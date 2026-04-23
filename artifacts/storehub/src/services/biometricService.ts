/**
 * biometricService.ts — WebAuthn (FIDO2) biometric authentication
 *
 * Uses the browser's native Web Authentication API (WebAuthn).
 * The private key NEVER leaves the device — only the public key is stored on the server.
 *
 * INTEGRATION: WEBAUTHN_SERVER
 * For full production verification, plug in @simplewebauthn/server on the backend.
 * The server-side verification challenge is in /api/auth/webauthn/register-finish and /login-finish.
 *
 * Supports:
 * - Face ID (iPhone)
 * - Touch ID (Mac / some iPhones)
 * - Fingerprint (Android, Windows Hello)
 * - Security keys (YubiKey etc.)
 */

import { API_BASE_URL } from "./dataService";

const BASE = `${API_BASE_URL}/api/auth/webauthn`;

function authFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });
}

// ─── Support detection ────────────────────────────────────────────────────────

export async function isWebAuthnSupported(): Promise<boolean> {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function" &&
    (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false))
  );
}

export async function getBiometricType(): Promise<"faceid" | "fingerprint" | "generic" | null> {
  if (!(await isWebAuthnSupported())) return null;
  // Browsers don't expose the exact type — infer from user agent
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return "faceid";
  if (/Android|Mac/i.test(ua)) return "fingerprint";
  return "generic";
}

// ─── Registration ─────────────────────────────────────────────────────────────

export async function registerBiometric(deviceName?: string): Promise<void> {
  if (!(await isWebAuthnSupported())) throw new Error("Biometrics not supported on this device");

  // 1. Get registration options from server (includes challenge)
  const optRes = await authFetch("/register-begin", { method: "POST" });
  if (!optRes.ok) throw new Error("Failed to begin registration");
  const options = await optRes.json();

  // 2. Create credentials using the browser's WebAuthn API
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge:              base64urlToBuffer(options.challenge),
      rp:                     options.rp,
      user: {
        id:          base64urlToBuffer(options.user.id),
        name:        options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams:       [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      timeout:                options.timeout ?? 60000,
      excludeCredentials:     (options.excludeCredentials ?? []).map((c: { id: string; type: string }) => ({
        id: base64urlToBuffer(c.id), type: c.type,
      })),
      authenticatorSelection: options.authenticatorSelection,
      attestation:            "none",
    },
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error("Biometric registration cancelled");

  const response = credential.response as AuthenticatorAttestationResponse;

  // 3. Send result to server
  const credentialId = bufferToBase64url(credential.rawId);
  const publicKey    = bufferToBase64url(response.getPublicKey() ?? new ArrayBuffer(0));

  const finishRes = await authFetch("/register-finish", {
    method: "POST",
    body: JSON.stringify({
      credentialId,
      publicKey,
      deviceName: deviceName ?? getDeviceName(),
    }),
  });

  if (!finishRes.ok) {
    const data = await finishRes.json();
    throw new Error(data.error ?? "Registration failed");
  }
}

// ─── Authentication ───────────────────────────────────────────────────────────

export async function authenticateWithBiometric(email?: string): Promise<void> {
  if (!(await isWebAuthnSupported())) throw new Error("Biometrics not supported on this device");

  // 1. Get authentication challenge from server
  const optRes = await authFetch("/login-begin", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!optRes.ok) throw new Error("Failed to begin authentication");
  const options = await optRes.json();

  // 2. Authenticate using the stored biometric key
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge:         base64urlToBuffer(options.challenge),
      rpId:              options.rpId,
      allowCredentials:  (options.allowCredentials ?? []).map((c: { id: string; type: string }) => ({
        id: base64urlToBuffer(c.id), type: c.type,
      })),
      timeout:           options.timeout ?? 60000,
      userVerification:  options.userVerification ?? "preferred",
    },
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error("Biometric authentication cancelled");

  // 3. Send credential to server for verification
  const finishRes = await authFetch("/login-finish", {
    method: "POST",
    body: JSON.stringify({
      credentialId: bufferToBase64url(credential.rawId),
      challenge:    options.challenge,
    }),
  });

  if (!finishRes.ok) {
    const data = await finishRes.json();
    throw new Error(data.error ?? "Couldn't verify. Try again or use your password");
  }
}

// ─── Preference (localStorage) ────────────────────────────────────────────────

const BIOMETRIC_PREF_KEY = "sh_biometric_email";
const BIOMETRIC_SETUP_KEY = "sh_biometric_setup";

export function getBiometricEmail(): string | null {
  return localStorage.getItem(BIOMETRIC_PREF_KEY);
}

export function setBiometricEmail(email: string): void {
  localStorage.setItem(BIOMETRIC_PREF_KEY, email);
  localStorage.setItem(BIOMETRIC_SETUP_KEY, "1");
}

export function clearBiometricPref(): void {
  localStorage.removeItem(BIOMETRIC_PREF_KEY);
  localStorage.removeItem(BIOMETRIC_SETUP_KEY);
}

export function isBiometricSetUp(): boolean {
  return localStorage.getItem(BIOMETRIC_SETUP_KEY) === "1";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view   = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes  = new Uint8Array(buffer);
  let binary   = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua))   return "iPad";
  if (/Android/i.test(ua)) return "Android Device";
  if (/Mac/i.test(ua))    return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "Unknown Device";
}
