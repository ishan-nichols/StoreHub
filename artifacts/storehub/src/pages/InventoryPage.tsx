import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Edit2, Package, Plus, ScanLine, Search, Tag, Trash2, Truck, X } from "lucide-react";
import { useApp } from "../contexts/useApp";
import BarcodeScanner from "../components/BarcodeScanner";
import BulkPriceUpdateModal from "../components/BulkPriceUpdateModal";
import CurrencyInput from "../components/CurrencyInput";
import PricePanel from "../components/PricePanel";
import ReceiveDeliveryModal from "../components/ReceiveDeliveryModal";
import ScheduledPriceChangesPanel from "../components/ScheduledPriceChangesPanel";
import PredictedDemandPanel from "../components/PredictedDemandPanel";
import DeadStockPanel from "../components/DeadStockPanel";
import { saveToLibrary, type BarcodeProductInfo } from "../services/barcodeService";
import { createProduct, deleteProduct, getProducts, getSuppliers, updateProduct, getCategorySettings, upsertCategorySetting } from "../services/dataService";
import type { InsertProduct, Product, Supplier, CategorySetting } from "../schemas";
import { formatCurrency } from "../utils";
import IngredientsPage from "./IngredientsPage";
import RecipesPage from "./RecipesPage";
import MenuPage from "./MenuPage";

const emptyForm: InsertProduct = {
  name: "",
  sku: "",
  category: "",
  price: 0,
  quantity: 0,
  lowStockThreshold: 5,
  supplierId: null,
  unit: "unit",
  tags: [],
  barcode: "",
  costPrice: 0,
  srp: undefined,
  marginAlertPct: 15,
};

// ─── Restaurant wrapper ───────────────────────────────────────────────────────

type RestaurantTab = "ingredients" | "recipes" | "menu";

function RestaurantInventory() {
  const [activeTab, setActiveTab] = useState<RestaurantTab>("ingredients");
  const tabs: { id: RestaurantTab; label: string }[] = [
    { id: "ingredients", label: "Ingredients" },
    { id: "recipes",     label: "Recipes" },
    { id: "menu",        label: "Menu" },
  ];
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex gap-2 rounded-[32px] bg-stone-100 p-1.5 self-start">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-[24px] px-5 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-white text-stone-950 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "ingredients" && <IngredientsPage />}
      {activeTab === "recipes"     && <RecipesPage />}
      {activeTab === "menu"        && <MenuPage />}
    </div>
  );
}

// ─── Main export — branches on businessType ───────────────────────────────────

export default function InventoryPage() {
  const { profile } = useApp();
  const isRestaurant = profile?.businessType === "restaurant";
  if (isRestaurant) return <RestaurantInventory />;
  return <RetailInventoryPage />;
}

type RetailTab = "products" | "predictions" | "deadstock";

function RetailInventoryPage() {
  const { t, currencySymbol, profile } = useApp();
  const [activeTab, setActiveTab] = useState<RetailTab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsertProduct>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showReceiveDelivery, setShowReceiveDelivery] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ productId: string; field: "price" | "costPrice" | "quantity" | "lowStockThreshold" | "marginTarget"; value: string } | null>(null);
  const [categorySettings, setCategorySettings] = useState<CategorySetting[]>([]);
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [editingCategorySetting, setEditingCategorySetting] = useState<CategorySetting | null>(null);

  const retailTabs: { id: RetailTab; label: string }[] = [
    { id: "products",     label: "Products" },
    { id: "predictions",  label: "Predictions" },
    { id: "deadstock",    label: "Dead Stock" },
  ];

  async function load() {
    const [productList, supplierList, settings] = await Promise.all([getProducts(), getSuppliers(), getCategorySettings()]);
    setProducts(productList);
    setSuppliers(supplierList);
    setCategorySettings(settings);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    window.addEventListener("storehub:products-updated", load);
    return () => window.removeEventListener("storehub:products-updated", load);
  }, []);

  function marginPct(product: Product): number | null {
    if (!product.costPrice) return null;
    return ((product.price - product.costPrice) / product.price) * 100;
  }

  function effectiveMarginTarget(product: Product): number {
    if (product.marginTarget != null) return product.marginTarget;
    return categorySettings.find(s => s.category === product.category)?.marginTarget ?? 30;
  }

  function marginColor(margin: number | null, target: number): string {
    if (margin === null) return "bg-amber-100 text-amber-800";
    if (margin >= target) return "bg-emerald-100 text-emerald-800";
    if (margin >= target - 5) return "bg-amber-100 text-amber-800";
    return "bg-rose-100 text-rose-800";
  }

  async function commitInlineEdit() {
    if (!inlineEdit) return;
    const num = parseFloat(inlineEdit.value);
    if (isNaN(num) || num < 0) { setInlineEdit(null); return; }
    await updateProduct(inlineEdit.productId, { [inlineEdit.field]: num });
    await load();
    setInlineEdit(null);
  }

  async function saveCategorySetting() {
    if (!editingCategorySetting) return;
    await upsertCategorySetting(editingCategorySetting);
    await load();
    setEditingCategorySetting(null);
  }

  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const q = search.toLowerCase();
        return (
          product.name.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q)
        );
      }),
    [products, search],
  );

  const inventoryValue = products.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const lowStockCount = products.filter((product) => product.quantity <= product.lowStockThreshold).length;
  const outOfStockCount = products.filter((product) => product.quantity === 0).length;
  const isGrocery =
    profile?.businessType === "grocery" || profile?.businessType === "butcher" || profile?.businessType === "bakery";

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: product.price,
      quantity: product.quantity,
      lowStockThreshold: product.lowStockThreshold,
      supplierId: product.supplierId,
      unit: product.unit,
      tags: product.tags,
      barcode: product.barcode ?? "",
      costPrice: product.costPrice ?? 0,
      srp: product.srp,
      marginAlertPct: product.marginAlertPct ?? 15,
    });
    setEditingId(product.id);
    setShowForm(true);
  }

  function handleBarcodeResult(info: BarcodeProductInfo, isManual: boolean) {
    setShowBarcodeScanner(false);
    if (isManual) saveToLibrary(info);
    setForm({
      ...emptyForm,
      name: info.name,
      sku: info.barcode,
      barcode: info.barcode,
      category: info.category ?? "",
      srp: info.srp,
      price: info.srp ?? 0,
    });
    setEditingId(null);
    setShowForm(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) await updateProduct(editingId, form);
    else await createProduct(form);
    setShowForm(false);
    await load();
  }

  async function handleDelete(id: string) {
    await deleteProduct(id);
    setDeleteConfirm(null);
    await load();
  }

  function statusBadge(product: Product) {
    if (product.quantity === 0) return <Status tone="rose" text="Out of stock" />;
    if (product.quantity <= product.lowStockThreshold) return <Status tone="amber" text="Low stock" />;
    return <Status tone="emerald" text="Healthy" />;
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-2 rounded-[32px] bg-stone-100 p-1.5 self-start">
        {retailTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-[24px] px-5 py-2.5 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-white text-stone-950 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Predictions tab */}
      {activeTab === "predictions" && <PredictedDemandPanel />}

      {/* Dead Stock tab */}
      {activeTab === "deadstock" && <DeadStockPanel />}

      {/* Products tab — existing content below */}
      {activeTab !== "predictions" && activeTab !== "deadstock" && (
      <>
      <section className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Inventory</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Everything on the shelf, in one glance.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Add items fast, catch low stock early, and keep pricing changes under control without losing your place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionButton icon={<ScanLine size={16} />} label="Scan barcode" onClick={() => setShowBarcodeScanner(true)} />
            <ActionButton icon={<Truck size={16} />} label="Receive delivery" onClick={() => setShowReceiveDelivery(true)} />
            <ActionButton
              icon={<Tag size={16} />}
              label={selectMode ? "Done selecting" : "Bulk price"}
              onClick={() => {
                setSelectMode((value) => !value);
                setSelectedIds(new Set());
              }}
            />
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Plus size={16} />
              {t.inventory.addProduct}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Products" value={String(products.length)} tone="stone" />
          <SummaryCard label="Inventory value" value={formatCurrency(inventoryValue, currencySymbol)} tone="emerald" />
          <SummaryCard label="Low stock" value={String(lowStockCount)} tone="amber" />
          <SummaryCard label="Out of stock" value={String(outOfStockCount)} tone="rose" />
        </div>
      </section>

      {selectMode && selectedIds.size > 0 && (
        <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{selectedIds.size} product{selectedIds.size === 1 ? "" : "s"} selected for a bulk price update.</span>
            <button
              onClick={() => setShowBulkUpdate(true)}
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-700"
            >
              Update prices
            </button>
          </div>
        </section>
      )}

      <section className="soft-panel rounded-[32px] p-5">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`${t.common.search} products, categories, or SKU`}
            className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
          />
        </div>
      </section>

      <section className="soft-panel overflow-hidden rounded-[32px]">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-stone-400">Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-stone-100 text-stone-500">
              <Package size={22} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-stone-900">
              {products.length === 0 ? "No inventory yet" : "No products match that search"}
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              {products.length === 0 ? "Start with your first product or scan a barcode to move faster." : "Try a simpler keyword or clear the search field."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#faf7f1] text-stone-500">
                <tr>
                  {selectMode && <th className="px-4 py-4 text-left font-medium">Select</th>}
                  <th className="px-6 py-4 text-left font-medium">Product</th>
                  <th className="px-4 py-4 text-left font-medium">Category</th>
                  <th className="px-4 py-4 text-right font-medium">Price</th>
                  <th className="px-4 py-4 text-right font-medium">Quantity</th>
                  <th className="px-4 py-4 text-left font-medium">Status</th>
                  <th className="px-6 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((product) => (
                  <tr key={product.id} className="bg-white transition hover:bg-[#fcfbf8]">
                    {selectMode && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="font-medium text-stone-900">{product.name}</div>
                      <div className="mt-1 text-xs text-stone-400">{product.sku || "No SKU"}</div>
                    </td>
                    <td className="px-4 py-4 text-stone-500">{product.category || "—"}</td>
                    <td className="px-4 py-4 text-right font-semibold text-stone-900">{formatCurrency(product.price, currencySymbol)}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-semibold ${product.quantity <= product.lowStockThreshold ? "text-rose-600" : "text-stone-900"}`}>{product.quantity}</span>
                      <span className="ml-1 text-xs text-stone-400">{product.unit}</span>
                    </td>
                    <td className="px-4 py-4">{statusBadge(product)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <IconButton icon={<Edit2 size={15} />} label="Edit product" onClick={() => openEdit(product)} />
                        <IconButton icon={<Trash2 size={15} />} label="Delete product" onClick={() => setDeleteConfirm(product.id)} danger />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ScheduledPriceChangesPanel products={products} />

      {showBarcodeScanner && <BarcodeScanner onClose={() => setShowBarcodeScanner(false)} onResult={handleBarcodeResult} />}
      {showReceiveDelivery && <ReceiveDeliveryModal onClose={() => setShowReceiveDelivery(false)} onComplete={load} />}
      {showBulkUpdate && (
        <BulkPriceUpdateModal
          selectedProducts={products.filter((product) => selectedIds.has(product.id))}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={() => {
            setSelectedIds(new Set());
            setSelectMode(false);
            void load();
          }}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">{editingId ? t.inventory.editProduct : t.inventory.addProduct}</h2>
                <p className="text-sm text-stone-500">Keep pricing, stock, and supplier details easy to maintain.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-6 py-6">
              {editingId && <PricePanel product={products.find((product) => product.id === editingId)!} onChange={load} />}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label={`${t.inventory.productName} *`}>
                  <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className={inputCls} />
                </Field>
                <Field label={t.inventory.category}>
                  <input value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} className={inputCls} />
                </Field>
                <Field label="SKU">
                  <input value={form.sku} onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))} className={inputCls} />
                </Field>
                <Field label="Barcode (UPC/EAN)">
                  <input
                    value={form.barcode ?? ""}
                    onChange={(event) => setForm((prev) => ({ ...prev, barcode: event.target.value }))}
                    className={inputCls}
                    placeholder="0123456789012"
                  />
                </Field>
                <Field label={`Cost (${currencySymbol})`}>
                  <CurrencyInput value={form.costPrice ?? 0} onChange={(value) => setForm((prev) => ({ ...prev, costPrice: value }))} className={inputCls} />
                </Field>
                <Field label={`${t.inventory.price} (${currencySymbol})`}>
                  <CurrencyInput value={form.price} onChange={(value) => setForm((prev) => ({ ...prev, price: value }))} className={inputCls} />
                </Field>
                <Field label={`SRP (${currencySymbol})`}>
                  <CurrencyInput
                    value={form.srp ?? 0}
                    onChange={(value) => setForm((prev) => ({ ...prev, srp: value > 0 ? value : undefined }))}
                    className={inputCls}
                    placeholder="Optional"
                  />
                </Field>
                <Field label={t.inventory.quantity}>
                  <input
                    type="number"
                    min={0}
                    value={form.quantity}
                    onChange={(event) => setForm((prev) => ({ ...prev, quantity: parseInt(event.target.value, 10) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={t.inventory.lowStockThreshold}>
                  <input
                    type="number"
                    min={0}
                    value={form.lowStockThreshold}
                    onChange={(event) => setForm((prev) => ({ ...prev, lowStockThreshold: parseInt(event.target.value, 10) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Margin alert below %">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.marginAlertPct ?? 15}
                    onChange={(event) => setForm((prev) => ({ ...prev, marginAlertPct: parseFloat(event.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={t.inventory.unit}>
                  <input
                    value={form.unit}
                    onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
                    className={inputCls}
                    placeholder="unit, kg, box…"
                  />
                </Field>
                {suppliers.length > 0 && (
                  <Field label={t.inventory.supplier}>
                    <select
                      value={form.supplierId ?? ""}
                      onChange={(event) => setForm((prev) => ({ ...prev, supplierId: event.target.value || null }))}
                      className={inputCls}
                    >
                      <option value="">No supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {isGrocery && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>Perishable inventory benefits from a tighter low-stock threshold so staff can react before a shelf goes empty.</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-stone-200 px-6 py-5">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                {t.common.cancel}
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!form.name.trim()}
                className="flex-[1.4] rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-stone-950">{t.inventory.deleteConfirm}</h3>
            <p className="mt-2 text-sm text-stone-500">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600">
                {t.common.cancel}
              </button>
              <button onClick={() => void handleDelete(deleteConfirm)} className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white">
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "stone" | "emerald" | "amber" | "rose" }) {
  const toneMap: Record<string, string> = {
    stone: "bg-stone-100 text-stone-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
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

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-white">
      {icon}
      {label}
    </button>
  );
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

function Status({ text, tone }: { text: string; tone: "emerald" | "amber" | "rose" }) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneMap[tone]}`}>{text}</span>;
}

const inputCls =
  "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-600">{label}</label>
      {children}
    </div>
  );
}
