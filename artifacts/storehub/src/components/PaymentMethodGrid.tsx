import { useState } from "react";
import { CreditCard, Smartphone, Apple, Wallet, Zap, GitBranch, Gift, Coins, QrCode } from "lucide-react";
import type { PaymentMethodType } from "../services/posService";
import { detectHardwareCapabilities } from "../services/paymentService";

interface PaymentMethodGridProps {
  onSelectMethod: (method: PaymentMethodType) => void;
  amount: number;
}

export function PaymentMethodGrid({ onSelectMethod, amount }: PaymentMethodGridProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType | null>(null);
  const hardware = detectHardwareCapabilities();

  const methods: { type: PaymentMethodType; label: string; icon: React.ReactNode; available: boolean; badge?: string }[] = [
    {
      type: "tap_to_pay",
      label: "Tap to Pay",
      icon: <Smartphone className="w-8 h-8" />,
      available: hardware.nfcAvailable || hardware.bluetoothAvailable,
      badge: hardware.nfcAvailable ? "Ready" : "Not available",
    },
    {
      type: "card_reader",
      label: "Card Reader",
      icon: <CreditCard className="w-8 h-8" />,
      available: hardware.bluetoothAvailable,
      badge: "Connect device",
    },
    {
      type: "apple_pay",
      label: "Apple Pay",
      icon: <Apple className="w-8 h-8" />,
      available: hardware.applePay,
      badge: hardware.applePay ? "Ready" : "Not available",
    },
    {
      type: "google_pay",
      label: "Google Pay",
      icon: <Wallet className="w-8 h-8" />,
      available: hardware.googlePay,
      badge: hardware.googlePay ? "Ready" : "Not available",
    },
    {
      type: "qr_cashapp",
      label: "CashApp",
      icon: <QrCode className="w-8 h-8" />,
      available: true,
      badge: "QR code",
    },
    {
      type: "qr_venmo",
      label: "Venmo",
      icon: <QrCode className="w-8 h-8" />,
      available: true,
      badge: "QR code",
    },
    {
      type: "qr_paypal",
      label: "PayPal",
      icon: <QrCode className="w-8 h-8" />,
      available: true,
      badge: "QR code",
    },
    {
      type: "qr_zelle",
      label: "Zelle",
      icon: <QrCode className="w-8 h-8" />,
      available: true,
      badge: "QR code",
    },
    {
      type: "manual_card",
      label: "Manual Entry",
      icon: <CreditCard className="w-8 h-8" />,
      available: true,
      badge: "Keypad",
    },
    {
      type: "cash",
      label: "Cash",
      icon: <Coins className="w-8 h-8" />,
      available: true,
    },
    {
      type: "split",
      label: "Split",
      icon: <GitBranch className="w-8 h-8" />,
      available: true,
      badge: "2 methods",
    },
    {
      type: "store_credit",
      label: "Store Credit",
      icon: <Gift className="w-8 h-8" />,
      available: true,
    },
    {
      type: "loyalty_points",
      label: "Loyalty Points",
      icon: <Coins className="w-8 h-8" />,
      available: true,
      badge: "Redeem",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
      {methods.map((method) => (
        <button
          key={method.type}
          onClick={() => {
            setSelectedMethod(method.type);
            onSelectMethod(method.type);
          }}
          disabled={!method.available}
          className={`
            relative flex flex-col items-center justify-center gap-2 p-4 rounded-lg
            border-2 transition-all
            ${
              selectedMethod === method.type
                ? "border-blue-500 bg-blue-50"
                : method.available
                  ? "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
                  : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
            }
          `}
        >
          <div
            className={`
              ${selectedMethod === method.type ? "text-blue-600" : method.available ? "text-gray-700" : "text-gray-400"}
            `}
          >
            {method.icon}
          </div>
          <span className="text-xs font-medium text-center leading-tight">{method.label}</span>
          {method.badge && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {method.badge}
            </span>
          )}
          {selectedMethod === method.type && (
            <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
