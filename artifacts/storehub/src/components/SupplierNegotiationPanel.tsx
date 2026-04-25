import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  TrendingUp,
  FileText,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  DollarSign,
  Plus,
} from "lucide-react";
import {
  detectPriceChanges,
  getAlerts,
  acknowledgeAlert,
  generateNegotiationReport,
  logPriceEntry,
  getPriceHistory,
  type SupplierPriceAlert,
  type NegotiationReport,
} from "../services/supplierIntelligenceService";
import type { Product, Supplier } from "../schemas";

interface Props {
  products: Product[];
  suppliers: Supplier[];
}

interface ReportState {
  loading: boolean;
  report: NegotiationReport | null;
  error: string | null;
  scriptVisible: boolean;
  copied: boolean;
}

interface LogPriceForm {
  productId: string;
  costPrice: string;
  note: string;
}

export default function SupplierNegotiationPanel({ products, suppliers }: Props) {
  const [alerts, setAlerts] = useState<SupplierPriceAlert[]>([]);
  const [reports, setReports] = useState<Record<string, ReportState>>({});
  const [logForm, setLogForm] = useState<LogPriceForm>({ productId: "", costPrice: "", note: "" });
  const [showLogForm, setShowLogForm] = useState<string | null>(null); // supplierId
  const [logSuccess, setLogSuccess] = useState<string | null>(null);

  const refreshAlerts = useCallback(() => {
    const detected = detectPriceChanges(products, suppliers);
    const cached = getAlerts();
    // merge detected + cached, deduplicate by productId
    const merged = [...detected];
    cached.forEach((a) => {
      if (!merged.find((m) => m.productId === a.productId)) merged.push(a);
    });
    setAlerts(merged);
  }, [products, suppliers]);

  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  function handleAcknowledge(productId: string) {
    acknowledgeAlert(productId);
    setAlerts((prev) => prev.filter((a) => a.productId !== productId));
  }

  async function handleGenerateReport(supplierId: string) {
    setReports((prev) => ({
      ...prev,
      [supplierId]: { loading: true, report: null, error: null, scriptVisible: false, copied: false },
    }));
    try {
      const report = await generateNegotiationReport(supplierId, products, suppliers);
      setReports((prev) => ({
        ...prev,
        [supplierId]: { loading: false, report, error: null, scriptVisible: false, copied: false },
      }));
    } catch (e) {
      setReports((prev) => ({
        ...prev,
        [supplierId]: {
          loading: false,
          report: null,
          error: (e as Error).message,
          scriptVisible: false,
          copied: false,
        },
      }));
    }
  }

  function toggleScript(supplierId: string) {
    setReports((prev) => ({
      ...prev,
      [supplierId]: {
        ...prev[supplierId],
        scriptVisible: !prev[supplierId]?.scriptVisible,
      },
    }));
  }

  async function copyScript(supplierId: string, script: string) {
    await navigator.clipboard.writeText(script);
    setReports((prev) => ({
      ...prev,
      [supplierId]: { ...prev[supplierId], copied: true },
    }));
    setTimeout(() => {
      setReports((prev) => ({
        ...prev,
        [supplierId]: { ...prev[supplierId], copied: false },
      }));
    }, 2000);
  }

  function handleLogPrice(supplierId: string) {
    if (!logForm.productId || !logForm.costPrice) return;
    const product = products.find((p) => p.id === logForm.productId);
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!product || !supplier) return;

    logPriceEntry(
      logForm.productId,
      parseFloat(logForm.costPrice),
      supplierId,
      supplier.name,
      logForm.note || undefined,
    );

    setLogSuccess(logForm.productId);
    setLogForm({ productId: "", costPrice: "", note: "" });
    setShowLogForm(null);
    setTimeout(() => setLogSuccess(null), 3000);
    refreshAlerts();
  }

  const supplierProductMap = suppliers.map((s) => ({
    supplier: s,
    products: products.filter((p) => p.supplierId === s.id),
    alerts: alerts.filter((a) => a.supplierId === s.id),
  }));

  const activeSuppliers = supplierProductMap.filter((s) => s.products.length > 0);

  return (
    <div className="space-y-6">
      {/* Price Alerts Section */}
      <div>
        <h2 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          Price Alerts
        </h2>

        {alerts.length === 0 ? (
          <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm text-center">
            <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-stone-500 text-sm">No price alerts — your suppliers are behaving</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.productId}
                className="rounded-[30px] border border-red-100 bg-red-50/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-800">{alert.productName}</span>
                    <span className="text-xs text-stone-500">via {alert.supplierName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-stone-500">${alert.oldPrice.toFixed(2)}</span>
                    <TrendingUp size={14} className="text-red-500" />
                    <span className="font-bold text-red-600">${alert.newPrice.toFixed(2)}</span>
                    <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      +{alert.changePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-red-600 font-medium">
                    This costs you +${alert.annualImpact.toFixed(0)}/year
                  </div>
                </div>
                <button
                  onClick={() => handleAcknowledge(alert.productId)}
                  className="shrink-0 px-4 py-2 text-sm font-semibold rounded-xl border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-Supplier Negotiation Cards */}
      <div>
        <h2 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2">
          <FileText size={18} className="text-amber-500" />
          Supplier Intelligence
        </h2>

        {activeSuppliers.length === 0 ? (
          <div className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm text-center text-stone-400 text-sm">
            No suppliers with products yet. Add suppliers and assign products to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {activeSuppliers.map(({ supplier, products: supplierProducts, alerts: supplierAlerts }) => {
              const reportState = reports[supplier.id];
              const hasHistory = supplierProducts.some(
                (p) => getPriceHistory(p.id).length > 0,
              );

              return (
                <div
                  key={supplier.id}
                  className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm space-y-4"
                >
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-stone-800 text-lg">{supplier.name}</div>
                      <div className="text-sm text-stone-500">
                        {supplierProducts.length} product{supplierProducts.length !== 1 ? "s" : ""}
                      </div>
                      {supplierAlerts.length > 0 && (
                        <div className="mt-1 text-xs font-semibold text-red-600">
                          {supplierAlerts.length} price increase{supplierAlerts.length !== 1 ? "s" : ""} detected
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setShowLogForm(showLogForm === supplier.id ? null : supplier.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors"
                      >
                        <Plus size={13} />
                        Log Price Change
                      </button>
                      <button
                        onClick={() => handleGenerateReport(supplier.id)}
                        disabled={reportState?.loading}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white transition-colors"
                      >
                        {reportState?.loading ? (
                          <>
                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <FileText size={14} />
                            Generate Report
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Log Price Form */}
                  {showLogForm === supplier.id && (
                    <div className="bg-stone-50 rounded-2xl p-4 space-y-3 border border-stone-100">
                      <div className="text-sm font-semibold text-stone-700">Log New Delivery Price</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-stone-500 block mb-1">Product</label>
                          <select
                            value={logForm.productId}
                            onChange={(e) => setLogForm((f) => ({ ...f, productId: e.target.value }))}
                            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <option value="">Select product…</option>
                            {supplierProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-stone-500 block mb-1">New Cost Price ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={logForm.costPrice}
                            onChange={(e) => setLogForm((f) => ({ ...f, costPrice: e.target.value }))}
                            placeholder="0.00"
                            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-stone-500 block mb-1">Note (optional)</label>
                          <input
                            type="text"
                            value={logForm.note}
                            onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
                            placeholder="e.g. delivery invoice #123"
                            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLogPrice(supplier.id)}
                          disabled={!logForm.productId || !logForm.costPrice}
                          className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl transition-colors"
                        >
                          Save Price
                        </button>
                        <button
                          onClick={() => setShowLogForm(null)}
                          className="px-4 py-2 text-sm font-semibold text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Success toast */}
                  {logSuccess && supplierProducts.find((p) => p.id === logSuccess) && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 px-3 py-2 rounded-xl">
                      <CheckCircle size={15} />
                      Price logged successfully
                    </div>
                  )}

                  {/* Error state */}
                  {reportState?.error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
                      {reportState.error}
                    </div>
                  )}

                  {/* Report results */}
                  {reportState?.report && (
                    <div className="space-y-4 border-t border-stone-100 pt-4">
                      {/* Summary */}
                      <div className="bg-amber-50 rounded-2xl p-4 text-sm text-amber-900">
                        {reportState.report.summary}
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-stone-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-stone-500 mb-1">Total Annual Impact</div>
                          <div className="font-bold text-red-600 text-lg">
                            ${reportState.report.totalAnnualImpact.toFixed(0)}
                          </div>
                        </div>
                        <div className="bg-stone-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-stone-500 mb-1">Target Price</div>
                          <div className="font-bold text-emerald-600 text-lg">
                            ${reportState.report.recommendedTargetPrice.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-stone-50 rounded-2xl p-3 text-center">
                          <div className="text-xs text-stone-500 mb-1">Price Increases</div>
                          <div className="font-bold text-stone-800 text-lg">
                            {reportState.report.priceIncreases.length}
                          </div>
                        </div>
                      </div>

                      {/* Price increases breakdown */}
                      {reportState.report.priceIncreases.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                            Price Increases
                          </div>
                          {reportState.report.priceIncreases.map((pi, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-2.5 text-sm"
                            >
                              <span className="font-medium text-stone-700">{pi.productName}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-stone-400">${pi.oldPrice.toFixed(2)}</span>
                                <TrendingUp size={12} className="text-red-500" />
                                <span className="font-semibold text-red-600">${pi.newPrice.toFixed(2)}</span>
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                  +{pi.changePct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Cheaper alternatives */}
                      {reportState.report.cheaperAlternatives.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                            Potential Alternatives
                          </div>
                          {reportState.report.cheaperAlternatives.map((alt, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-2.5 text-sm"
                            >
                              <div>
                                <span className="font-medium text-stone-700">{alt.productName}</span>
                                <span className="text-stone-400 ml-2 text-xs">→ {alt.alternativeSupplier}</span>
                              </div>
                              <span className="text-emerald-600 font-semibold text-xs">
                                Save ${alt.savings.toFixed(0)}/yr
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Negotiation script */}
                      <div>
                        <button
                          onClick={() => toggleScript(supplier.id)}
                          className="flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                        >
                          <FileText size={15} />
                          {reportState.scriptVisible ? "Hide" : "View"} Negotiation Script
                          {reportState.scriptVisible ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>

                        {reportState.scriptVisible && (
                          <div className="mt-3 relative">
                            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm text-stone-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono text-xs">
                              {reportState.report.negotiationScript}
                            </div>
                            <button
                              onClick={() =>
                                copyScript(supplier.id, reportState.report!.negotiationScript)
                              }
                              className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 text-xs bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors text-stone-600"
                            >
                              {reportState.copied ? (
                                <>
                                  <Check size={11} className="text-emerald-500" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No history hint */}
                  {!hasHistory && !reportState && (
                    <div className="text-xs text-stone-400 bg-stone-50 rounded-xl px-3 py-2">
                      No price history yet. Log delivery prices to enable intelligent analysis.
                    </div>
                  )}

                  {/* Product list */}
                  <div className="flex flex-wrap gap-2">
                    {supplierProducts.map((p) => (
                      <span
                        key={p.id}
                        className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full"
                      >
                        {p.name}
                        {p.costPrice ? ` · $${p.costPrice.toFixed(2)}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
