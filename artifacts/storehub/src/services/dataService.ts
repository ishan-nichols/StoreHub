/**
 * dataService.ts — Single data access layer for StoreHub.
 *
 * All data operations go through this file. Currently reads/writes to
 * localStorage. To switch to a real API, replace the implementations
 * of each function here — no changes needed in UI components.
 *
 * All functions are async/await so they are structurally ready for
 * real API endpoints.
 *
 * Future integration points:
 * - Shopify: Replace product/inventory functions with Shopify Products API
 * - Square: Replace POS/sales functions with Square Payments API
 * - QuickBooks: Replace expense/profit functions with QuickBooks Accounting API
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
} from "../schemas";
import { generateId, generateReceiptNumber, now, isToday, getDayName } from "../utils";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const KEYS = {
  USER_PROFILE: "storehub_user_profile",
  PRODUCTS: "storehub_products",
  SALES: "storehub_sales",
  EXPENSES: "storehub_expenses",
  SUPPLIERS: "storehub_suppliers",
  EMPLOYEES: "storehub_employees",
  SHIFTS: "storehub_shifts",
  RECURRING_EXPENSES: "storehub_recurring_expenses",
  SCHEDULED_PRICES: "storehub_scheduled_prices",
};

function getItem<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function setItem<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function getSingle<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setSingle<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── User Profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(): Promise<UserProfile | null> {
  // Future: GET /api/profile
  await Promise.resolve();
  return getSingle<UserProfile>(KEYS.USER_PROFILE);
}

export async function saveUserProfile(profile: UserProfile): Promise<UserProfile> {
  // Future: POST/PUT /api/profile
  await Promise.resolve();
  setSingle(KEYS.USER_PROFILE, profile);
  return profile;
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
  // Future: PATCH /api/profile
  await Promise.resolve();
  const current = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (!current) return null;
  const updated = { ...current, ...updates };
  setSingle(KEYS.USER_PROFILE, updated);
  return updated;
}

export async function trackFeatureUsage(feature: string): Promise<void> {
  // Future: POST /api/profile/feature-usage
  await Promise.resolve();
  const current = getSingle<UserProfile>(KEYS.USER_PROFILE);
  if (!current) return;
  const counts = current.featureUsageCount ?? {};
  counts[feature] = (counts[feature] ?? 0) + 1;
  setSingle(KEYS.USER_PROFILE, { ...current, featureUsageCount: counts });
}

export async function clearAllData(): Promise<void> {
  // Future: DELETE /api/data
  await Promise.resolve();
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

// ─── Products / Inventory ──────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  // Future: GET /api/products
  // [Shopify integration point: replace with Shopify.products.list()]
  await Promise.resolve();
  return getItem<Product>(KEYS.PRODUCTS);
}

export async function getProduct(id: string): Promise<Product | null> {
  // Future: GET /api/products/:id
  await Promise.resolve();
  const products = getItem<Product>(KEYS.PRODUCTS);
  return products.find((p) => p.id === id) ?? null;
}

export async function createProduct(data: InsertProduct): Promise<Product> {
  // Future: POST /api/products
  // [Shopify integration point: replace with Shopify.products.create()]
  await Promise.resolve();
  const product: Product = {
    ...data,
    id: generateId(),
    createdAt: now(),
    updatedAt: now(),
  };
  const products = getItem<Product>(KEYS.PRODUCTS);
  setItem(KEYS.PRODUCTS, [...products, product]);
  return product;
}

export async function updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | null> {
  // Future: PATCH /api/products/:id
  // [Shopify integration point: replace with Shopify.products.update()]
  await Promise.resolve();
  const products = getItem<Product>(KEYS.PRODUCTS);
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated = { ...products[idx], ...data, updatedAt: now() };
  products[idx] = updated;
  setItem(KEYS.PRODUCTS, products);
  return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
  // Future: DELETE /api/products/:id
  await Promise.resolve();
  const products = getItem<Product>(KEYS.PRODUCTS);
  const filtered = products.filter((p) => p.id !== id);
  setItem(KEYS.PRODUCTS, filtered);
  return true;
}

export async function getLowStockProducts(): Promise<Product[]> {
  // Future: GET /api/products/low-stock
  await Promise.resolve();
  const products = getItem<Product>(KEYS.PRODUCTS);
  return products.filter((p) => p.quantity <= p.lowStockThreshold);
}

// ─── Pre-seeding ────────────────────────────────────────────────────────────────

export async function bulkCreateProducts(items: InsertProduct[]): Promise<Product[]> {
  await Promise.resolve();
  const created: Product[] = items.map((data) => ({
    ...data,
    id: generateId(),
    createdAt: now(),
    updatedAt: now(),
  }));
  const existing = getItem<Product>(KEYS.PRODUCTS);
  setItem(KEYS.PRODUCTS, [...existing, ...created]);
  return created;
}

export async function bulkCreateEmployees(items: InsertEmployee[]): Promise<Employee[]> {
  await Promise.resolve();
  const created: Employee[] = items.map((data) => ({
    ...data,
    id: generateId(),
    createdAt: now(),
  }));
  const existing = getItem<Employee>(KEYS.EMPLOYEES);
  setItem(KEYS.EMPLOYEES, [...existing, ...created]);
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
  // Future: GET /api/sales
  // [Square integration point: replace with Square.ordersApi.listOrders()]
  await Promise.resolve();
  const sales = getItem<Sale>(KEYS.SALES);
  return sales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSale(id: string): Promise<Sale | null> {
  // Future: GET /api/sales/:id
  await Promise.resolve();
  const sales = getItem<Sale>(KEYS.SALES);
  return sales.find((s) => s.id === id) ?? null;
}

export async function createSale(data: InsertSale): Promise<Sale> {
  // Future: POST /api/sales
  // [Square integration point: replace with Square.ordersApi.createOrder()]
  await Promise.resolve();
  const sale: Sale = {
    ...data,
    id: generateId(),
    receiptNumber: generateReceiptNumber(),
    createdAt: now(),
  };
  const sales = getItem<Sale>(KEYS.SALES);
  setItem(KEYS.SALES, [...sales, sale]);

  for (const item of data.items) {
    const products = getItem<Product>(KEYS.PRODUCTS);
    const idx = products.findIndex((p) => p.id === item.productId);
    if (idx !== -1) {
      products[idx].quantity = Math.max(0, products[idx].quantity - item.quantity);
      products[idx].updatedAt = now();
      setItem(KEYS.PRODUCTS, products);
    }
  }

  return sale;
}

export async function getTodaySales(): Promise<Sale[]> {
  await Promise.resolve();
  const sales = getItem<Sale>(KEYS.SALES);
  return sales.filter((s) => isToday(s.createdAt));
}

// ─── Expenses ──────────────────────────────────────────────────────────────────

export async function getExpenses(): Promise<Expense[]> {
  // Future: GET /api/expenses
  // [QuickBooks integration point: replace with qbo.findPurchases()]
  await Promise.resolve();
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function createExpense(data: InsertExpense): Promise<Expense> {
  // Future: POST /api/expenses
  // [QuickBooks integration point: replace with qbo.createPurchase()]
  await Promise.resolve();
  const expense: Expense = { ...data, id: generateId(), createdAt: now() };
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  setItem(KEYS.EXPENSES, [...expenses, expense]);
  return expense;
}

export async function updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | null> {
  await Promise.resolve();
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated = { ...expenses[idx], ...data };
  expenses[idx] = updated;
  setItem(KEYS.EXPENSES, expenses);
  return updated;
}

export async function deleteExpense(id: string): Promise<boolean> {
  await Promise.resolve();
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  setItem(KEYS.EXPENSES, expenses.filter((e) => e.id !== id));
  return true;
}

export async function getTodayExpenses(): Promise<Expense[]> {
  await Promise.resolve();
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  return expenses.filter((e) => isToday(e.date));
}

// ─── Suppliers ─────────────────────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  await Promise.resolve();
  return getItem<Supplier>(KEYS.SUPPLIERS);
}

export async function createSupplier(data: InsertSupplier): Promise<Supplier> {
  await Promise.resolve();
  const supplier: Supplier = { ...data, id: generateId(), createdAt: now() };
  const suppliers = getItem<Supplier>(KEYS.SUPPLIERS);
  setItem(KEYS.SUPPLIERS, [...suppliers, supplier]);
  return supplier;
}

export async function updateSupplier(id: string, data: Partial<InsertSupplier>): Promise<Supplier | null> {
  await Promise.resolve();
  const suppliers = getItem<Supplier>(KEYS.SUPPLIERS);
  const idx = suppliers.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...suppliers[idx], ...data };
  suppliers[idx] = updated;
  setItem(KEYS.SUPPLIERS, suppliers);
  return updated;
}

export async function deleteSupplier(id: string): Promise<boolean> {
  await Promise.resolve();
  const suppliers = getItem<Supplier>(KEYS.SUPPLIERS);
  setItem(KEYS.SUPPLIERS, suppliers.filter((s) => s.id !== id));
  return true;
}

// ─── Employees ─────────────────────────────────────────────────────────────────

export async function getEmployees(): Promise<Employee[]> {
  // Future: GET /api/employees
  await Promise.resolve();
  return getItem<Employee>(KEYS.EMPLOYEES);
}

export async function createEmployee(data: InsertEmployee): Promise<Employee> {
  // Future: POST /api/employees
  await Promise.resolve();
  const employee: Employee = { ...data, id: generateId(), createdAt: now() };
  const employees = getItem<Employee>(KEYS.EMPLOYEES);
  setItem(KEYS.EMPLOYEES, [...employees, employee]);
  return employee;
}

export async function updateEmployee(id: string, data: Partial<InsertEmployee>): Promise<Employee | null> {
  await Promise.resolve();
  const employees = getItem<Employee>(KEYS.EMPLOYEES);
  const idx = employees.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated = { ...employees[idx], ...data };
  employees[idx] = updated;
  setItem(KEYS.EMPLOYEES, employees);
  return updated;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  // Future: DELETE /api/employees/:id
  await Promise.resolve();
  const employees = getItem<Employee>(KEYS.EMPLOYEES);
  setItem(KEYS.EMPLOYEES, employees.filter((e) => e.id !== id));
  return true;
}

// ─── Shifts ────────────────────────────────────────────────────────────────────

export async function getShifts(): Promise<Shift[]> {
  // Future: GET /api/shifts
  await Promise.resolve();
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  return shifts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getActiveShift(employeeId: string): Promise<Shift | null> {
  await Promise.resolve();
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  return shifts.find((s) => s.employeeId === employeeId && s.shiftEnd === null) ?? null;
}

export async function clockIn(employeeId: string, employeeName: string): Promise<Shift> {
  const shift: Shift = {
    id: generateId(),
    employeeId,
    employeeName,
    shiftStart: now(),
    shiftEnd: null,
    hoursWorked: null,
    createdAt: now(),
  };
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  setItem(KEYS.SHIFTS, [...shifts, shift]);
  return shift;
}

export async function clockOut(shiftId: string): Promise<Shift | null> {
  await Promise.resolve();
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  const idx = shifts.findIndex((s) => s.id === shiftId);
  if (idx === -1) return null;
  const endTime = now();
  const start = new Date(shifts[idx].shiftStart).getTime();
  const end = new Date(endTime).getTime();
  const hoursWorked = Math.round(((end - start) / 3600000) * 100) / 100;
  const updated = { ...shifts[idx], shiftEnd: endTime, hoursWorked };
  shifts[idx] = updated;
  setItem(KEYS.SHIFTS, shifts);
  return updated;
}

export async function createShift(data: InsertShift): Promise<Shift> {
  // Future: POST /api/shifts
  await Promise.resolve();
  const shift: Shift = { ...data, id: generateId(), createdAt: now() };
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  setItem(KEYS.SHIFTS, [...shifts, shift]);
  return shift;
}

export async function updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | null> {
  // Future: PATCH /api/shifts/:id
  await Promise.resolve();
  const shifts = getItem<Shift>(KEYS.SHIFTS);
  const idx = shifts.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...shifts[idx], ...data };
  shifts[idx] = updated;
  setItem(KEYS.SHIFTS, shifts);
  return updated;
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

  // yearly
  const tMonth = monthOfYear ?? 0;
  const tDay = dayOfMonth ?? 1;
  let next = new Date(today.getFullYear(), tMonth, tDay);
  if (next <= today) next = new Date(today.getFullYear() + 1, tMonth, tDay);
  return next.toISOString().split("T")[0];
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  await Promise.resolve();
  return getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
}

export async function createRecurringExpense(data: InsertRecurringExpense): Promise<RecurringExpense> {
  await Promise.resolve();
  const r: RecurringExpense = { ...data, id: generateId(), createdAt: now() };
  const list = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  setItem(KEYS.RECURRING_EXPENSES, [...list, r]);
  return r;
}

export async function updateRecurringExpense(
  id: string,
  data: Partial<InsertRecurringExpense>,
): Promise<RecurringExpense | null> {
  await Promise.resolve();
  const list = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...data };
  list[idx] = updated;
  setItem(KEYS.RECURRING_EXPENSES, list);
  return updated;
}

export async function deleteRecurringExpense(id: string): Promise<boolean> {
  await Promise.resolve();
  const list = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  setItem(KEYS.RECURRING_EXPENSES, list.filter((r) => r.id !== id));
  return true;
}

export async function processRecurringExpenses(): Promise<Array<{ description: string; amount: number }>> {
  await Promise.resolve();
  const list = getItem<RecurringExpense>(KEYS.RECURRING_EXPENSES);
  const todayStr = new Date().toISOString().split("T")[0];
  const autoCreated: Array<{ description: string; amount: number }> = [];

  const updatedList = list.map((r) => {
    if (!r.enabled) return r;
    if (r.lastProcessed === todayStr) return r;
    if (!isDueToday(r)) return r;

    const expense: Expense = {
      id: generateId(),
      description: `${r.description} (auto)`,
      amount: r.amount,
      category: r.category,
      date: todayStr,
      createdAt: now(),
    };
    const expenses = getItem<Expense>(KEYS.EXPENSES);
    setItem(KEYS.EXPENSES, [...expenses, expense]);
    autoCreated.push({ description: r.description, amount: r.amount });
    return { ...r, lastProcessed: todayStr };
  });

  setItem(KEYS.RECURRING_EXPENSES, updatedList);
  return autoCreated;
}

// ─── Scheduled Price Changes ───────────────────────────────────────────────────

export async function getScheduledPriceChanges(): Promise<ScheduledPriceChange[]> {
  await Promise.resolve();
  return getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
}

export async function createScheduledPriceChange(
  data: InsertScheduledPriceChange,
): Promise<ScheduledPriceChange> {
  await Promise.resolve();
  const sc: ScheduledPriceChange = {
    ...data,
    id: generateId(),
    status: "pending",
    createdAt: now(),
  };
  const list = getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
  setItem(KEYS.SCHEDULED_PRICES, [...list, sc]);
  return sc;
}

export async function updateScheduledPriceChange(
  id: string,
  data: Partial<ScheduledPriceChange>,
): Promise<ScheduledPriceChange | null> {
  await Promise.resolve();
  const list = getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...data };
  list[idx] = updated;
  setItem(KEYS.SCHEDULED_PRICES, list);
  return updated;
}

export async function deleteScheduledPriceChange(id: string): Promise<boolean> {
  await Promise.resolve();
  const list = getItem<ScheduledPriceChange>(KEYS.SCHEDULED_PRICES);
  setItem(KEYS.SCHEDULED_PRICES, list.filter((s) => s.id !== id));
  return true;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardSummary(profile: UserProfile | null): Promise<DashboardSummary> {
  // Future: GET /api/dashboard/summary
  await Promise.resolve();

  const sales = getItem<Sale>(KEYS.SALES);
  const expenses = getItem<Expense>(KEYS.EXPENSES);
  const products = getItem<Product>(KEYS.PRODUCTS);

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
