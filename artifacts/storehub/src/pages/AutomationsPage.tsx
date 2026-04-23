import { useState, useEffect, useCallback } from "react";
import { useApp } from "../contexts/useApp";
import {
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  processRecurringExpenses,
  getLowStockProducts,
  getSuppliers,
  getSales,
  getExpenses,
  getProducts,
  calcNextDue,
} from "../services/dataService";
import type { RecurringExpense, InsertRecurringExpense, Product, Supplier, Sale, Expense } from "../schemas";
import { formatCurrency, getCurrencySymbol, formatDate } from "../utils";
import {
  Zap,
  Repeat,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  Package,
  FileText,
  ToggleLeft,
  ToggleRight,
  ShoppingCart,
  Printer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CATEGORIES = ["Rent / Utilities", "Stock / Inventory", "Wages", "Marketing", "Equipment", "Other"];

const EMPTY_FORM: InsertRecurringExpense = {
  description: "",
  amount: 0,
  category: "Rent / Utilities",
  frequency: "monthly",
  dayOfWeek: 1,
  dayOfMonth: 1,
  monthOfYear: 0,
  enabled: true,
  lastProcessed: null,
};

export default function AutomationsPage() {
  const { profile } = useApp();
  const currencySymbol = getCurrencySymbol(profile?.currency ?? "USD");
  const fmt = (n: number) => formatCurrency(n, currencySymbol);

  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [todayExpenses, setTodayExpenses] = useState<Expense[]>([]);
  const [autoProcessed, setAutoProcessed] = useState<Array<{ description: string; amount: number }>>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsertRecurringExpense>(EMPTY_FORM);

  const [poOpen, setPoOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    const [r, ls, s, sales, expenses] = await Promise.all([
      getRecurringExpenses(),
      getLowStockProducts(),
      getSuppliers(),
      getSales(),
      getExpenses(),
    ]);
    setRecurring(r);
    setLowStock(ls);
    setSuppliers(s);
    const todayStr = new Date().toISOString().split("T")[0];
    setTodaySales(sales.filter((sale) => sale.createdAt.startsWith(todayStr)));
    setTodayExpenses(expenses.filter((exp) => exp.date === todayStr));
  }, []);

  useEffect(() => {
    load();
    processRecurringExpenses().then((created) => {
      if (created.length > 0) {
        setAutoProcessed(created);
        load();
      }
    });
  }, [load]);

  async function handleSave() {
    if (!form.description.trim() || form.amount <= 0) return;
    if (editingId) {
      await updateRecurringExpense(editingId, form);
    } else {
      await createRecurringExpense(form);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this recurring expense?")) return;
    await deleteRecurringExpense(id);
    load();
  }

  async function handleToggle(r: RecurringExpense) {
    await updateRecurringExpense(r.id, { enabled: !r.enabled });
    load();
  }

  function startEdit(r: RecurringExpense) {
    setForm({
      description: r.description,
      amount: r.amount,
      category: r.category,
      frequency: r.frequency,
      dayOfWeek: r.dayOfWeek ?? 1,
      dayOfMonth: r.dayOfMonth ?? 1,
      monthOfYear: r.monthOfYear ?? 0,
      enabled: r.enabled,
      lastProcessed: r.lastProcessed,
    });
    setEditingId(r.id);
    setShowForm(true);
  }

  function getNextDueDisplay(r: RecurringExpense): string {
    if (!r.enabled) return "Paused";
    const todayStr = new Date().toISOString().split("T")[0];
    if (r.lastProcessed === todayStr) {
      const next = calcNextDue(r.frequency, r.dayOfWeek, r.dayOfMonth, r.monthOfYear);
      return `Next: ${next}`;
    }
    return "Due today";
  }

  function generatePurchaseOrder(): string {
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const storeName = profile?.storeName ?? "My Store";
    const lines: string[] = [
      `PURCHASE ORDER — ${storeName}`,
      `Date: ${date}`,
      ``,
      `ITEMS TO REORDER:`,
      `─────────────────────────────────────`,
    ];

    for (const p of lowStock) {
      const supplier = suppliers.find((s) => s.id === p.supplierId);
      const needed = p.lowStockThreshold * 2 - p.quantity;
      lines.push(`• ${p.name}`);
      lines.push(`  Current stock: ${p.quantity} ${p.unit}`);
      lines.push(`  Reorder quantity: ${needed} ${p.unit} (to reach 2× threshold)`);
      if (supplier) {
        lines.push(`  Supplier: ${supplier.name}${supplier.phone ? ` — ${supplier.phone}` : ""}`);
        if (supplier.reorderNotes) lines.push(`  Notes: ${supplier.reorderNotes}`);
      }
      lines.push(``);
    }
    lines.push(`─────────────────────────────────────`);
    lines.push(`Total items: ${lowStock.length}`);
    lines.push(`Generated by StoreHub`);
    return lines.join("\n");
  }

  function generateCloseReport(): string {
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const storeName = profile?.storeName ?? "My Store";
    const totalRevenue = todaySales.reduce((s, sale) => s + sale.total, 0);
    const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);
    const totalProfit = totalRevenue - totalExpenses;

    const lines: string[] = [
      `END OF DAY REPORT — ${storeName}`,
      `Date: ${date}`,
      ``,
      `SALES SUMMARY`,
      `─────────────────────────────────────`,
      `Total Transactions:  ${todaySales.length}`,
      `Total Revenue:       ${fmt(totalRevenue)}`,
      ``,
      `EXPENSES`,
      `─────────────────────────────────────`,
      `Total Expenses:      ${fmt(totalExpenses)}`,
    ];

    if (todayExpenses.length > 0) {
      for (const e of todayExpenses) {
        lines.push(`  • ${e.description}: ${fmt(e.amount)}`);
      }
    }

    lines.push(``);
    lines.push(`NET PROFIT`);
    lines.push(`─────────────────────────────────────`);
    lines.push(`Today's Profit:      ${fmt(totalProfit)}`);
    lines.push(``);

    if (todaySales.length > 0) {
      lines.push(`TOP ITEMS SOLD TODAY`);
      lines.push(`─────────────────────────────────────`);
      const itemMap: Record<string, number> = {};
      for (const sale of todaySales) {
        for (const item of sale.items) {
          itemMap[item.productName] = (itemMap[item.productName] ?? 0) + item.quantity;
        }
      }
      const sorted = Object.entries(itemMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [name, count] of sorted) {
        lines.push(`  • ${name}: ${count} sold`);
      }
      lines.push(``);
    }

    if (lowStock.length > 0) {
      lines.push(`LOW STOCK ALERTS (${lowStock.length} items)`);
      lines.push(`─────────────────────────────────────`);
      for (const p of lowStock.slice(0, 5)) {
        lines.push(`  • ${p.name}: ${p.quantity} ${p.unit} left`);
      }
      lines.push(``);
    }

    lines.push(`Generated by StoreHub`);
    return lines.join("\n");
  }

  function printText(text: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Print</title>
          <style>
            body { font-family: monospace; white-space: pre; padding: 20px; font-size: 13px; line-height: 1.6; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body>
        <script>window.onload = () => { window.print(); }</script>
      </html>
    `);
    win.document.close();
  }

  const totalMonthly = recurring
    .filter((r) => r.enabled)
    .reduce((sum, r) => {
      if (r.frequency === "daily") return sum + r.amount * 30;
      if (r.frequency === "weekly") return sum + r.amount * 4.3;
      if (r.frequency === "monthly") return sum + r.amount;
      if (r.frequency === "yearly") return sum + r.amount / 12;
      return sum;
    }, 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="text-amber-500" size={26} />
            Automations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Save time by automating repetitive tasks</p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Auto-processed notification */}
      {autoProcessed.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm mb-1">
            <Check size={16} /> Auto-processed today ({autoProcessed.length} expense{autoProcessed.length > 1 ? "s" : ""})
          </div>
          {autoProcessed.map((a, i) => (
            <div key={i} className="text-xs text-emerald-600 dark:text-emerald-500 ml-5">
              • {a.description}: {fmt(a.amount)} added to expenses
            </div>
          ))}
        </div>
      )}

      {/* ─── Section 1: Recurring Expenses ─── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Repeat size={17} className="text-amber-500" /> Recurring Expenses
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set up fixed costs (rent, utilities, subscriptions) — they auto-add to expenses on schedule
            </p>
          </div>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditingId(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-amber-50/40 dark:bg-gray-750">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              {editingId ? "Edit Recurring Expense" : "New Recurring Expense"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description</label>
                <input
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="e.g. Monthly Rent"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount ({currencySymbol})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.amount || ""}
                  onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <select
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Frequency</label>
                <select
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.frequency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frequency: e.target.value as InsertRecurringExpense["frequency"] }))
                  }
                >
                  {Object.entries(FREQ_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditional day/month selectors */}
              {form.frequency === "weekly" && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Day of Week</label>
                  <select
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={form.dayOfWeek ?? 1}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: parseInt(e.target.value) }))}
                  >
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(form.frequency === "monthly" || form.frequency === "yearly") && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Day of Month</label>
                  <select
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={form.dayOfMonth ?? 1}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: parseInt(e.target.value) }))}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.frequency === "yearly" && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Month</label>
                  <select
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={form.monthOfYear ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, monthOfYear: parseInt(e.target.value) }))}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={!form.description.trim() || form.amount <= 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                <Check size={14} /> {editingId ? "Update" : "Save"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Recurring expenses list */}
        {recurring.length === 0 && !showForm ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No recurring expenses yet. Add your fixed costs like rent, utilities, and subscriptions.
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {recurring.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 px-5 py-3.5 ${!r.enabled ? "opacity-50" : ""}`}>
                <button
                  onClick={() => handleToggle(r)}
                  className="text-gray-400 hover:text-amber-500 transition-colors shrink-0"
                  title={r.enabled ? "Disable" : "Enable"}
                >
                  {r.enabled ? (
                    <ToggleRight size={22} className="text-amber-500" />
                  ) : (
                    <ToggleLeft size={22} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-white">{r.description}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                    <span>{r.category}</span>
                    <span>•</span>
                    <span>{FREQ_LABELS[r.frequency]}</span>
                    <span>•</span>
                    <span className={r.lastProcessed === new Date().toISOString().split("T")[0] ? "text-emerald-600" : "text-amber-600"}>
                      {getNextDueDisplay(r)}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-bold text-gray-800 dark:text-white shrink-0">{fmt(r.amount)}</div>
                <button
                  onClick={() => startEdit(r)}
                  className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {recurring.length > 0 && (
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-750 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 flex justify-between">
            <span>{recurring.filter((r) => r.enabled).length} active rules</span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              ≈ {fmt(totalMonthly)} / month
            </span>
          </div>
        )}
      </section>

      {/* ─── Section 2: Reorder Center ─── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <button
          className="w-full p-5 flex items-center justify-between text-left"
          onClick={() => setPoOpen((o) => !o)}
        >
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Package size={17} className={lowStock.length > 0 ? "text-red-500" : "text-amber-500"} />
              Reorder Center
              {lowStock.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">
                  {lowStock.length} items
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Generate a purchase order for all low stock items
            </p>
          </div>
          {poOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {poOpen && (
          <div className="border-t border-gray-100 dark:border-gray-700">
            {lowStock.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                All products are sufficiently stocked. Nothing to reorder.
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {lowStock.map((p) => {
                    const supplier = suppliers.find((s) => s.id === p.supplierId);
                    return (
                      <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                        <AlertTriangle size={14} className={p.quantity === 0 ? "text-red-500" : "text-amber-500"} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-white">{p.name}</div>
                          <div className="text-xs text-gray-500">
                            Stock: {p.quantity} {p.unit} &nbsp;•&nbsp; Threshold: {p.lowStockThreshold}{" "}
                            {supplier && `• Supplier: ${supplier.name}`}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                          Order {Math.max(p.lowStockThreshold * 2 - p.quantity, p.lowStockThreshold)} {p.unit}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                  <button
                    onClick={() => {
                      const po = generatePurchaseOrder();
                      navigator.clipboard.writeText(po).then(() => alert("Purchase order copied to clipboard!"));
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors"
                  >
                    <FileText size={14} /> Copy Purchase Order
                  </button>
                  <button
                    onClick={() => printText(generatePurchaseOrder())}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Printer size={14} /> Print PO
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ─── Section 3: Daily Close Report ─── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <button
          className="w-full p-5 flex items-center justify-between text-left"
          onClick={() => setReportOpen((o) => !o)}
        >
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <FileText size={17} className="text-amber-500" /> End of Day Report
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Print or copy today's summary — revenue, expenses, profit, top items, and low stock alerts
            </p>
          </div>
          {reportOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {reportOpen && (
          <div className="border-t border-gray-100 dark:border-gray-700 p-5">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Revenue", value: fmt(todaySales.reduce((s, sale) => s + sale.total, 0)), color: "text-amber-600" },
                {
                  label: "Expenses",
                  value: fmt(todayExpenses.reduce((s, e) => s + e.amount, 0)),
                  color: "text-red-500",
                },
                {
                  label: "Profit",
                  value: fmt(
                    todaySales.reduce((s, sale) => s + sale.total, 0) -
                      todayExpenses.reduce((s, e) => s + e.amount, 0),
                  ),
                  color: "text-emerald-600",
                },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const report = generateCloseReport();
                  navigator.clipboard.writeText(report).then(() => alert("Close report copied to clipboard!"));
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors"
              >
                <FileText size={14} /> Copy Report
              </button>
              <button
                onClick={() => printText(generateCloseReport())}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <Printer size={14} /> Print Report
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Section 4: Shift Overtime ─── */}
      <ShiftOvertimeSection />
    </div>
  );
}

function ShiftOvertimeSection() {
  const [shifts, setShifts] = useState<Array<{ employeeName: string; shiftStart: string; hoursWorked: number }>>([]);

  useEffect(() => {
    import("../services/dataService").then(({ getShifts }) => {
      getShifts().then((allShifts) => {
        const now = new Date();
        const active = allShifts
          .filter((s) => s.shiftEnd === null)
          .map((s) => {
            const start = new Date(s.shiftStart);
            const hours = (now.getTime() - start.getTime()) / 3600000;
            return { employeeName: s.employeeName, shiftStart: s.shiftStart, hoursWorked: Math.round(hours * 10) / 10 };
          })
          .filter((s) => s.hoursWorked >= 7);
        setShifts(active);
      });
    });
  }, []);

  if (shifts.length === 0) return null;

  return (
    <section className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
      <h2 className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-3">
        <AlertTriangle size={17} className="text-amber-500" /> Shift Overtime Alerts
      </h2>
      <div className="space-y-2">
        {shifts.map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="font-medium text-amber-800 dark:text-amber-300">{s.employeeName}</span>
            <span className="text-amber-600 dark:text-amber-400">has been clocked in for {s.hoursWorked} hours</span>
            {s.hoursWorked >= 9 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-full">Overtime</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
