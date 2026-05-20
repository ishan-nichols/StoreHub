/**
 * squareReaderService.ts — Square Mobile Payments SDK integration
 *
 * ─── API Credentials ──────────────────────────────────────────────────────────
 *   VITE_SQUARE_APPLICATION_ID  — Client-safe application ID. Set in your .env:
 *                                   VITE_SQUARE_APPLICATION_ID=sq0idp-xxxxxxxxxxxx
 *                                 Used to initialize the Square SDK on the client.
 *
 *   SQUARE_ACCESS_TOKEN         — Server-side only. NEVER expose to the browser.
 *                                 Set in your backend environment / secrets manager:
 *                                   SQUARE_ACCESS_TOKEN=EAAAl...
 *                                 Your backend reads this when calling Square APIs.
 *                                 See: processSquareReaderPayment() for the endpoint stub.
 *
 * ─── Production SDK Docs ─────────────────────────────────────────────────────
 *   Mobile (iOS/Android native): https://developer.squareup.com/docs/mobile-payments-sdk
 *   Web Payments SDK:            https://developer.squareup.com/docs/web-payments/overview
 *   Payments API (backend):      https://developer.squareup.com/reference/square/payments-api
 *
 * ─── Reader Support ──────────────────────────────────────────────────────────
 *   Square Reader for Contactless and Chip 2nd Gen supports:
 *     ✓ Contactless tap (Apple Pay, Google Pay, contactless cards)
 *     ✓ Chip insert (EMV)
 *     ✗ Magnetic stripe swipe — not supported on this reader
 *     ✗ PIN entry — not supported on this reader
 */

// ─── API Credentials (plug in here) ──────────────────────────────────────────
// VITE_SQUARE_APPLICATION_ID is safe to use in the browser.
// Add it to your .env file: VITE_SQUARE_APPLICATION_ID=sq0idp-xxxxxxxx
export const SQUARE_APPLICATION_ID =
  (import.meta.env.VITE_SQUARE_APPLICATION_ID as string | undefined) || "";

// SQUARE_ACCESS_TOKEN lives server-side only.
// Your backend endpoint (e.g. POST /api/square/payments) reads:
//   process.env.SQUARE_ACCESS_TOKEN  (Node.js / Express / Hono)
// Never reference it here.

// ─── Bluetooth Constants ──────────────────────────────────────────────────────
// Square Reader 2nd Gen advertises with Bluetooth LE service UUID 0xFEF4
const SQUARE_READER_SERVICE_UUID = 0xfef4;

const SQUARE_READER_STORAGE_KEY = "storehub_square_reader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SquareReaderDevice {
  id: string;
  name: string;
  bluetoothId?: string;
  pairedAt: string;
  isConnected: boolean;
  lastConnected?: string;
}

export interface ScannedSquareReader {
  bluetoothId: string;
  name: string;
}

export interface SquarePaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  lastFour?: string;
  network?: string;
  entryMethod?: "contactless" | "chip";
  error?: string;
  errorCode?: "declined" | "unsupported_entry_method" | "reader_disconnected" | "cancelled" | "unknown";
}

export interface SquarePaymentOptions {
  amountCents: number;
  currency: string;
  referenceId?: string;
  note?: string;
  idempotencyKey: string;
}

// ─── Reader Persistence ───────────────────────────────────────────────────────

export function getSavedSquareReader(): SquareReaderDevice | null {
  const raw = localStorage.getItem(SQUARE_READER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SquareReaderDevice;
  } catch {
    return null;
  }
}

export function saveSquareReader(reader: SquareReaderDevice): void {
  localStorage.setItem(SQUARE_READER_STORAGE_KEY, JSON.stringify(reader));
}

export function clearSavedSquareReader(): void {
  localStorage.removeItem(SQUARE_READER_STORAGE_KEY);
}

export function updateSquareReaderStatus(isConnected: boolean): SquareReaderDevice | null {
  const reader = getSavedSquareReader();
  if (!reader) return null;
  const updated: SquareReaderDevice = {
    ...reader,
    isConnected,
    ...(isConnected ? { lastConnected: new Date().toISOString() } : {}),
  };
  saveSquareReader(updated);
  return updated;
}

// ─── Bluetooth ────────────────────────────────────────────────────────────────

export function isBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Open the browser's Bluetooth picker filtered to Square readers.
 * Returns the device the user selects, or an empty array if they cancel.
 *
 * Production note: In a native iOS/Android app using the Square Mobile Payments
 * SDK, scanning is handled by SquareMobilePayments.readerManager.startScanning().
 * In a web browser we use the Web Bluetooth API which shows a native OS picker.
 */
export async function scanForSquareReaders(): Promise<ScannedSquareReader[]> {
  if (!isBluetoothAvailable()) {
    throw new Error(
      "Bluetooth is not available. Use Chrome or Edge on a device with Bluetooth enabled.",
    );
  }

  try {
    // The browser shows a native Bluetooth picker filtered to Square readers.
    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        { services: [SQUARE_READER_SERVICE_UUID] },
        { namePrefix: "Square Reader" },
        { namePrefix: "SQR-" },
      ],
      optionalServices: [SQUARE_READER_SERVICE_UUID],
    });

    if (device) {
      return [{ bluetoothId: device.id as string, name: (device.name as string) || "Square Reader" }];
    }
    return [];
  } catch (error: any) {
    // User dismissed the picker — not an error
    if (error.name === "NotFoundError" || error.message?.includes("cancel")) {
      return [];
    }
    throw error;
  }
}

// ─── Pairing & Unpairing ──────────────────────────────────────────────────────

export async function pairSquareReader(scanned: ScannedSquareReader): Promise<SquareReaderDevice> {
  // In production with Square Mobile Payments SDK:
  //   await SquareMobilePayments.readerManager.connect(scanned.bluetoothId);
  const reader: SquareReaderDevice = {
    id: crypto.randomUUID(),
    bluetoothId: scanned.bluetoothId,
    name: scanned.name,
    pairedAt: new Date().toISOString(),
    isConnected: true,
    lastConnected: new Date().toISOString(),
  };
  saveSquareReader(reader);
  return reader;
}

export async function unpairSquareReader(): Promise<void> {
  // In production with Square Mobile Payments SDK:
  //   await SquareMobilePayments.readerManager.disconnect();
  clearSavedSquareReader();
}

export async function reconnectSquareReader(): Promise<boolean> {
  // In production, attempt BLE reconnect using saved bluetoothId.
  // Web Bluetooth does not allow reconnecting by saved ID without a new user gesture.
  // Mark as connected based on last known state; production SDK handles this automatically.
  const reader = getSavedSquareReader();
  if (!reader) return false;
  // Optimistically mark as connected (production SDK would verify this)
  updateSquareReaderStatus(true);
  return true;
}

// ─── Payment Processing ───────────────────────────────────────────────────────

/**
 * Process a payment through the connected Square Reader.
 *
 * ── Production backend call ──────────────────────────────────────────────────
 * Replace the mock block below with a real fetch to your backend:
 *
 *   const response = await fetch("/api/square/payments", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({
 *       amount_money: { amount: options.amountCents, currency: options.currency },
 *       idempotency_key: options.idempotencyKey,
 *       reference_id: options.referenceId,
 *       note: options.note,
 *       // source_id comes from the nonce generated by reader interaction via SDK
 *     }),
 *   });
 *   // Your backend uses SQUARE_ACCESS_TOKEN to authorize with Square:
 *   //   Authorization: Bearer $SQUARE_ACCESS_TOKEN
 *   //   POST https://connect.squareup.com/v2/payments
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function processSquareReaderPayment(
  options: SquarePaymentOptions,
): Promise<SquarePaymentResult> {
  const reader = getSavedSquareReader();

  if (!reader || !reader.isConnected) {
    return {
      success: false,
      error: "Square Reader is not connected. Pair your reader in Settings > Card Reader.",
      errorCode: "reader_disconnected",
    };
  }

  // Simulate the reader interaction delay (customer taps/inserts card)
  await new Promise((resolve) => setTimeout(resolve, 2500));

  // ── Replace with real backend call in production ──────────────────────────
  // Simulate 90% approval rate for development/demo
  const approved = Math.random() > 0.1;

  if (!approved) {
    return {
      success: false,
      error: "Payment declined. Please try again or use a different payment method.",
      errorCode: "declined",
    };
  }

  const transactionId = `sq_${crypto.randomUUID().replace(/-/g, "").substring(0, 20)}`;

  return {
    success: true,
    transactionId,
    authCode: transactionId.substring(0, 6).toUpperCase(),
    lastFour: String(Math.floor(1000 + Math.random() * 9000)),
    network: ["Visa", "Mastercard", "Amex", "Discover"][Math.floor(Math.random() * 4)],
    entryMethod: Math.random() > 0.4 ? "contactless" : "chip",
  };
}

// ─── Reader Capabilities ──────────────────────────────────────────────────────

export const SQUARE_READER_CAPABILITIES = {
  contactless: true,   // Apple Pay, Google Pay, contactless cards
  chip: true,          // EMV chip insert
  swipe: false,        // Magnetic stripe — NOT supported on 2nd gen reader
  pin: false,          // PIN entry — NOT supported on 2nd gen reader
  unsupportedMessage:
    "This reader does not support swipe or PIN — please tap or insert chip.",
} as const;
