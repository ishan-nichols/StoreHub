import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import {
  getProducts,
  getSuppliers,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../services/dataService";
import type { Product, Supplier, InsertProduct } from "../schemas";
import { formatCurrency } from "../utils";
import { Plus, Search, Edit2, Trash2, AlertTriangle, X, Package, ScanLine, Tag } from "lucide-react";
import CurrencyInput from "../components/CurrencyInput";
import BarcodeScanner from "../components/BarcodeScanner";
import ReceiveDeliveryModal from "../components/ReceiveDeliveryModal";
import PricePanel from "../components/PricePanel";
import BulkPriceUpdateModal from "../components/BulkPriceUpdateModal";
import ScheduledPriceChangesPanel from "../components/ScheduledPriceChangesPanel";
import { saveToLibrary, type BarcodeProductInfo } from "../services/barcodeService";

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

export default function InventoryPage() {
  const { t, currencySymbol, profile } = useApp();
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

  async function load() {
    const [prods, sups] = await Promise.all([getProducts(), getSuppliers()]);
    setProducts(prods);
    setSuppliers(sups);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("storehub:products-updated", load);
    return () => window.removeEventListener("storehub:products-updated", load);
  }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      quantity: p.quantity,
      lowStockThreshold: p.lowStockThreshold,
      supplierId: p.supplierId,
      unit: p.unit,
      tags: p.tags,
      barcode: p.barcode ?? "",
      costPrice: p.costPrice ?? 0,
      srp: p.srp,
      marginAlertPct: p.marginAlertPct ?? 15,
    });
    setEditingId(p.id);
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) {
      await updateProduct(editingId, form);
    } else {
      await createProduct(form);
    }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await deleteProduct(id);
    setDeleteConfirm(null);
    load();
  }

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const isGrocery =
    profile?.businessType === "grocery" ||
    profile?.businessType === "butcher" ||
    profile?.businessType === "bakery";

  function getStatusBadge(p: Product) {
    if (p.quantity === 0)
      return <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">Out of Stock</span>;
    if (p.quantity <= p.lowStockThreshold)
      return (
        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
          <AlertTriangle size={10} /> Low
        </span>
      );
    return <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">In Stock</span>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t.inventory.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="flex items-center gap-2 border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl px-3 py-2.5 text-sm font-semibold"
          >
            <ScanLine size={15} /> Scan Barcode
          </button>
          <button
            onClick={() => setShowReceiveDelivery(true)}
            className="flex items-center gap-2 border-2 border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl px-3 py-2.5 text-sm font-semibold"
          >
            <Package size={15} /> Receive Delivery
          </button>
          <button
            onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold border-2 ${selectMode ? "bg-slate-700 text-white border-slate-700" : "border-slate-300 text-slate-700 dark:text-slate-300"}`}
          >
            <Tag size={15} /> {selectMode ? "Done selecting" : "Bulk price"}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow"
          >
            <Plus size={16} /> {t.inventory.addProduct}
          </button>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <button onClick={() => setShowBulkUpdate(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold">
            Update prices
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.common.search + " products..."}
          className="w-full pl-9 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {/* Table / List */}
      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {products.length === 0 ? t.inventory.noProducts : "No products match your search"}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {selectMode && <th className="px-2 py-3 w-8"></th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Product</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Price</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Qty</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden md:table-cell">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {selectMode && (
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-emerald-600" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{p.name}</div>
                      {p.sku && <div className="text-xs text-gray-400">{p.sku}</div>}
                      <div className="md:hidden mt-1">{getStatusBadge(p)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{p.category || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">
                      {formatCurrency(p.price, currencySymbol)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${p.quantity <= p.lowStockThreshold ? "text-red-600" : "text-gray-700 dark:text-gray-200"}`}>
                        {p.quantity}
                      </span>
                      <span className="text-gray-400 text-xs ml-1">{p.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">{getStatusBadge(p)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
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

      {/* Scheduled price changes */}
      <ScheduledPriceChangesPanel products={products} />

      {/* Modals */}
      {showBarcodeScanner && (
        <BarcodeScanner onClose={() => setShowBarcodeScanner(false)} onResult={handleBarcodeResult} />
      )}
      {showReceiveDelivery && (
        <ReceiveDeliveryModal onClose={() => setShowReceiveDelivery(false)} onComplete={load} />
      )}
      {showBulkUpdate && (
        <BulkPriceUpdateModal
          selectedProducts={products.filter((p) => selectedIds.has(p.id))}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={() => { setSelectedIds(new Set()); setSelectMode(false); load(); }}
        />
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">
                {editingId ? t.inventory.editProduct : t.inventory.addProduct}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editingId && (
                <PricePanel
                  product={products.find((p) => p.id === editingId)!}
                  onChange={load}
                />
              )}
              <Field label={t.inventory.productName + " *"}>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="SKU">
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Barcode (UPC/EAN)">
                  <input
                    value={form.barcode ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                    className={inputCls}
                    placeholder="0123456789012"
                  />
                </Field>
              </div>
              <Field label={t.inventory.category}>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label={`Cost (${currencySymbol})`}>
                  <CurrencyInput
                    value={form.costPrice ?? 0}
                    onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={`${t.inventory.price} (${currencySymbol})`}>
                  <CurrencyInput
                    value={form.price}
                    onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={`SRP (${currencySymbol})`}>
                  <CurrencyInput
                    value={form.srp ?? 0}
                    onChange={(v) => setForm((f) => ({ ...f, srp: v > 0 ? v : undefined }))}
                    className={inputCls}
                    placeholder="optional"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.inventory.quantity}>
                  <input
                    type="number" min={0}
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Margin alert below %">
                  <input
                    type="number" min={0} step={0.5}
                    value={form.marginAlertPct ?? 15}
                    onChange={(e) => setForm((f) => ({ ...f, marginAlertPct: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.inventory.lowStockThreshold}>
                  <input
                    type="number"
                    min={0}
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={t.inventory.unit}>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className={inputCls}
                    placeholder="unit, kg, pcs..."
                  />
                </Field>
              </div>
              {suppliers.length > 0 && (
                <Field label={t.inventory.supplier}>
                  <select
                    value={form.supplierId ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value || null }))}
                    className={inputCls}
                  >
                    <option value="">No supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              {isGrocery && (
                <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  Tip: Set a low stock threshold for perishables to get timely restocking alerts.
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
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
            <h3 className="font-bold text-gray-800 dark:text-gray-100">{t.inventory.deleteConfirm}</h3>
            <p className="text-sm text-gray-500">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
