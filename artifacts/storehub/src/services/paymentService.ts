import type { PaymentMethodType } from "./posService";
import {
  processSquareReaderPayment,
  getSavedSquareReader,
  type SquarePaymentOptions,
} from "./squareReaderService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  method: PaymentMethodType;
  amount: number;
  error?: string;
  receiptInfo?: {
    authCode?: string;
    lastFour?: string;
    network?: string;
  };
}

export interface StripePaymentIntent {
  clientSecret: string;
  publishableKey: string;
}

export interface SquarePayment {
  sourceId: string;
  idempotencyKey: string;
}

// ─── Payment Processors ────────────────────────────────────────────────────────

// STRIPE INTEGRATION
export async function processStripePayment(
  amount: number,
  paymentMethodId: string,
  description: string,
): Promise<PaymentResult> {
  try {
    // This would normally call a backend endpoint to process via Stripe
    // For now, return a mock result
    return {
      success: true,
      transactionId: `stripe_${crypto.randomUUID()}`,
      method: "card_reader",
      amount,
      receiptInfo: {
        lastFour: "4242",
        network: "Visa",
      },
    };
  } catch (error) {
    return {
      success: false,
      method: "card_reader",
      amount,
      error: error instanceof Error ? error.message : "Stripe payment failed",
    };
  }
}

// SQUARE INTEGRATION — routes to squareReaderService which handles the
// connected Square Reader for Contactless and Chip 2nd Gen via Bluetooth.
// For online/manual Square payments, sourceId is used instead.
export async function processSquarePayment(
  amount: number,
  sourceId: string,
  description: string,
): Promise<PaymentResult> {
  try {
    // If a Square Reader is paired and connected, use it for in-person payment
    const squareReader = getSavedSquareReader();
    if (squareReader?.isConnected) {
      const opts: SquarePaymentOptions = {
        amountCents: Math.round(amount * 100),
        currency: "USD",
        idempotencyKey: crypto.randomUUID(),
        note: description || undefined,
      };
      const result = await processSquareReaderPayment(opts);
      return {
        success: result.success,
        transactionId: result.transactionId,
        method: "card_reader",
        amount,
        error: result.error,
        receiptInfo: result.transactionId
          ? {
              authCode: result.authCode,
              lastFour: result.lastFour,
              network: result.network,
            }
          : undefined,
      };
    }

    // Fallback: online Square payment using sourceId (e.g. Web Payments SDK nonce)
    // Backend call: POST /api/square/payments with SQUARE_ACCESS_TOKEN
    return {
      success: true,
      transactionId: `square_${crypto.randomUUID()}`,
      method: "card_reader",
      amount,
      receiptInfo: {
        lastFour: "4242",
        network: "Visa",
      },
    };
  } catch (error) {
    return {
      success: false,
      method: "card_reader",
      amount,
      error: error instanceof Error ? error.message : "Square payment failed",
    };
  }
}

// TAP TO PAY (NFC via Stripe or Square SDK)
export async function processTapToPayment(
  amount: number,
  provider: "stripe" | "square",
): Promise<PaymentResult> {
  try {
    if (!("NDEFReader" in window)) {
      return {
        success: false,
        method: "tap_to_pay",
        amount,
        error: "NFC not supported on this device",
      };
    }

    // Mock NFC read — in production, use NDEFReader API
    const transactionId = `nfc_${crypto.randomUUID()}`;

    return {
      success: true,
      transactionId,
      method: "tap_to_pay",
      amount,
      receiptInfo: {
        authCode: transactionId,
      },
    };
  } catch (error) {
    return {
      success: false,
      method: "tap_to_pay",
      amount,
      error: error instanceof Error ? error.message : "Tap to pay failed",
    };
  }
}

// APPLE PAY / GOOGLE PAY
export async function processDigitalWallet(
  amount: number,
  walletType: "apple_pay" | "google_pay",
): Promise<PaymentResult> {
  try {
    // Check for Payment Request API support
    if (!window.PaymentRequest) {
      return {
        success: false,
        method: walletType,
        amount,
        error: "Digital wallet not supported",
      };
    }

    // In production, this would use the Payment Request API
    // to show Apple Pay / Google Pay UI
    const transactionId = `${walletType}_${crypto.randomUUID()}`;

    return {
      success: true,
      transactionId,
      method: walletType,
      amount,
      receiptInfo: {
        authCode: transactionId,
      },
    };
  } catch (error) {
    return {
      success: false,
      method: walletType,
      amount,
      error: error instanceof Error ? error.message : "Digital wallet payment failed",
    };
  }
}

// MANUAL CARD ENTRY (via Stripe or Square card element)
export async function processManualCard(
  amount: number,
  provider: "stripe" | "square",
): Promise<PaymentResult> {
  try {
    // In production, Stripe/Square handles the card element securely
    // App never sees raw card data (PCI compliant)
    const transactionId = `manual_card_${crypto.randomUUID()}`;

    return {
      success: true,
      transactionId,
      method: "manual_card",
      amount,
      receiptInfo: {
        lastFour: "4242",
        network: "Visa",
      },
    };
  } catch (error) {
    return {
      success: false,
      method: "manual_card",
      amount,
      error: error instanceof Error ? error.message : "Manual card payment failed",
    };
  }
}

// CASH PAYMENT
export function processCashPayment(amount: number): PaymentResult {
  return {
    success: true,
    transactionId: `cash_${crypto.randomUUID()}`,
    method: "cash",
    amount,
  };
}

// QR CODE PAYMENTS (CashApp, Venmo, PayPal, Zelle)
export function generateQRPaymentLink(
  method: "qr_cashapp" | "qr_venmo" | "qr_paypal" | "qr_zelle",
  amount: number,
  recipientId: string,
  note?: string,
): string {
  const encodedNote = note ? encodeURIComponent(note) : "";

  switch (method) {
    case "qr_cashapp":
      return `https://cash.app/$${recipientId}/${amount}${encodedNote ? `?note=${encodedNote}` : ""}`;
    case "qr_venmo":
      return `https://venmo.com/?txn=charge&recipients=${recipientId}&amount=${amount}${encodedNote ? `&note=${encodedNote}` : ""}`;
    case "qr_paypal":
      return `https://paypal.me/${recipientId}/${amount}${encodedNote ? `?note=${encodedNote}` : ""}`;
    case "qr_zelle":
      // Zelle doesn't have a standard deep link, but we can provide instructions
      return `zelle://pay?amount=${amount}&memo=${encodedNote}`;
    default:
      return "";
  }
}

export async function processQRPayment(
  method: "qr_cashapp" | "qr_venmo" | "qr_paypal" | "qr_zelle",
  amount: number,
): Promise<PaymentResult> {
  return {
    success: true,
    transactionId: `qr_${method}_${crypto.randomUUID()}`,
    method,
    amount,
    receiptInfo: {
      authCode: `QR-${method.toUpperCase()}`,
    },
  };
}

// STORE CREDIT
export async function processStoreCredit(
  amount: number,
  customerId: string,
  customerBalance: number,
): Promise<PaymentResult> {
  if (customerBalance < amount) {
    return {
      success: false,
      method: "store_credit",
      amount,
      error: `Insufficient store credit. Available: $${customerBalance.toFixed(2)}`,
    };
  }

  return {
    success: true,
    transactionId: `credit_${crypto.randomUUID()}`,
    method: "store_credit",
    amount,
    receiptInfo: {
      authCode: `CREDIT-${customerId}`,
    },
  };
}

// LOYALTY POINTS
export async function processLoyaltyPoints(
  amount: number,
  customerId: string,
  pointsPerDollar: number = 1,
): Promise<PaymentResult> {
  const pointsNeeded = Math.ceil(amount * pointsPerDollar);

  return {
    success: true,
    transactionId: `loyalty_${crypto.randomUUID()}`,
    method: "loyalty_points",
    amount,
    receiptInfo: {
      authCode: `${pointsNeeded}-POINTS`,
    },
  };
}

// SPLIT PAYMENT
export async function processSplitPayment(
  amount: number,
  method1: PaymentMethodType,
  amount1: number,
  method2: PaymentMethodType,
): Promise<PaymentResult> {
  const amount2 = amount - amount1;

  if (amount2 < 0) {
    return {
      success: false,
      method: "split",
      amount,
      error: "First payment amount exceeds total",
    };
  }

  try {
    // Process method1
    let result1: PaymentResult;
    if (method1 === "cash") {
      result1 = processCashPayment(amount1);
    } else if (method1.startsWith("qr_")) {
      result1 = await processQRPayment(method1 as any, amount1);
    } else {
      // For other methods, would need context (Stripe key, etc.)
      result1 = {
        success: true,
        transactionId: `split_${crypto.randomUUID()}_1`,
        method: method1,
        amount: amount1,
      };
    }

    if (!result1.success) {
      return {
        success: false,
        method: "split",
        amount,
        error: `First payment failed: ${result1.error}`,
      };
    }

    // Process method2
    let result2: PaymentResult;
    if (method2 === "cash") {
      result2 = processCashPayment(amount2);
    } else if (method2.startsWith("qr_")) {
      result2 = await processQRPayment(method2 as any, amount2);
    } else {
      result2 = {
        success: true,
        transactionId: `split_${crypto.randomUUID()}_2`,
        method: method2,
        amount: amount2,
      };
    }

    if (!result2.success) {
      return {
        success: false,
        method: "split",
        amount,
        error: `Second payment failed: ${result2.error}`,
      };
    }

    return {
      success: true,
      transactionId: `split_${crypto.randomUUID()}`,
      method: "split",
      amount,
      receiptInfo: {
        authCode: `${method1}(${amount1})+${method2}(${amount2})`,
      },
    };
  } catch (error) {
    return {
      success: false,
      method: "split",
      amount,
      error: error instanceof Error ? error.message : "Split payment failed",
    };
  }
}

// ─── Main Payment Router ───────────────────────────────────────────────────────

export async function processPayment(
  method: PaymentMethodType,
  amount: number,
  context?: {
    stripePaymentMethodId?: string;
    squareSourceId?: string;
    customerId?: string;
    customerBalance?: number;
    pointsPerDollar?: number;
    provider?: "stripe" | "square";
    splitMethods?: { method: PaymentMethodType; amount: number }[];
    description?: string;
  },
): Promise<PaymentResult> {
  if (amount <= 0) {
    return {
      success: false,
      method,
      amount,
      error: "Invalid amount",
    };
  }

  switch (method) {
    case "card_reader":
      if (context?.stripePaymentMethodId) {
        return processStripePayment(amount, context.stripePaymentMethodId, context.description || "");
      } else if (context?.squareSourceId) {
        return processSquarePayment(amount, context.squareSourceId, context.description || "");
      }
      return {
        success: false,
        method,
        amount,
        error: "No card reader or payment method ID provided",
      };

    case "tap_to_pay":
      return processTapToPayment(amount, context?.provider || "stripe");

    case "apple_pay":
    case "google_pay":
      return processDigitalWallet(amount, method);

    case "manual_card":
      return processManualCard(amount, context?.provider || "stripe");

    case "cash":
      return processCashPayment(amount);

    case "qr_cashapp":
    case "qr_venmo":
    case "qr_paypal":
    case "qr_zelle":
      return processQRPayment(method, amount);

    case "store_credit":
      return processStoreCredit(
        amount,
        context?.customerId || "",
        context?.customerBalance || 0,
      );

    case "loyalty_points":
      return processLoyaltyPoints(amount, context?.customerId || "", context?.pointsPerDollar);

    case "split":
      if (context?.splitMethods && context.splitMethods.length === 2) {
        return processSplitPayment(
          amount,
          context.splitMethods[0].method,
          context.splitMethods[0].amount,
          context.splitMethods[1].method,
        );
      }
      return {
        success: false,
        method,
        amount,
        error: "Split payment requires exactly 2 methods",
      };

    default:
      return {
        success: false,
        method,
        amount,
        error: `Unknown payment method: ${method}`,
      };
  }
}

// ─── Hardware Detection ────────────────────────────────────────────────────────

export interface HardwareCapabilities {
  bluetoothAvailable: boolean;
  nfcAvailable: boolean;
  applePay: boolean;
  googlePay: boolean;
  paymentRequestAvailable: boolean;
}

export function detectHardwareCapabilities(): HardwareCapabilities {
  return {
    bluetoothAvailable: "bluetooth" in navigator,
    nfcAvailable: "NDEFReader" in window,
    applePay:
      typeof window !== "undefined" &&
      typeof (window as any).ApplePaySession !== "undefined" &&
      (window as any).ApplePaySession.canMakePayments(),
    googlePay:
      typeof window !== "undefined" &&
      typeof (window as any).google !== "undefined" &&
      typeof (window as any).google.payments !== "undefined",
    paymentRequestAvailable: "PaymentRequest" in window,
  };
}
