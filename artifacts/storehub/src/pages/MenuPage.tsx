import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { useApp } from "../contexts/useApp";
import { API_BASE_URL } from "../services/dataService";
import { formatCurrency } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Recipe {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  recipeId: string | null;
  available: boolean;
  createdAt: string;
  recipeName?: string | null;
}

type InsertMenuItem = {
  name: string;
  description: string;
  category: string;
  price: number;
  recipeId: string | null;
  available: boolean;
};

const BASE = `${API_BASE_URL}/api/store`;

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

const emptyForm: InsertMenuItem = {
  name: "",
  description: "",
  category: "",
  price: 0,
  recipeId: null,
  available: true,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MenuPage() {
  const { currencySymbol } = useApp();
  const [menuList, setMenuList] = useState<MenuItem[]>([]);
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<InsertMenuItem>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [menuRes, recipeRes] = await Promise.all([
      apiFetch("/menu/with-recipes"),
      apiFetch("/recipes"),
    ]);
    if (menuRes.ok) setMenuList(await menuRes.json() as MenuItem[]);
    if (recipeRes.ok) setRecipeList(await recipeRes.json() as Recipe[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menuList.map((i) => i.category).filter(Boolean) as string[]))],
    [menuList],
  );

  const filtered = useMemo(
    () => activeCategory === "All" ? menuList : menuList.filter((i) => i.category === activeCategory),
    [menuList, activeCategory],
  );

  function openAdd() {
    setForm(emptyForm);
    setEditingItem(null);
    setShowModal(true);
  }

  function openEdit(item: MenuItem) {
    setForm({
      name: item.name,
      description: item.description ?? "",
      category: item.category ?? "",
      price: parseFloat(item.price),
      recipeId: item.recipeId,
      available: item.available,
    });
    setEditingItem(item);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingItem) {
        await apiFetch(`/menu-items/${editingItem.id}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/menu-items", { method: "POST", body: JSON.stringify(form) });
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/menu-items/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    await load();
  }

  async function toggleAvailability(item: MenuItem) {
    await apiFetch(`/menu-items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ available: !item.available }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Restaurant</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Menu</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Manage what you sell. Link items to recipes so the POS automatically deducts ingredients on each sale.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>
      </div>

      {/* Category filter tabs */}
      {categories.length > 1 && (
        <div className="soft-panel rounded-[32px] px-5 py-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeCategory === cat ? "bg-stone-950 text-white" : "bg-white text-stone-500 hover:bg-stone-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Menu grid */}
      <div className="soft-panel rounded-[32px] p-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-stone-400">Loading menu…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-stone-400">
            {menuList.length === 0 ? "No menu items yet. Add your first item." : "No items in this category."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                currencySymbol={currencySymbol}
                onEdit={() => openEdit(item)}
                onDelete={() => setDeleteConfirm(item.id)}
                onToggle={() => void toggleAvailability(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">{editingItem ? "Edit Menu Item" : "Add Menu Item"}</h2>
                <p className="text-sm text-stone-500">Define what you sell and link it to a recipe.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
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
                    placeholder="e.g. Classic Burger"
                    autoFocus
                  />
                </Field>
                <Field label="Price *">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Category">
                  <input
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Burgers, Drinks"
                  />
                </Field>
                <Field label="Link to Recipe">
                  <select
                    value={form.recipeId ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, recipeId: e.target.value || null }))}
                    className={inputCls}
                  >
                    <option value="">No recipe linked</option>
                    {recipeList.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="Optional description"
                  />
                </Field>
              </div>
            </div>

            <div className="flex gap-3 border-t border-stone-200 px-6 py-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!form.name.trim() || saving}
                className="flex-[1.4] rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-stone-950">Delete Menu Item?</h3>
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

// ─── MenuItemCard ─────────────────────────────────────────────────────────────

function MenuItemCard({
  item,
  currencySymbol,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: MenuItem;
  currencySymbol: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-[24px] border p-5 transition ${item.available ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50 opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-900">{item.name}</div>
          {item.category && <div className="mt-1 text-xs text-stone-400">{item.category}</div>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={onEdit} aria-label="Edit" className="rounded-2xl p-2 text-stone-400 transition hover:bg-amber-50 hover:text-amber-700">
            <Edit2 size={14} />
          </button>
          <button onClick={onDelete} aria-label="Delete" className="rounded-2xl p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {item.description && (
        <p className="mt-2 line-clamp-2 text-xs text-stone-500">{item.description}</p>
      )}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="text-xl font-semibold tracking-[-0.03em] text-stone-950">{formatCurrency(parseFloat(item.price), currencySymbol)}</div>
        <div className="flex flex-col items-end gap-1.5">
          {item.recipeName && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              {item.recipeName}
            </span>
          )}
          <button
            onClick={onToggle}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              item.available
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            {item.available ? "Available" : "86'd"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
