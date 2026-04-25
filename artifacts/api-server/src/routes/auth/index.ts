/**
 * Auth routes — email/password, phone OTP, social login (OAuth), WebAuthn/biometric
 *
 * Integration hooks (search for these comments to plug in real services):
 * - INTEGRATION: EMAIL_PROVIDER  — swap stub for SendGrid / nodemailer / Resend
 * - INTEGRATION: SMS_PROVIDER    — swap stub for Twilio / Vonage SMS
 * - INTEGRATION: OAUTH_GOOGLE    — swap stub for Google OAuth2 flow
 * - INTEGRATION: OAUTH_APPLE     — swap stub for Sign in with Apple
 * - INTEGRATION: OAUTH_MICROSOFT — swap stub for Microsoft MSAL
 * - INTEGRATION: WEBAUTHN_SERVER — @simplewebauthn/server verification
 */

import { Router } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  users, refreshTokens, authTokens, phoneOtps,
  socialAccounts, webauthnCredentials, webauthnChallenges, storeProfiles,
} from "@workspace/db";
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  verifyAccessToken,
  hashPassword, verifyPassword, validatePasswordStrength,
  generateOpaqueToken, hashToken,
  generateOTP, hashOTP, verifyOTP,
  setAuthCookies, clearAuthCookies,
  generateChallenge,
  ACCESS_TOKEN_TTL_MS,
} from "../../lib/auth.js";

const router = Router();
const isDev = process.env.NODE_ENV !== "production";

// ─── Helper ───────────────────────────────────────────────────────────────────

function userAgent(req: { headers: Record<string, string | string[] | undefined> }): string {
  return String(req.headers["user-agent"] ?? "unknown").slice(0, 250);
}

function sanitizeUser(user: { id: string; email: string | null; fullName: string; emailVerified: boolean; phoneNumber: string | null; role: string; businessId?: string | null; createdAt: Date; lastLoginAt: Date | null }) {
  return {
    id:            user.id,
    email:         user.email,
    fullName:      user.fullName,
    emailVerified: user.emailVerified,
    phoneNumber:   user.phoneNumber,
    role:          user.role,
    businessId:    user.businessId ?? null,
    createdAt:     user.createdAt,
    lastLoginAt:   user.lastLoginAt,
  };
}

const RATE_LIMIT_MAX    = 5;
const LOCKOUT_MINUTES   = 15;

// ─── Sign Up ──────────────────────────────────────────────────────────────────

router.post("/signup", async (req, res) => {
  const { email, password, fullName } = req.body as { email: string; password: string; fullName: string };

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: "Email, password, and full name are required" });
  }

  const { valid, reason } = validatePasswordStrength(password);
  if (!valid) return res.status(400).json({ error: reason });

  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({
    email: email.toLowerCase(),
    fullName: fullName.trim(),
    passwordHash,
    emailVerified: false,
    role: "business_owner",
  }).returning();

  // Generate email verification token
  const verifyToken = generateOpaqueToken();
  await db.insert(authTokens).values({
    userId: user.id,
    token: hashToken(verifyToken),
    type: "email_verification",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  });

  // INTEGRATION: EMAIL_PROVIDER — send verification email here
  // Example with SendGrid: sendgrid.send({ to: email, subject: "Verify your email", html: `<a href="...">Verify</a>` });
  // Example with nodemailer: transporter.sendMail({ to: email, html: `<a href="${BASE_URL}/verify-email?token=${verifyToken}">Verify</a>` });
  // For now, return token in dev mode only:
  if (isDev) {
    console.log(`[DEV] Email verification token for ${email}: ${verifyToken}`);
  }

  return res.status(201).json({
    message: "Account created. Please verify your email.",
    userId: user.id,
    // In dev only — remove in production:
    ...(isDev ? { _devVerifyToken: verifyToken } : {}),
  });
});

// ─── Log In ───────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const { email, password, rememberMe = false } = req.body as {
    email: string; password: string; rememberMe?: boolean;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  if (!user) {
    return res.status(401).json({ error: "We couldn't find an account with that email" });
  }

  // Check rate limit / lockout
  if (user.lockedUntil && new Date() < user.lockedUntil) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}` });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: "This account uses social or phone login. Use that method instead." });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const newAttempts = user.failedAttempts + 1;
    const updates: Partial<typeof user> = { failedAttempts: newAttempts };
    if (newAttempts >= RATE_LIMIT_MAX) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      updates.failedAttempts = 0;
    }
    await db.update(users).set(updates).where(eq(users.id, user.id));
    const remainingAttempts = RATE_LIMIT_MAX - newAttempts;
    return res.status(401).json({
      error: "That password doesn't look right. Try again or reset it below",
      ...(remainingAttempts > 0 ? { attemptsLeft: remainingAttempts } : {}),
    });
  }

  if (!user.emailVerified) {
    return res.status(403).json({ error: "Please verify your email first — check your inbox", code: "EMAIL_NOT_VERIFIED" });
  }

  // Reset failed attempts
  await db.update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const accessToken  = signAccessToken( { userId: user.id, email: user.email!, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email!, role: user.role });

  await db.insert(refreshTokens).values({
    userId:    user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: userAgent(req),
  });

  setAuthCookies(res, accessToken, refreshToken, rememberMe);
  return res.json({ user: sanitizeUser(user), isNewUser: false });
});

// ─── Log Out ──────────────────────────────────────────────────────────────────

router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies?.sh_refresh as string | undefined;
  if (refreshToken) {
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
  }
  clearAuthCookies(res);
  return res.json({ ok: true });
});

// ─── Me (get current user) ────────────────────────────────────────────────────

router.get("/me", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  if (!accessToken) return res.status(401).json({ error: "Not authenticated" });

  const payload = verifyAccessToken(accessToken);
  if (!payload) return res.status(401).json({ error: "Session expired" });

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) return res.status(401).json({ error: "User not found" });

  // If the role in the JWT doesn't match the DB (e.g. onboarding upgraded the user
  // to business_owner but the old server never re-issued the token), silently re-issue
  // the access token with the correct role so subsequent API calls pass middleware checks.
  // Skip this during a switched-store session — those use a deliberately different role.
  if (!payload.switchedFromUserId && user.role !== payload.role) {
    const newAccessToken = signAccessToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
    });
    res.cookie("sh_access", newAccessToken, {
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: ACCESS_TOKEN_TTL_MS,
    });
  }

  return res.json({
    user: {
      ...sanitizeUser(user),
      switchedFromUserId: payload.switchedFromUserId ?? null,
    }
  });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.sh_refresh as string | undefined;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Your session expired. Please log in again" });
  }

  const tokenHash = hashToken(refreshToken);
  const [storedToken] = await db.select().from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);

  if (!storedToken) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Your session expired. Please log in again" });
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "User not found" });
  }

  // Preserve switched-store mode across refresh. If the session is switched, the
  // role must stay as payload.role ("store_owner") — using user.role would silently
  // promote the session back to business_owner and break the switched session.
  const isSwitched = Boolean(payload.switchedFromUserId);
  const roleForToken = isSwitched ? payload.role : user.role;

  const newAccessToken = signAccessToken({
    userId: user.id,
    email: user.email ?? user.id,
    role: roleForToken,
    ...(payload.switchedFromUserId ? { switchedFromUserId: payload.switchedFromUserId } : {}),
  });

  res.cookie("sh_access", newAccessToken, {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: ACCESS_TOKEN_TTL_MS,
  });

  return res.json({
    user: {
      ...sanitizeUser(user),
      switchedFromUserId: payload.switchedFromUserId ?? null,
    },
  });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "Email is required" });

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  // Always respond with success to prevent user enumeration
  if (user) {
    const resetToken = generateOpaqueToken();
    await db.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.type, "password_reset")));
    await db.insert(authTokens).values({
      userId: user.id,
      token: hashToken(resetToken),
      type: "password_reset",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
    });

    // INTEGRATION: EMAIL_PROVIDER — send password reset email here
    // Example: await sendEmail({ to: email, subject: "Reset your password", html: `...` });
    if (isDev) console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
  }

  return res.json({ message: "If an account exists with that email, you'll receive a reset link shortly" });
});

// ─── Reset Password ───────────────────────────────────────────────────────────

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body as { token: string; password: string };
  if (!token || !password) return res.status(400).json({ error: "Token and password are required" });

  const { valid, reason } = validatePasswordStrength(password);
  if (!valid) return res.status(400).json({ error: reason });

  const tokenHash = hashToken(token);
  const [record] = await db.select().from(authTokens).where(
    and(eq(authTokens.token, tokenHash), eq(authTokens.type, "password_reset"),
      eq(authTokens.used, false), gt(authTokens.expiresAt, new Date()))
  ).limit(1);

  if (!record) return res.status(400).json({ error: "Invalid or expired reset link" });

  const newHash = await hashPassword(password);
  await db.update(users).set({ passwordHash: newHash, emailVerified: true }).where(eq(users.id, record.userId));
  await db.update(authTokens).set({ used: true }).where(eq(authTokens.id, record.id));

  return res.json({ message: "Password updated successfully" });
});

// ─── Verify Email ─────────────────────────────────────────────────────────────

router.post("/verify-email", async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ error: "Token is required" });

  const tokenHash = hashToken(token);
  const [record] = await db.select().from(authTokens).where(
    and(eq(authTokens.token, tokenHash), eq(authTokens.type, "email_verification"),
      eq(authTokens.used, false), gt(authTokens.expiresAt, new Date()))
  ).limit(1);

  if (!record) return res.status(400).json({ error: "Invalid or expired verification link" });

  await db.update(users).set({ emailVerified: true }).where(eq(users.id, record.userId));
  await db.update(authTokens).set({ used: true }).where(eq(authTokens.id, record.id));

  return res.json({ message: "Email verified successfully" });
});

// ─── Resend Verification ──────────────────────────────────────────────────────

router.post("/resend-verification", async (req, res) => {
  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "Email is required" });

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user || user.emailVerified) return res.json({ message: "If applicable, a new verification email has been sent" });

  await db.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.type, "email_verification")));
  const verifyToken = generateOpaqueToken();
  await db.insert(authTokens).values({
    userId: user.id, token: hashToken(verifyToken),
    type: "email_verification", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // INTEGRATION: EMAIL_PROVIDER — send verification email here
  if (isDev) console.log(`[DEV] Resend verification token for ${email}: ${verifyToken}`);

  return res.json({
    message: "Verification email sent",
    ...(isDev ? { _devVerifyToken: verifyToken } : {}),
  });
});

// ─── Phone OTP — Send ─────────────────────────────────────────────────────────

router.post("/phone/send-otp", async (req, res) => {
  const { phone } = req.body as { phone: string };
  if (!phone) return res.status(400).json({ error: "Phone number is required" });

  const otp     = generateOTP();
  const otpHash = await hashOTP(otp);

  await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
  await db.insert(phoneOtps).values({
    phone,
    otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  // INTEGRATION: SMS_PROVIDER — send OTP via SMS here
  // Example with Twilio:
  //   const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  //   await twilio.messages.create({ body: `Your StoreHub code: ${otp}`, from: TWILIO_PHONE, to: phone });
  if (isDev) console.log(`[DEV] OTP for ${phone}: ${otp}`);

  return res.json({
    message: "OTP sent",
    maskedPhone: phone.replace(/(\+?\d{1,3})\d+(\d{4})$/, "$1****$2"),
    expiresInSeconds: 600,
    ...(isDev ? { _devOtp: otp } : {}), // Remove in production
  });
});

// ─── Phone OTP — Verify ───────────────────────────────────────────────────────

router.post("/phone/verify-otp", async (req, res) => {
  const { phone, otp } = req.body as { phone: string; otp: string };
  if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });

  const [record] = await db.select().from(phoneOtps).where(
    and(eq(phoneOtps.phone, phone), eq(phoneOtps.used, false), gt(phoneOtps.expiresAt, new Date()))
  ).limit(1);

  if (!record) return res.status(400).json({ error: "That code has expired. Request a new one" });

  const otpValid = await verifyOTP(otp, record.otpHash);
  if (!otpValid) return res.status(400).json({ error: "That code doesn't match. Try again" });

  await db.update(phoneOtps).set({ used: true }).where(eq(phoneOtps.id, record.id));

  // Find or create user by phone number
  const existingUsers = await db.select().from(users).where(eq(users.phoneNumber, phone)).limit(1);
  let isNewUser = false;

  let authUser = existingUsers[0];
  if (!authUser) {
    isNewUser = true;
    const [newUser] = await db.insert(users).values({
      fullName: "User",
      phoneNumber: phone,
      emailVerified: true, // phone-verified accounts bypass email verification
      role: "business_owner",
    }).returning();
    authUser = newUser;
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, authUser.id));

  const accessToken  = signAccessToken( { userId: authUser.id, email: authUser.email ?? phone, role: authUser.role });
  const refreshToken = signRefreshToken({ userId: authUser.id, email: authUser.email ?? phone, role: authUser.role });

  await db.insert(refreshTokens).values({
    userId:    authUser.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: userAgent(req),
  });

  setAuthCookies(res, accessToken, refreshToken, true);
  return res.json({ user: sanitizeUser(authUser), isNewUser });
});

// ─── Social Login — Generic handler ───────────────────────────────────────────
// Returns a mock session for now. Swap the top section with real OAuth in production.

router.post("/social/:provider", async (req, res) => {
  const { provider } = req.params;
  const allowed = ["google", "apple", "microsoft"];
  if (!allowed.includes(provider)) return res.status(400).json({ error: "Unknown provider" });

  let email: string | undefined;
  let fullName: string | undefined;
  let providerUserId: string | undefined;

  if (provider === "google") {
    // Frontend sends an access token obtained via @react-oauth/google.
    // We verify it by calling Google's userinfo endpoint — no extra package needed.
    const { accessToken } = req.body as { accessToken?: string };
    if (!accessToken) {
      return res.status(400).json({ error: "Google access token is required" });
    }
    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!googleRes.ok) {
      return res.status(401).json({ error: "Invalid Google session. Please sign in again." });
    }
    const googleUser = await googleRes.json() as {
      sub: string; email: string; name: string; email_verified: boolean;
    };
    if (!googleUser.email_verified) {
      return res.status(401).json({ error: "Your Google account email is not verified." });
    }
    email        = googleUser.email;
    providerUserId = googleUser.sub;
    fullName     = googleUser.name;
  } else {
    // INTEGRATION: OAUTH_APPLE — verify using apple-signin-auth package
    // INTEGRATION: OAUTH_MICROSOFT — verify using @azure/msal-node
    ({ email, fullName, providerUserId } = req.body as {
      email: string; fullName?: string; providerUserId: string;
    });
  }

  if (!email || !providerUserId) {
    return res.status(400).json({ error: "Email and provider user ID required" });
  }

  // Find existing social account
  const [existing] = await db.select().from(socialAccounts).where(
    and(eq(socialAccounts.provider, provider), eq(socialAccounts.providerUserId, providerUserId))
  ).limit(1);

  let authUser;
  let isNewUser = false;

  if (existing) {
    const [u] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
    authUser = u;
  } else {
    // Check if email already exists → link account
    const [byEmail] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (byEmail) {
      authUser = byEmail;
    } else {
      isNewUser = true;
      const [newUser] = await db.insert(users).values({
        email: email.toLowerCase(),
        fullName: fullName ?? email.split("@")[0],
        emailVerified: true,
        role: "business_owner",
      }).returning();
      authUser = newUser;
    }
    await db.insert(socialAccounts).values({
      userId: authUser.id,
      provider,
      providerUserId,
      providerEmail: email,
    }).onConflictDoNothing();
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, authUser.id));

  const accessToken  = signAccessToken( { userId: authUser.id, email: authUser.email ?? email, role: authUser.role });
  const refreshToken = signRefreshToken({ userId: authUser.id, email: authUser.email ?? email, role: authUser.role });

  await db.insert(refreshTokens).values({
    userId:    authUser.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: userAgent(req),
  });

  setAuthCookies(res, accessToken, refreshToken, true);
  return res.json({ user: sanitizeUser(authUser), isNewUser });
});

// ─── WebAuthn — Register (Begin) ──────────────────────────────────────────────

router.post("/webauthn/register-begin", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const challenge = generateChallenge();

  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.userId, payload.userId));
  await db.insert(webauthnChallenges).values({
    challenge,
    userId:    payload.userId,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  const existing = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, payload.userId));

  // INTEGRATION: WEBAUTHN_SERVER
  // In a full implementation, use @simplewebauthn/server:
  //   const opts = await generateRegistrationOptions({
  //     rpName: "StoreHub", rpID: req.hostname, userID: user.id, userName: user.email,
  //     excludeCredentials: existing.map(c => ({ id: c.credentialId, type: 'public-key' })),
  //   });
  //   await saveChallenge(opts.challenge, user.id);
  //   return res.json(opts);

  return res.json({
    challenge,
    rp:      { name: "StoreHub", id: new URL(req.headers.origin ?? "http://localhost").hostname },
    user:    { id: user.id, name: user.email ?? user.phoneNumber ?? user.id, displayName: user.fullName },
    timeout: 60000,
    excludeCredentials: existing.map(c => ({ id: c.credentialId, type: "public-key" })),
    authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
  });
});

// ─── WebAuthn — Register (Finish) ─────────────────────────────────────────────

router.post("/webauthn/register-finish", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const { credentialId, publicKey, deviceName } = req.body as {
    credentialId: string; publicKey: string; deviceName?: string;
  };

  // INTEGRATION: WEBAUTHN_SERVER
  // Full verification using @simplewebauthn/server:
  //   const savedChallenge = await getChallenge(payload.userId);
  //   const verification = await verifyRegistrationResponse({
  //     response: req.body, expectedChallenge: savedChallenge,
  //     expectedOrigin: req.headers.origin!, expectedRPID: req.hostname,
  //   });
  //   if (!verification.verified) return res.status(400).json({ error: "Verification failed" });
  //   const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

  const [challenge] = await db.select().from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.userId, payload.userId), gt(webauthnChallenges.expiresAt, new Date())))
    .limit(1);

  if (!challenge) return res.status(400).json({ error: "Challenge expired or not found" });

  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challenge.id));

  await db.insert(webauthnCredentials).values({
    userId:       payload.userId,
    credentialId,
    publicKey,
    deviceName:   deviceName ?? "Unknown device",
    counter:      0,
  }).onConflictDoNothing();

  return res.json({ ok: true, message: "Biometric registered successfully" });
});

// ─── WebAuthn — Login (Begin) ─────────────────────────────────────────────────

router.post("/webauthn/login-begin", async (req, res) => {
  const { email } = req.body as { email: string };

  const challenge = generateChallenge();
  let userId: string | undefined;
  let credentialIds: string[] = [];

  if (email) {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (user) {
      userId = user.id;
      const creds = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
      credentialIds = creds.map(c => c.credentialId);
    }
  }

  await db.insert(webauthnChallenges).values({
    challenge,
    userId:    userId ?? null,
    email:     email ?? null,
    expiresAt: new Date(Date.now() + 60_000),
  });

  return res.json({
    challenge,
    allowCredentials: credentialIds.map(id => ({ id, type: "public-key" })),
    timeout: 60000,
    userVerification: "preferred",
    rpId: new URL(req.headers.origin ?? "http://localhost").hostname,
  });
});

// ─── WebAuthn — Login (Finish) ────────────────────────────────────────────────

router.post("/webauthn/login-finish", async (req, res) => {
  const { credentialId, challenge: clientChallenge } = req.body as {
    credentialId: string; challenge: string;
  };

  // Verify challenge
  const [savedChallenge] = await db.select().from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.challenge, clientChallenge), gt(webauthnChallenges.expiresAt, new Date())))
    .limit(1);

  if (!savedChallenge) return res.status(400).json({ error: "Couldn't verify. Try again or use your password" });
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, savedChallenge.id));

  // INTEGRATION: WEBAUTHN_SERVER
  // Full verification using @simplewebauthn/server:
  //   const verification = await verifyAuthenticationResponse({
  //     response: req.body, expectedChallenge, expectedOrigin, expectedRPID, authenticator: storedCredential,
  //   });
  //   if (!verification.verified) return res.status(401).json({ error: "Biometric failed" });
  //   await updateCounter(credentialId, verification.authenticationInfo.newCounter);

  const [cred] = await db.select().from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, credentialId)).limit(1);

  if (!cred) return res.status(401).json({ error: "Couldn't verify. Try again or use your password" });

  const [user] = await db.select().from(users).where(eq(users.id, cred.userId)).limit(1);
  if (!user) return res.status(401).json({ error: "User not found" });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const accessToken  = signAccessToken( { userId: user.id, email: user.email!, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email!, role: user.role });

  await db.insert(refreshTokens).values({
    userId:    user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: userAgent(req),
  });

  setAuthCookies(res, accessToken, refreshToken, true);
  return res.json({ user: sanitizeUser(user) });
});

// ─── Get Login Methods ────────────────────────────────────────────────────────

router.get("/methods", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) return res.status(401).json({ error: "User not found" });

  const socials = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, user.id));
  const biometrics = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));

  return res.json({
    email:     user.email ? { active: true, verified: user.emailVerified } : null,
    phone:     user.phoneNumber ? { active: true, number: user.phoneNumber } : null,
    google:    socials.find(s => s.provider === "google") ?? null,
    apple:     socials.find(s => s.provider === "apple") ?? null,
    microsoft: socials.find(s => s.provider === "microsoft") ?? null,
    biometrics: biometrics.map(b => ({ id: b.id, deviceName: b.deviceName, createdAt: b.createdAt })),
    lastLogin:  user.lastLoginAt,
  });
});

// ─── Remove WebAuthn credential ───────────────────────────────────────────────

router.delete("/webauthn/:credentialId", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  await db.delete(webauthnCredentials).where(
    and(eq(webauthnCredentials.credentialId, req.params.credentialId),
        eq(webauthnCredentials.userId, payload.userId))
  );

  return res.json({ ok: true });
});

// ─── Update Profile ───────────────────────────────────────────────────────────

router.patch("/profile", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const { fullName, currentPassword, newPassword } = req.body as {
    fullName?: string; currentPassword?: string; newPassword?: string;
  };

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const updates: Partial<typeof user> = {};
  if (fullName) updates.fullName = fullName.trim();

  if (newPassword && currentPassword) {
    if (!user.passwordHash) return res.status(400).json({ error: "No password set" });
    const correct = await verifyPassword(currentPassword, user.passwordHash);
    if (!correct) return res.status(401).json({ error: "Current password is incorrect" });
    const { valid, reason } = validatePasswordStrength(newPassword);
    if (!valid) return res.status(400).json({ error: reason });
    updates.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, user.id));
  }

  const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return res.json({ user: sanitizeUser(updated) });
});

// ─── Check WebAuthn credentials ───────────────────────────────────────────────

router.get("/webauthn/credentials", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });

  const creds = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, payload.userId));
  return res.json({ credentials: creds.map(c => ({ id: c.credentialId, deviceName: c.deviceName, createdAt: c.createdAt })) });
});

// ─── Switch Store (business owner enters a store) ─────────────────────────────

router.post("/switch-store", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  if (payload.role !== "business_owner") return res.status(403).json({ error: "Business owner access required" });

  const { targetUserId } = req.body as { targetUserId: string };
  if (!targetUserId) return res.status(400).json({ error: "targetUserId is required" });

  try {
    // Find the current user to get businessId
    const [currentUser] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!currentUser?.businessId) return res.status(400).json({ error: "Business owner has no business associated" });

    // Verify target store belongs to this business
    const [storeProfile] = await db.select().from(storeProfiles)
      .where(and(eq(storeProfiles.userId, targetUserId), eq(storeProfiles.businessId, currentUser.businessId)))
      .limit(1);
    if (!storeProfile) return res.status(403).json({ error: "This store does not belong to your business" });

    // Find the target store user
    const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!targetUser) return res.status(404).json({ error: "Store user not found" });

    // Always issue store_owner role so the app renders StoreApp.
    // This handles both sub-accounts (role=store_owner) and the business
    // owner's own first store (role=business_owner, same userId).
    const newAccessToken = signAccessToken({
      userId: targetUserId,
      email: targetUser.email ?? targetUser.id,
      role: "store_owner",
      switchedFromUserId: payload.userId,
    });
    const newRefreshToken = signRefreshToken({
      userId: targetUserId,
      email: targetUser.email ?? targetUser.id,
      role: "store_owner",
      switchedFromUserId: payload.userId,
    });

    await db.insert(refreshTokens).values({
      userId: targetUserId,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deviceInfo: "business-switch",
    });

    setAuthCookies(res, newAccessToken, newRefreshToken, true);
    return res.json({ success: true, storeName: storeProfile.storeName });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// ─── Restore Business (switch back to business owner session) ─────────────────

router.post("/restore-business", async (req, res) => {
  const accessToken = req.cookies?.sh_access as string | undefined;
  const payload = accessToken ? verifyAccessToken(accessToken) : null;

  const switchedFromUserId = payload?.switchedFromUserId;
  if (!switchedFromUserId) {
    return res.status(400).json({ error: "Not in a switched store session" });
  }

  try {
    const [originalUser] = await db.select().from(users).where(eq(users.id, switchedFromUserId)).limit(1);
    if (!originalUser || originalUser.role !== "business_owner") {
      return res.status(400).json({ error: "Original business owner not found" });
    }

    const newAccessToken = signAccessToken({
      userId: originalUser.id,
      email: originalUser.email!,
      role: originalUser.role,
    });
    const newRefreshToken = signRefreshToken({
      userId: originalUser.id,
      email: originalUser.email!,
      role: originalUser.role,
    });

    await db.insert(refreshTokens).values({
      userId: originalUser.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deviceInfo: "business-restore",
    });

    setAuthCookies(res, newAccessToken, newRefreshToken, true);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
