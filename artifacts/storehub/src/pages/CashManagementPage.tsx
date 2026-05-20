import { useState, useEffect } from "react";
import { Plus, X, CheckCircle, AlertCircle, DollarSign } from "lucide-react";
import type { CashShift } from "../schemas";
import {
  openShift,
  closeShift,
  getCurrentShift,
  getShiftReport,
  getDailyReport,
  getRecentShifts,
} from "../services/cashDrawerService";

export default function CashManagementPage() {
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null);
  const [recentShifts, setRecentShifts] = useState<CashShift[]>([]);
  const [floatAmount, setFloatAmount] = useState<string>("");
  const [countedAmount, setCountedAmount] = useState<string>("");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const shift = getCurrentShift();
      setCurrentShift(shift);
      const shifts = getRecentShifts(10);
      setRecentShifts(shifts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shifts");
    }
  };

  const handleOpenShift = async () => {
    const float = parseFloat(floatAmount);
    if (isNaN(float) || float < 0) {
      setError("Invalid opening float");
      return;
    }

    setLoading(true);
    try {
      const shift = openShift(float);
      setCurrentShift(shift);
      setFloatAmount("");
      setShowOpenForm(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open shift");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;

    const counted = parseFloat(countedAmount);
    if (isNaN(counted) || counted < 0) {
      setError("Invalid counted amount");
      return;
    }

    setLoading(true);
    try {
      const closed = closeShift(currentShift.id, counted);
      setCurrentShift(null);
      setCountedAmount("");
      setShowCloseForm(false);
      setError(null);
      await loadShifts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close shift");
    } finally {
      setLoading(false);
    }
  };

  const balance = currentShift
    ? {
        openingFloat: currentShift.openingFloat,
        cashIn: currentShift.cashIn,
        cashOut: currentShift.cashOut,
        expected: currentShift.openingFloat + currentShift.cashIn - currentShift.cashOut,
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cash Management</h1>
            <p className="text-gray-600">Track and reconcile cash shifts</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 hover:text-red-800 mt-2 font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Current Shift */}
        {currentShift && !currentShift.closedAt && balance && (
          <div className="bg-white rounded-lg border-2 border-blue-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              Active Shift
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">Opening Float</p>
                <p className="text-2xl font-bold text-blue-900">${balance.openingFloat.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600 font-medium">Cash In</p>
                <p className="text-2xl font-bold text-green-900">${balance.cashIn.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 font-medium">Cash Out</p>
                <p className="text-2xl font-bold text-red-900">${balance.cashOut.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Expected</p>
                <p className="text-2xl font-bold text-gray-900">${balance.expected.toFixed(2)}</p>
              </div>
            </div>

            {!showCloseForm ? (
              <button
                onClick={() => setShowCloseForm(true)}
                className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                Close Shift & Reconcile
              </button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Counted Cash Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xl font-semibold text-gray-600">$</span>
                    <input
                      type="number"
                      value={countedAmount}
                      onChange={(e) => setCountedAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {countedAmount && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Variance</p>
                    <p
                      className={`text-2xl font-bold ${
                        Math.abs(parseFloat(countedAmount) - balance.expected) < 0.01
                          ? "text-green-600"
                          : parseFloat(countedAmount) > balance.expected
                            ? "text-amber-600"
                            : "text-red-600"
                      }`}
                    >
                      {parseFloat(countedAmount) - balance.expected >= 0 ? "+" : ""}$
                      {(parseFloat(countedAmount) - balance.expected).toFixed(2)}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCloseForm(false);
                      setCountedAmount("");
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseShift}
                    disabled={loading || !countedAmount}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Closing..." : "Close Shift"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Open Shift Form */}
        {!currentShift && !showOpenForm && (
          <button
            onClick={() => setShowOpenForm(true)}
            className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Open New Shift
          </button>
        )}

        {!currentShift && showOpenForm && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Open Cash Shift</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opening Float
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xl font-semibold text-gray-600">$</span>
                <input
                  type="number"
                  value={floatAmount}
                  onChange={(e) => setFloatAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Amount of cash to start the shift with
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowOpenForm(false);
                  setFloatAmount("");
                }}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleOpenShift}
                disabled={loading || !floatAmount}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Opening..." : "Open Shift"}
              </button>
            </div>
          </div>
        )}

        {/* Recent Shifts */}
        {recentShifts.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Shifts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Float</th>
                    <th className="py-2 font-medium">In / Out</th>
                    <th className="py-2 font-medium">Counted</th>
                    <th className="py-2 font-medium">Variance</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentShifts.map((shift) => {
                    const report = shift.closedAt ? getShiftReport(shift.id) : null;
                    const isBalanced = report ? report.isBalanced : false;

                    return (
                      <tr key={shift.id} className="border-b hover:bg-gray-50">
                        <td className="py-3">
                          {new Date(shift.date).toLocaleDateString()}
                        </td>
                        <td className="py-3">${shift.openingFloat.toFixed(2)}</td>
                        <td className="py-3">
                          <span className="text-green-600">
                            +${shift.cashIn.toFixed(2)}
                          </span>
                          {" / "}
                          <span className="text-red-600">
                            -${shift.cashOut.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3">
                          {report?.actualCash ? (
                            <>${report.actualCash.toFixed(2)}</>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3">
                          {report ? (
                            <span
                              className={
                                isBalanced
                                  ? "text-green-600"
                                  : report.variance > 0
                                    ? "text-amber-600"
                                    : "text-red-600"
                              }
                            >
                              {isBalanced ? "Balanced" : `${report.variance >= 0 ? "+" : ""}${report.variance.toFixed(2)}`}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3">
                          {shift.closedAt ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle
                                className={`w-4 h-4 ${isBalanced ? "text-green-600" : "text-amber-600"}`}
                              />
                              <span className={isBalanced ? "text-green-600" : "text-amber-600"}>
                                {isBalanced ? "Balanced" : "Discrepancy"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-blue-600">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {recentShifts.length === 0 && (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No shifts yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
