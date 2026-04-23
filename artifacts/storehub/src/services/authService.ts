/**
 * authService.ts — Central authentication service
 *
 * All auth calls go through this file so swapping to a real backend is trivial.
 * JWT tokens are stored in httpOnly cookies by the server.
 * The access token is short-lived (15 min); a refresh token handles silent renewal.
 *
 * Integration hooks:
 * - INTEGRATION: OAUTH_GOOGLE    → swap handleSocialLogin("google", ...) with real Google OAuth
 * - INTEGRATION: OAUTH_APPLE     → swap handleSocialLogin("apple", ...) with Sign in with Apple
 * - INTEGRATION: OAUTH_MICROSOFT → swap handleSocialLogin("microsoft", ...) with MSAL
 */

import { API_BASE_URL } from "./dataService";

export interface AuthUser {
  id:            string;
  email:         string | null;
  fullName:      string;
  emailVerified: boolean;
  phoneNumber:   string | null;
  createdAt:     string;
  lastLoginAt:   string | null;
}

export interface LoginMethod {
  email?:     { active: boolean; verified: boolean } | null;
  phone?:     { active: boolean; number: string } | null;
  google?:    { createdAt: string } | null;
  apple?:     { createdAt: string } | null;
  microsoft?: { createdAt: string } | null;
  biometrics: { id: string; deviceName: string | null; createdAt: string }[];
  lastLogin:  string | null;
}

const BASE = `${API_BASE_URL}/api/auth`;

async function authFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include", // Always send httpOnly cookies
    ...options,
  });
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  fullName: string
): Promise<{ userId: string; _devVerifyToken?: string }> {
  const res = await authFetch("/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, fullName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Sign up failed");
  return data;
}

// ─── Log In ───────────────────────────────────────────────────────────────────

export async function logIn(
  email: string,
  password: string,
  rememberMe = false
): Promise<{ user: AuthUser; isNewUser: boolean }> {
  const res = await authFetch("/login", {
    method: "POST",
    body: JSON.stringify({ email, password, rememberMe }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error ?? "Login failed") as Error & { code?: string; attemptsLeft?: number };
    err.code = data.code;
    err.attemptsLeft = data.attemptsLeft;
    throw err;
  }
  return data;
}

// ─── Log Out ──────────────────────────────────────────────────────────────────

export async function logOut(): Promise<void> {
  await authFetch("/logout", { method: "POST" });
}

// ─── Get current user (for page-load auth check) ─────────────────────────────

export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await authFetch("/me");
    if (res.status === 401) return null;
    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

// ─── Silent token refresh ─────────────────────────────────────────────────────

export async function refreshSession(): Promise<AuthUser | null> {
  try {
    const res = await authFetch("/refresh", { method: "POST" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<string> {
  const res = await authFetch("/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data.message;
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await authFetch("/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Reset failed");
}

// ─── Verify Email ─────────────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<void> {
  const res = await authFetch("/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Verification failed");
}

// ─── Resend Verification ──────────────────────────────────────────────────────

export async function resendVerification(email: string): Promise<void> {
  const res = await authFetch("/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to resend");
  }
}

// ─── Social Login ─────────────────────────────────────────────────────────────

/**
 * INTEGRATION: OAUTH_GOOGLE / OAUTH_APPLE / OAUTH_MICROSOFT
 *
 * In production, the OAuth flow happens in a popup or redirect:
 *   1. Open OAuth provider URL with your client_id
 *   2. Provider returns an id_token or auth_code
 *   3. Exchange for email + sub (providerUserId) — verify server-side
 *   4. Call this function with the verified data
 *
 * For Google: use Google Identity Services library
 *   google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse });
 *
 * For Apple: use AppleID.auth.signIn() from Apple's JS SDK
 *
 * For Microsoft: use @azure/msal-browser
 *   const msalInstance = new PublicClientApplication({ auth: { clientId: MSAL_CLIENT_ID } });
 *   const result = await msalInstance.loginPopup({ scopes: ["User.Read"] });
 */
export async function socialLogin(
  provider: "google" | "apple" | "microsoft",
  data: { email: string; fullName?: string; providerUserId: string }
): Promise<{ user: AuthUser; isNewUser: boolean }> {
  const res = await authFetch(`/social/${provider}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Social login failed");
  return json;
}

// ─── Login Methods ────────────────────────────────────────────────────────────

export async function getLoginMethods(): Promise<LoginMethod> {
  const res = await authFetch("/methods");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch methods");
  return data;
}

// ─── WebAuthn credential list ─────────────────────────────────────────────────

export async function getWebAuthnCredentials() {
  const res = await authFetch("/webauthn/credentials");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data.credentials as { id: string; deviceName: string | null; createdAt: string }[];
}

export async function removeWebAuthnCredential(credentialId: string): Promise<void> {
  const res = await authFetch(`/webauthn/${encodeURIComponent(credentialId)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to remove");
  }
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateAuthProfile(updates: {
  fullName?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<AuthUser> {
  const res = await authFetch("/profile", {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Update failed");
  return data.user;
}

// ─── Password strength helper (client-side) ───────────────────────────────────

export type PasswordStrength = "empty" | "weak" | "fair" | "good" | "strong";

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return "weak";
  if (score === 2) return "fair";
  if (score === 3) return "good";
  return "strong";
}
