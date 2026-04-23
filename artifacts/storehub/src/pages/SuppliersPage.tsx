import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, getProducts } from "../services/dataService";
import type { Supplier, InsertSupplier, Product } from "../schemas";
import { Plus, Edit2, Trash2, X, Phone, Mail } from "lucide-react";

const emptyForm: InsertSupplier = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  productIds: [],
  reorderNotes: "",
};

export default function SuppliersPage() {
  const { t } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsertSupplier>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function load() {
    const [sups, prods] = await Promise.all([getSuppliers(), getProducts()]);
    setSuppliers(sups);
    setProducts(prods);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(s: Supplier) {
    setForm({ name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, productIds: s.productIds, reorderNotes: s.reorderNotes });
    setEditingId(s.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) {
      await updateSupplier(editingId, form);
    } else {
      await createSupplier(form);
    }
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    await deleteSupplier(id);
    setDeleteConfirm(null);
    load();
  }

  function toggleProduct(productId: string) {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(productId)
        ? f.productIds.filter((id) => id !== productId)
        : [...f.productIds, productId],
    }));
  }

  function getProductNames(productIds: string[]) {
    return productIds
      .map((id) => products.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t.suppliers.title}</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow transition-colors"
        >
          <Plus size={16} /> {t.suppliers.addSupplier}
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{t.suppliers.noSuppliers}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-gray-800 dark:text-gray-100">{s.name}</div>
                  {s.contactName && <div className="text-sm text-gray-500">{s.contactName}</div>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => setDeleteConfirm(s.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {s.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone size={13} className="text-gray-400" />
                  <a href={`tel:${s.phone}`} className="hover:text-amber-600 transition-colors">{s.phone}</a>
                </div>
              )}
              {s.email && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail size={13} className="text-gray-400" />
                  <a href={`mailto:${s.email}`} className="hover:text-amber-600 transition-colors">{s.email}</a>
                </div>
              )}
              {s.productIds.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 mb-1">Products</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">{getProductNames(s.productIds)}</div>
                </div>
              )}
              {s.reorderNotes && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-xs text-amber-700 dark:text-amber-300">
                  {s.reorderNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{editingId ? t.suppliers.editSupplier : t.suppliers.addSupplier}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: "Supplier Name *", key: "name", placeholder: "e.g. Fresh Foods Inc." },
                { label: t.suppliers.contactName, key: "contactName", placeholder: "e.g. Juan Rodriguez" },
                { label: t.suppliers.phone, key: "phone", placeholder: "+1 555-0100" },
                { label: t.suppliers.email, key: "email", placeholder: "supplier@example.com" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
              ))}
              {products.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.suppliers.products}</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl p-2">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer hover:text-amber-600">
                        <input
                          type="checkbox"
                          checked={form.productIds.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="rounded"
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.suppliers.reorderNotes}</label>
                <textarea
                  value={form.reorderNotes}
                  onChange={(e) => setForm((f) => ({ ...f, reorderNotes: e.target.value }))}
                  rows={2}
                  placeholder="Minimum order qty, lead time, etc."
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100 resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleSave} disabled={!form.name.trim()} className="flex-[2] bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3 text-sm transition-colors">{t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100">Delete this supplier?</h3>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500 text-white font-bold rounded-xl py-2.5 text-sm">{t.common.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
