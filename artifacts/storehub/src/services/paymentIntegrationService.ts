import type { Sale, UserProfile } from "../schemas";
import type { PaymentMethodType } from "./posService";
import { processPayment, detectHardwareCapabilities } from "./paymentService";
import { getCurrentShift, addCashIn } from "./cashDrawerService";

export interface PaymentProcessingResult {
  success: boolean;
  sale?: Sale;
  error?: string;
  transactionId?: string;
  receipt?: {
    number: string;
    total: number;
    method: PaymentMethodType;
  };
}

export async function processPaymentForSale(
  amount: number,
  method: PaymentMethodType,
  receiptNumber: string,
  profile: UserProfile,
  options?: {
    customerId?: string;
    splitMethods?: { method: PaymentMethodType; amount: number }[];
  }
): Promise<PaymentProcessingResult> {
  if (amount <= 0) {
    return { success: false, error: "Invalid amount" };
  }

  if (profile.paymentsEnabled === false) {
    return { success: false, error: "Payments not enabled in settings" };
  }

  try {
    const paymentResult = await processPayment(method, amount, {
      customerId: options?.customerId,
      provider: profile.paymentSettings?.stripeConnected ? "stripe" : "square",
      splitMethods: options?.splitMethods,
    });

    if (!paymentResult.success) {
      return { success: false, error: paymentResult.error || "Payment failed" };
    }

    // Track in cash shift if it's a cash payment
    if (method === "cash") {
      const shift = getCurrentShift();
      if (shift) {
        try {
          addCashIn(amount, `Sale #${receiptNumber}`);
        } catch (err) {
          console.warn("Failed to update cash shift:", err);
        }
      }
    }

    return {
      success: true,
      transactionId: paymentResult.transactionId,
      receipt: {
        number: receiptNumber,
        total: amount,
        method,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Payment processing failed",
    };
  }
}

export function getAvailablePaymentMethods(profile: UserProfile) {
  const hardware = detectHardwareCapabilities();
  const settings = profile.paymentSettings || {};

  const methods: {
    type: PaymentMethodType;
    label: string;
    available: boolean;
    badge?: string;
  }[] = [
    {
      type: "tap_to_pay",
      label: "Tap to Pay",
      available: hardware.nfcAvailable,
      badge: "NFC",
    },
    {
      type: "card_reader",
      label: "Card Reader",
      available: !!settings.connectedReader,
      badge: settings.connectedReader?.model,
    },
    {
      type: "apple_pay",
      label: "Apple Pay",
      available: hardware.applePay,
    },
    {
      type: "google_pay",
      label: "Google Pay",
      available: hardware.googlePay,
    },
    {
      type: "qr_cashapp",
      label: "CashApp",
      available: true,
      badge: "QR",
    },
    {
      type: "qr_venmo",
      label: "Venmo",
      available: true,
      badge: "QR",
    },
    {
      type: "qr_paypal",
      label: "PayPal",
      available: true,
      badge: "QR",
    },
    {
      type: "qr_zelle",
      label: "Zelle",
      available: true,
      badge: "QR",
    },
    {
      type: "manual_card",
      label: "Manual Entry",
      available: true,
      badge: "Keypad",
    },
    {
      type: "cash",
      label: "Cash",
      available: true,
    },
    {
      type: "split",
      label: "Split Payment",
      available: true,
      badge: "2 methods",
    },
    {
      type: "store_credit",
      label: "Store Credit",
      available: true,
    },
    {
      type: "loyalty_points",
      label: "Loyalty Points",
      available: true,
    },
  ];

  return methods;
}

export function isPaymentSystemEnabled(profile?: UserProfile): boolean {
  return profile?.paymentsEnabled !== false;
}

export function requiresPaymentMethod(paymentMethod: PaymentMethodType): boolean {
  const skipMethods = ["cash", "split"];
  return !skipMethods.includes(paymentMethod);
}

export function validatePaymentMethod(
  method: PaymentMethodType,
  amount: number,
  profile?: UserProfile
): { valid: boolean; message?: string } {
  if (profile?.paymentsEnabled === false) {
    return {
      valid: false,
      message: "Payments are not enabled. Enable in Settings > Payments & POS.",
    };
  }

  if (amount <= 0) {
    return { valid: false, message: "Invalid payment amount" };
  }

  if (method === "card_reader" && !profile.paymentSettings?.connectedReader) {
    return {
      valid: false,
      message: "No card reader connected. Pair a reader in Settings.",
    };
  }

  if (method === "store_credit" && !profile.paymentSettings) {
    return {
      valid: false,
      message: "Store credit not configured. Check Settings > Payments & POS.",
    };
  }

  return { valid: true };
}
