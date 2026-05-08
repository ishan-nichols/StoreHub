import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Printer, Search, ShoppingCart, Trash2, X, Maximize2, PauseCircle, CreditCard, Tag } from "lucide-react";
import CurrencyInput from "../components/CurrencyInput";
import { useApp } from "../contexts/useApp";
import { createSale, getProducts, API_BASE_URL } from "../services/dataService";
import type { CartItem, Product } from "../schemas";
import { formatCurrency } from "../utils";

// ─── Restaurant POS ───────────────────────────────────────────────────────────

interface MenuItemWithRecipe {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  recipeId: string | null;
  available: boolean;
  recipeName?: string | null;
}

interface RestaurantCartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  category: string | null;
}

interface LowStockWarning {
  id: string;
  name: string;
  stockQuantity: string;
  unit: string;
}

const STORE_BASE = `${API_BASE_URL}/api/store`;

async function storeApiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${STORE_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

function RestaurantPOS() {
  const { currencySymbol, profile } = useApp();
  const [menuItems, setMenuItems] = useState<MenuItemWithRecipe[]>([]);
  const [cart, setCart] = useState<RestaurantCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<{
    receiptNumber: string;
    items: RestaurantCartItem[];
    total: number;
    lowStockWarnings: LowStockWarning[];
  } | null>(null);
  const [fullscreenMode, setFullscreenMode] = useState(
    () => localStorage.getItem("storehub_pos_fullscreen") === "true"
  );
  const [heldCarts, setHeldCarts] = useState<{ id: string; items: RestaurantCartItem[]; savedAt: string }[]>([]);

  async function load() {
    const res = await storeApiFetch("/menu/with-recipes");
    if (res.ok) {
      const data = (await res.json()) as MenuItemWithRecipe[];
      setMenuItems(data.filter((i) => i.available));
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (fullscreenMode) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [fullscreenMode]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && fullscreenMode) {
        localStorage.setItem("storehub_pos_fullscreen", "false");
        setFullscreenMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [fullscreenMode]);

  function enterFullscreen() {
    localStorage.setItem("storehub_pos_fullscreen", "true");
    setFullscreenMode(true);
  }

  function exitFullscreen() {
    localStorage.setItem("storehub_pos_fullscreen", "false");
    setFullscreenMode(false);
  }

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(menuItems.map((i) => i.category).filter(Boolean) as string[]))],
    [menuItems],
  );

  const filtered = useMemo(
    () => activeCategory === "All" ? menuItems : menuItems.filter((i) => i.category === activeCategory),
    [menuItems, activeCategory],
  );
  const cartByMenuItemId = useMemo(
    () => new Map(cart.map((item) => [item.menuItemId, item])),
    [cart],
  );

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addToCart(item: MenuItemWithRecipe) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: parseFloat(item.price), quantity: 1, category: item.category }];
    });
  }

  function updateQty(menuItemId: string, qty: number) {
    if (qty <= 0) setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
    else setCart((prev) => prev.map((c) => c.menuItemId === menuItemId ? { ...c, quantity: qty } : c));
  }

  async function handleSendOrder() {
    if (cart.length === 0) return;
    setSending(true);
    try {
      const res = await storeApiFetch("/menu/sell", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
          paymentMethod,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { sale: { receiptNumber: string }; lowStockWarnings: LowStockWarning[] };
        setReceipt({
          receiptNumber: data.sale.receiptNumber,
          items: cart,
          total,
          lowStockWarnings: data.lowStockWarnings,
        });
        setCart([]);
      }
    } finally {
      setSending(false);
    }
  }

  const RestaurantFullscreenOverlay = () => (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#f5f4f1]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Restaurant POS</p>
          <h2 className="text-sm font-semibold text-stone-950">{profile?.storeName ?? "StoreHub"}</h2>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">
              <ShoppingCart size={14} />
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
          {heldCarts.length > 0 && (
            <button
              onClick={() => {
                const held = heldCarts[0];
                setCart(held.items);
                setHeldCarts(heldCarts.slice(1));
              }}
              className="flex items-center gap-1 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              <PauseCircle size={14} />
              {heldCarts.length}
            </button>
          )}
          <button onClick={exitFullscreen} className="rounded-2xl bg-stone-100 p-2 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-0 flex-col md:flex-row">
        <div className="flex flex-1 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-stone-200 bg-[#f5f4f1] p-4">
          {categories.length > 1 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeCategory === cat ? "bg-stone-950 text-white" : "bg-white text-stone-500 hover:bg-stone-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-stone-400">Loading menu…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-stone-400">No items available</div>
            ) : (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((item) => {
                  const inCart = cartByMenuItemId.get(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`rounded-2xl border p-3 text-left transition min-h-[110px] flex flex-col justify-between ${
                        inCart ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300 hover:bg-[#fcfbf8]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-xs font-semibold text-stone-900">{item.name}</div>
                        <div className="mt-0.5 text-xs text-stone-400">{item.category || "General"}</div>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-sm font-semibold text-stone-950">{formatCurrency(parseFloat(item.price), currencySymbol)}</div>
                        {inCart && <span className="rounded-full bg-stone-950 px-2 py-0.5 text-xs font-semibold text-white">{inCart.quantity}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full md:w-80 flex-col overflow-hidden bg-white">
          <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ShoppingCart size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-950">Order</h2>
              <p className="text-xs text-stone-500">{cart.length} item{cart.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="rounded-2xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Add items from the left</div>
            ) : (
              cart.map((item) => (
                <div key={item.menuItemId} className="rounded-2xl bg-stone-50 px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-1 font-semibold text-stone-900">{item.name}</div>
                      <div className="text-stone-500">{formatCurrency(item.price, currencySymbol)} ea</div>
                    </div>
                    <button onClick={() => updateQty(item.menuItemId, 0)} className="shrink-0 p-1.5 text-stone-400 transition hover:text-rose-600">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(item.menuItemId, Math.max(1, item.quantity - 1))} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-stone-600 transition hover:bg-stone-100">
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center font-semibold text-stone-900">{item.quantity}</span>
                      <button onClick={() => updateQty(item.menuItemId, item.quantity + 1)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-stone-600 transition hover:bg-stone-100">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-stone-950">{formatCurrency(item.price * item.quantity, currencySymbol)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-3 h-auto md:h-16">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Total</p>
          <div className="text-2xl font-semibold text-stone-950">{formatCurrency(total, currencySymbol)}</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (cart.length > 0) {
                setHeldCarts([...heldCarts, { id: crypto.randomUUID(), items: cart, savedAt: new Date().toISOString() }]);
                setCart([]);
              }
            }}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PauseCircle size={13} />
            Hold
          </button>

          <button
            onClick={() => void handleSendOrder()}
            disabled={cart.length === 0 || sending}
            className="flex items-center gap-1.5 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CreditCard size={13} />
            Send Order
          </button>
        </div>
      </div>
    </div>
  );

  if (fullscreenMode) return <RestaurantFullscreenOverlay />;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="glass-panel rounded-[36px] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Restaurant POS</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950">Take an order.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">
              Select menu items, confirm payment, and ingredients are deducted automatically.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <RestaurantHeroStat label="Items in order" value={String(cart.reduce((s, i) => s + i.quantity, 0))} />
              <RestaurantHeroStat label="Order total" value={formatCurrency(total, currencySymbol)} emphasize />
            </div>
            <button
              onClick={enterFullscreen}
              className="flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Maximize2 size={15} />
              Full Screen POS
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Menu panel */}
        <section className="soft-panel rounded-[32px] p-5">
          {categories.length > 1 && (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
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
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-stone-400">Loading menu…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-stone-400">
              {menuItems.length === 0 ? "No menu items yet. Add items in Menu." : "No items in this category."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => {
                const inCart = cartByMenuItemId.get(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      inCart ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300 hover:bg-[#fcfbf8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold text-stone-900">{item.name}</div>
                        <div className="mt-1 text-xs text-stone-400">{item.category ?? "General"}</div>
                      </div>
                      {inCart && <span className="rounded-full bg-stone-950 px-2.5 py-1 text-xs font-semibold text-white">{inCart.quantity}</span>}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div className="text-lg font-semibold tracking-[-0.03em] text-stone-950">{formatCurrency(parseFloat(item.price), currencySymbol)}</div>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">Tap to add</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Order panel */}
        <aside className="soft-panel flex h-fit flex-col rounded-[32px] p-5">
          <div className="flex items-center gap-3 border-b border-stone-200 pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-950">Order</h2>
              <p className="text-sm text-stone-500">{cart.length === 0 ? "No items yet." : `${cart.length} item${cart.length === 1 ? "" : "s"}`}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-[24px] bg-[#fbfaf7] px-4 py-8 text-center text-sm text-stone-500">Tap menu items to add to order.</div>
            ) : (
              cart.map((item) => (
                <div key={item.menuItemId} className="rounded-[24px] bg-[#fbfaf7] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-stone-900">{item.name}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatCurrency(item.price, currencySymbol)} each</div>
                    </div>
                    <button onClick={() => updateQty(item.menuItemId, 0)} className="rounded-2xl p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <RestaurantQtyButton onClick={() => updateQty(item.menuItemId, item.quantity - 1)} icon={<Minus size={14} />} />
                      <span className="min-w-[2rem] text-center text-sm font-semibold text-stone-900">{item.quantity}</span>
                      <RestaurantQtyButton onClick={() => updateQty(item.menuItemId, item.quantity + 1)} icon={<Plus size={14} />} />
                    </div>
                    <div className="text-sm font-semibold text-stone-950">{formatCurrency(item.price * item.quantity, currencySymbol)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-3 border-t border-stone-200 pt-5">
            <RestaurantLineItem label="Order Total" value={formatCurrency(total, currencySymbol)} strong />

            {/* Payment method */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Payment</label>
              <div className="flex gap-2">
                {["Cash", "Card", "Other"].map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`flex-1 rounded-2xl py-2.5 text-sm font-medium transition ${
                      paymentMethod === method
                        ? "bg-stone-950 text-white"
                        : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCart([])}
                disabled={cart.length === 0}
                className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={() => void handleSendOrder()}
                disabled={cart.length === 0 || sending}
                className="flex-[2] rounded-2xl bg-stone-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
              >
                {sending ? "Processing…" : "Send Order"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Receipt / success modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-white shadow-2xl">
            <div className="px-6 py-6">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
                <h2 className="mt-4 text-xl font-semibold text-stone-950">Order Complete</h2>
                <div className="mt-1 text-xs text-stone-400">#{receipt.receiptNumber}</div>
              </div>

              <div className="mt-5 rounded-[24px] border border-dashed border-stone-200 px-4 py-4 font-mono text-sm">
                <div className="text-center font-semibold text-stone-950">{profile?.storeName ?? "Restaurant"}</div>
                <div className="my-4 border-t border-dashed border-stone-200" />
                <div className="space-y-2">
                  {receipt.items.map((item) => (
                    <div key={item.menuItemId} className="flex justify-between gap-3 text-stone-700">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                    </div>
                  ))}
                </div>
                <div className="my-4 border-t border-dashed border-stone-200" />
                <RestaurantLineItem label="TOTAL" value={formatCurrency(receipt.total, currencySymbol)} strong />
              </div>

              {receipt.lowStockWarnings.length > 0 && (
                <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  <div className="font-semibold">Low stock warning:</div>
                  <div className="mt-1 space-y-1">
                    {receipt.lowStockWarnings.map((w) => (
                      <div key={w.id}>{w.name} — {parseFloat(w.stockQuantity).toFixed(3)} {w.unit} remaining</div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setReceipt(null)}
                className="mt-5 w-full rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RestaurantHeroStat({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className={`rounded-[24px] px-4 py-4 ${emphasize ? "bg-stone-950 text-white" : "bg-white/72 text-stone-900"}`}>
      <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${emphasize ? "text-white/50" : "text-stone-400"}`}>{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</div>
    </div>
  );
}

function RestaurantQtyButton({ onClick, icon }: { onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-stone-600 transition hover:bg-stone-100">
      {icon}
    </button>
  );
}

function RestaurantLineItem({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? "font-semibold text-stone-950" : "text-stone-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ─── Main export — branches on businessType ───────────────────────────────────

export default function POSPage() {
  const { profile } = useApp();
  const isRestaurant = profile?.businessType === "restaurant";
  if (isRestaurant) return <RestaurantPOS />;
  return <RetailPOSPage />;
}

function RetailPOSPage() {
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
  const [fullscreenMode, setFullscreenMode] = useState(
    () => localStorage.getItem("storehub_pos_fullscreen") === "true"
  );
  const [discount, setDiscount] = useState<{ type: "percent" | "amount"; value: number } | null>(null);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [heldCarts, setHeldCarts] = useState<{ id: string; items: CartItem[]; savedAt: string }[]>([]);
  const [discountInputValue, setDiscountInputValue] = useState("");

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

  useEffect(() => {
    if (fullscreenMode) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [fullscreenMode]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && fullscreenMode) {
        localStorage.setItem("storehub_pos_fullscreen", "false");
        setFullscreenMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [fullscreenMode]);

  function enterFullscreen() {
    localStorage.setItem("storehub_pos_fullscreen", "true");
    setFullscreenMode(true);
  }

  function exitFullscreen() {
    localStorage.setItem("storehub_pos_fullscreen", "false");
    setFullscreenMode(false);
  }

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
  const cartByProductId = useMemo(
    () => new Map(cart.map((item) => [item.productId, item])),
    [cart],
  );
  const taxRate = profile?.taxRate ?? 0;
  const discountAmount = discount
    ? discount.type === "percent"
      ? parseFloat(((subtotal * discount.value) / 100).toFixed(2))
      : Math.min(discount.value, subtotal)
    : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const tax = parseFloat(((discountedSubtotal * taxRate) / 100).toFixed(2));
  const total = discountedSubtotal + tax;
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

  const FullscreenPOSOverlay = () => (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#f5f4f1]">
      {/* Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Point of Sale</p>
            <h2 className="text-sm font-semibold text-stone-950">{profile?.storeName ?? "StoreHub"}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cart.length > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900">
              <ShoppingCart size={14} />
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
          {heldCarts.length > 0 && (
            <button
              onClick={() => {
                const held = heldCarts[0];
                setCart(held.items);
                setHeldCarts(heldCarts.slice(1));
              }}
              title={`${heldCarts.length} cart${heldCarts.length === 1 ? "" : "s"} on hold`}
              className="flex items-center gap-1 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              <PauseCircle size={14} />
              {heldCarts.length}
            </button>
          )}
          <button onClick={exitFullscreen} className="rounded-2xl bg-stone-100 p-2 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden gap-0 flex-col md:flex-row">
        {/* Product Panel */}
        <div className="flex flex-1 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-stone-200 bg-[#f5f4f1] p-4">
          <div className="flex flex-col gap-3 pb-3 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.pos.searchProducts}
                className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
              />
            </div>
            {categories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      activeCategory === cat ? "bg-stone-950 text-white" : "bg-white text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-stone-400">Loading products…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-stone-100 text-stone-500">
                  <Search size={20} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-stone-900">{products.length === 0 ? "No products" : "No matches"}</h2>
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((product) => {
                  const inCart = cartByProductId.get(product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`rounded-2xl border p-3 text-left transition min-h-[110px] flex flex-col justify-between ${
                        inCart ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:border-stone-300 hover:bg-[#fcfbf8]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-xs font-semibold text-stone-900">{product.name}</div>
                        <div className="mt-0.5 text-xs text-stone-400">{product.category || "General"}</div>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-sm font-semibold text-stone-950">{formatCurrency(product.price, currencySymbol)}</div>
                        {inCart && <span className="rounded-full bg-stone-950 px-2 py-0.5 text-xs font-semibold text-white">{inCart.quantity}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="flex w-full md:w-80 flex-col overflow-hidden bg-white">
          {/* Cart Header */}
          <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ShoppingCart size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-950">Cart</h2>
              <p className="text-xs text-stone-500">{cart.length} item{cart.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="rounded-2xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">Add items from the left</div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="rounded-2xl bg-stone-50 px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-1 font-semibold text-stone-900">{item.productName}</div>
                      <div className="text-stone-500">{formatCurrency(item.price, currencySymbol)} ea</div>
                    </div>
                    <button onClick={() => updateQty(item.productId, 0)} className="shrink-0 p-1.5 text-stone-400 transition hover:text-rose-600">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(item.productId, Math.max(1, item.quantity - 1))} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-stone-600 transition hover:bg-stone-100">
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center font-semibold text-stone-900">{item.quantity}</span>
                      <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-stone-600 transition hover:bg-stone-100">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-stone-950">{formatCurrency(item.price * item.quantity, currencySymbol)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-3 h-auto md:h-16">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Total</p>
          <div className="text-2xl font-semibold text-stone-950">{formatCurrency(total, currencySymbol)}</div>
        </div>

        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          {/* Discount Button */}
          <div className="relative">
            <button
              onClick={() => setShowDiscountInput(!showDiscountInput)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                discount ? "bg-amber-100 text-amber-900 hover:bg-amber-200" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
              }`}
            >
              <Tag size={13} />
              {discount ? `${discount.type === "percent" ? `${discount.value}%` : formatCurrency(discount.value, currencySymbol)}` : "Discount"}
            </button>
            {showDiscountInput && (
              <div className="absolute right-0 top-full mt-1 z-[101] bg-white border border-stone-200 rounded-lg shadow-lg p-3 w-48">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-600">Discount Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setDiscount({ type: "percent", value: 0 });
                        setDiscountInputValue("");
                      }}
                      className="flex-1 rounded px-2 py-1.5 text-xs font-medium transition bg-amber-100 text-amber-900"
                    >
                      %
                    </button>
                    <button
                      onClick={() => {
                        setDiscount({ type: "amount", value: 0 });
                        setDiscountInputValue("");
                      }}
                      className="flex-1 rounded px-2 py-1.5 text-xs font-medium transition bg-stone-100 text-stone-600 hover:bg-stone-200"
                    >
                      {currencySymbol}
                    </button>
                  </div>
                  <input
                    type="number"
                    value={discountInputValue}
                    onChange={(e) => setDiscountInputValue(e.target.value)}
                    placeholder="Amount"
                    className="w-full rounded px-2 py-2 text-xs border border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const val = parseFloat(discountInputValue);
                        if (val > 0 && discount) {
                          setDiscount({ ...discount, value: val });
                          setShowDiscountInput(false);
                        }
                      }}
                      className="flex-1 rounded bg-stone-950 text-white text-xs font-medium py-1.5 transition hover:bg-stone-800"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => {
                        setDiscount(null);
                        setDiscountInputValue("");
                        setShowDiscountInput(false);
                      }}
                      className="flex-1 rounded border border-stone-200 text-stone-600 text-xs font-medium py-1.5 transition hover:bg-stone-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hold Button */}
          <button
            onClick={() => {
              if (cart.length > 0) {
                setHeldCarts([...heldCarts, { id: crypto.randomUUID(), items: cart, savedAt: new Date().toISOString() }]);
                setCart([]);
              }
            }}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PauseCircle size={13} />
            Hold
          </button>

          {/* Void Last Button */}
          <button
            onClick={() => {
              if (cart.length > 0) {
                const last = cart[cart.length - 1];
                if (last.quantity > 1) {
                  updateQty(last.productId, last.quantity - 1);
                } else {
                  setCart(cart.slice(0, -1));
                }
              }
            }}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={13} />
            Void
          </button>

          {/* Open Payment Button */}
          <button
            onClick={() => setShowCheckout(true)}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CreditCard size={13} />
            Pay
          </button>
        </div>
      </div>
    </div>
  );

  if (fullscreenMode) return <FullscreenPOSOverlay />;

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
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <HeroStat label="Items in cart" value={String(cart.reduce((sum, item) => sum + item.quantity, 0))} />
              <HeroStat label="Subtotal" value={formatCurrency(subtotal, currencySymbol)} />
              <HeroStat label="Total due" value={formatCurrency(total, currencySymbol)} emphasize />
            </div>
            <button
              onClick={enterFullscreen}
              className="flex items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              <Maximize2 size={15} />
              Full Screen POS
            </button>
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
                  const inCart = cartByProductId.get(product.id);
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
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
                  {discount && <LineItem label={`Discount${discount.type === "percent" ? ` (${discount.value}%)` : ""}`} value={`-${formatCurrency(discountAmount, currencySymbol)}`} />}
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
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
