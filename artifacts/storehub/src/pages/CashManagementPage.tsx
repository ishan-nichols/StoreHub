import { useState, useEffect } from "react";
import { Plus, CheckCircle, AlertCircle, DollarSign } from "lucide-react";
import type { CashShift } from "../schemas";
import {
  openShift,
  closeShift,
  getCurrentShift,
  getRecentShifts,
} from "../services/cashDrawerService";
import { getSales } from "../services/dataService";
import type { Sale } from "../schemas";

interface ShiftRow {
  shift: CashShift;
  cashIn: number;       // actual cash that came in (from sales or tracked)
  expectedCash: number;
  actualCash: number;   // what was counted at close
  variance: number;
  isBalanced: boolean;
}

function computeShiftRow(shift: CashShift, sales: Sale[]): ShiftRow {
  const start = new Date(shift.openedAt);
  const end = shift.closedAt ? new Date(shift.closedAt) : new Date();

  const shiftSales = sales.filter(s => {
    const d = new Date(s.createdAt);
    return d >= start && d <= end;
  });

  // Determine cash in:
  //   1. shift.cashIn if it was tracked (> 0)
  //   2. sum of sales with paymentMethod = "cash" (case-insensitive)
  //   3. sum of ALL sales in the shift if no payment method info exists at all
  const cashSalesFromMethod = shiftSales
    .filter(s => s.paymentMethod?.toLowerCase() === 'cash')
    .reduce((sum, s) => sum + s.total, 0);

  const anyMethodSet = shiftSales.some(s => s.paymentMethod && s.paymentMethod !== '');
  const totalShiftSales = shiftSales.reduce((sum, s) => sum + s.total, 0);

  const cashIn =
    shift.cashIn > 0
      ? shift.cashIn
      : anyMethodSet
        ? cashSalesFromMethod
        : totalShiftSales; // no payment method data at all → assume all cash

  const expectedCash = shift.openingFloat + cashIn - shift.cashOut;
  const actualCash = shift.countedClose != null ? shift.countedClose : expectedCash;

  // For closed shifts, the stored variance is the most authoritative (it was
  // computed at close time from the live shift with correct cashIn).
  // But if it is 0 and we now know expectedCash > 0, use the recalculation.
  let variance: number;
  if (shift.closedAt && shift.variance != null) {
    variance = shift.variance !== 0 || expectedCash === 0
      ? shift.variance
      : actualCash - expectedCash;
  } else {
    variance = actualCash - expectedCash;
  }

  return {
    shift,
    cashIn,
    expectedCash,
    actualCash,
    variance,
    isBalanced: Math.abs(variance) < 0.01,
  };
}

export default function CashManagementPage() {
  const [currentShift, setCurrentShift] = useState<CashShift | null>(null);
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
  const [floatAmount, setFloatAmount] = useState<string>("");
  const [countedAmount, setCountedAmount] = useState<string>("");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const shift = getCurrentShift();
      setCurrentShift(shift);
      const shifts = getRecentShifts(10);

      // Fetch sales once and compute accurate row data for every shift
      const sales = await getSales();
      setShiftRows(shifts.map(s => computeShiftRow(s, sales)));
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
      closeShift(currentShift.id, counted);
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

  // Live balance preview uses current shift state + sales-based cashIn
  // We compute it from shiftRows if we have the current shift in there,
  // otherwise fall back to the raw currentShift values.
  const liveRow = currentShift
    ? shiftRows.find(r => r.shift.id === currentShift.id)
    : null;

  const expectedBalance = liveRow
    ? liveRow.expectedCash
    : currentShift
      ? currentShift.openingFloat + currentShift.cashIn - currentShift.cashOut
      : 0;

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

        {/* Active Shift */}
        {currentShift && !currentShift.closedAt && (
          <div className="bg-white rounded-lg border-2 border-blue-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              Active Shift
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">Opening Float</p>
                <p className="text-2xl font-bold text-blue-900">${currentShift.openingFloat.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600 font-medium">Cash In (tracked)</p>
                <p className="text-2xl font-bold text-green-900">${(liveRow?.cashIn ?? currentShift.cashIn).toFixed(2)}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 font-medium">Cash Out</p>
                <p className="text-2xl font-bold text-red-900">${currentShift.cashOut.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <p className="text-xs text-gray-600 font-medium">Expected in Drawer</p>
                <p className="text-2xl font-bold text-gray-900">${expectedBalance.toFixed(2)}</p>
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

                {countedAmount !== "" && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Variance</p>
                    <p
                      className={`text-2xl font-bold ${
                        Math.abs(parseFloat(countedAmount) - expectedBalance) < 0.01
                          ? "text-green-600"
                          : parseFloat(countedAmount) > expectedBalance
                            ? "text-amber-600"
                            : "text-red-600"
                      }`}
                    >
                      {parseFloat(countedAmount) - expectedBalance >= 0 ? "+" : ""}$
                      {(parseFloat(countedAmount) - expectedBalance).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Expected in drawer: ${expectedBalance.toFixed(2)}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCloseForm(false); setCountedAmount(""); }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseShift}
                    disabled={loading || countedAmount === ""}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "Closing..." : "Close Shift"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Open Shift */}
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Opening Float</label>
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
              <p className="text-xs text-gray-500 mt-2">Amount of cash to start the shift with</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowOpenForm(false); setFloatAmount(""); }}
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
        {shiftRows.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Shifts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Float</th>
                    <th className="py-2 font-medium">Cash In</th>
                    <th className="py-2 font-medium">Expected</th>
                    <th className="py-2 font-medium">Counted</th>
                    <th className="py-2 font-medium">Variance</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftRows.map((row) => (
                    <tr key={row.shift.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        {new Date(row.shift.openedAt).toLocaleString()}
                      </td>
                      <td className="py-3">${row.shift.openingFloat.toFixed(2)}</td>
                      <td className="py-3">
                        <span className="text-green-600">+${row.cashIn.toFixed(2)}</span>
                        {row.shift.cashOut > 0 && (
                          <span className="text-red-600 ml-1">/ -${row.shift.cashOut.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-3">${row.expectedCash.toFixed(2)}</td>
                      <td className="py-3">
                        {row.shift.closedAt
                          ? <>${row.actualCash.toFixed(2)}</>
                          : <span className="text-gray-400">Open</span>
                        }
                      </td>
                      <td className="py-3">
                        {row.shift.closedAt ? (
                          <span className={
                            row.isBalanced
                              ? "text-green-600"
                              : row.variance > 0
                                ? "text-amber-600"
                                : "text-red-600 font-semibold"
                          }>
                            {row.isBalanced
                              ? "Balanced"
                              : `${row.variance >= 0 ? "+" : ""}$${row.variance.toFixed(2)}`}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {row.shift.closedAt ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className={`w-4 h-4 ${row.isBalanced ? "text-green-600" : row.variance > 0 ? "text-amber-600" : "text-red-600"}`} />
                            <span className={row.isBalanced ? "text-green-600" : row.variance > 0 ? "text-amber-600" : "text-red-600"}>
                              {row.isBalanced ? "Balanced" : row.variance > 0 ? "Overage" : "Shortage"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-blue-600">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {shiftRows.length === 0 && (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No shifts yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
