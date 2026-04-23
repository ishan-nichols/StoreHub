import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2, X } from "lucide-react";
import CurrencyInput from "../components/CurrencyInput";
import { useApp } from "../contexts/useApp";
import { createSale, getProducts } from "../services/dataService";
import type { CartItem, Product } from "../schemas";
import { formatCurrency } from "../utils";

export default function POSPage() {
  const { t, currencySymbol, profile } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [receipt, setReceipt] = useState<{
    receiptNumber: string;
    items: CartItem[];
    total: number;
    change: number;
    amountPaid: number;
    storeName: string;
    date: string;
  } | null>(null);

  async function load() {
    const productList = await getProducts();
    setProducts(productList);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    window.addEventListener("storehub:products-updated", load);
    return () => window.removeEventListener("storehub:products-updated", load);
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))], [products]);
  const filtered = useMemo(
    () =>
      products.filter((product) => {
        const matchSearch =
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          product.category.toLowerCase().includes(search.toLowerCase());
        const matchCategory = activeCategory === "All" || product.category === activeCategory;
        return matchSearch && matchCategory && product.quantity > 0;
      }),
    [activeCategory, products, search],
  );

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxRate = profile?.taxRate ?? 0;
  const tax = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
  const total = subtotal + tax;
  const change = amountPaid - total;

  function addToCart(product: Product) {
    setCart((previous) => {
      const existing = previous.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) return previous;
        return previous.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...previous, { productId: product.id, productName: product.name, price: product.price, quantity: 1, unit: product.unit }];
    });
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) setCart((previous) => previous.filter((item) => item.productId !== productId));
    else setCart((previous) => previous.map((item) => (item.productId === productId ? { ...item, quantity: qty } : item)));
  }

  async function handleCompleteSale() {
    if (cart.length === 0 || amountPaid < total) return;

    const sale = await createSale({
      items: cart,
      subtotal,
      tax,
      total,
      amountPaid,
      change: amountPaid - total,
      note: "",
      receiptNumber: "",
    });

    setReceipt({
      receiptNumber: sale.receiptNumber,
      items: cart,
      total,
      change: amountPaid - total,
      amountPaid,
      storeName: profile?.storeName ?? "StoreHub",
      date: new Date(sale.createdAt).toLocaleString(),
    });
    setCart([]);
    setShowCheckout(false);
    setAmountPaid(0);
    await load();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Point of sale</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Checkout that stays fast when the line gets long.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Search instantly, tap products once, and keep the running total visible at every step.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <HeroStat label="Items in cart" value={String(cart.reduce((sum, item) => sum + item.quantity, 0))} />
            <HeroStat label="Subtotal" value={formatCurrency(subtotal, currencySymbol)} />
            <HeroStat label="Total due" value={formatCurrency(total, currencySymbol)} emphasize />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="soft-panel rounded-[32px] p-5">
          <div className="flex flex-col gap-4 border-b border-stone-200 pb-5">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.pos.searchProducts}
                className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
              />
            </div>
            {categories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                      activeCategory === category ? "bg-stone-950 text-white" : "bg-white text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="py-16 text-center text-sm text-stone-400">Loading products…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-stone-100 text-stone-500">
                  <Search size={20} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-stone-900">{products.length === 0 ? "No products yet" : "No matching products"}</h2>
                <p className="mt-2 text-sm text-stone-500">
                  {products.length === 0 ? "Add items in Inventory before using checkout." : "Try another search or category."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((product) => {
                  const inCart = cart.find((item) => item.productId === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`rounded-[24px] border p-4 text-left transition ${
                        inCart ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300 hover:bg-[#fcfbf8]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-semibold text-stone-900">{product.name}</div>
                          <div className="mt-1 text-xs text-stone-400">{product.category || "General"}</div>
                        </div>
                        {inCart && <span className="rounded-full bg-stone-950 px-2.5 py-1 text-xs font-semibold text-white">{inCart.quantity}</span>}
                      </div>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold tracking-[-0.03em] text-stone-950">{formatCurrency(product.price, currencySymbol)}</div>
                          <div className="text-xs text-stone-500">{product.quantity} {product.unit} available</div>
                        </div>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">Tap to add</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="soft-panel flex h-fit flex-col rounded-[32px] p-5">
          <div className="flex items-center gap-3 border-b border-stone-200 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-950">{t.pos.cart}</h2>
              <p className="text-sm text-stone-500">{cart.length === 0 ? "No items selected yet." : `${cart.length} unique item${cart.length === 1 ? "" : "s"} ready to check out.`}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-[24px] bg-[#fbfaf7] px-4 py-8 text-center text-sm text-stone-500">Choose products from the left to start a sale.</div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="rounded-[24px] bg-[#fbfaf7] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-stone-900">{item.productName}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatCurrency(item.price, currencySymbol)} each</div>
                    </div>
                    <button onClick={() => updateQty(item.productId, 0)} className="rounded-2xl p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <QtyButton onClick={() => updateQty(item.productId, item.quantity - 1)} icon={<Minus size={14} />} />
                      <span className="min-w-[2rem] text-center text-sm font-semibold text-stone-900">{item.quantity}</span>
                      <QtyButton onClick={() => updateQty(item.productId, item.quantity + 1)} icon={<Plus size={14} />} />
                    </div>
                    <div className="text-sm font-semibold text-stone-950">{formatCurrency(item.price * item.quantity, currencySymbol)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-3 border-t border-stone-200 pt-5">
            <LineItem label="Subtotal" value={formatCurrency(subtotal, currencySymbol)} />
            <LineItem label={`Tax${taxRate ? ` (${taxRate}%)` : ""}`} value={formatCurrency(tax, currencySymbol)} />
            <LineItem label="Total" value={formatCurrency(total, currencySymbol)} strong />
            <button
              onClick={() => setShowCheckout(true)}
              disabled={cart.length === 0}
              className="w-full rounded-2xl bg-stone-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {t.pos.completeSale}
            </button>
          </div>
        </aside>
      </div>

      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-[#fbfaf7] shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">Complete sale</h2>
                <p className="text-sm text-stone-500">Review totals and enter payment.</p>
              </div>
              <button onClick={() => setShowCheckout(false)} className="rounded-2xl bg-white p-2 text-stone-400 transition hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="rounded-[24px] bg-white p-4">
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.productId} className="flex justify-between gap-3 text-sm text-stone-600">
                      <span>{item.productName} × {item.quantity}</span>
                      <span>{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-stone-200 pt-4">
                  <LineItem label="Subtotal" value={formatCurrency(subtotal, currencySymbol)} />
                  <LineItem label={`Tax${taxRate ? ` (${taxRate}%)` : ""}`} value={formatCurrency(tax, currencySymbol)} />
                  <LineItem label="Total" value={formatCurrency(total, currencySymbol)} strong />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-600">
                  {t.pos.amountPaid} ({currencySymbol})
                </label>
                <CurrencyInput
                  value={amountPaid}
                  onChange={setAmountPaid}
                  placeholder={total.toFixed(2)}
                  autoFocus
                  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-lg font-semibold text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                />
              </div>

              {amountPaid >= total && amountPaid > 0 && (
                <div className="rounded-[24px] bg-emerald-50 px-4 py-4 text-center">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">{t.pos.change}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-emerald-700">{formatCurrency(change, currencySymbol)}</div>
                </div>
              )}

              <button
                onClick={() => void handleCompleteSale()}
                disabled={amountPaid < total || cart.length === 0}
                className="w-full rounded-2xl bg-stone-950 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                Confirm sale
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-white shadow-2xl">
            <div className="px-6 py-6">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
                <h2 className="mt-4 text-xl font-semibold text-stone-950">{t.pos.receiptTitle}</h2>
                <div className="mt-1 text-xs text-stone-400">#{receipt.receiptNumber}</div>
              </div>

              <div className="mt-5 rounded-[24px] border border-dashed border-stone-200 px-4 py-4 font-mono text-sm">
                <div className="text-center font-semibold text-stone-950">{receipt.storeName}</div>
                <div className="mt-1 text-center text-xs text-stone-400">{receipt.date}</div>
                <div className="my-4 border-t border-dashed border-stone-200" />
                <div className="space-y-2">
                  {receipt.items.map((item, index) => (
                    <div key={`${item.productId}-${index}`} className="flex justify-between gap-3 text-stone-700">
                      <span>{item.productName} × {item.quantity}</span>
                      <span>{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                    </div>
                  ))}
                </div>
                <div className="my-4 border-t border-dashed border-stone-200" />
                <LineItem label="TOTAL" value={formatCurrency(receipt.total, currencySymbol)} strong />
                <LineItem label="Paid" value={formatCurrency(receipt.amountPaid, currencySymbol)} />
                <LineItem label="Change" value={formatCurrency(receipt.change, currencySymbol)} />
              </div>

              <div className="mt-5 flex gap-3">
                <button onClick={handlePrint} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
                  <Printer size={15} />
                  {t.pos.printReceipt}
                </button>
                <button onClick={() => setReceipt(null)} className="flex-1 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800">
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

function HeroStat({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`rounded-[24px] px-4 py-4 ${emphasize ? "bg-stone-950 text-white" : "bg-white/72 text-stone-900"}`}>
      <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${emphasize ? "text-white/50" : "text-stone-400"}`}>{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</div>
    </div>
  );
}

function QtyButton({ onClick, icon }: { onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-stone-600 transition hover:bg-stone-100">
      {icon}
    </button>
  );
}

function LineItem({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? "font-semibold text-stone-950" : "text-stone-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
