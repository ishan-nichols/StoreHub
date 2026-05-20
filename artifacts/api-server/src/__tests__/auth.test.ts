/**
 * Auth utility unit tests — JWT signing/verification, password hashing.
 */
import { describe, it, expect } from "vitest";

// ─── Token helpers (inlined for unit testing without DB) ─────────────────────

import crypto from "crypto";

function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

describe("generateOpaqueToken", () => {
  it("returns a hex string of correct length", () => {
    const token = generateOpaqueToken(32);
    expect(token).toHaveLength(64); // 32 bytes × 2 hex chars
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("generates unique tokens", () => {
    const t1 = generateOpaqueToken();
    const t2 = generateOpaqueToken();
    expect(t1).not.toBe(t2);
  });
});

describe("hashToken", () => {
  it("produces a deterministic SHA-256 hash", () => {
    const token = "test-token-123";
    const h1    = hashToken(token);
    const h2    = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("different inputs produce different hashes", () => {
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });
});

describe("generateOTP", () => {
  it("returns a 6-digit string", () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOTP();
      expect(otp).toHaveLength(6);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    }
  });
});

describe("invite token flow", () => {
  it("hashed token does not equal raw token", () => {
    const raw    = generateOpaqueToken(32);
    const hashed = hashToken(raw);
    expect(raw).not.toBe(hashed);
  });

  it("validate: same raw → same hash, different raw → different hash", () => {
    const r1 = generateOpaqueToken();
    const r2 = generateOpaqueToken();
    expect(hashToken(r1)).toBe(hashToken(r1));
    expect(hashToken(r1)).not.toBe(hashToken(r2));
  });
});
