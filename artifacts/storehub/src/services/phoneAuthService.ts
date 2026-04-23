/**
 * phoneAuthService.ts — Phone number OTP authentication
 *
 * INTEGRATION: SMS_PROVIDER
 * The sendOTP call triggers an SMS on the backend.
 * The backend stub shows the OTP in the API response in dev mode.
 * Plug in Twilio / Vonage / AWS SNS in the backend route:
 *   artifacts/api-server/src/routes/auth/index.ts → POST /phone/send-otp
 *
 * Country codes list — add/remove to customise supported countries.
 */

import { API_BASE_URL } from "./dataService";

const BASE = `${API_BASE_URL}/api/auth/phone`;

function authFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });
}

// ─── Country codes ────────────────────────────────────────────────────────────

export interface CountryCode {
  name:  string;
  code:  string; // ISO 2-letter
  dial:  string; // e.g. "+1"
  flag:  string; // emoji
}

export const COUNTRY_CODES: CountryCode[] = [
  { name: "United States",   code: "US", dial: "+1",   flag: "🇺🇸" },
  { name: "Mexico",          code: "MX", dial: "+52",  flag: "🇲🇽" },
  { name: "Canada",          code: "CA", dial: "+1",   flag: "🇨🇦" },
  { name: "Colombia",        code: "CO", dial: "+57",  flag: "🇨🇴" },
  { name: "Argentina",       code: "AR", dial: "+54",  flag: "🇦🇷" },
  { name: "Brazil",          code: "BR", dial: "+55",  flag: "🇧🇷" },
  { name: "Peru",            code: "PE", dial: "+51",  flag: "🇵🇪" },
  { name: "Chile",           code: "CL", dial: "+56",  flag: "🇨🇱" },
  { name: "Venezuela",       code: "VE", dial: "+58",  flag: "🇻🇪" },
  { name: "Ecuador",         code: "EC", dial: "+593", flag: "🇪🇨" },
  { name: "Guatemala",       code: "GT", dial: "+502", flag: "🇬🇹" },
  { name: "Honduras",        code: "HN", dial: "+504", flag: "🇭🇳" },
  { name: "El Salvador",     code: "SV", dial: "+503", flag: "🇸🇻" },
  { name: "Dominican Rep.",  code: "DO", dial: "+1",   flag: "🇩🇴" },
  { name: "Cuba",            code: "CU", dial: "+53",  flag: "🇨🇺" },
  { name: "United Kingdom",  code: "GB", dial: "+44",  flag: "🇬🇧" },
  { name: "Spain",           code: "ES", dial: "+34",  flag: "🇪🇸" },
  { name: "France",          code: "FR", dial: "+33",  flag: "🇫🇷" },
  { name: "Germany",         code: "DE", dial: "+49",  flag: "🇩🇪" },
  { name: "Nigeria",         code: "NG", dial: "+234", flag: "🇳🇬" },
  { name: "Ghana",           code: "GH", dial: "+233", flag: "🇬🇭" },
  { name: "Kenya",           code: "KE", dial: "+254", flag: "🇰🇪" },
  { name: "South Africa",    code: "ZA", dial: "+27",  flag: "🇿🇦" },
  { name: "India",           code: "IN", dial: "+91",  flag: "🇮🇳" },
  { name: "Philippines",     code: "PH", dial: "+63",  flag: "🇵🇭" },
  { name: "Australia",       code: "AU", dial: "+61",  flag: "🇦🇺" },
];

// ─── Send OTP ─────────────────────────────────────────────────────────────────

export interface SendOTPResult {
  maskedPhone:      string;
  expiresInSeconds: number;
  _devOtp?:         string; // Only present in dev mode — remove display in production
}

export async function sendOTP(fullPhone: string): Promise<SendOTPResult> {
  const res = await authFetch("/send-otp", {
    method: "POST",
    body: JSON.stringify({ phone: fullPhone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to send code");
  return data;
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export interface VerifyOTPResult {
  user:      { id: string; email: string | null; fullName: string; phoneNumber: string | null };
  isNewUser: boolean;
}

export async function verifyOTP(fullPhone: string, otp: string): Promise<VerifyOTPResult> {
  const res = await authFetch("/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone: fullPhone, otp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Verification failed");
  return data;
}

// ─── Phone number formatting ──────────────────────────────────────────────────

export function formatPhoneNumber(raw: string, dialCode: string): string {
  // Remove non-digits
  const digits = raw.replace(/\D/g, "");
  // Format US/Canada: (555) 555-5555
  if (dialCode === "+1") {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  // Generic: group in blocks of 3-4
  const groups = [];
  let remaining = digits;
  while (remaining.length > 0) {
    groups.push(remaining.slice(0, 4));
    remaining = remaining.slice(4);
  }
  return groups.join(" ");
}

export function fullPhoneNumber(dialCode: string, localNumber: string): string {
  const digits = localNumber.replace(/\D/g, "");
  return `${dialCode}${digits}`;
}
