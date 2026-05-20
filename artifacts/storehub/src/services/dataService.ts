/**
 * dataService.ts — Single data access layer for StoreHub.
 *
 * Primary storage: PostgreSQL via /api/storehub/* backend routes.
 * Fallback (reads): localStorage when API is unreachable.
 * On first load: automatically migrates any existing localStorage data to the DB.
 */

import type {
  UserProfile,
  Product,
  Sale,
  Expense,
  Supplier,
  Employee,
  Shift,
  InsertProduct,
  InsertSale,
  InsertExpense,
  InsertSupplier,
  InsertEmployee,
  InsertShift,
  DashboardSummary,
  BusinessType,
  RecurringExpense,
  InsertRecurringExpense,
  ScheduledPriceChange,
  InsertScheduledPriceChange,
  DailyPayRecord,
  InsertDailyPayRecord,
  PayrollReportEntry,
  CategorySetting,
  CashShift,
  InsertCashShift,
  Refund,
  InsertRefund,
  MonthCloseRecord,
} from "../schemas";
import { generateId, generateReceiptNumber, now, isToday, getDayName } from "../utils";

export type { Employee, InsertEmployee } from "../schemas";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

// ─── localStorage helpers (fallback + non-API types) ──────────────────────────

const ACTIVE_STORE_KEY = "sh_active_store_id";

const KEYS = {
  USER_PROFILE: "storehub_user_profile",
  PRODUCTS: "storehub_products",
  SALES: "storehub_sales",
  REFUNDS: "storehub_refunds",
  EXPENSES: "storehub_expenses",
  SUPPLIERS: "storehub_suppliers",
  EMPLOYEES: "storehub_employees",
  SHIFTS: "storehub_shifts",
  RECURRING_EXPENSES: "storehub_recurring_expenses",
  SCHEDULED_PRICES: "storehub_scheduled_prices",
  MONTH_CLOSE_RECORDS: "storehub_month_close_records",
};

const STORE_SCOPED_KEYS = new Set(Object.values(KEYS));

function getScopedKey(key: string): string {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem(ACTIVE_STORE_KEY) : null;
  if (!activeStoreId || !STORE_SCOPED_KEYS.has(key)) return key;
  return `${key}_${activeStoreId}`;
}

function getItem<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(getScopedKey(key));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function setItem<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(getScopedKey(key), JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

function getSingle<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(getScopedKey(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setSingle<T>(key: string, data: T): void {
  localStorage.setItem(getScopedKey(key), JSON.stringify(data));
}

function removeScopedItem(key: string): void {
  localStorage.removeItem(getScopedKey(key));
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem("sh_active_store_id") : null;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(activeStoreId ? { "X-Store-User-Id": activeStoreId } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[API] ${opts?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function apiGet<T>(path: string) {
  return api<T[]>(`${path}?limit=200`);
}

function apiPost<T>(path: string, body: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

function apiPatch<T>(path: string, body: unknown) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

function apiDelete(path: string) {
  return api<{ ok: boolean }>(path, { method: "DELETE" });
}

// ─── One-time localStorage → DB migration ────────────────────────────────────

const MIGRATED_FLAG = "sh_ls_migrated_v3";
let migrationRan = false;

async function ensureMigrated(): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;
  if (localStorage.getItem(MIGRATED_FLAG)) return;

  // In cloud/store-view mode the server is the source of truth; pullAll handles
  // the server→local cache. Never push localStorage back to the server here —
  // it would duplicate records that pullAll just wrote to localStorage.
  const isStoreView = !!sessionStorage.getItem(ACTIVE_STORE_KEY);
  const cloudMode = localStorage.getItem("storehub_storage_mode") === "cloud";
  if (isStoreView || cloudMode) {
    localStorage.setItem(MIGRATED_FLAG, "1");
    return;
  }

  // Gather all localStorage collections
  const lsProducts   = getItem<Product>(KEYS.PRODUCTS);
  const lsSales      = getItem<Sale>(KEYS.SALES);
  const lsExpenses   = getItem<Expense>(KEYS.EXPENSES);
  const lsSuppliers  = getItem<Supplier>(KEYS.SUPPLIERS);
  const lsEmployees  = getItem<Employee>(KEYS.EMPLOYEES);
  const lsShifts     = getItem<Shift>(KEYS.SHIFTS);
  const lsRecurring  = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  const lsScheduled  = getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
  const lsDailyPay   = getItem<DailyPayRecord>("storehub_daily_pay_records");
  const lsProfile    = getSingle<UserProfile>(KEYS.USER_PROFILE);

  const hasData =
    lsProducts.length > 0 || lsSales.length > 0 || lsExpenses.length > 0 ||
    lsSuppliers.length > 0 || lsEmployees.length > 0;

  if (!hasData) {
    localStorage.setItem(MIGRATED_FLAG, "1");
    return;
  }

  try {
    await apiPost("/api/storehub/migrate", {
      ...(lsProfile ? { profile: lsProfile } : {}),
      products:              lsProducts,
      sales:                 lsSales,
      expenses:              lsExpenses,
      suppliers:             lsSuppliers,
      employees:             lsEmployees,
      shifts:                lsShifts,
      recurringExpenses:     lsRecurring,
      scheduledPriceChanges: lsScheduled,
    });
    // Daily pay records via individual POSTs (no bulk migrate endpoint)
    for (const r of lsDailyPay) {
      await apiPost("/api/storehub/daily-pay-records", r).catch(() => {});
    }
    localStorage.setItem(MIGRATED_FLAG, "1");
    console.info(`[dataService] Migrated ${lsProducts.length} products, ${lsSales.length} sales, ${lsExpenses.length} expenses to cloud DB`);
  } catch (e) {
    console.warn("[dataService] Migration to cloud failed, will retry next session:", e);
    migrationRan = false; // allow retry
  }
}

// ─── User Profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile | null> {
  const local = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (local) return local;

  // localStorage is empty — try to restore from the backend storeProfiles table
  try {
    const remote = await api<UserProfile | null>("/api/storehub/profile");
    if (remote && remote.storeName) {
      // Re-hydrate localStorage so subsequent reads are fast
      setSingle(KEYS.USER_PROFILE, remote);
      return remote;
    }
  } catch {
    // Not authenticated or network issue — return null gracefully
  }
  return null;
}

export async function saveUserProfile(profile: UserProfile): Promise<UserProfile> {
  await Promise.resolve();
  setSingle(KEYS.USER_PROFILE, profile);
  return profile;
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
  const current = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (!current) return null;
  const updated = { ...current, ...updates };
  setSingle(KEYS.USER_PROFILE, updated);
  // Persist to server so portal and other endpoints see the latest values.
  try {
    await fetch(`${API_BASE_URL}/api/storehub/profile`, {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  } catch {
    // Non-fatal — localStorage already updated, server will sync on next migration.
  }
  return updated;
}

export async function trackFeatureUsage(feature: string): Promise<void> {
  await Promise.resolve();
  const current = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (!current) return;
  const counts = current.featureUsageCount ?? {};
  counts[feature] = (counts[feature] ?? 0) + 1;
  setSingle(KEYS.USER_PROFILE, { ...current, featureUsageCount: counts });
}

export async function clearAllData(): Promise<void> {
  await Promise.resolve();
  Object.values(KEYS).forEach((k) => removeScopedItem(k));
}

// ─── Products / Inventory ──────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  await ensureMigrated();
  try {
    return await apiGet<Product>("/api/storehub/products");
  } catch (e) {
    console.warn("[dataService] getProducts API failed, using localStorage fallback:", e);
    return getItem<Product>(KEYS.PRODUCTS);
  }
}

export async function getProduct(id: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((p) => p.id === id) ?? null;
}

export async function createProduct(data: InsertProduct): Promise<Product> {
  await ensureMigrated();
  try {
    const product = await apiPost<Product>("/api/storehub/products", data);
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return product;
  } catch (e) {
    console.warn("[dataService] createProduct API failed, saving locally:", e);
    const product: Product = { ...data, id: generateId(), createdAt: now(), updatedAt: now() };
    const products = getItem<Product>(KEYS.PRODUCTS);
    setItem(KEYS.PRODUCTS, [...products, product]);
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return product;
  }
}

export async function updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | null> {
  await ensureMigrated();
  try {
    const product = await apiPatch<Product>(`/api/storehub/products/${id}`, data);
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return product;
  } catch (e) {
    console.warn("[dataService] updateProduct API failed, updating locally:", e);
    const products = getItem<Product>(KEYS.PRODUCTS);
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) throw e; // product isn't in localStorage either — propagate so callers can show an error
    const updated = { ...products[idx], ...data, updatedAt: now() };
    products[idx] = updated;
    setItem(KEYS.PRODUCTS, products);
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return updated;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/products/${id}`);
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return true;
  } catch (e) {
    console.warn("[dataService] deleteProduct API failed, deleting locally:", e);
    const products = getItem<Product>(KEYS.PRODUCTS);
    setItem(KEYS.PRODUCTS, products.filter((p) => p.id !== id));
    window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    return true;
  }
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getProducts();
  return products.filter((p) => p.quantity <= p.lowStockThreshold);
}

// ─── Pre-seeding ────────────────────────────────────────────────────────────────

export async function bulkCreateProducts(items: InsertProduct[]): Promise<Product[]> {
  await ensureMigrated();
  const created: Product[] = [];
  for (const data of items) {
    created.push(await createProduct(data));
  }
  return created;
}

export async function bulkCreateEmployees(items: InsertEmployee[]): Promise<Employee[]> {
  await ensureMigrated();
  const created: Employee[] = [];
  for (const data of items) {
    created.push(await createEmployee(data));
  }
  return created;
}

export function getSeedProducts(businessType: BusinessType, currencyMultiplier = 1): InsertProduct[] {
  const seeds: Record<BusinessType, InsertProduct[]> = {
    grocery: [
      { name: "Whole Milk (1 gal)", sku: "MLK001", category: "Dairy", price: 3.99 * currencyMultiplier, quantity: 24, lowStockThreshold: 6, supplierId: null, unit: "gallon", tags: ["dairy", "staple"] },
      { name: "Bread (White Loaf)", sku: "BRD001", category: "Bakery", price: 2.49 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "loaf", tags: ["bread", "staple"] },
      { name: "Large Eggs (12pk)", sku: "EGG001", category: "Dairy", price: 4.29 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "dozen", tags: ["eggs", "staple"] },
      { name: "Jasmine Rice (5lb)", sku: "RIC001", category: "Grains", price: 6.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "bag", tags: ["grain", "staple"] },
      { name: "Black Beans (can)", sku: "BNS001", category: "Canned Goods", price: 1.29 * currencyMultiplier, quantity: 48, lowStockThreshold: 12, supplierId: null, unit: "can", tags: ["beans", "canned"] },
      { name: "Vegetable Oil (1L)", sku: "OIL001", category: "Oils", price: 3.49 * currencyMultiplier, quantity: 18, lowStockThreshold: 5, supplierId: null, unit: "bottle", tags: ["oil"] },
      { name: "Sugar (4lb)", sku: "SUG001", category: "Baking", price: 2.99 * currencyMultiplier, quantity: 22, lowStockThreshold: 6, supplierId: null, unit: "bag", tags: ["baking"] },
      { name: "Chicken Breast (lb)", sku: "CHK001", category: "Meat", price: 4.99 * currencyMultiplier, quantity: 12, lowStockThreshold: 4, supplierId: null, unit: "lb", tags: ["meat", "protein"] },
      { name: "Tomatoes (lb)", sku: "TOM001", category: "Produce", price: 1.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 6, supplierId: null, unit: "lb", tags: ["produce"] },
      { name: "Bananas (bunch)", sku: "BAN001", category: "Produce", price: 1.29 * currencyMultiplier, quantity: 25, lowStockThreshold: 8, supplierId: null, unit: "bunch", tags: ["fruit", "produce"] },
    ],
    butcher: [
      { name: "Ground Beef (lb)", sku: "GBF001", category: "Beef", price: 5.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "lb", tags: ["beef"] },
      { name: "Ribeye Steak (lb)", sku: "RBY001", category: "Beef", price: 14.99 * currencyMultiplier, quantity: 10, lowStockThreshold: 3, supplierId: null, unit: "lb", tags: ["beef", "premium"] },
      { name: "Chicken Thighs (lb)", sku: "CTH001", category: "Poultry", price: 3.49 * currencyMultiplier, quantity: 25, lowStockThreshold: 6, supplierId: null, unit: "lb", tags: ["chicken"] },
      { name: "Pork Chops (lb)", sku: "PKC001", category: "Pork", price: 4.49 * currencyMultiplier, quantity: 18, lowStockThreshold: 5, supplierId: null, unit: "lb", tags: ["pork"] },
      { name: "Lamb Chops (lb)", sku: "LMB001", category: "Lamb", price: 11.99 * currencyMultiplier, quantity: 8, lowStockThreshold: 2, supplierId: null, unit: "lb", tags: ["lamb", "premium"] },
      { name: "Italian Sausage (lb)", sku: "SAS001", category: "Sausage", price: 5.49 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "lb", tags: ["sausage"] },
      { name: "Bacon (lb)", sku: "BCN001", category: "Pork", price: 6.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "lb", tags: ["pork", "breakfast"] },
      { name: "Whole Chicken", sku: "WCH001", category: "Poultry", price: 8.99 * currencyMultiplier, quantity: 12, lowStockThreshold: 3, supplierId: null, unit: "each", tags: ["chicken"] },
    ],
    bakery: [
      { name: "Croissant", sku: "CRS001", category: "Pastries", price: 2.99 * currencyMultiplier, quantity: 24, lowStockThreshold: 6, supplierId: null, unit: "each", tags: ["pastry", "breakfast"] },
      { name: "Sourdough Loaf", sku: "SDG001", category: "Bread", price: 7.99 * currencyMultiplier, quantity: 10, lowStockThreshold: 3, supplierId: null, unit: "loaf", tags: ["bread"] },
      { name: "Blueberry Muffin", sku: "MUF001", category: "Muffins", price: 2.49 * currencyMultiplier, quantity: 20, lowStockThreshold: 6, supplierId: null, unit: "each", tags: ["muffin", "breakfast"] },
      { name: "Chocolate Cake (slice)", sku: "CKS001", category: "Cakes", price: 4.99 * currencyMultiplier, quantity: 12, lowStockThreshold: 3, supplierId: null, unit: "slice", tags: ["cake", "dessert"] },
      { name: "Baguette", sku: "BGT001", category: "Bread", price: 3.49 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "each", tags: ["bread", "french"] },
      { name: "Cinnamon Roll", sku: "CNR001", category: "Pastries", price: 3.99 * currencyMultiplier, quantity: 18, lowStockThreshold: 5, supplierId: null, unit: "each", tags: ["pastry", "sweet"] },
      { name: "Banana Bread Loaf", sku: "BNB001", category: "Bread", price: 6.99 * currencyMultiplier, quantity: 8, lowStockThreshold: 2, supplierId: null, unit: "loaf", tags: ["bread", "sweet"] },
      { name: "Chocolate Chip Cookie", sku: "CCK001", category: "Cookies", price: 1.49 * currencyMultiplier, quantity: 48, lowStockThreshold: 12, supplierId: null, unit: "each", tags: ["cookie", "dessert"] },
    ],
    clothing: [
      { name: "Classic T-Shirt (M)", sku: "TSH001", category: "Tops", price: 19.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "each", tags: ["shirt", "casual"] },
      { name: "Slim Jeans (32x30)", sku: "JNS001", category: "Bottoms", price: 49.99 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "each", tags: ["jeans", "denim"] },
      { name: "Summer Dress (S)", sku: "DRS001", category: "Dresses", price: 34.99 * currencyMultiplier, quantity: 12, lowStockThreshold: 3, supplierId: null, unit: "each", tags: ["dress", "summer"] },
      { name: "Hoodie (L)", sku: "HDY001", category: "Tops", price: 39.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "each", tags: ["hoodie", "winter"] },
      { name: "Sneakers (Size 10)", sku: "SNK001", category: "Shoes", price: 59.99 * currencyMultiplier, quantity: 10, lowStockThreshold: 3, supplierId: null, unit: "pair", tags: ["shoes", "casual"] },
      { name: "Baseball Cap", sku: "CAP001", category: "Accessories", price: 14.99 * currencyMultiplier, quantity: 25, lowStockThreshold: 6, supplierId: null, unit: "each", tags: ["hat", "accessory"] },
      { name: "Polo Shirt (M)", sku: "PLO001", category: "Tops", price: 29.99 * currencyMultiplier, quantity: 18, lowStockThreshold: 5, supplierId: null, unit: "each", tags: ["polo", "smart casual"] },
    ],
    restaurant: [
      { name: "Burger (Classic)", sku: "BRG001", category: "Mains", price: 9.99 * currencyMultiplier, quantity: 50, lowStockThreshold: 10, supplierId: null, unit: "serving", tags: ["burger", "main"] },
      { name: "Caesar Salad", sku: "SAL001", category: "Salads", price: 8.49 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "serving", tags: ["salad", "starter"] },
      { name: "French Fries", sku: "FRI001", category: "Sides", price: 3.99 * currencyMultiplier, quantity: 60, lowStockThreshold: 15, supplierId: null, unit: "serving", tags: ["fries", "side"] },
      { name: "Soda (Medium)", sku: "SOD001", category: "Drinks", price: 2.99 * currencyMultiplier, quantity: 80, lowStockThreshold: 20, supplierId: null, unit: "cup", tags: ["drink", "soda"] },
      { name: "Grilled Chicken Plate", sku: "GCP001", category: "Mains", price: 12.99 * currencyMultiplier, quantity: 40, lowStockThreshold: 10, supplierId: null, unit: "serving", tags: ["chicken", "main"] },
      { name: "Chocolate Brownie", sku: "BRN001", category: "Desserts", price: 4.99 * currencyMultiplier, quantity: 24, lowStockThreshold: 6, supplierId: null, unit: "each", tags: ["dessert"] },
    ],
    pharmacy: [
      { name: "Ibuprofen 200mg (24ct)", sku: "IBP001", category: "Pain Relief", price: 6.99 * currencyMultiplier, quantity: 40, lowStockThreshold: 10, supplierId: null, unit: "box", tags: ["pain", "otc"] },
      { name: "Vitamin C 500mg (60ct)", sku: "VTC001", category: "Vitamins", price: 9.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "bottle", tags: ["vitamin", "supplement"] },
      { name: "Bandages (Assorted)", sku: "BND001", category: "First Aid", price: 4.49 * currencyMultiplier, quantity: 50, lowStockThreshold: 12, supplierId: null, unit: "box", tags: ["first aid"] },
      { name: "Cold & Flu Syrup", sku: "CFS001", category: "Cold & Flu", price: 8.99 * currencyMultiplier, quantity: 25, lowStockThreshold: 6, supplierId: null, unit: "bottle", tags: ["cold", "flu", "otc"] },
      { name: "Hand Sanitizer (8oz)", sku: "HNS001", category: "Hygiene", price: 3.99 * currencyMultiplier, quantity: 60, lowStockThreshold: 15, supplierId: null, unit: "bottle", tags: ["hygiene", "sanitizer"] },
      { name: "Blood Pressure Monitor", sku: "BPM001", category: "Devices", price: 49.99 * currencyMultiplier, quantity: 8, lowStockThreshold: 2, supplierId: null, unit: "each", tags: ["device", "health"] },
    ],
    general: [
      { name: "AA Batteries (8pk)", sku: "BAT001", category: "Electronics", price: 5.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "pack", tags: ["electronics"] },
      { name: "Dish Soap (32oz)", sku: "DSH001", category: "Cleaning", price: 3.49 * currencyMultiplier, quantity: 24, lowStockThreshold: 6, supplierId: null, unit: "bottle", tags: ["cleaning"] },
      { name: "Paper Towels (2-roll)", sku: "PTW001", category: "Paper Goods", price: 4.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "pack", tags: ["paper"] },
      { name: "Notebook (ruled)", sku: "NTB001", category: "Stationery", price: 2.99 * currencyMultiplier, quantity: 35, lowStockThreshold: 10, supplierId: null, unit: "each", tags: ["stationery"] },
      { name: "Phone Charger Cable", sku: "CHG001", category: "Electronics", price: 9.99 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "each", tags: ["electronics", "phone"] },
      { name: "Laundry Detergent", sku: "LND001", category: "Cleaning", price: 11.99 * currencyMultiplier, quantity: 18, lowStockThreshold: 5, supplierId: null, unit: "bottle", tags: ["cleaning", "laundry"] },
    ],
    cstore: [
      { name: "Marlboro Red (pk)", sku: "CIG001", category: "Tobacco", price: 9.99 * currencyMultiplier, quantity: 60, lowStockThreshold: 15, supplierId: null, unit: "pack", tags: ["tobacco"] },
      { name: "Bud Light (6pk)", sku: "BUD001", category: "Beer", price: 8.99 * currencyMultiplier, quantity: 40, lowStockThreshold: 10, supplierId: null, unit: "6pk", tags: ["beer"] },
      { name: "Lay's Classic Chips", sku: "LAY001", category: "Snacks", price: 2.99 * currencyMultiplier, quantity: 50, lowStockThreshold: 12, supplierId: null, unit: "bag", tags: ["snacks"] },
      { name: "Red Bull (8.4oz)", sku: "RBL001", category: "Energy Drinks", price: 3.49 * currencyMultiplier, quantity: 48, lowStockThreshold: 12, supplierId: null, unit: "can", tags: ["energy drink"] },
      { name: "Lottery Ticket", sku: "LOT001", category: "Lottery", price: 2.00 * currencyMultiplier, quantity: 100, lowStockThreshold: 20, supplierId: null, unit: "each", tags: ["lottery"] },
      { name: "Regular Fuel (gal)", sku: "GAS001", category: "Fuel", price: 3.49 * currencyMultiplier, quantity: 500, lowStockThreshold: 100, supplierId: null, unit: "gallon", tags: ["fuel"] },
    ],
    liquor: [
      { name: "Budweiser (6pk)", sku: "BDW001", category: "Beer", price: 9.99 * currencyMultiplier, quantity: 48, lowStockThreshold: 12, supplierId: null, unit: "6pk", tags: ["beer"] },
      { name: "Jack Daniel's (750ml)", sku: "JDN001", category: "Whiskey", price: 29.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "bottle", tags: ["whiskey", "spirits"] },
      { name: "Smirnoff Vodka (750ml)", sku: "SMV001", category: "Vodka", price: 18.99 * currencyMultiplier, quantity: 24, lowStockThreshold: 6, supplierId: null, unit: "bottle", tags: ["vodka", "spirits"] },
      { name: "Cabernet Sauvignon (750ml)", sku: "CAB001", category: "Wine", price: 14.99 * currencyMultiplier, quantity: 18, lowStockThreshold: 4, supplierId: null, unit: "bottle", tags: ["wine"] },
      { name: "Corona Extra (12pk)", sku: "COR001", category: "Beer", price: 16.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "12pk", tags: ["beer", "import"] },
      { name: "Coke (2L)", sku: "COK001", category: "Mixers", price: 2.99 * currencyMultiplier, quantity: 36, lowStockThreshold: 10, supplierId: null, unit: "bottle", tags: ["mixer", "soda"] },
    ],
    other: [
      { name: "Product 1", sku: "PRD001", category: "General", price: 9.99 * currencyMultiplier, quantity: 20, lowStockThreshold: 5, supplierId: null, unit: "each", tags: [] },
      { name: "Product 2", sku: "PRD002", category: "General", price: 14.99 * currencyMultiplier, quantity: 15, lowStockThreshold: 4, supplierId: null, unit: "each", tags: [] },
      { name: "Product 3", sku: "PRD003", category: "General", price: 4.99 * currencyMultiplier, quantity: 30, lowStockThreshold: 8, supplierId: null, unit: "each", tags: [] },
    ],
  };
  return seeds[businessType] ?? seeds.other;
}

// ─── Sales ─────────────────────────────────────────────────────────────────────

export async function getSales(): Promise<Sale[]> {
  await ensureMigrated();
  try {
    const rows = await apiGet<Sale>("/api/storehub/sales");
    // API returns newest first (orderBy createdAt desc) — keep that order
    return rows;
  } catch (e) {
    console.warn("[dataService] getSales API failed, using localStorage fallback:", e);
    return getItem<Sale>(KEYS.SALES).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function getSale(id: string): Promise<Sale | null> {
  const sales = await getSales();
  return sales.find((s) => s.id === id) ?? null;
}

export async function createSale(data: InsertSale): Promise<Sale> {
  await ensureMigrated();
  let sale: Sale;

  try {
    sale = await apiPost<Sale>("/api/storehub/sales", {
      items:         data.items,
      subtotal:      data.subtotal,
      tax:           data.tax,
      total:         data.total,
      amountPaid:    data.amountPaid,
      change:        data.change,
      receiptNumber: data.receiptNumber ?? generateReceiptNumber(),
      note:          data.note,
      customerId:    data.customerId,
      customerPhone: data.customerPhone,
      paymentMethod: data.paymentMethod,
      loyaltyPointsUsed: data.loyaltyPointsUsed,
    });
  } catch (e) {
    console.warn("[dataService] createSale API failed, saving locally:", e);
    sale = {
      ...data,
      id: generateId(),
      receiptNumber: data.receiptNumber ?? generateReceiptNumber(),
      createdAt: now(),
    };
    // Emergency local persist so the receipt is never lost
    const existing = getItem<Sale>(KEYS.SALES);
    if (!existing.some((s) => s.id === sale.id)) {
      setItem(KEYS.SALES, [...existing, sale]);
    }
  }

  // Deduct product quantities via API (best-effort)
  for (const item of data.items) {
    try {
      const product = await getProduct(item.productId);
      if (product) {
        await updateProduct(item.productId, {
          quantity: Math.max(0, product.quantity - item.quantity),
        });
      }
    } catch {
      // Non-fatal: quantity deduction failure shouldn't break the sale
    }
  }

  return sale;
}

export async function getTodaySales(): Promise<Sale[]> {
  const sales = await getSales();
  return sales.filter((s) => isToday(s.createdAt));
}

// ─── Expenses ──────────────────────────────────────────────────────────────────

export async function getExpenses(): Promise<Expense[]> {
  await ensureMigrated();
  try {
    return await apiGet<Expense>("/api/storehub/expenses");
  } catch (e) {
    console.warn("[dataService] getExpenses API failed, using localStorage fallback:", e);
    return getItem<Expense>(KEYS.EXPENSES).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
}

export async function createExpense(data: InsertExpense): Promise<Expense> {
  await ensureMigrated();
  try {
    return await apiPost<Expense>("/api/storehub/expenses", data);
  } catch (e) {
    console.warn("[dataService] createExpense API failed, saving locally:", e);
    const expense: Expense = { ...data, id: generateId(), createdAt: now() };
    setItem(KEYS.EXPENSES, [...getItem<Expense>(KEYS.EXPENSES), expense]);
    return expense;
  }
}

export async function updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | null> {
  await ensureMigrated();
  try {
    return await apiPatch<Expense>(`/api/storehub/expenses/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateExpense API failed, updating locally:", e);
    const expenses = getItem<Expense>(KEYS.EXPENSES);
    const idx = expenses.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated = { ...expenses[idx], ...data };
    expenses[idx] = updated;
    setItem(KEYS.EXPENSES, expenses);
    return updated;
  }
}

export async function deleteExpense(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/expenses/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteExpense API failed, deleting locally:", e);
    setItem(KEYS.EXPENSES, getItem<Expense>(KEYS.EXPENSES).filter((e) => e.id !== id));
    return true;
  }
}

export async function getTodayExpenses(): Promise<Expense[]> {
  const expenses = await getExpenses();
  return expenses.filter((e) => isToday(e.date));
}

// ─── Suppliers ─────────────────────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  await ensureMigrated();
  try {
    return await apiGet<Supplier>("/api/storehub/suppliers");
  } catch (e) {
    console.warn("[dataService] getSuppliers API failed, using localStorage fallback:", e);
    return getItem<Supplier>(KEYS.SUPPLIERS);
  }
}

export async function createSupplier(data: InsertSupplier): Promise<Supplier> {
  await ensureMigrated();
  try {
    return await apiPost<Supplier>("/api/storehub/suppliers", data);
  } catch (e) {
    console.warn("[dataService] createSupplier API failed, saving locally:", e);
    const supplier: Supplier = { ...data, id: generateId(), createdAt: now() };
    setItem(KEYS.SUPPLIERS, [...getItem<Supplier>(KEYS.SUPPLIERS), supplier]);
    return supplier;
  }
}

export async function updateSupplier(id: string, data: Partial<InsertSupplier>): Promise<Supplier | null> {
  await ensureMigrated();
  try {
    return await apiPatch<Supplier>(`/api/storehub/suppliers/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateSupplier API failed, updating locally:", e);
    const suppliers = getItem<Supplier>(KEYS.SUPPLIERS);
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated = { ...suppliers[idx], ...data };
    suppliers[idx] = updated;
    setItem(KEYS.SUPPLIERS, suppliers);
    return updated;
  }
}

export async function deleteSupplier(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/suppliers/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteSupplier API failed, deleting locally:", e);
    setItem(KEYS.SUPPLIERS, getItem<Supplier>(KEYS.SUPPLIERS).filter((s) => s.id !== id));
    return true;
  }
}

// ─── Employees ─────────────────────────────────────────────────────────────────

export async function getEmployees(): Promise<Employee[]> {
  await ensureMigrated();
  try {
    return await apiGet<Employee>("/api/storehub/employees");
  } catch (e) {
    console.warn("[dataService] getEmployees API failed, using localStorage fallback:", e);
    return getItem<Employee>(KEYS.EMPLOYEES);
  }
}

export async function createEmployee(data: InsertEmployee): Promise<Employee> {
  await ensureMigrated();
  try {
    return await apiPost<Employee>("/api/storehub/employees", data);
  } catch (e) {
    console.error("[dataService] createEmployee API failed:", (e as Error).message);
    // Save locally so the next load can retry the sync.
    const employee: Employee = { ...data, id: generateId(), createdAt: now() };
    setItem(KEYS.EMPLOYEES, [...getItem<Employee>(KEYS.EMPLOYEES), employee]);
    // Re-throw so the UI can show an error toast.
    throw e;
  }
}

export async function updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | null> {
  await ensureMigrated();
  try {
    return await apiPatch<Employee>(`/api/storehub/employees/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateEmployee API failed, updating locally:", e);
    const employees = getItem<Employee>(KEYS.EMPLOYEES);
    const idx = employees.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated = { ...employees[idx], ...data };
    employees[idx] = updated;
    setItem(KEYS.EMPLOYEES, employees);
    return updated;
  }
}

export async function deleteEmployee(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/employees/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteEmployee API failed, deleting locally:", e);
    setItem(KEYS.EMPLOYEES, getItem<Employee>(KEYS.EMPLOYEES).filter((e) => e.id !== id));
    return true;
  }
}

// ─── Shifts ────────────────────────────────────────────────────────────────────

export async function getShifts(): Promise<Shift[]> {
  await ensureMigrated();
  try {
    const apiShifts = await apiGet<Shift>("/api/storehub/shifts");
    // Merge any locally-saved shifts that haven't synced to DB yet (e.g. from a failed clock-in POST)
    const localShifts = getItem<Shift>(KEYS.SHIFTS);
    const apiIds = new Set(apiShifts.map((s) => s.id));
    const pendingLocal = localShifts.filter((s) => !apiIds.has(s.id));
    return [...apiShifts, ...pendingLocal].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (e) {
    console.warn("[dataService] getShifts API failed, using localStorage fallback:", e);
    return getItem<Shift>(KEYS.SHIFTS).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function getActiveShift(employeeId: string): Promise<Shift | null> {
  const shifts = await getShifts();
  return shifts.find((s) => s.employeeId === employeeId && s.shiftEnd === null) ?? null;
}

export async function clockIn(employeeId: string, employeeName: string): Promise<Shift> {
  const shiftData: InsertShift = {
    employeeId,
    employeeName,
    shiftStart: now(),
    shiftEnd: null,
    hoursWorked: null,
  };
  await ensureMigrated();
  try {
    return await apiPost<Shift>("/api/storehub/shifts", shiftData);
  } catch (e) {
    console.warn("[dataService] clockIn API failed, saving locally:", e);
    const shift: Shift = { ...shiftData, id: generateId(), createdAt: now() };
    setItem(KEYS.SHIFTS, [...getItem<Shift>(KEYS.SHIFTS), shift]);
    return shift;
  }
}

export async function clockOut(shift: Shift): Promise<Shift | null> {
  const endTime = now();
  const start = new Date(shift.shiftStart).getTime();
  const end = new Date(endTime).getTime();
  const hoursWorked = Math.round(((end - start) / 3600000) * 100) / 100;

  try {
    return await apiPatch<Shift>(`/api/storehub/shifts/${shift.id}`, { shiftEnd: endTime, hoursWorked });
  } catch (e) {
    console.warn("[dataService] clockOut API failed, saving locally:", e);
    const updated = { ...shift, shiftEnd: endTime, hoursWorked };
    const localShifts = getItem<Shift>(KEYS.SHIFTS);
    const idx = localShifts.findIndex((s) => s.id === shift.id);
    if (idx === -1) {
      setItem(KEYS.SHIFTS, [...localShifts, updated]);
    } else {
      localShifts[idx] = updated;
      setItem(KEYS.SHIFTS, localShifts);
    }
    return updated;
  }
}

export async function createShift(data: InsertShift): Promise<Shift> {
  await ensureMigrated();
  try {
    return await apiPost<Shift>("/api/storehub/shifts", data);
  } catch (e) {
    console.warn("[dataService] createShift API failed, saving locally:", e);
    const shift: Shift = { ...data, id: generateId(), createdAt: now() };
    setItem(KEYS.SHIFTS, [...getItem<Shift>(KEYS.SHIFTS), shift]);
    return shift;
  }
}

export async function updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | null> {
  await ensureMigrated();
  try {
    return await apiPatch<Shift>(`/api/storehub/shifts/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateShift API failed, updating locally:", e);
    const shifts = getItem<Shift>(KEYS.SHIFTS);
    const idx = shifts.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated = { ...shifts[idx], ...data };
    shifts[idx] = updated;
    setItem(KEYS.SHIFTS, shifts);
    return updated;
  }
}

// ─── Recurring Expenses ────────────────────────────────────────────────────────

function isDueToday(r: RecurringExpense): boolean {
  const today = new Date();
  if (r.frequency === "daily") return true;
  if (r.frequency === "weekly") return today.getDay() === (r.dayOfWeek ?? 1);
  if (r.frequency === "monthly") return today.getDate() === (r.dayOfMonth ?? 1);
  if (r.frequency === "yearly") {
    return today.getMonth() === (r.monthOfYear ?? 0) && today.getDate() === (r.dayOfMonth ?? 1);
  }
  return false;
}

export function calcNextDue(
  frequency: string,
  dayOfWeek?: number,
  dayOfMonth?: number,
  monthOfYear?: number,
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (frequency === "daily") {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return next.toISOString().split("T")[0];
  }

  if (frequency === "weekly") {
    const target = dayOfWeek ?? 1;
    const daysUntil = ((target - today.getDay()) + 7) % 7 || 7;
    const next = new Date(today);
    next.setDate(next.getDate() + daysUntil);
    return next.toISOString().split("T")[0];
  }

  if (frequency === "monthly") {
    const target = dayOfMonth ?? 1;
    let next = new Date(today.getFullYear(), today.getMonth(), target);
    if (next <= today) next = new Date(today.getFullYear(), today.getMonth() + 1, target);
    return next.toISOString().split("T")[0];
  }

  const tMonth = monthOfYear ?? 0;
  const tDay = dayOfMonth ?? 1;
  let next = new Date(today.getFullYear(), tMonth, tDay);
  if (next <= today) next = new Date(today.getFullYear() + 1, tMonth, tDay);
  return next.toISOString().split("T")[0];
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  await ensureMigrated();
  try {
    return await apiGet<RecurringExpense>("/api/storehub/recurring-expenses");
  } catch (e) {
    console.warn("[dataService] getRecurringExpenses API failed, using localStorage fallback:", e);
    return getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  }
}

export async function createRecurringExpense(data: InsertRecurringExpense): Promise<RecurringExpense> {
  await ensureMigrated();
  try {
    return await apiPost<RecurringExpense>("/api/storehub/recurring-expenses", data);
  } catch (e) {
    console.warn("[dataService] createRecurringExpense API failed, saving locally:", e);
    const r: RecurringExpense = { ...data, id: generateId(), createdAt: now() };
    setItem(KEYS.RECURRING_EXPENSES, [...getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES), r]);
    return r;
  }
}

export async function updateRecurringExpense(
  id: string,
  data: Partial<InsertRecurringExpense>,
): Promise<RecurringExpense | null> {
  await ensureMigrated();
  try {
    return await apiPatch<RecurringExpense>(`/api/storehub/recurring-expenses/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateRecurringExpense API failed, updating locally:", e);
    const list = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    setItem(KEYS.RECURRING_EXPENSES, list);
    return updated;
  }
}

export async function deleteRecurringExpense(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/recurring-expenses/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteRecurringExpense API failed, deleting locally:", e);
    setItem(KEYS.RECURRING_EXPENSES, getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES).filter((r) => r.id !== id));
    return true;
  }
}

export async function processRecurringExpenses(): Promise<Array<{ description: string; amount: number }>> {
  const list = await getRecurringExpenses();
  const todayStr = new Date().toISOString().split("T")[0];
  const autoCreated: Array<{ description: string; amount: number }> = [];

  for (const r of list) {
    if (!r.enabled) continue;
    if (r.lastProcessed === todayStr) continue;
    if (!isDueToday(r)) continue;

    await createExpense({
      description: `${r.description} (auto)`,
      amount: r.amount,
      category: r.category,
      date: todayStr,
    });
    autoCreated.push({ description: r.description, amount: r.amount });
    await updateRecurringExpense(r.id, { lastProcessed: todayStr });
  }

  return autoCreated;
}

// ─── Scheduled Price Changes ───────────────────────────────────────────────────

export async function getScheduledPriceChanges(): Promise<ScheduledPriceChange[]> {
  await ensureMigrated();
  try {
    return await apiGet<ScheduledPriceChange>("/api/storehub/scheduled-prices");
  } catch (e) {
    console.warn("[dataService] getScheduledPriceChanges API failed, using localStorage fallback:", e);
    return getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
  }
}

export async function createScheduledPriceChange(
  data: InsertScheduledPriceChange,
): Promise<ScheduledPriceChange> {
  await ensureMigrated();
  try {
    return await apiPost<ScheduledPriceChange>("/api/storehub/scheduled-prices", { ...data, status: "pending" });
  } catch (e) {
    console.warn("[dataService] createScheduledPriceChange API failed, saving locally:", e);
    const sc: ScheduledPriceChange = { ...data, id: generateId(), status: "pending", createdAt: now() };
    setItem(KEYS.SCHEDULED_PRICES, [...getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES), sc]);
    return sc;
  }
}

export async function updateScheduledPriceChange(
  id: string,
  data: Partial<ScheduledPriceChange>,
): Promise<ScheduledPriceChange | null> {
  await ensureMigrated();
  try {
    return await apiPatch<ScheduledPriceChange>(`/api/storehub/scheduled-prices/${id}`, data);
  } catch (e) {
    console.warn("[dataService] updateScheduledPriceChange API failed, updating locally:", e);
    const list = getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const updated = { ...list[idx], ...data };
    list[idx] = updated;
    setItem(KEYS.SCHEDULED_PRICES, list);
    return updated;
  }
}

export async function deleteScheduledPriceChange(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/scheduled-prices/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteScheduledPriceChange API failed, deleting locally:", e);
    setItem(KEYS.SCHEDULED_PRICES, getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES).filter((s) => s.id !== id));
    return true;
  }
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardSummary(profile: UserProfile | null): Promise<DashboardSummary> {
  const [sales, expenses, products] = await Promise.all([
    getSales(),
    getExpenses(),
    getProducts(),
  ]);

  const todaySales = sales.filter((s) => isToday(s.createdAt));
  const todayExpenses = expenses.filter((e) => isToday(e.date));

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayExpenseTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

  const lowStockProducts = products.filter((p) => p.quantity <= p.lowStockThreshold);

  const itemCounts: Record<string, number> = {};
  for (const sale of sales) {
    for (const item of sale.items) {
      itemCounts[item.productName] = (itemCounts[item.productName] ?? 0) + item.quantity;
    }
  }
  const topSellingItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const dayCounts: Record<string, number> = {};
  for (const sale of sales) {
    const day = getDayName(sale.createdAt);
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const busiestDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day, count]) => ({ day, count }));

  const categoryTotals: Record<string, number> = {};
  for (const expense of expenses) {
    categoryTotals[expense.category] = (categoryTotals[expense.category] ?? 0) + expense.amount;
  }
  const biggestExpenseCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, total]) => ({ category, total }));

  const smartTips: string[] = [];
  const totalSalesCount = sales.length;
  const MIN_FOR_TRENDS = 10;
  const MIN_FOR_PATTERNS = 20;

  const outOfStock = products.filter((p) => p.quantity === 0);
  if (outOfStock.length > 0) {
    const names = outOfStock.slice(0, 2).map((p) => p.name).join(", ");
    smartTips.push(
      `${outOfStock.length === 1 ? `"${outOfStock[0].name}" is` : `${names} are`} OUT OF STOCK — customers are leaving empty-handed. Reorder immediately.`,
    );
  }

  const criticalLow = lowStockProducts
    .filter((p) => p.quantity > 0)
    .sort((a, b) => a.quantity / a.lowStockThreshold - b.quantity / b.lowStockThreshold);
  if (criticalLow.length > 0) {
    const worst = criticalLow[0];
    smartTips.push(
      `Critical: "${worst.name}" has only ${worst.quantity} ${worst.unit} left (reorder threshold: ${worst.lowStockThreshold}). Contact your supplier today.`,
    );
  }

  if (topSellingItems.length > 0 && totalSalesCount >= MIN_FOR_TRENDS) {
    const top = topSellingItems[0];
    const isLow = lowStockProducts.some((p) => p.name === top.name);
    if (isLow) {
      smartTips.push(
        `Your best-selling item "${top.name}" (${top.count} units sold) is running low. Prioritize restocking this above everything else.`,
      );
    } else {
      smartTips.push(
        `"${top.name}" is your #1 seller with ${top.count} units sold. Always keep it fully stocked — losing it to stockouts directly hurts revenue.`,
      );
    }
  }

  if (busiestDays.length > 0 && totalSalesCount >= MIN_FOR_PATTERNS) {
    const busy = busiestDays[0];
    smartTips.push(
      `Based on ${totalSalesCount} sales, ${busy.day} is your busiest day (${busy.count} transactions). Prepare extra stock and schedule more staff before ${busy.day}.`,
    );
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30Sales = sales.filter((s) => new Date(s.createdAt) > thirtyDaysAgo);
  const last30Revenue = last30Sales.reduce((sum, s) => sum + s.total, 0);
  const last30Expenses = expenses
    .filter((e) => new Date(e.date) > thirtyDaysAgo)
    .reduce((sum, e) => sum + e.amount, 0);

  if (last30Revenue > 0 && last30Expenses > 0 && last30Sales.length >= MIN_FOR_TRENDS) {
    const margin = ((last30Revenue - last30Expenses) / last30Revenue) * 100;
    if (margin < 15) {
      smartTips.push(
        `Your 30-day profit margin is ${margin.toFixed(0)}% — dangerously thin. Either raise prices on slow-moving items by 10-15% or cut your largest expense category.`,
      );
    } else if (margin < 25) {
      smartTips.push(
        `Your 30-day profit margin is ${margin.toFixed(0)}% (target: 25-35%). Review your top expense category to find savings.`,
      );
    }
  }

  const month = new Date().getMonth() + 1;
  const day = new Date().getDate();
  const quarterEndMonths = [3, 6, 9, 12];
  if (quarterEndMonths.includes(month) && day >= 10) {
    const quarterLabels: Record<number, string> = { 3: "Q1", 6: "Q2", 9: "Q3", 12: "Q4" };
    smartTips.push(
      `Tax reminder: ${quarterLabels[month]} estimated taxes may be due this month. Keep your expense records up to date for deductions.`,
    );
  }

  return {
    todayRevenue,
    todayExpenses: todayExpenseTotal,
    todayProfit: todayRevenue - todayExpenseTotal,
    todaySalesCount: todaySales.length,
    lowStockProducts,
    recentSales: todaySales.slice(0, 5),
    topSellingItems,
    busiestDays,
    biggestExpenseCategories,
    smartTips,
  };
}

// ─── Daily Pay Records ─────────────────────────────────────────────────────────

export async function getDailyPayRecords(): Promise<DailyPayRecord[]> {
  await ensureMigrated();
  try {
    return await apiGet<DailyPayRecord>("/api/storehub/daily-pay-records");
  } catch (e) {
    console.warn("[dataService] getDailyPayRecords API failed, using localStorage fallback:", e);
    return getItem<DailyPayRecord>("storehub_daily_pay_records");
  }
}

export async function createDailyPayRecord(data: InsertDailyPayRecord): Promise<DailyPayRecord> {
  await ensureMigrated();
  try {
    return await apiPost<DailyPayRecord>("/api/storehub/daily-pay-records", data);
  } catch (e) {
    console.warn("[dataService] createDailyPayRecord API failed, saving locally:", e);
    const record: DailyPayRecord = { ...data, id: generateId(), createdAt: now() };
    setItem("storehub_daily_pay_records", [...getItem<DailyPayRecord>("storehub_daily_pay_records"), record]);
    return record;
  }
}

export async function deleteDailyPayRecord(id: string): Promise<boolean> {
  await ensureMigrated();
  try {
    await apiDelete(`/api/storehub/daily-pay-records/${id}`);
    return true;
  } catch (e) {
    console.warn("[dataService] deleteDailyPayRecord API failed, deleting locally:", e);
    setItem("storehub_daily_pay_records", getItem<DailyPayRecord>("storehub_daily_pay_records").filter((r) => r.id !== id));
    return true;
  }
}

export async function getPayrollReport(start: string, end: string): Promise<PayrollReportEntry[]> {
  const [emps, allShifts, allDailyRecords] = await Promise.all([
    getEmployees(),
    getShifts(),
    getDailyPayRecords(),
  ]);

  const startDate = new Date(start);
  const endDate   = new Date(end + "T23:59:59");

  return emps.map((emp) => {
    const payrollType = emp.payrollType ?? "hourly";
    if (payrollType === "hourly") {
      const empShifts = allShifts.filter((s) => {
        if (s.employeeId !== emp.id || s.shiftEnd === null) return false;
        const d = new Date(s.shiftStart);
        return d >= startDate && d <= endDate;
      });
      const hoursWorked = empShifts.reduce((sum, s) => sum + (s.hoursWorked ?? 0), 0);
      const estimatedPay = hoursWorked * (emp.hourlyWage ?? 0);
      return {
        employee: { id: emp.id, name: emp.name, role: emp.role, payrollType },
        hoursWorked,
        estimatedPay,
        shifts: empShifts,
      };
    } else {
      const empDailyRecords = allDailyRecords.filter((d) => {
        if (d.employeeId !== emp.id) return false;
        const date = new Date(d.workDate);
        return date >= startDate && date <= endDate;
      });
      const estimatedPay = empDailyRecords.reduce((sum, d) => sum + (d.totalPay ?? 0), 0);
      return {
        employee: { id: emp.id, name: emp.name, role: emp.role, payrollType },
        estimatedPay,
        dailyRecords: empDailyRecords,
      };
    }
  });
}

// ─── Month Close Records (localStorage only — no backend route) ───────────────

export async function getMonthCloseRecords(): Promise<MonthCloseRecord[]> {
  await Promise.resolve();
  return getItem<MonthCloseRecord>(KEYS.MONTH_CLOSE_RECORDS);
}

export async function getMonthCloseRecord(month: number, year: number): Promise<MonthCloseRecord | null> {
  await Promise.resolve();
  return getItem<MonthCloseRecord>(KEYS.MONTH_CLOSE_RECORDS).find(
    (r) => r.month === month && r.year === year
  ) ?? null;
}

export async function createMonthCloseRecord(data: Omit<MonthCloseRecord, 'id' | 'createdAt' | 'closedAt'> & { notes?: string; completedSteps?: string[] }): Promise<MonthCloseRecord> {
  await Promise.resolve();
  const record: MonthCloseRecord = {
    id: generateId(),
    month: data.month,
    year: data.year,
    closedAt: new Date().toISOString(),
    notes: data.notes ?? '',
    completedSteps: data.completedSteps ?? [],
    revenue: data.revenue,
    expenses: data.expenses,
    profit: data.profit,
    supplierSpending: data.supplierSpending,
    shrinkage: data.shrinkage,
    cashVariance: data.cashVariance,
    createdAt: now(),
  };
  const list = getItem<MonthCloseRecord>(KEYS.MONTH_CLOSE_RECORDS);
  setItem(KEYS.MONTH_CLOSE_RECORDS, [...list, record]);
  return record;
}

export async function isMonthClosed(month: number, year: number): Promise<boolean> {
  return (await getMonthCloseRecord(month, year)) !== null;
}

export async function getTaxSummary(): Promise<{
  profile: { country?: string; stateCode?: string; taxRate: number; currency: string };
  currentMonth: { totalSales: number; taxCollected: number; totalExpenses: number };
  ytd: { totalSales: number; taxCollected: number; totalExpenses: number };
} | null> {
  const profile = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (!profile) return null;

  const [allSales, allExpenses] = await Promise.all([getSales(), getExpenses()]);
  const taxRate = profile.taxRate ?? 0;

  const nowDate = new Date();
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const yearStart  = new Date(nowDate.getFullYear(), 0, 1);

  const filterSales = (from: Date) =>
    allSales.filter((s) => new Date(s.createdAt) >= from).reduce((sum, s) => sum + s.total, 0);
  const filterExpenses = (from: Date) =>
    allExpenses.filter((e) => new Date(e.date) >= from).reduce((sum, e) => sum + e.amount, 0);

  const monthSales    = filterSales(monthStart);
  const monthExpenses = filterExpenses(monthStart);
  const ytdSales      = filterSales(yearStart);
  const ytdExpenses   = filterExpenses(yearStart);

  return {
    profile: { country: profile.country, stateCode: profile.stateCode, taxRate, currency: profile.currency },
    currentMonth: { totalSales: monthSales, taxCollected: monthSales * taxRate, totalExpenses: monthExpenses },
    ytd: { totalSales: ytdSales, taxCollected: ytdSales * taxRate, totalExpenses: ytdExpenses },
  };
}

// ─── Category Settings (localStorage only — no backend route) ─────────────────

const CATEGORY_SETTINGS_KEY = "storehub_category_settings";

export async function getCategorySettings(): Promise<CategorySetting[]> {
  await Promise.resolve();
  return getItem<CategorySetting>(CATEGORY_SETTINGS_KEY);
}

export async function upsertCategorySetting(setting: CategorySetting): Promise<void> {
  await Promise.resolve();
  const settings = getItem<CategorySetting>(CATEGORY_SETTINGS_KEY);
  const idx = settings.findIndex((s) => s.category === setting.category);
  if (idx >= 0) {
    settings[idx] = setting;
  } else {
    settings.push(setting);
  }
  setItem(CATEGORY_SETTINGS_KEY, settings);
}

// ─── Refunds ───────────────────────────────────────────────────────────────────

export async function createRefund(data: InsertRefund): Promise<Refund> {
  await ensureMigrated();
  let refund: Refund;
  try {
    refund = await apiPost<Refund>("/api/storehub/refunds", data);
  } catch (e) {
    console.warn("[dataService] createRefund API failed, saving locally:", e);
    refund = { ...data, id: generateId(), createdAt: now() };
    const existing = getItem<Refund>(KEYS.REFUNDS);
    if (!existing.some((r) => r.id === refund.id)) {
      setItem(KEYS.REFUNDS, [...existing, refund]);
    }
  }
  return refund;
}

export async function getRefunds(): Promise<Refund[]> {
  await ensureMigrated();
  try {
    const apiRefunds = await apiGet<Refund>("/api/storehub/refunds");
    const localRefunds = getItem<Refund>(KEYS.REFUNDS);
    const apiIds = new Set(apiRefunds.map((r) => r.id));
    const pendingLocal = localRefunds.filter((r) => !apiIds.has(r.id));
    return [...apiRefunds, ...pendingLocal].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (e) {
    console.warn("[dataService] getRefunds API failed, using local:", e);
    return getItem<Refund>(KEYS.REFUNDS).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function getRefund(id: string): Promise<Refund | null> {
  const all = await getRefunds();
  return all.find((r) => r.id === id) ?? null;
}

export async function deleteRefund(id: string): Promise<boolean> {
  try {
    await apiDelete(`/api/storehub/refunds/${id}`);
  } catch {
    setItem(KEYS.REFUNDS, getItem<Refund>(KEYS.REFUNDS).filter((r) => r.id !== id));
  }
  return true;
}

// ─── Cash Shifts (localStorage only — no backend route) ───────────────────────

const CASH_SHIFTS_DB_KEY = "storehub_cash_shifts_db";

export async function createCashShift(data: InsertCashShift): Promise<CashShift> {
  await Promise.resolve();
  const shift: CashShift = { ...data, id: generateId() };
  setItem(CASH_SHIFTS_DB_KEY, [...getItem<CashShift>(CASH_SHIFTS_DB_KEY), shift]);
  return shift;
}

export async function getCashShifts(): Promise<CashShift[]> {
  await Promise.resolve();
  return getItem<CashShift>(CASH_SHIFTS_DB_KEY);
}

export async function getCashShift(id: string): Promise<CashShift | null> {
  await Promise.resolve();
  return getItem<CashShift>(CASH_SHIFTS_DB_KEY).find((s) => s.id === id) ?? null;
}

export async function updateCashShift(id: string, data: Partial<InsertCashShift>): Promise<CashShift | null> {
  await Promise.resolve();
  const shifts = getItem<CashShift>(CASH_SHIFTS_DB_KEY);
  const idx = shifts.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...shifts[idx], ...data };
  shifts[idx] = updated;
  setItem(CASH_SHIFTS_DB_KEY, shifts);
  return updated;
}

export async function deleteCashShift(id: string): Promise<boolean> {
  await Promise.resolve();
  setItem(CASH_SHIFTS_DB_KEY, getItem<CashShift>(CASH_SHIFTS_DB_KEY).filter((s) => s.id !== id));
  return true;
}

// ─── Payment Settings ─────────────────────────────────────────────────────────

export async function getPaymentSettings(): Promise<any> {
  await Promise.resolve();
  const profile = await getUserProfile();
  return profile?.paymentSettings ?? null;
}

export async function savePaymentSettings(settings: any): Promise<void> {
  await Promise.resolve();
  const profile = await getUserProfile();
  if (profile) {
    await updateUserProfile({ paymentSettings: settings });
  }
}
