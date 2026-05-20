import { Router } from "express";
import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { generateSecret, generateURI, verify as otpVerify } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { totpSecrets, mfaChallenges, users } from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { verifyPassword, generateOpaqueToken, hashToken } from "../../lib/auth.js";
import { logAudit } from "../../lib/audit.js";
import { sendMfaBackupCodes } from "../../lib/email.js";

const router = Router();

const MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY ?? "storehub-mfa-key-32-bytes-change!"; // must be 32 chars

// ─── Encrypt/decrypt TOTP secret ─────────────────────────────────────────────

function encryptSecret(secret: string): string {
  const iv  = crypto.randomBytes(12);
  const key = crypto.scryptSync(MFA_ENCRYPTION_KEY, "storehub-mfa-salt", 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decryptSecret(enc: string): string {
  const [ivHex, tagHex, cipherHex] = enc.split(":");
  const key    = crypto.scryptSync(MFA_ENCRYPTION_KEY, "storehub-mfa-salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(cipherHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// ─── Generate backup codes ────────────────────────────────────────────────────

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})/, "$1-")
  );
}

// ─── POST /api/auth/mfa/setup — generate TOTP secret + QR code ───────────────

router.post("/setup", requireAuth as any, async (req, res) => {
  const userId = req.userId!;

  const [existing] = await db
    .select({ enabledAt: totpSecrets.enabledAt })
    .from(totpSecrets)
    .where(eq(totpSecrets.userId, userId))
    .limit(1);

  if (existing?.enabledAt) {
    return res.status(409).json({ error: "MFA is already enabled. Disable it first." });
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return res.status(404).json({ error: "User not found" });

  const secret = generateSecret();
  const secretEnc = encryptSecret(secret);

  // Upsert pending TOTP secret (not enabled until verified)
  await db
    .insert(totpSecrets)
    .values({ userId, secretEnc })
    .onConflictDoUpdate({
      target: totpSecrets.userId,
      set: { secretEnc, enabledAt: null },
    });

  const otpauthUrl = generateURI({ issuer: "StoreHub", label: user.email ?? userId, secret });
  const qrDataUrl  = await QRCode.toDataURL(otpauthUrl);

  return res.json({ qrDataUrl, secret, otpauthUrl });
});

// ─── POST /api/auth/mfa/verify — confirm TOTP code and enable MFA ─────────────

router.post("/verify", requireAuth as any, async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: "code is required" });

  const userId = req.userId!;

  const [row] = await db
    .select({ secretEnc: totpSecrets.secretEnc })
    .from(totpSecrets)
    .where(eq(totpSecrets.userId, userId))
    .limit(1);

  if (!row) return res.status(400).json({ error: "MFA setup not started" });

  let secret: string;
  try { secret = decryptSecret(row.secretEnc); }
  catch { return res.status(500).json({ error: "Failed to decrypt TOTP secret" }); }

  const verifyResult = await otpVerify({ token: code, secret });
  if (!verifyResult.valid) {
    return res.status(400).json({ error: "Invalid TOTP code" });
  }

  // Generate backup codes
  const plainCodes  = generateBackupCodes();
  const hashedCodes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)));

  await db
    .update(totpSecrets)
    .set({ enabledAt: new Date(), backupCodes: hashedCodes })
    .where(eq(totpSecrets.userId, userId));

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.email) {
    sendMfaBackupCodes(user.email, plainCodes).catch(() => {});
  }

  logAudit({ req }, { action: "auth.mfa_enabled" });

  return res.json({ success: true, backupCodes: plainCodes });
});

// ─── POST /api/auth/mfa/challenge — verify TOTP during login ─────────────────
// Body: { mfaToken, code }

router.post("/challenge", async (req, res) => {
  const { mfaToken, code } = req.body as { mfaToken?: string; code?: string };
  if (!mfaToken || !code) {
    return res.status(400).json({ error: "mfaToken and code are required" });
  }

  const hash = hashToken(mfaToken);
  const [challenge] = await db
    .select({ userId: mfaChallenges.userId, used: mfaChallenges.used })
    .from(mfaChallenges)
    .where(and(eq(mfaChallenges.token, hash), gt(mfaChallenges.expiresAt, new Date())))
    .limit(1);

  if (!challenge || challenge.used) {
    return res.status(401).json({ error: "Invalid or expired MFA challenge" });
  }

  const [row] = await db
    .select({ secretEnc: totpSecrets.secretEnc, backupCodes: totpSecrets.backupCodes })
    .from(totpSecrets)
    .where(eq(totpSecrets.userId, challenge.userId))
    .limit(1);

  if (!row) return res.status(400).json({ error: "MFA not configured" });

  let valid = false;
  let secret: string;

  try { secret = decryptSecret(row.secretEnc); }
  catch { return res.status(500).json({ error: "MFA verification failed" }); }

  // Check TOTP code — secret is definitely assigned after the try/catch
  const result = await otpVerify({ token: code, secret: secret! });
  valid = result.valid;

  // Check backup codes if TOTP failed
  if (!valid && row.backupCodes.length > 0) {
    for (let i = 0; i < row.backupCodes.length; i++) {
      if (await bcrypt.compare(code.toUpperCase(), row.backupCodes[i])) {
        valid = true;
        // Invalidate used backup code
        const remaining = [...row.backupCodes];
        remaining.splice(i, 1);
        await db
          .update(totpSecrets)
          .set({ backupCodes: remaining })
          .where(eq(totpSecrets.userId, challenge.userId));
        break;
      }
    }
  }

  if (!valid) return res.status(401).json({ error: "Invalid TOTP code" });

  // Mark challenge as used
  await db
    .update(mfaChallenges)
    .set({ used: true })
    .where(eq(mfaChallenges.token, hash));

  // Return user info so the caller can issue auth cookies
  const [user] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, businessId: users.businessId })
    .from(users)
    .where(eq(users.id, challenge.userId))
    .limit(1);

  return res.json({ success: true, user });
});

// ─── POST /api/auth/mfa/disable ───────────────────────────────────────────────

router.post("/disable", requireAuth as any, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) return res.status(400).json({ error: "password is required" });

  const userId = req.userId!;
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.passwordHash) return res.status(400).json({ error: "No password set" });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Incorrect password" });

  await db.delete(totpSecrets).where(eq(totpSecrets.userId, userId));

  logAudit({ req }, { action: "auth.mfa_disabled" });
  return res.json({ success: true });
});

// ─── GET /api/auth/mfa/status ─────────────────────────────────────────────────

router.get("/status", requireAuth as any, async (req, res) => {
  const [row] = await db
    .select({ enabledAt: totpSecrets.enabledAt, backupCodesCount: totpSecrets.backupCodes })
    .from(totpSecrets)
    .where(eq(totpSecrets.userId, req.userId!))
    .limit(1);

  return res.json({
    enabled:          !!row?.enabledAt,
    backupCodesLeft:  row?.backupCodesCount?.length ?? 0,
  });
});

export default router;
