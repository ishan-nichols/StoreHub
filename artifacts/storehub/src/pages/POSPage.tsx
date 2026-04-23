import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import { getProducts, createSale } from "../services/dataService";
import type { Product, CartItem } from "../schemas";
import { formatCurrency } from "../utils";
import { Plus, Minus, Trash2, ShoppingCart, X, Printer, Search } from "lucide-react";
import CurrencyInput from "../components/CurrencyInput";

export default function POSPage() {
  const { t, currencySymbol } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  const [receipt, setReceipt] = useState<{
    receiptNumber: string;
    items: CartItem[];
    total: number;
    change: number;
    amountPaid: number;
    storeName: string;
    date: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");

  async function load() {
    const prods = await getProducts();
    setProducts(prods);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("storehub:products-updated", load);
    return () => window.removeEventListener("storehub:products-updated", load);
  }, []);

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const { profile } = useApp();

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    return matchSearch && matchCat && p.quantity > 0;
  });

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.quantity) return prev;
        return prev.map((i) => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: p.id, productName: p.name, price: p.price, quantity: 1, unit: p.unit }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: qty } : i));
    }
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const taxRate = profile?.taxRate ?? 0;
  const tax = parseFloat((subtotal * taxRate / 100).toFixed(2));
  const total = subtotal + tax;
  const change = amountPaid - total;

  async function handleCompleteSale() {
    if (cart.length === 0) return;
    const paid = amountPaid;
    if (paid < total) return;

    const sale = await createSale({
      items: cart,
      subtotal,
      tax,
      total,
      amountPaid: paid,
      change: paid - total,
      note: "",
    });

    setReceipt({
      receiptNumber: sale.receiptNumber,
      items: cart,
      total,
      change: paid - total,
      amountPaid: paid,
      storeName: profile?.storeName ?? "StoreHub",
      date: new Date(sale.createdAt).toLocaleString(),
    });
    setCart([]);
    setShowCheckout(false);
    setAmountPaid(0);
    await load();
  }

  function handlePrint() {
    /**
     * [Printer API integration point]
     * Future: connect to Star Micronics, Epson, or any ESC/POS printer API here.
     * The receipt data structure is ready for integration.
     */
    window.print();
  }

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-gray-100 dark:border-gray-700">
        <div className="p-4 space-y-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">{t.pos.title}</h1>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.pos.searchProducts}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    activeCategory === cat
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12 text-sm">Loading products...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {products.length === 0 ? "No products in inventory yet" : "No products found"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((p) => {
                const inCart = cart.find((i) => i.productId === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`text-left rounded-xl border-2 p-3 transition-all active:scale-95 ${
                      inCart
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                        : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-amber-300"
                    }`}
                  >
                    <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm leading-tight mb-1">
                      {p.name}
                    </div>
                    <div className="text-amber-600 font-bold text-base">{formatCurrency(p.price, currencySymbol)}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{p.quantity} {p.unit} left</div>
                    {inCart && (
                      <div className="mt-1 text-xs font-bold text-amber-600">{inCart.quantity} in cart</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-full md:w-72 lg:w-80 flex flex-col bg-white dark:bg-gray-800 max-h-64 md:max-h-none border-t md:border-t-0 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <ShoppingCart size={18} className="text-amber-500" />
          <span className="font-bold text-gray-800 dark:text-gray-100">{t.pos.cart}</span>
          {cart.length > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">{t.pos.emptyCart}</p>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-xl p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{item.productName}</div>
                  <div className="text-xs text-amber-600 font-bold">{formatCurrency(item.price * item.quantity, currencySymbol)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-200 hover:bg-amber-100 transition-colors">
                    <Minus size={10} />
                  </button>
                  <span className="text-xs font-bold w-5 text-center text-gray-800 dark:text-gray-100">{item.quantity}</span>
                  <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-200 hover:bg-amber-100 transition-colors">
                    <Plus size={10} />
                  </button>
                  <button onClick={() => updateQty(item.productId, 0)} className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex justify-between text-sm font-bold text-gray-800 dark:text-gray-100">
              <span>{t.common.total}</span>
              <span className="text-amber-600">{formatCurrency(total, currencySymbol)}</span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-3.5 text-sm transition-colors shadow-md shadow-amber-200 dark:shadow-amber-900/20"
            >
              {t.pos.completeSale}
            </button>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Complete Sale</h2>
              <button onClick={() => setShowCheckout(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 space-y-2 text-sm">
                {cart.map((i) => (
                  <div key={i.productId} className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>{i.productName} × {i.quantity}</span>
                    <span>{formatCurrency(i.price * i.quantity, currencySymbol)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 space-y-1">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal, currencySymbol)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Tax ({taxRate}%)</span>
                      <span>{formatCurrency(tax, currencySymbol)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-800 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-600">
                    <span>Total</span>
                    <span>{formatCurrency(total, currencySymbol)}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{t.pos.amountPaid} ({currencySymbol})</label>
                <CurrencyInput
                  value={amountPaid}
                  onChange={setAmountPaid}
                  placeholder={total.toFixed(2)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100"
                  autoFocus
                />
              </div>
              {amountPaid >= total && amountPaid > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                  <div className="text-xs text-emerald-600 font-semibold">{t.pos.change}</div>
                  <div className="text-2xl font-bold text-emerald-700">{formatCurrency(change, currencySymbol)}</div>
                </div>
              )}
              <button
                onClick={handleCompleteSale}
                disabled={amountPaid < total || cart.length === 0}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 text-base transition-colors"
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-2xl">✓</span>
                </div>
                <h2 className="font-bold text-gray-800 dark:text-gray-100">{t.pos.receiptTitle}</h2>
                <div className="text-xs text-gray-400 mt-1">#{receipt.receiptNumber}</div>
              </div>
              <div className="border border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-2 text-sm font-mono">
                <div className="text-center font-bold text-gray-800 dark:text-gray-100 text-base">{receipt.storeName}</div>
                <div className="text-center text-gray-400 text-xs">{receipt.date}</div>
                <div className="border-t border-dashed border-gray-200 dark:border-gray-600 my-2" />
                {receipt.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{i.productName} × {i.quantity}</span>
                    <span>{formatCurrency(i.price * i.quantity, currencySymbol)}</span>
                  </div>
                ))}
                <div className="border-t border-dashed border-gray-200 dark:border-gray-600 my-2" />
                <div className="flex justify-between font-bold text-gray-800 dark:text-gray-100">
                  <span>TOTAL</span>
                  <span>{formatCurrency(receipt.total, currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Paid</span>
                  <span>{formatCurrency(receipt.amountPaid, currencySymbol)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Change</span>
                  <span>{formatCurrency(receipt.change, currencySymbol)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  <Printer size={15} /> {t.pos.printReceipt}
                </button>
                <button
                  onClick={() => setReceipt(null)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
                >
                  {t.pos.newSale}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
