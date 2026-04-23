import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Edit2, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { useApp } from "../contexts/useApp";
import { API_BASE_URL } from "../services/dataService";
import { formatCurrency } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  userId: string;
  name: string;
  unit: string;
  stockQuantity: string;
  lowStockThreshold: string;
  costPerUnit: string;
  createdAt: string;
}

type InsertIngredient = {
  name: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  costPerUnit: number;
};

const UNITS = ["each", "kg", "g", "L", "mL", "oz", "lb", "dozen", "box", "bag"];

const BASE = `${API_BASE_URL}/api/store`;

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

const emptyForm: InsertIngredient = {
  name: "",
  unit: "each",
  stockQuantity: 0,
  lowStockThreshold: 0,
  costPerUnit: 0,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function IngredientsPage() {
  const { currencySymbol } = useApp();
  const [ingredientList, setIngredientList] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<InsertIngredient>(emptyForm);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await apiFetch("/ingredients");
    if (res.ok) {
      const data = (await res.json()) as Ingredient[];
      setIngredientList(data);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => ingredientList.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [ingredientList, search],
  );

  const lowStockItems = ingredientList.filter(
    (i) => parseFloat(i.stockQuantity) <= parseFloat(i.lowStockThreshold) && parseFloat(i.lowStockThreshold) > 0,
  );

  const totalValue = ingredientList.reduce(
    (sum, i) => sum + parseFloat(i.stockQuantity) * parseFloat(i.costPerUnit),
    0,
  );

  function openAdd() {
    setForm(emptyForm);
    setEditingIngredient(null);
    setShowAddModal(true);
  }

  function openEdit(ingredient: Ingredient) {
    setForm({
      name: ingredient.name,
      unit: ingredient.unit,
      stockQuantity: parseFloat(ingredient.stockQuantity),
      lowStockThreshold: parseFloat(ingredient.lowStockThreshold),
      costPerUnit: parseFloat(ingredient.costPerUnit),
    });
    setEditingIngredient(ingredient);
    setShowAddModal(true);
  }

  function openAdjust(ingredient: Ingredient) {
    setAdjustTarget(ingredient);
    setAdjustDelta(0);
    setAdjustNote("");
    setShowAdjustModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.unit) return;
    setSaving(true);
    try {
      if (editingIngredient) {
        await apiFetch(`/ingredients/${editingIngredient.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/ingredients", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setShowAddModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/ingredients/${adjustTarget.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({ delta: adjustDelta, note: adjustNote }),
      });
      setShowAdjustModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/ingredients/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    await load();
  }

  function stockStatus(i: Ingredient) {
    const qty = parseFloat(i.stockQuantity);
    const threshold = parseFloat(i.lowStockThreshold);
    if (qty <= 0) return <StatusBadge tone="rose" text="Out" />;
    if (threshold > 0 && qty <= threshold) return <StatusBadge tone="amber" text="Low" />;
    return <StatusBadge tone="emerald" text="Good" />;
  }

  const newStock = adjustTarget
    ? Math.max(0, parseFloat(adjustTarget.stockQuantity) + adjustDelta)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{lowStockItems.length} ingredient{lowStockItems.length === 1 ? "" : "s"} low on stock:</span>{" "}
            {lowStockItems.map((i) => i.name).join(", ")}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Restaurant</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Ingredients</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Track your raw ingredients, monitor stock levels, and keep costs under control.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            <Plus size={16} />
            Add Ingredient
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard label="Total Ingredients" value={String(ingredientList.length)} tone="stone" />
          <SummaryCard label="Low Stock" value={String(lowStockItems.length)} tone="amber" />
          <SummaryCard label="Inventory Value" value={formatCurrency(totalValue, currencySymbol)} tone="emerald" />
        </div>
      </div>

      {/* Search */}
      <div className="soft-panel rounded-[32px] p-5">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients…"
            className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
          />
        </div>
      </div>

      {/* Table */}
      <div className="soft-panel overflow-hidden rounded-[32px]">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-stone-400">Loading ingredients…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-stone-400">
            {ingredientList.length === 0 ? "No ingredients yet. Add your first ingredient." : "No ingredients match that search."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#faf7f1] text-stone-500">
                <tr>
                  <th className="px-6 py-4 text-left font-medium">Name</th>
                  <th className="px-4 py-4 text-left font-medium">Unit</th>
                  <th className="px-4 py-4 text-right font-medium">Stock</th>
                  <th className="px-4 py-4 text-right font-medium">Threshold</th>
                  <th className="px-4 py-4 text-right font-medium">Cost/Unit</th>
                  <th className="px-4 py-4 text-right font-medium">Value</th>
                  <th className="px-4 py-4 text-left font-medium">Status</th>
                  <th className="px-6 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((ingredient) => {
                  const qty = parseFloat(ingredient.stockQuantity);
                  const cost = parseFloat(ingredient.costPerUnit);
                  return (
                    <tr key={ingredient.id} className="bg-white transition hover:bg-[#fcfbf8]">
                      <td className="px-6 py-4 font-medium text-stone-900">{ingredient.name}</td>
                      <td className="px-4 py-4 text-stone-500">{ingredient.unit}</td>
                      <td className="px-4 py-4 text-right font-semibold text-stone-900">{qty.toFixed(3)}</td>
                      <td className="px-4 py-4 text-right text-stone-500">{parseFloat(ingredient.lowStockThreshold).toFixed(3)}</td>
                      <td className="px-4 py-4 text-right text-stone-500">{formatCurrency(cost, currencySymbol)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-stone-900">{formatCurrency(qty * cost, currencySymbol)}</td>
                      <td className="px-4 py-4">{stockStatus(ingredient)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <IconButton icon={<Edit2 size={15} />} label="Edit" onClick={() => openEdit(ingredient)} />
                          <IconButton icon={<Minus size={15} />} label="Adjust stock" onClick={() => openAdjust(ingredient)} />
                          <IconButton icon={<Trash2 size={15} />} label="Delete" onClick={() => setDeleteConfirm(ingredient.id)} danger />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">{editingIngredient ? "Edit Ingredient" : "Add Ingredient"}</h2>
                <p className="text-sm text-stone-500">Track raw materials used in your recipes.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name *">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Beef Patty"
                    autoFocus
                  />
                </Field>
                <Field label="Unit *">
                  <select
                    value={form.unit}
                    onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                    className={inputCls}
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Cost per Unit">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.costPerUnit}
                    onChange={(e) => setForm((p) => ({ ...p, costPerUnit: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Stock Quantity">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={form.stockQuantity}
                    onChange={(e) => setForm((p) => ({ ...p, stockQuantity: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Low Stock Threshold">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm((p) => ({ ...p, lowStockThreshold: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>

            <div className="flex gap-3 border-t border-stone-200 px-6 py-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!form.name.trim() || !form.unit || saving}
                className="flex-[1.4] rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">Adjust Stock</h2>
                <p className="text-sm text-stone-500">{adjustTarget.name}</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <div className="rounded-[24px] bg-white px-4 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Current Stock</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
                  {parseFloat(adjustTarget.stockQuantity).toFixed(3)} {adjustTarget.unit}
                </div>
              </div>

              <Field label="Adjustment (positive = delivery, negative = waste)">
                <input
                  type="number"
                  step={0.001}
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(parseFloat(e.target.value) || 0)}
                  className={inputCls}
                  autoFocus
                />
              </Field>

              <Field label="Note (optional)">
                <input
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Delivery received"
                />
              </Field>

              <div className={`rounded-[24px] px-4 py-4 ${newStock < parseFloat(adjustTarget.lowStockThreshold) ? "bg-amber-50" : "bg-emerald-50"}`}>
                <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${newStock < parseFloat(adjustTarget.lowStockThreshold) ? "text-amber-600" : "text-emerald-600"}`}>
                  New Stock Level
                </div>
                <div className={`mt-2 text-2xl font-semibold tracking-[-0.04em] ${newStock < parseFloat(adjustTarget.lowStockThreshold) ? "text-amber-700" : "text-emerald-700"}`}>
                  {newStock.toFixed(3)} {adjustTarget.unit}
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-stone-200 px-6 py-5">
              <button onClick={() => setShowAdjustModal(false)} className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                Cancel
              </button>
              <button
                onClick={() => void handleAdjust()}
                disabled={adjustDelta === 0 || saving}
                className="flex-[1.4] rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Apply Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-stone-950">Delete Ingredient?</h3>
            <p className="mt-2 text-sm text-stone-500">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600">
                Cancel
              </button>
              <button onClick={() => void handleDelete(deleteConfirm)} className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "stone" | "emerald" | "amber" }) {
  const toneMap: Record<string, string> = {
    stone:   "bg-stone-100 text-stone-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-[24px] bg-white/72 p-4">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-2xl font-semibold tracking-[-0.04em] text-stone-950">{value}</div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneMap[tone]}`}>{label}</span>
      </div>
    </div>
  );
}

function StatusBadge({ text, tone }: { text: string; tone: "emerald" | "amber" | "rose" }) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    rose:    "bg-rose-50 text-rose-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneMap[tone]}`}>{text}</span>;
}

function IconButton({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`rounded-2xl p-2.5 transition ${danger ? "text-stone-400 hover:bg-rose-50 hover:text-rose-600" : "text-stone-400 hover:bg-amber-50 hover:text-amber-700"}`}
    >
      {icon}
    </button>
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

const inputCls =
  "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100";
