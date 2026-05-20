import { CreditCard, Smartphone, QrCode, Wallet, DollarSign, Zap, Split, Gift, Trophy } from "lucide-react";

interface PaymentMethodsProps {
  total: number;
  onSelect: (method: string) => void;
  onClose: () => void;
}

export function PaymentMethods({ total, onSelect, onClose }: PaymentMethodsProps) {
  const methods = [
    { id: "tap", label: "Tap to Pay", icon: Smartphone, color: "bg-blue-600", desc: "NFC on phone" },
    { id: "card_reader", label: "Card Reader", icon: CreditCard, color: "bg-purple-600", desc: "Insert or tap card" },
    { id: "apple_pay", label: "Apple Pay", icon: Wallet, color: "bg-black", desc: "iPhone/Watch" },
    { id: "google_pay", label: "Google Pay", icon: Smartphone, color: "bg-red-600", desc: "Android" },
    { id: "qr", label: "QR Code", icon: QrCode, color: "bg-green-600", desc: "CashApp, Venmo, PayPal" },
    { id: "manual", label: "Manual Entry", icon: CreditCard, color: "bg-gray-600", desc: "Phone orders" },
    { id: "cash", label: "Cash", icon: DollarSign, color: "bg-green-700", desc: "Open drawer" },
    { id: "split", label: "Split Payment", icon: Split, color: "bg-orange-600", desc: "2 methods" },
    { id: "loyalty", label: "Loyalty Points", icon: Trophy, color: "bg-yellow-600", desc: "Redeem points" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold">Select Payment Method</h2>
              <p className="text-blue-100 mt-1">Choose how to process this payment</p>
            </div>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-blue-100 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-8">
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
            <p className="text-sm text-blue-600 font-semibold">Amount Due</p>
            <p className="text-4xl font-bold text-blue-900 mt-1">USD ${total.toFixed(2)}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {methods.map(method => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  onClick={() => onSelect(method.id)}
                  className={`${method.color} p-6 rounded-xl text-white hover:opacity-90 transition duration-150 active:scale-95 text-left`}
                >
                  <Icon size={32} className="mb-2" />
                  <p className="font-bold text-lg">{method.label}</p>
                  <p className="text-sm opacity-90 mt-1">{method.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-500">
              💡 <strong>Tip:</strong> App detects connected hardware. If no reader available, QR code and manual entry work as fallback with no equipment needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
