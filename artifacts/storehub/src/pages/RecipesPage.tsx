import { useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { useApp } from "../contexts/useApp";
import { API_BASE_URL } from "../services/dataService";
import { formatCurrency } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: string;
}

interface RecipeIngredient {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: string;
  name?: string;
  unit?: string;
  costPerUnit?: string;
}

interface Recipe {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  yieldQuantity: string;
  yieldUnit: string;
  createdAt: string;
  recipeIngredients?: RecipeIngredient[];
  estimatedCost?: number;
}

interface IngredientRow {
  ingredientId: string;
  quantity: number;
}

const BASE = `${API_BASE_URL}/api/store`;

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const { currencySymbol } = useApp();
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [ingredientList, setIngredientList] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formYieldQty, setFormYieldQty] = useState(1);
  const [formYieldUnit, setFormYieldUnit] = useState("serving");
  const [formIngredients, setFormIngredients] = useState<IngredientRow[]>([]);

  async function load() {
    const [recipeRes, ingredientRes] = await Promise.all([
      apiFetch("/recipes"),
      apiFetch("/ingredients"),
    ]);
    if (recipeRes.ok) setRecipeList(await recipeRes.json() as Recipe[]);
    if (ingredientRes.ok) setIngredientList(await ingredientRes.json() as Ingredient[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openAdd() {
    setEditingRecipe(null);
    setFormName("");
    setFormCategory("");
    setFormDescription("");
    setFormYieldQty(1);
    setFormYieldUnit("serving");
    setFormIngredients([{ ingredientId: "", quantity: 1 }]);
    setShowModal(true);
  }

  async function openEdit(recipe: Recipe) {
    setEditingRecipe(recipe);
    setFormName(recipe.name);
    setFormCategory(recipe.category ?? "");
    setFormDescription(recipe.description ?? "");
    setFormYieldQty(parseFloat(recipe.yieldQuantity));
    setFormYieldUnit(recipe.yieldUnit);

    // Load full recipe to get ingredients
    const res = await apiFetch(`/recipes/${recipe.id}/full`);
    if (res.ok) {
      const full = (await res.json()) as Recipe;
      setFormIngredients(
        (full.recipeIngredients ?? []).map((ri) => ({
          ingredientId: ri.ingredientId,
          quantity: parseFloat(ri.quantity),
        })),
      );
    } else {
      setFormIngredients([]);
    }
    setShowModal(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDescription || undefined,
        category: formCategory || undefined,
        yieldQuantity: formYieldQty,
        yieldUnit: formYieldUnit,
        ingredients: formIngredients.filter((r) => r.ingredientId),
      };
      if (editingRecipe) {
        await apiFetch(`/recipes/${editingRecipe.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/recipes", { method: "POST", body: JSON.stringify(body) });
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/recipes/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    await load();
  }

  function addIngredientRow() {
    setFormIngredients((prev) => [...prev, { ingredientId: "", quantity: 1 }]);
  }

  function removeIngredientRow(index: number) {
    setFormIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateIngredientRow(index: number, field: keyof IngredientRow, value: string | number) {
    setFormIngredients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  // Live estimated cost
  const estimatedCost = formIngredients.reduce((sum, row) => {
    if (!row.ingredientId) return sum;
    const ing = ingredientList.find((i) => i.id === row.ingredientId);
    if (!ing) return sum;
    return sum + row.quantity * parseFloat(ing.costPerUnit);
  }, 0) / (formYieldQty || 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Restaurant</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Recipes</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Define how ingredients combine to produce menu items. Each recipe tracks cost per serving automatically.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            <Plus size={16} />
            New Recipe
          </button>
        </div>
      </div>

      {/* Recipe grid */}
      <div className="soft-panel rounded-[32px] p-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-stone-400">Loading recipes…</div>
        ) : recipeList.length === 0 ? (
          <div className="py-16 text-center text-sm text-stone-400">No recipes yet. Create your first recipe.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recipeList.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                currencySymbol={currencySymbol}
                onEdit={() => void openEdit(recipe)}
                onDelete={() => setDeleteConfirm(recipe.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">{editingRecipe ? "Edit Recipe" : "New Recipe"}</h2>
                <p className="text-sm text-stone-500">Define ingredients and yield for this preparation.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Name *">
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Classic Burger"
                    autoFocus
                  />
                </Field>
                <Field label="Category">
                  <input
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Burgers, Salads"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Description">
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="Optional preparation notes"
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Yield Quantity">
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={formYieldQty}
                    onChange={(e) => setFormYieldQty(parseFloat(e.target.value) || 1)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Yield Unit">
                  <input
                    value={formYieldUnit}
                    onChange={(e) => setFormYieldUnit(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. serving, portion, cookie"
                  />
                </Field>
              </div>

              {/* Ingredients section */}
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-700">Ingredients</h3>
                  <button
                    onClick={addIngredientRow}
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50"
                  >
                    <Plus size={13} />
                    Add Ingredient
                  </button>
                </div>

                {formIngredients.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-200 py-6 text-center text-sm text-stone-400">
                    No ingredients yet. Click "Add Ingredient" to start.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formIngredients.map((row, index) => {
                      const ing = ingredientList.find((i) => i.id === row.ingredientId);
                      return (
                        <div key={index} className="flex items-center gap-3 rounded-[24px] bg-white px-4 py-3">
                          <select
                            value={row.ingredientId}
                            onChange={(e) => updateIngredientRow(index, "ingredientId", e.target.value)}
                            className="flex-1 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          >
                            <option value="">Select ingredient…</option>
                            {ingredientList.map((i) => (
                              <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            step={0.001}
                            value={row.quantity}
                            onChange={(e) => updateIngredientRow(index, "quantity", parseFloat(e.target.value) || 0)}
                            className="w-24 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                          />
                          <span className="w-10 text-xs text-stone-400">{ing?.unit ?? ""}</span>
                          <button
                            onClick={() => removeIngredientRow(index)}
                            className="rounded-2xl p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {formIngredients.some((r) => r.ingredientId) && (
                  <div className="mt-4 rounded-[24px] bg-emerald-50 px-4 py-3 text-sm">
                    <span className="text-emerald-700 font-medium">Estimated cost per {formYieldUnit || "serving"}:</span>{" "}
                    <span className="font-semibold text-emerald-800">{formatCurrency(estimatedCost, currencySymbol)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-stone-200 px-6 py-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!formName.trim() || saving}
                className="flex-[1.4] rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-stone-950">Delete Recipe?</h3>
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

// ─── RecipeCard ───────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  currencySymbol,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  currencySymbol: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-white p-5 transition hover:border-stone-300 hover:bg-[#fcfbf8]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-900">{recipe.name}</div>
          {recipe.category && <div className="mt-1 text-xs text-stone-400">{recipe.category}</div>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label="Edit recipe"
            className="rounded-2xl p-2 text-stone-400 transition hover:bg-amber-50 hover:text-amber-700"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete recipe"
            className="rounded-2xl p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {recipe.description && (
        <p className="mt-2 line-clamp-2 text-xs text-stone-500">{recipe.description}</p>
      )}

      <div className="mt-4 flex items-center gap-3 text-xs text-stone-500">
        <span className="rounded-full bg-stone-100 px-3 py-1 font-medium">
          Yields {parseFloat(recipe.yieldQuantity)} {recipe.yieldUnit}
        </span>
        {recipe.estimatedCost !== undefined && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            {formatCurrency(recipe.estimatedCost, currencySymbol)}/serving
          </span>
        )}
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
