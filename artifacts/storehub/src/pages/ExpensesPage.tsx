import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import { getExpenses, createExpense, updateExpense, deleteExpense, getTaxSummary } from "../services/dataService";
import { getRegion } from "../data/taxData";
import type { Expense, InsertExpense } from "../schemas";
import { formatCurrency, formatDate } from "../utils";
import CurrencyInput from "../components/CurrencyInput";
import { Plus, Edit2, Trash2, X, Receipt, FileText } from "lucide-react";

const EXPENSE_CATEGORIES = [
  "Supplier Delivery",
  "Rent / Utilities",
  "Stock / Inventory",
  "Wages",
  "Marketing",
  "Equipment",
  "Transport",
  "Maintenance",
  "Other",
];

const emptyForm: InsertExpense = {
  description: "",
  amount: 0,
  category: "Stock / Inventory",
  date: new Date().toISOString().split("T")[0],
};

type Tab = "expenses" | "tax";

export default function ExpensesPage() {
  const { t, currencySymbol, profile } = useApp();
  const { activeStoreId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsertExpense>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Tax summary state
  const [taxSummary, setTaxSummary] = useState<Awaited<ReturnType<typeof getTaxSummary>>>(null);
  const [taxLoading, setTaxLoading] = useState(false);

  async function load() {
    const data = await getExpenses();
    setExpenses(data);
    setLoading(false);
  }

  async function loadTaxSummary() {
    setTaxLoading(true);
    const data = await getTaxSummary();
    setTaxSummary(data);
    setTaxLoading(false);
  }

  useEffect(() => { load(); }, [activeStoreId]);

  useEffect(() => {
    if (activeTab === "tax") { loadTaxSummary(); }
  }, [activeTab]);

  function openAdd() {
    setForm({ ...emptyForm, date: new Date().toISOString().split("T")[0] });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(e: Expense) {
    setForm({ description: e.description, amount: e.amount, category: e.category, date: e.date });
    setEditingId(e.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.description.trim() || form.amount <= 0) return;
    if (editingId) {
      await updateExpense(editingId, form);
    } else {
      await createExpense(form);
    }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await deleteExpense(id);
    setDeleteConfirm(null);
    load();
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  }

  // Tax summary helpers
  const taxProfile = taxSummary?.profile;
  const regionCode = taxProfile?.country && taxProfile?.stateCode
    ? `${taxProfile.country}-${taxProfile.stateCode}`
    : null;
  const region = regionCode ? getRegion(regionCode) : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-0">
        <button
          onClick={() => setActiveTab("expenses")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "expenses" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <Receipt size={14} /> {t.expenses.title}
        </button>
        <button
          onClick={() => setActiveTab("tax")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${activeTab === "tax" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <FileText size={14} /> Tax Summary
        </button>
      </div>

      {/* ─── EXPENSES TAB ─── */}
      {activeTab === "expenses" && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t.expenses.title}</h1>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow transition-colors"
            >
              <Plus size={16} /> {t.expenses.addExpense}
            </button>
          </div>

          {/* Summary */}
          {expenses.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-2xl p-5">
              <div className="text-sm font-medium text-rose-700 dark:text-rose-300 mb-1">Total Expenses (All Time)</div>
              <div className="text-3xl font-bold text-rose-700 dark:text-rose-300">
                {formatCurrency(totalExpenses, currencySymbol)}
              </div>
              {Object.keys(byCategory).length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([cat, total]) => (
                      <span key={cat} className="text-xs bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-1 rounded-lg">
                        {cat}: {formatCurrency(total, currencySymbol)}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">{t.expenses.noExpenses}</div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Description</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Category</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Date</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Amount</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 dark:text-gray-100">{e.description}</div>
                          <div className="sm:hidden text-xs text-gray-400">{e.category}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{e.category}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{formatDate(e.date)}</td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">{formatCurrency(e.amount, currencySymbol)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(e)} className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                              <Edit2 size={15} />
                            </button>
                            <button onClick={() => setDeleteConfirm(e.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── TAX SUMMARY TAB ─── */}
      {activeTab === "tax" && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Tax Summary</h1>

          {taxLoading ? (
            <div className="text-center text-gray-400 py-12 text-sm">Loading tax data…</div>
          ) : !taxSummary ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
              <div className="text-2xl mb-2">📍</div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Location not set</p>
              <p className="text-sm text-amber-700">Set your location in onboarding or Settings to see tax info.</p>
            </div>
          ) : (
            <>
              {/* Tax Profile card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
                <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">Your Tax Profile</h2>
                {!taxProfile?.country ? (
                  <div className="text-sm text-gray-500">
                    No location set.{" "}
                    <a href="/settings" className="text-amber-600 font-semibold hover:underline">Set your location in Settings</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
                      <span>{taxProfile.country === "US" ? "🇺🇸" : "🇲🇽"}</span>
                      <span>{taxProfile.country === "US" ? "United States" : "México"}</span>
                      {region && <span className="text-gray-400 font-normal text-sm">· {region.stateName}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">Currency</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{taxProfile.currency}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-0.5">{taxProfile.country === "MX" ? "IVA Rate" : "Sales Tax Rate"}</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{((taxProfile.taxRate ?? 0) * 100).toFixed(2)}%</div>
                      </div>
                    </div>
                    {region && (
                      <>
                        {region.incomeTaxNote && (
                          <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                            <span className="font-semibold text-gray-600 dark:text-gray-300">Income Tax: </span>{region.incomeTaxNote}
                          </div>
                        )}
                        {region.specialNotes && (
                          <div className="text-xs text-gray-400 italic">{region.specialNotes}</div>
                        )}
                        {region.minimumWageHourly && (
                          <div className="text-xs text-gray-500">Min wage: <strong>${region.minimumWageHourly.toFixed(2)}/hr</strong></div>
                        )}
                        {region.minimumWageDailyMXN && (
                          <div className="text-xs text-gray-500">Salario mínimo: <strong>${region.minimumWageDailyMXN.toFixed(2)} MXN/día</strong></div>
                        )}
                      </>
                    )}
                    <a href="/settings" className="text-xs text-amber-600 font-semibold hover:underline">Update Location in Settings →</a>
                  </div>
                )}
              </div>

              {/* This Month card */}
              {taxSummary.currentMonth && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
                  <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">This Month</h2>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                      <div className="text-xs text-green-600 mb-0.5">Sales</div>
                      <div className="font-bold text-green-700">{formatCurrency(taxSummary.currentMonth.totalSales, currencySymbol)}</div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                      <div className="text-xs text-blue-600 mb-0.5">Tax Collected (est.)</div>
                      <div className="font-bold text-blue-700">{formatCurrency(taxSummary.currentMonth.taxCollected, currencySymbol)}</div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3">
                      <div className="text-xs text-rose-600 mb-0.5">Total Expenses</div>
                      <div className="font-bold text-rose-700">{formatCurrency(taxSummary.currentMonth.totalExpenses, currencySymbol)}</div>
                    </div>
                    <div className={`rounded-xl p-3 ${taxSummary.currentMonth.totalSales - taxSummary.currentMonth.totalExpenses >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                      <div className={`text-xs mb-0.5 ${taxSummary.currentMonth.totalSales - taxSummary.currentMonth.totalExpenses >= 0 ? "text-emerald-600" : "text-red-600"}`}>Net (Sales − Exp.)</div>
                      <div className={`font-bold ${taxSummary.currentMonth.totalSales - taxSummary.currentMonth.totalExpenses >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {formatCurrency(taxSummary.currentMonth.totalSales - taxSummary.currentMonth.totalExpenses, currencySymbol)}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 italic">Tax estimates only. Consult a licensed tax professional.</p>
                </div>
              )}

              {/* Year to Date card */}
              {taxSummary.ytd && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
                  <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">Year to Date</h2>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                      <div className="text-xs text-green-600 mb-0.5">Sales</div>
                      <div className="font-bold text-green-700">{formatCurrency(taxSummary.ytd.totalSales, currencySymbol)}</div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                      <div className="text-xs text-blue-600 mb-0.5">Tax Collected (est.)</div>
                      <div className="font-bold text-blue-700">{formatCurrency(taxSummary.ytd.taxCollected, currencySymbol)}</div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3">
                      <div className="text-xs text-rose-600 mb-0.5">Total Expenses</div>
                      <div className="font-bold text-rose-700">{formatCurrency(taxSummary.ytd.totalExpenses, currencySymbol)}</div>
                    </div>
                    <div className={`rounded-xl p-3 ${taxSummary.ytd.totalSales - taxSummary.ytd.totalExpenses >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                      <div className={`text-xs mb-0.5 ${taxSummary.ytd.totalSales - taxSummary.ytd.totalExpenses >= 0 ? "text-emerald-600" : "text-red-600"}`}>Net (Sales − Exp.)</div>
                      <div className={`font-bold ${taxSummary.ytd.totalSales - taxSummary.ytd.totalExpenses >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {formatCurrency(taxSummary.ytd.totalSales - taxSummary.ytd.totalExpenses, currencySymbol)}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 italic">Tax estimates only. Consult a licensed tax professional.</p>
                </div>
              )}

              {/* Country-specific reminders */}
              {taxProfile?.country === "MX" && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                  📋 Recuerda: Las declaraciones provisionales del ISR se presentan mensualmente ante el SAT.
                </div>
              )}
              {taxProfile?.country === "US" && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
                  📋 Reminder: Federal estimated taxes are due quarterly (April, June, Sept, Jan).
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">
                {editingId ? t.expenses.editExpense : t.expenses.addExpense}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.expenses.description}</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="e.g. Monthly rent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.expenses.amount} ({currencySymbol})</label>
                <CurrencyInput
                  value={form.amount}
                  onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.expenses.category}</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.expenses.date}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">
                {t.common.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.description.trim() || form.amount <= 0}
                className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100">Delete this expense?</h3>
            <p className="text-sm text-gray-500">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors">{t.common.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
