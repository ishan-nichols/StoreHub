import { useState } from "react";
import { X, GitBranch } from "lucide-react";
import type { PaymentMethodType } from "../services/posService";
import { PaymentMethodGrid } from "./PaymentMethodGrid";

interface SplitPaymentModalProps {
  amount: number;
  onConfirm: (method1: PaymentMethodType, amount1: number, method2: PaymentMethodType) => void;
  onCancel: () => void;
}

export function SplitPaymentModal({ amount, onConfirm, onCancel }: SplitPaymentModalProps) {
  const [step, setStep] = useState<"method1" | "amount1" | "method2">("method1");
  const [method1, setMethod1] = useState<PaymentMethodType | null>(null);
  const [amount1, setAmount1] = useState<string>("");
  const [method2, setMethod2] = useState<PaymentMethodType | null>(null);

  const amount2 = amount - parseFloat(amount1 || "0");

  const handleSelectMethod1 = (method: PaymentMethodType) => {
    setMethod1(method);
    setStep("amount1");
  };

  const handleSelectMethod2 = (method: PaymentMethodType) => {
    setMethod2(method);
    if (method1 && amount1 && parseFloat(amount1) > 0) {
      onConfirm(method1, parseFloat(amount1), method);
    }
  };

  const handleAmountChange = (val: string) => {
    const num = parseFloat(val) || 0;
    if (num > 0 && num <= amount) {
      setAmount1(val);
    }
  };

  const handleContinue = () => {
    if (amount1 && parseFloat(amount1) > 0 && parseFloat(amount1) <= amount) {
      setStep("method2");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Split Payment</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6 p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-sm text-gray-600 mb-1">Total Amount</p>
            <p className="text-3xl font-bold text-blue-600">${amount.toFixed(2)}</p>
          </div>

          {step === "method1" && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-4">Select first payment method</p>
              <PaymentMethodGrid amount={amount} onSelectMethod={handleSelectMethod1} />
            </div>
          )}

          {step === "amount1" && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-4">How much with {method1}?</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">First Payment Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-2xl font-semibold text-gray-600">$</span>
                    <input
                      type="number"
                      value={amount1}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      max={amount}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {amount1 && parseFloat(amount1) > 0 && (
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">Remaining with second method</p>
                    <p className="text-2xl font-bold text-gray-900">${amount2.toFixed(2)}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setMethod1(null);
                      setAmount1("");
                      setStep("method1");
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!amount1 || parseFloat(amount1) <= 0 || parseFloat(amount1) > amount}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "method2" && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-4">
                Select second payment method for ${amount2.toFixed(2)}
              </p>
              <PaymentMethodGrid amount={amount2} onSelectMethod={handleSelectMethod2} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
