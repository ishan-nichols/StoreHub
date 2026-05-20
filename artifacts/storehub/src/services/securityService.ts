/**
 * securityService.ts — Payment and POS security features
 * 
 * Handles:
 * - Manager PIN verification for high-value transactions
 * - Biometric authentication for cash drawer access
 * - Transaction logging and audit trails
 * - PCI compliance and data protection
 */

import type { UserProfile } from "../schemas";
import { generateId, now } from "../utils";

// ─── Transaction Logging ──────────────────────────────────────────────────────

export interface TransactionLog {
  id: string;
  type: "sale" | "refund" | "cash_in" | "cash_out" | "cash_drawer_open" | "manager_override";
  amount: number;
  employeeId: string;
  employeeName: string;
  timestamp: string;
  method?: string;
  description?: string;
  managerApproval?: { managerId: string; managerName: string; timestamp: string };
}

const TRANSACTION_LOGS_KEY = "storehub_transaction_logs";

export function logTransaction(log: Omit<TransactionLog, "id" | "timestamp">): TransactionLog {
  const transaction: TransactionLog = {
    ...log,
    id: generateId(),
    timestamp: now(),
  };

  const logs = JSON.parse(localStorage.getItem(TRANSACTION_LOGS_KEY) || "[]") as TransactionLog[];
  logs.push(transaction);
  localStorage.setItem(TRANSACTION_LOGS_KEY, JSON.stringify(logs));

  return transaction;
}

export function getTransactionLogs(
  dateStart?: string,
  dateEnd?: string,
  employeeId?: string,
): TransactionLog[] {
  const logs = JSON.parse(localStorage.getItem(TRANSACTION_LOGS_KEY) || "[]") as TransactionLog[];

  return logs.filter((log) => {
    const logDate = log.timestamp.split("T")[0];
    if (dateStart && logDate < dateStart) return false;
    if (dateEnd && logDate > dateEnd) return false;
    if (employeeId && log.employeeId !== employeeId) return false;
    return true;
  });
}

export function getTransactionLogsByType(
  type: TransactionLog["type"],
  limit: number = 100,
): TransactionLog[] {
  const logs = JSON.parse(localStorage.getItem(TRANSACTION_LOGS_KEY) || "[]") as TransactionLog[];
  return logs.filter((log) => log.type === type).slice(-limit);
}

// ─── Manager PIN Verification ────────────────────────────────────────────────────

const MANAGER_PIN_ATTEMPTS_KEY = "storehub_manager_pin_attempts";
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_MINUTES = 15;

interface PINAttempt {
  timestamp: string;
  success: boolean;
}

function getPINAttempts(): PINAttempt[] {
  return JSON.parse(localStorage.getItem(MANAGER_PIN_ATTEMPTS_KEY) || "[]");
}

function recordPINAttempt(success: boolean): void {
  const attempts = getPINAttempts();
  const now_time = new Date().toISOString();
  
  // Remove attempts older than 15 minutes
  const recent = attempts.filter((a) => {
    const ageMinutes = (new Date(now_time).getTime() - new Date(a.timestamp).getTime()) / 60000;
    return ageMinutes < PIN_LOCKOUT_MINUTES;
  });

  recent.push({ timestamp: now_time, success });
  localStorage.setItem(MANAGER_PIN_ATTEMPTS_KEY, JSON.stringify(recent));
}

function isLockedOut(): boolean {
  const attempts = getPINAttempts();
  const recentAttempts = attempts.filter((a) => {
    const ageMinutes = (new Date().getTime() - new Date(a.timestamp).getTime()) / 60000;
    return ageMinutes < PIN_LOCKOUT_MINUTES;
  });

  const recentFailures = recentAttempts.filter((a) => !a.success).length;
  return recentFailures >= MAX_PIN_ATTEMPTS;
}

const DEFAULT_MANAGER_PIN = "1234";

export function verifyManagerPIN(
  inputPIN: string,
  profile: UserProfile | null,
): { valid: boolean; error?: string } {
  if (!profile) {
    return { valid: false, error: "No user profile found" };
  }

  if (isLockedOut()) {
    return {
      valid: false,
      error: `Account locked. Too many failed attempts. Try again in ${PIN_LOCKOUT_MINUTES} minutes.`,
    };
  }

  const requiredPin = profile.paymentSettings?.managerPinRequired ? DEFAULT_MANAGER_PIN : "";
  if (!requiredPin) {
    return { valid: true };
  }

  const isValid = inputPIN === requiredPin;
  recordPINAttempt(isValid);

  if (!isValid) {
    const attempts = getPINAttempts();
    const recentFailures = attempts.filter((a) => !a.success).length;
    const remaining = MAX_PIN_ATTEMPTS - recentFailures;
    return {
      valid: false,
      error: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    };
  }

  return { valid: true };
}

export function requiresManagerApproval(amount: number, profile: UserProfile | null): boolean {
  if (!profile?.paymentSettings?.managerPinRequired) return false;
  return amount >= (profile.paymentSettings?.managerPinThreshold || 0);
}

export function getManagerPINStatus(): {
  locked: boolean;
  attemptsRemaining: number;
  minutesUntilUnlock: number;
} {
  const locked = isLockedOut();
  const attempts = getPINAttempts();
  const recentFailures = attempts.filter((a) => !a.success).length;
  const attemptsRemaining = MAX_PIN_ATTEMPTS - recentFailures;

  let minutesUntilUnlock = 0;
  if (locked && attempts.length > 0) {
    const oldestAttempt = attempts[attempts.length - 1];
    const ageMs = new Date().getTime() - new Date(oldestAttempt.timestamp).getTime();
    minutesUntilUnlock = Math.ceil((PIN_LOCKOUT_MINUTES * 60000 - ageMs) / 60000);
  }

  return { locked, attemptsRemaining, minutesUntilUnlock };
}

// ─── Biometric Authentication ─────────────────────────────────────────────────

export interface BiometricCredential {
  id: string;
  type: "fingerprint" | "face" | "iris";
  createdAt: string;
  name: string;
}

const BIOMETRIC_CREDS_KEY = "storehub_biometric_credentials";

export function getBiometricCredentials(): BiometricCredential[] {
  return JSON.parse(localStorage.getItem(BIOMETRIC_CREDS_KEY) || "[]");
}

export function addBiometricCredential(
  type: "fingerprint" | "face" | "iris",
  name: string,
): BiometricCredential {
  const cred: BiometricCredential = {
    id: generateId(),
    type,
    createdAt: now(),
    name,
  };

  const creds = getBiometricCredentials();
  creds.push(cred);
  localStorage.setItem(BIOMETRIC_CREDS_KEY, JSON.stringify(creds));

  return cred;
}

export function removeBiometricCredential(id: string): boolean {
  const creds = getBiometricCredentials();
  const filtered = creds.filter((c) => c.id !== id);
  localStorage.setItem(BIOMETRIC_CREDS_KEY, JSON.stringify(filtered));
  return filtered.length < creds.length;
}

export function isBiometricAvailable(): boolean {
  if (typeof window === "undefined") return false;

  return (
    "PublicKeyCredential" in window ||
    ("webkitGetUserMedia" in navigator && "mediaDevices" in navigator)
  );
}

// ─── PCI Compliance ────────────────────────────────────────────────────────

/**
 * IMPORTANT: Raw card data NEVER appears in this app.
 * All card payments are tokenized by Stripe or Square SDK.
 * This function ensures compliance by logging that payment was processed
 * without storing card details.
 */
export function logPaymentProcessed(
  transactionId: string,
  amount: number,
  processor: "stripe" | "square",
  lastFour: string,
  maskedCard: string,
): void {
  logTransaction({
    type: "sale",
    amount,
    employeeId: "system",
    employeeName: "Card Payment",
    method: processor,
    description: `${maskedCard} ending in ${lastFour}`,
  });
}

// ─── Cash Drawer Access Log ───────────────────────────────────────────────

export function logCashDrawerAccess(
  employeeId: string,
  employeeName: string,
  method: "pin" | "biometric",
): void {
  logTransaction({
    type: "cash_drawer_open",
    amount: 0,
    employeeId,
    employeeName,
    description: `Cash drawer opened via ${method}`,
  });
}
