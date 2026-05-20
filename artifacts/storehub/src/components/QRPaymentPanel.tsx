import { useState, useEffect } from "react";
import { generateQRPaymentLink } from "../services/paymentService";
import type { PaymentMethodType } from "../services/posService";

interface QRPaymentPanelProps {
  method: "qr_cashapp" | "qr_venmo" | "qr_paypal" | "qr_zelle";
  amount: number;
  storeName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function QRPaymentPanel({ method, amount, storeName, onConfirm, onCancel }: QRPaymentPanelProps) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const [waitingForPayment, setWaitingForPayment] = useState(false);

  useEffect(() => {
    // Generate QR link
    const methodIds: Record<string, string> = {
      qr_cashapp: "$storehub",
      qr_venmo: "StoreHub",
      qr_paypal: "storehub@paypal.me",
      qr_zelle: "",
    };

    const url = generateQRPaymentLink(
      method,
      amount,
      methodIds[method] || "",
      `Payment for ${storeName || "order"}`
    );

    setQrUrl(url);
  }, [method, amount, storeName]);

  const methodLabels = {
    qr_cashapp: "Cash App",
    qr_venmo: "Venmo",
    qr_paypal: "PayPal",
    qr_zelle: "Zelle",
  };

  const methodInstructions = {
    qr_cashapp: "Scan with Cash App to pay ${{amount}}",
    qr_venmo: "Scan with Venmo to pay ${{amount}}",
    qr_paypal: "Scan with PayPal to pay ${{amount}}",
    qr_zelle: "Scan with Zelle to pay ${{amount}}",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-6 rounded-lg bg-gray-50">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">{methodLabels[method]}</h3>
        <p className="text-2xl font-bold text-blue-600 mt-2">${amount.toFixed(2)}</p>
      </div>

      {/* Mock QR Code Display */}
      <div className="w-40 h-40 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">📱</div>
          <p className="text-xs text-gray-500 font-mono">{method.toUpperCase()}</p>
          <p className="text-xs text-gray-400 mt-1">QR Code</p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          {methodInstructions[method].replace("{{amount}}", amount.toFixed(2))}
        </p>
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            setWaitingForPayment(true);
            // In production, would poll for payment confirmation
            setTimeout(onConfirm, 2000);
          }}
          disabled={waitingForPayment}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {waitingForPayment ? "Waiting for payment..." : "Payment received"}
        </button>
      </div>

      {waitingForPayment && (
        <div className="text-center">
          <p className="text-sm text-gray-600 italic">Waiting for customer to complete payment...</p>
        </div>
      )}
    </div>
  );
}
