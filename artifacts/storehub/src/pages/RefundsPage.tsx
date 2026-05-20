import { useState, useEffect } from "react";
import { Search, RotateCcw, AlertCircle, CheckCircle, Lock } from "lucide-react";
import type { Sale, Refund } from "../schemas";
import { getSales } from "../services/dataService";
import { createRefund, getRefunds } from "../services/dataService";
import { processRefund, getRefundHistory } from "../services/refundService";
import { requiresManagerApproval } from "../services/securityService";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export default function RefundsPage() {
  const { profile } = useApp();
  const { activeStoreId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [refundReason, setRefundReason] = useState<"damaged" | "wrong_item" | "customer_changed_mind" | "other">("damaged");
  const [reasonNote, setReasonNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [managerPINRequired, setManagerPINRequired] = useState(false);
  const [managerPINInput, setManagerPINInput] = useState("");

  useEffect(() => {
    loadData();
  }, [activeStoreId]);

  const loadData = async () => {
    try {
      const salesData = await getSales();
      setSales(salesData);
      const refundsData = await getRefunds();
      setRefunds(refundsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  };

  const filteredSales = sales.filter((sale) =>
    sale.receiptNumber.includes(searchTerm) ||
    sale.createdAt.includes(searchTerm) ||
    sale.items.some((item) => item.productName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelectItem = (itemIndex: number, selected: boolean) => {
    const newSelected = new Set(selectedItems);
    if (selected) {
      newSelected.add(itemIndex);
      setQuantities({ ...quantities, [itemIndex]: selectedSale!.items[itemIndex].quantity });
    } else {
      newSelected.delete(itemIndex);
      const newQuantities = { ...quantities };
      delete newQuantities[itemIndex];
      setQuantities(newQuantities);
    }
    setSelectedItems(newSelected);
  };

  const handleQuantityChange = (itemIndex: number, qty: number) => {
    const maxQty = selectedSale!.items[itemIndex].quantity;
    if (qty > 0 && qty <= maxQty) {
      setQuantities({ ...quantities, [itemIndex]: qty });
    }
  };

  const calculateRefundAmount = (): number => {
    if (!selectedSale) return 0;
    let total = 0;
    selectedItems.forEach((itemIndex) => {
      const item = selectedSale.items[itemIndex];
      const qty = quantities[itemIndex] || 0;
      total += item.price * qty;
    });
    return total;
  };

  const handleProcessRefund = async () => {
    if (!selectedSale || selectedItems.size === 0) {
      setError("Please select items to refund");
      return;
    }

    const refundAmount = calculateRefundAmount();

    // Check if manager PIN is required
    if (requiresManagerApproval(refundAmount, profile)) {
      if (!managerPINInput) {
        setManagerPINRequired(true);
        toast.error("Manager PIN required for refunds over $" + profile?.managerPinThreshold);
        return;
      }
    }

    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const refundItems = Array.from(selectedItems).map((itemIndex) => ({
        productId: selectedSale.items[itemIndex].productId,
        productName: selectedSale.items[itemIndex].productName,
        quantity: quantities[itemIndex],
        price: selectedSale.items[itemIndex].price,
      }));

      // Use new refundService for proper PIN verification and logging
      const result = await processRefund(
        {
          saleId: selectedSale.id,
          items: refundItems,
          amount: refundAmount,
          reason: refundReason,
          reasonNote: reasonNote || undefined,
          requiresApproval: requiresManagerApproval(refundAmount, profile),
        },
        profile,
        "employee_001", // TODO: Get actual employee ID from auth context
        profile?.ownerName || "Unknown", // TODO: Get actual employee name from auth context
        managerPINInput || undefined
      );

      if (result.success) {
        toast.success(`Refund of $${refundAmount.toFixed(2)} processed successfully`);
        setSuccess(`Refund of $${refundAmount.toFixed(2)} processed successfully`);
        
        setSelectedSale(null);
        setSelectedItems(new Set());
        setQuantities({});
        setRefundReason("damaged");
        setReasonNote("");
        setManagerPINRequired(false);
        setManagerPINInput("");

        await loadData();
      } else {
        setError(result.error || "Failed to process refund");
        toast.error(result.error || "Failed to process refund");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to process refund";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Refunds & Returns</h1>
            <p className="text-gray-600">Process refunds for past transactions</p>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-green-900">Success</p>
              <p className="text-sm text-green-700 mt-1">{success}</p>
            </div>
          </div>
        )}

        {!selectedSale ? (
          // Transaction Search
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Find Transaction</h2>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Receipt #, date, or product name..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {filteredSales.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredSales.map((sale) => (
                  <button
                    key={sale.id}
                    onClick={() => {
                      setSelectedSale(sale);
                      setSelectedItems(new Set());
                      setQuantities({});
                    }}
                    className="w-full p-4 text-left border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">
                          Receipt #{sale.receiptNumber}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(sale.createdAt).toLocaleDateString()}{" "}
                          {new Date(sale.createdAt).toLocaleTimeString()}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {sale.items.length} item{sale.items.length !== 1 ? "s" : ""} •{" "}
                          {sale.items.map((i) => i.productName).join(", ")}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-gray-900">${sale.total.toFixed(2)}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? "No transactions found" : "Search to find a transaction"}
              </div>
            )}
          </div>
        ) : (
          // Refund Form
          <div className="bg-white rounded-lg border p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Receipt #{selectedSale.receiptNumber}
              </h2>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Items Selection */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Select items to refund</h3>
              <div className="space-y-2">
                {selectedSale.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 border rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(idx)}
                      onChange={(e) => handleSelectItem(idx, e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-sm text-gray-600">
                        ${item.price.toFixed(2)} × {item.quantity} = $
                        {(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    {selectedItems.has(idx) && (
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Qty:</label>
                        <input
                          type="number"
                          min="1"
                          max={item.quantity}
                          value={quantities[idx] || item.quantity}
                          onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value))}
                          className="w-12 px-2 py-1 border border-gray-300 rounded text-center"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Refund Reason</h3>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="damaged">Damaged</option>
                <option value="wrong_item">Wrong Item</option>
                <option value="customer_changed_mind">Customer Changed Mind</option>
                <option value="other">Other</option>
              </select>

              {refundReason === "other" && (
                <textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Please explain..."
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              )}
            </div>

            {/* Refund Summary */}
            {selectedItems.size > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">Refund Amount</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${calculateRefundAmount().toFixed(2)}
                </p>

                {/* Manager PIN Alert */}
                {requiresManagerApproval(calculateRefundAmount(), profile) && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex items-center gap-2 text-amber-700 mb-3">
                      <Lock className="w-4 h-4" />
                      <span className="font-medium text-sm">Manager PIN Required</span>
                    </div>
                    <p className="text-xs text-blue-600 mb-3">
                      This refund exceeds the threshold of ${profile?.managerPinThreshold}. Enter manager PIN to approve.
                    </p>
                    <input
                      type="password"
                      value={managerPINInput}
                      onChange={(e) => setManagerPINInput(e.target.value)}
                      placeholder="Enter manager PIN"
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={() => setSelectedSale(null)}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleProcessRefund}
                disabled={selectedItems.size === 0 || processing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {processing ? "Processing..." : "Process Refund"}
              </button>
            </div>
          </div>
        )}

        {/* Recent Refunds */}
        {refunds.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Refunds</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Sale #</th>
                    <th className="py-2 font-medium">Items</th>
                    <th className="py-2 font-medium">Amount</th>
                    <th className="py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.slice(0, 10).map((refund) => (
                    <tr key={refund.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        {new Date(refund.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 font-medium">{refund.saleId.slice(0, 8)}</td>
                      <td className="py-3">{refund.items.length} item(s)</td>
                      <td className="py-3 font-medium">${refund.amount.toFixed(2)}</td>
                      <td className="py-3 text-gray-600 capitalize">
                        {refund.reason.replace("_", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
