import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  FileText,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Repeat,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useApp } from "../contexts/useApp";
import { PageHero, SectionTitle, SummaryTile, SurfaceCard } from "../components/page-shell";
import {
  calcNextDue,
  createRecurringExpense,
  deleteRecurringExpense,
  getExpenses,
  getLowStockProducts,
  getRecurringExpenses,
  getSales,
  getSuppliers,
  processRecurringExpenses,
  updateRecurringExpense,
} from "../services/dataService";
import type { Expense, InsertRecurringExpense, Product, RecurringExpense, Sale, Supplier } from "../schemas";
import { formatCurrency, getCurrencySymbol } from "../utils";

const FREQ_LABELS: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
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
  const [poOpen, setPoOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(true);

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
    void load();
    processRecurringExpenses().then((created) => {
      if (created.length > 0) {
        setAutoProcessed(created);
        void load();
      }
    });
  }, [load]);

  async function handleSave() {
    if (!form.description.trim() || form.amount <= 0) return;
    if (editingId) await updateRecurringExpense(editingId, form);
    else await createRecurringExpense(form);
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this recurring expense?")) return;
    await deleteRecurringExpense(id);
    await load();
  }

  async function handleToggle(rule: RecurringExpense) {
    await updateRecurringExpense(rule.id, { enabled: !rule.enabled });
    await load();
  }

  function startEdit(rule: RecurringExpense) {
    setForm({
      description: rule.description,
      amount: rule.amount,
      category: rule.category,
      frequency: rule.frequency,
      dayOfWeek: rule.dayOfWeek ?? 1,
      dayOfMonth: rule.dayOfMonth ?? 1,
      monthOfYear: rule.monthOfYear ?? 0,
      enabled: rule.enabled,
      lastProcessed: rule.lastProcessed,
    });
    setEditingId(rule.id);
    setShowForm(true);
  }

  function getNextDueDisplay(rule: RecurringExpense) {
    if (!rule.enabled) return "Paused";
    const todayStr = new Date().toISOString().split("T")[0];
    if (rule.lastProcessed === todayStr) {
      return `Next: ${calcNextDue(rule.frequency, rule.dayOfWeek, rule.dayOfMonth, rule.monthOfYear)}`;
    }
    return "Due today";
  }

  function generatePurchaseOrder() {
    const lines = [
      `PURCHASE ORDER - ${profile?.storeName ?? "My Store"}`,
      `Date: ${new Date().toLocaleDateString()}`,
      "",
      "ITEMS TO REORDER",
      "-----------------------------------",
    ];
    for (const product of lowStock) {
      const supplier = suppliers.find((item) => item.id === product.supplierId);
      lines.push(`${product.name}`);
      lines.push(`Current stock: ${product.quantity} ${product.unit}`);
      lines.push(`Reorder quantity: ${Math.max(product.lowStockThreshold * 2 - product.quantity, product.lowStockThreshold)} ${product.unit}`);
      if (supplier) lines.push(`Supplier: ${supplier.name}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  function generateCloseReport() {
    const totalRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
    const totalExpenses = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    return [
      `END OF DAY REPORT - ${profile?.storeName ?? "My Store"}`,
      `Date: ${new Date().toLocaleDateString()}`,
      "",
      `Revenue: ${fmt(totalRevenue)}`,
      `Expenses: ${fmt(totalExpenses)}`,
      `Profit: ${fmt(totalRevenue - totalExpenses)}`,
      `Transactions: ${todaySales.length}`,
      "",
      `Low stock alerts: ${lowStock.length}`,
    ].join("\n");
  }

  function printText(text: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><body style="font-family: monospace; white-space: pre; padding: 20px;">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body><script>window.onload=()=>window.print()</script></html>`);
    win.document.close();
  }

  const totalMonthly = recurring.filter((item) => item.enabled).reduce((sum, item) => {
    if (item.frequency === "daily") return sum + item.amount * 30;
    if (item.frequency === "weekly") return sum + item.amount * 4.3;
    if (item.frequency === "monthly") return sum + item.amount;
    if (item.frequency === "yearly") return sum + item.amount / 12;
    return sum;
  }, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHero
        eyebrow="Automations"
        title="Put the repetitive parts of store operations on autopilot."
        description="Recurring expenses, reorder prep, and close-of-day paperwork all live in one calmer control center."
        actions={
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-white">
            <RefreshCw size={15} />
            Refresh
          </button>
        }
        stats={
          <>
            <SummaryTile label="Active rules" value={String(recurring.filter((item) => item.enabled).length)} />
            <SummaryTile label="Estimated monthly total" value={fmt(totalMonthly)} />
            <SummaryTile label="Low-stock items" value={String(lowStock.length)} />
          </>
        }
      />

      {autoProcessed.length > 0 && (
        <SurfaceCard className="border border-emerald-200 bg-emerald-50">
          <SectionTitle title="Processed automatically today" description="These recurring expenses were added for you." />
          <div className="mt-4 space-y-2 text-sm text-emerald-800">
            {autoProcessed.map((item, index) => (
              <div key={`${item.description}-${index}`} className="flex items-center gap-2">
                <Check size={14} />
                <span>{item.description}: {fmt(item.amount)}</span>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard>
        <SectionTitle
          title="Recurring expenses"
          description="Set up fixed costs like rent, utilities, or subscriptions so they land automatically."
          aside={
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setEditingId(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Plus size={15} />
              Add rule
            </button>
          }
        />

        {showForm && (
          <div className="mt-5 rounded-[28px] bg-[#faf7f1] p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Description">
                <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className={inputCls} />
              </Field>
              <Field label={`Amount (${currencySymbol})`}>
                <input type="number" min="0" step="0.01" value={form.amount || ""} onChange={(e) => setForm((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} className={inputCls} />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className={inputCls}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Frequency">
                <select value={form.frequency} onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value as InsertRecurringExpense["frequency"] }))} className={inputCls}>
                  {Object.entries(FREQ_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {form.frequency === "weekly" && (
                <Field label="Day of week">
                  <select value={form.dayOfWeek ?? 1} onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: parseInt(e.target.value, 10) }))} className={inputCls}>
                    {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </Field>
              )}
              {(form.frequency === "monthly" || form.frequency === "yearly") && (
                <Field label="Day of month">
                  <select value={form.dayOfMonth ?? 1} onChange={(e) => setForm((prev) => ({ ...prev, dayOfMonth: parseInt(e.target.value, 10) }))} className={inputCls}>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </Field>
              )}
              {form.frequency === "yearly" && (
                <Field label="Month">
                  <select value={form.monthOfYear ?? 0} onChange={(e) => setForm((prev) => ({ ...prev, monthOfYear: parseInt(e.target.value, 10) }))} className={inputCls}>
                    {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => void handleSave()} disabled={!form.description.trim() || form.amount <= 0} className="rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                {editingId ? "Update rule" : "Save rule"}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {recurring.length === 0 && !showForm ? (
            <div className="rounded-[24px] bg-[#faf7f1] px-4 py-8 text-center text-sm text-stone-500">No recurring expenses yet.</div>
          ) : (
            recurring.map((rule) => (
              <div key={rule.id} className={`flex items-center gap-3 rounded-[24px] bg-[#faf7f1] px-4 py-4 ${!rule.enabled ? "opacity-60" : ""}`}>
                <button onClick={() => void handleToggle(rule)} className="text-stone-400 transition hover:text-amber-600">
                  {rule.enabled ? <ToggleRight size={22} className="text-amber-600" /> : <ToggleLeft size={22} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-900">{rule.description}</div>
                  <div className="mt-1 text-xs text-stone-500">{rule.category} · {FREQ_LABELS[rule.frequency]} · {getNextDueDisplay(rule)}</div>
                </div>
                <div className="text-sm font-semibold text-stone-900">{fmt(rule.amount)}</div>
                <button onClick={() => startEdit(rule)} className="rounded-2xl p-2 text-stone-400 hover:bg-amber-50 hover:text-amber-700"><Edit2 size={14} /></button>
                <button onClick={() => void handleDelete(rule.id)} className="rounded-2xl p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))
          )}
        </div>
      </SurfaceCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SurfaceCard>
          <button className="flex w-full items-center justify-between" onClick={() => setPoOpen((value) => !value)}>
            <SectionTitle title="Reorder center" description="Generate a purchase order for everything running low." />
            {poOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
          </button>
          {poOpen && (
            <div className="mt-5 space-y-3">
              {lowStock.length === 0 ? (
                <div className="rounded-[24px] bg-[#faf7f1] px-4 py-8 text-center text-sm text-stone-500">All products are sufficiently stocked.</div>
              ) : (
                <>
                  {lowStock.map((product) => {
                    const supplier = suppliers.find((item) => item.id === product.supplierId);
                    return (
                      <div key={product.id} className="flex items-center gap-3 rounded-[24px] bg-[#faf7f1] px-4 py-4">
                        <AlertTriangle size={15} className={product.quantity === 0 ? "text-rose-500" : "text-amber-500"} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-stone-900">{product.name}</div>
                          <div className="mt-1 text-xs text-stone-500">Stock: {product.quantity} {product.unit} · Threshold: {product.lowStockThreshold}{supplier ? ` · Supplier: ${supplier.name}` : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => navigator.clipboard.writeText(generatePurchaseOrder())} className="rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white">Copy purchase order</button>
                    <button onClick={() => printText(generatePurchaseOrder())} className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600"><Printer size={14} /> Print</button>
                  </div>
                </>
              )}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <button className="flex w-full items-center justify-between" onClick={() => setReportOpen((value) => !value)}>
            <SectionTitle title="End of day report" description="Print or copy a ready-made close report for today's activity." />
            {reportOpen ? <ChevronUp size={18} className="text-stone-400" /> : <ChevronDown size={18} className="text-stone-400" />}
          </button>
          {reportOpen && (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryTile label="Revenue" value={fmt(todaySales.reduce((sum, sale) => sum + sale.total, 0))} />
                <SummaryTile label="Expenses" value={fmt(todayExpenses.reduce((sum, expense) => sum + expense.amount, 0))} />
                <SummaryTile label="Profit" value={fmt(todaySales.reduce((sum, sale) => sum + sale.total, 0) - todayExpenses.reduce((sum, expense) => sum + expense.amount, 0))} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => navigator.clipboard.writeText(generateCloseReport())} className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white"><FileText size={14} /> Copy report</button>
                <button onClick={() => printText(generateCloseReport())} className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600"><Printer size={14} /> Print</button>
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100";
