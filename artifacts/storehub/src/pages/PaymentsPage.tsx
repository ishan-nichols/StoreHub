import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Printer, Mail, Phone } from "lucide-react";
import type { Sale, UserProfile } from "../schemas";
import type { PaymentMethodType } from "../services/posService";
import { processPayment } from "../services/paymentService";
import { printReceipt, emailReceipt, smsReceipt } from "../services/receiptService";
import { PaymentMethodGrid } from "../components/PaymentMethodGrid";
import { QRPaymentPanel } from "../components/QRPaymentPanel";
import { SplitPaymentModal } from "../components/SplitPaymentModal";

interface PaymentsPageProps {
  sale?: Sale;
  profile?: UserProfile;
  onPaymentComplete?: (result: any) => void;
}

export default function PaymentsPage({ sale, profile, onPaymentComplete }: PaymentsPageProps) {
  const [, setLocation] = useLocation();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showReceiptOptions, setShowReceiptOptions] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!sale) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">No sale data available</p>
      </div>
    );
  }

  const amount = sale.total;

  const handleSelectMethod = async (method: PaymentMethodType) => {
    if (method === "split") {
      setShowSplitModal(true);
      return;
    }

    if (method === "loyalty_points") {
      setError("Loyalty points payments must be processed from the POS loyalty checkout flow or with an assigned customer.");
      return;
    }

    setSelectedMethod(method);
    setError(null);

    if (method === "qr_cashapp" || method === "qr_venmo" || method === "qr_paypal" || method === "qr_zelle") {
      return;
    }

    if (method === "cash") {
      setProcessing(true);
      try {
        const result = await processPayment(method, amount);
        if (result.success) {
          setPaymentResult(result);
          setShowReceiptOptions(true);
        } else {
          setError(result.error || "Payment failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Payment processing failed");
      } finally {
        setProcessing(false);
      }
      return;
    }

    setProcessing(true);
    try {
      const result = await processPayment(method, amount);
      if (result.success) {
        setPaymentResult(result);
        setShowReceiptOptions(true);
      } else {
        setError(result.error || "Payment failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitPayment = async (method1: PaymentMethodType, amount1: number, method2: PaymentMethodType) => {
    setSelectedMethod("split");
    setProcessing(true);
    setError(null);

    try {
      const result = await processPayment("split", amount, {
        splitMethods: [
          { method: method1, amount: amount1 },
          { method: method2, amount: amount - amount1 },
        ],
      });

      if (result.success) {
        setPaymentResult(result);
        setShowReceiptOptions(true);
      } else {
        setError(result.error || "Split payment failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment processing failed");
    } finally {
      setProcessing(false);
      setShowSplitModal(false);
    }
  };

  const handlePrintReceipt = () => {
    if (profile) {
      printReceipt(sale, profile);
    }
  };

  const handleEmailReceipt = async () => {
    const email = prompt("Enter customer email:");
    if (email && profile) {
      try {
        await emailReceipt(sale, email, profile);
        alert("Receipt sent successfully!");
      } catch (err) {
        alert("Failed to send receipt");
      }
    }
  };

  const handleSmsReceipt = async () => {
    const phone = prompt("Enter customer phone number:");
    if (phone && profile) {
      try {
        await smsReceipt(sale, phone, profile);
        alert("Receipt sent via SMS!");
      } catch (err) {
        alert("Failed to send SMS");
      }
    }
  };

  if (showReceiptOptions && paymentResult) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold">Payment Complete</h1>
          <button
            onClick={() => window.history.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <div className="text-center">
            <div className="text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-green-600">Payment Successful</h2>
            <p className="text-gray-600 mt-2">Transaction ID: {paymentResult.transactionId}</p>
            <p className="text-3xl font-bold mt-4 text-gray-900">${amount.toFixed(2)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-md">
            <button
              onClick={handlePrintReceipt}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <Printer className="w-5 h-5" />
              <span className="text-xs font-medium">Print</span>
            </button>
            <button
              onClick={handleEmailReceipt}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <Mail className="w-5 h-5" />
              <span className="text-xs font-medium">Email</span>
            </button>
            <button
              onClick={handleSmsReceipt}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <Phone className="w-5 h-5" />
              <span className="text-xs font-medium">SMS</span>
            </button>
          </div>

          <button
            onClick={() => {
              setPaymentResult(null);
              setShowReceiptOptions(false);
              onPaymentComplete?.(paymentResult);
              window.history.back();
            }}
            className="w-full max-w-md px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (
    selectedMethod &&
    (selectedMethod === "qr_cashapp" || selectedMethod === "qr_venmo" || selectedMethod === "qr_paypal" || selectedMethod === "qr_zelle")
  ) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold">QR Code Payment</h1>
          <button
            onClick={() => {
              setSelectedMethod(null);
              setError(null);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <QRPaymentPanel
            method={selectedMethod}
            amount={amount}
            storeName={profile?.storeName}
            onConfirm={() => handleSelectMethod(selectedMethod)}
            onCancel={() => setSelectedMethod(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-xl font-bold">Payment</h1>
          <p className="text-sm text-gray-600">Order {sale.receiptNumber}</p>
        </div>
        <button
          onClick={() => window.history.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 bg-blue-50 border-b text-center">
        <p className="text-sm text-blue-600 font-medium">Amount Due</p>
        <p className="text-5xl font-bold text-blue-600">${amount.toFixed(2)}</p>
      </div>

      <div className="p-4 border-b">
        <details className="cursor-pointer">
          <summary className="font-medium text-gray-900">Order Summary ({sale.items.length} items)</summary>
          <div className="mt-3 space-y-2 text-sm">
            {sale.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-gray-600">
                <span>
                  {item.productName} × {item.quantity}
                </span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            {sale.tax > 0 && (
              <div className="flex justify-between text-gray-600 border-t pt-2 mt-2">
                <span>Tax</span>
                <span>${sale.tax.toFixed(2)}</span>
              </div>
            )}
          </div>
        </details>
      </div>

      {error && (
        <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm font-medium text-gray-900 mb-4">Select Payment Method</p>
        <PaymentMethodGrid
          amount={amount}
          onSelectMethod={handleSelectMethod}
        />
      </div>

      <div className="p-4 border-t bg-gray-50 flex gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        {selectedMethod && selectedMethod !== "split" && (
          <button
            onClick={() => handleSelectMethod(selectedMethod)}
            disabled={processing}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? "Processing..." : "Confirm Payment"}
          </button>
        )}
      </div>

      {showSplitModal && (
        <SplitPaymentModal
          amount={amount}
          onConfirm={handleSplitPayment}
          onCancel={() => setShowSplitModal(false)}
        />
      )}
    </div>
  );
}
