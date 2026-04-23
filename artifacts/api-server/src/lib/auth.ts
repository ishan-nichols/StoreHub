import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Response } from "express";

const JWT_SECRET      = process.env.JWT_SECRET      ?? "storehub-dev-secret-change-in-prod";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "storehub-refresh-secret-change-in-prod";

export const ACCESS_TOKEN_TTL_MS  = 15 * 60 * 1000;        // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 7  * 24 * 60 * 60 * 1000; // 7 days

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function signRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── Opaque token helpers ─────────────────────────────────────────────────────

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── OTP helpers ─────────────────────────────────────────────────────────────

export function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ─── Password helpers ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: "At least 8 characters required" };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: "At least one uppercase letter required" };
  if (!/[0-9]/.test(password)) return { valid: false, reason: "At least one number required" };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: "At least one special character required" };
  return { valid: true };
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

// When behind Replit's HTTPS proxy in production, set secure cookies.
// In dev, cookies work over HTTP with sameSite: lax.
const COOKIE_OPTS_BASE = {
  httpOnly: true,
  path:     "/",
  secure:   isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  remember: boolean
) {
  res.cookie("sh_access", accessToken, {
    ...COOKIE_OPTS_BASE,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  res.cookie("sh_refresh", refreshToken, {
    ...COOKIE_OPTS_BASE,
    maxAge: remember ? REFRESH_TOKEN_TTL_MS : undefined, // session cookie if remember=false
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("sh_access",  { ...COOKIE_OPTS_BASE });
  res.clearCookie("sh_refresh", { ...COOKIE_OPTS_BASE });
}

// ─── Challenge (WebAuthn) ─────────────────────────────────────────────────────

export function generateChallenge(): string {
  return crypto.randomBytes(32).toString("base64url");
}
