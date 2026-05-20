import type { Product } from "../schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethodType =
  | "tap_to_pay"        // NFC on phone via Stripe or Square SDK
  | "card_reader"       // Stripe/Square/Clover connected reader
  | "apple_pay"         // via Stripe Payment Request Button
  | "google_pay"        // via Stripe Payment Request Button
  | "qr_cashapp"        // QR code → user pays via CashApp
  | "qr_venmo"          // QR code → user pays via Venmo
  | "qr_paypal"         // QR code → user pays via PayPal
  | "qr_zelle"          // QR code → user pays via Zelle
  | "manual_card"       // Manual card number entry (Stripe card element)
  | "cash"              // Cash — no processing needed
  | "split"             // Two methods combined
  | "store_credit"      // Deducted from customer account
  | "loyalty_points";   // Converted at owner-set rate

export interface POSCartItem {
  productId?: string;
  productName: string;
  price: number;
  quantity: number;
  unit: string;
  itemDiscount?: { type: "percent" | "amount"; value: number };
  isCustom?: boolean;   // manually added item not in inventory
  loyaltyPoints?: number;
}

export interface POSCart {
  id: string;
  items: POSCartItem[];
  discount: { type: "percent" | "amount"; value: number } | null;
  couponCode?: string;
  couponDiscount?: number;
  splitBetween?: number;  // number of customers for bill split
  note?: string;
  heldAt?: string;
}

export interface POSTotals {
  subtotal: number;
  discountAmount: number;
  discountedSubtotal: number;
  tax: number;
  total: number;
}

export interface POSCoupon {
  code: string;
  discountType: "percent" | "amount";
  discountValue: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  minPurchase?: number;
}

// ─── Cart Management ───────────────────────────────────────────────────────────

export function createCart(id: string = crypto.randomUUID()): POSCart {
  return {
    id,
    items: [],
    discount: null,
  };
}

export function addItemToCart(cart: POSCart, product: Product, quantity: number = 1): POSCart {
  const existing = cart.items.find(
    i => (i.productId === product.id || i.productName === product.name) && !i.isCustom
  );

  if (existing) {
    existing.quantity += quantity;
    return { ...cart };
  }

  return {
    ...cart,
    items: [
      ...cart.items,
      {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity,
        unit: product.unit,
      },
    ],
  };
}

export function addCustomItemToCart(
  cart: POSCart,
  name: string,
  price: number,
  quantity: number = 1,
  unit: string = "pcs",
): POSCart {
  return {
    ...cart,
    items: [
      ...cart.items,
      {
        productName: name,
        price,
        quantity,
        unit,
        isCustom: true,
      },
    ],
  };
}

export function updateItemQuantity(
  cart: POSCart,
  productId: string | undefined,
  productName: string,
  quantity: number,
): POSCart {
  if (quantity <= 0) {
    return removeItemFromCart(cart, productId, productName);
  }

  return {
    ...cart,
    items: cart.items.map(item =>
      (productId && item.productId === productId) || item.productName === productName
        ? { ...item, quantity }
        : item,
    ),
  };
}

export function removeItemFromCart(
  cart: POSCart,
  productId: string | undefined,
  productName: string,
): POSCart {
  return {
    ...cart,
    items: cart.items.filter(
      item => !((productId && item.productId === productId) || item.productName === productName),
    ),
  };
}

export function clearCart(cart: POSCart): POSCart {
  return {
    ...cart,
    items: [],
    discount: null,
    couponCode: undefined,
    couponDiscount: undefined,
    splitBetween: undefined,
    note: undefined,
  };
}

// ─── Discount & Coupon Logic ──────────────────────────────────────────────────

export function applyDiscount(
  cart: POSCart,
  type: "percent" | "amount",
  value: number,
): POSCart {
  return {
    ...cart,
    discount: { type, value },
  };
}

export function removeDiscount(cart: POSCart): POSCart {
  return {
    ...cart,
    discount: null,
  };
}

export function applyCoupon(cart: POSCart, coupon: POSCoupon, subtotal: number): POSCart {
  if (coupon.minPurchase && subtotal < coupon.minPurchase) {
    return cart;
  }

  const discountAmount =
    coupon.discountType === "percent"
      ? (subtotal * coupon.discountValue) / 100
      : coupon.discountValue;

  return {
    ...cart,
    couponCode: coupon.code,
    couponDiscount: Math.min(discountAmount, subtotal),
  };
}

export function removeCoupon(cart: POSCart): POSCart {
  return {
    ...cart,
    couponCode: undefined,
    couponDiscount: undefined,
  };
}

// ─── Totals Calculation ───────────────────────────────────────────────────────

export function computeTotals(cart: POSCart, taxRate: number): POSTotals {
  let subtotal = 0;
  for (const item of cart.items) {
    subtotal += item.price * item.quantity;
  }

  // Apply discounts in order: item-level → cart-level discount → coupon
  let discountAmount = 0;
  for (const item of cart.items) {
    if (item.itemDiscount) {
      const itemTotal = item.price * item.quantity;
      if (item.itemDiscount.type === "percent") {
        discountAmount += (itemTotal * item.itemDiscount.value) / 100;
      } else {
        discountAmount += Math.min(item.itemDiscount.value, itemTotal);
      }
    }
  }

  let discountedSubtotal = subtotal - discountAmount;

  // Apply cart-level discount
  if (cart.discount) {
    const cartDiscountAmount =
      cart.discount.type === "percent"
        ? (discountedSubtotal * cart.discount.value) / 100
        : Math.min(cart.discount.value, discountedSubtotal);
    discountAmount += cartDiscountAmount;
    discountedSubtotal -= cartDiscountAmount;
  }

  // Apply coupon
  if (cart.couponDiscount) {
    discountAmount += cart.couponDiscount;
    discountedSubtotal -= cart.couponDiscount;
  }

  const tax = Math.max(0, discountedSubtotal * taxRate);
  const total = discountedSubtotal + tax;

  return {
    subtotal,
    discountAmount: Math.max(0, discountAmount),
    discountedSubtotal: Math.max(0, discountedSubtotal),
    tax,
    total,
  };
}

// ─── Split Bill Logic ──────────────────────────────────────────────────────────

export function splitBill(total: number, ways: number): number {
  if (ways <= 0) return total;
  return Math.round((total / ways) * 100) / 100;
}

// ─── Coupon Storage (localStorage) ────────────────────────────────────────────

export function getCoupons(): POSCoupon[] {
  const stored = localStorage.getItem("storehub_coupons");
  return stored ? JSON.parse(stored) : [];
}

export function saveCoupon(coupon: POSCoupon): void {
  const coupons = getCoupons();
  const index = coupons.findIndex(c => c.code === coupon.code);
  if (index >= 0) {
    coupons[index] = coupon;
  } else {
    coupons.push(coupon);
  }
  localStorage.setItem("storehub_coupons", JSON.stringify(coupons));
}

export function deleteCoupon(code: string): void {
  const coupons = getCoupons().filter(c => c.code !== code);
  localStorage.setItem("storehub_coupons", JSON.stringify(coupons));
}

export function findCoupon(code: string): POSCoupon | null {
  const coupons = getCoupons();
  return coupons.find(c => c.code.toLowerCase() === code.toLowerCase()) ?? null;
}

export function validateCoupon(code: string, subtotal: number): { valid: boolean; error?: string } {
  const coupon = findCoupon(code);
  if (!coupon) return { valid: false, error: "Coupon not found" };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, error: "Coupon has reached max uses" };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: "Coupon has expired" };
  }
  if (coupon.minPurchase && subtotal < coupon.minPurchase) {
    return { valid: false, error: `Minimum purchase of ${coupon.minPurchase} required` };
  }
  return { valid: true };
}

// ─── Hold/Resume Logic ────────────────────────────────────────────────────────

const ACTIVE_STORE_KEY = "sh_active_store_id";

function getScopedKey(key: string): string {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem(ACTIVE_STORE_KEY) : null;
  return activeStoreId ? `${key}_${activeStoreId}` : key;
}

export function getHeldCarts(): POSCart[] {
  const stored = localStorage.getItem(getScopedKey("storehub_held_carts"));
  return stored ? JSON.parse(stored) : [];
}

export function holdCart(cart: POSCart): void {
  const heldCarts = getHeldCarts();
  const index = heldCarts.findIndex(c => c.id === cart.id);
  const heldCart = { ...cart, heldAt: new Date().toISOString() };
  if (index >= 0) {
    heldCarts[index] = heldCart;
  } else {
    heldCarts.push(heldCart);
  }
  localStorage.setItem(getScopedKey("storehub_held_carts"), JSON.stringify(heldCarts));
}

export function resumeCart(cartId: string): POSCart | null {
  const heldCarts = getHeldCarts();
  const cart = heldCarts.find(c => c.id === cartId);
  if (!cart) return null;
  // Remove from held list (don't delete on resume — just show in UI)
  return { ...cart, heldAt: undefined };
}

export function deleteHeldCart(cartId: string): void {
  const heldCarts = getHeldCarts().filter(c => c.id !== cartId);
  localStorage.setItem(getScopedKey("storehub_held_carts"), JSON.stringify(heldCarts));
}
