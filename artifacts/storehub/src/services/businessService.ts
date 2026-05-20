/**
 * businessService.ts
 * All API calls for the business-owner section of the app.
 * Every function is async and throws on non-OK responses.
 */

import { API_BASE_URL } from "./dataService";

// ── Shared fetch helper ───────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusinessInfo {
  id:              string;
  name:            string;
  description:     string | null;
  website:         string | null;
  businessOwnerId: string;
  createdAt:       string;
  updatedAt:       string;
}

export interface StoreInfo {
  userId:              string;
  storeName:           string;
  ownerName:           string;
  businessType:        string;
  onboardingCompleted: boolean;
  storageMode:         string;
  storeCity:           string | null;
  createdAt:           string;
  lastUpdated:         string;
  revenue:             number;
  productCount:        number;
  employeeCount:       number;
}

export interface BusinessStats {
  totalStores:    number;
  totalRevenue:   number;
  totalProducts:  number;
  totalEmployees: number;
  stores:         StoreInfo[];
}

export interface CreatedStore {
  userId:       string;
  email:        string | null;
  fullName:     string;
  tempPassword: string | null;
  selfManaged:  boolean;
  message:      string;
}

// ── Business operations ───────────────────────────────────────────────────────

/**
 * Returns the caller's business, or null if they haven't created one yet.
 * Never throws a 403 — the backend returns [] for owners with no business.
 */
export async function getMyBusiness(): Promise<BusinessInfo | null> {
  const { businesses } = await apiJson<{ businesses: BusinessInfo[] }>(
    "/api/businesses",
  );
  return businesses[0] ?? null;
}

/**
 * Create the caller's business during initial onboarding.
 * The server re-issues JWT cookies and links the businessId to the user record.
 */
export async function setupBusiness(name: string): Promise<BusinessInfo> {
  const data = await apiJson<{ business: BusinessInfo }>(
    "/api/onboarding/business",
    {
      method: "POST",
      body: JSON.stringify({ businessName: name }),
    },
  );
  return data.business;
}

/** Update business name / description / website. */
export async function updateBusiness(
  businessId: string,
  patch: { name?: string; description?: string; website?: string },
): Promise<BusinessInfo> {
  const data = await apiJson<{ business: BusinessInfo }>(
    `/api/businesses/${businessId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return data.business;
}

// ── Store stats ───────────────────────────────────────────────────────────────

function localEmployeeCount(storeUserId: string): number {
  try {
    const raw = localStorage.getItem(`storehub_employees_${storeUserId}`);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

function localSalesRevenue(storeUserId: string): number {
  try {
    const raw = localStorage.getItem(`storehub_sales_${storeUserId}`);
    if (!raw) return 0;
    const arr: Array<{ total?: number }> = JSON.parse(raw);
    return Array.isArray(arr) ? arr.reduce((s, r) => s + (r.total ?? 0), 0) : 0;
  } catch { return 0; }
}

function localProductCount(storeUserId: string): number {
  try {
    const raw = localStorage.getItem(`storehub_products_${storeUserId}`);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.length : 0;
  } catch { return 0; }
}

/** Full per-store breakdown with aggregated totals. */
export async function getBusinessStats(businessId: string): Promise<BusinessStats> {
  let stats: BusinessStats;
  try {
    stats = await apiJson<BusinessStats>(`/api/businesses/${businessId}/stats`);
  } catch {
    // No API available — build stats entirely from localStorage.
    // Collect all store-scoped employee keys to discover known stores.
    const storeIds = Object.keys(localStorage)
      .filter((k) => k.startsWith("storehub_employees_"))
      .map((k) => k.replace("storehub_employees_", ""));

    const stores: StoreInfo[] = storeIds.map((id) => ({
      userId:              id,
      storeName:           `Store ${id.slice(0, 6)}`,
      ownerName:           "",
      businessType:        "",
      onboardingCompleted: true,
      storageMode:         "local",
      storeCity:           null,
      createdAt:           "",
      lastUpdated:         "",
      revenue:             localSalesRevenue(id),
      productCount:        localProductCount(id),
      employeeCount:       localEmployeeCount(id),
    }));

    return {
      totalStores:    stores.length,
      totalRevenue:   stores.reduce((s, r) => s + r.revenue, 0),
      totalProducts:  stores.reduce((s, r) => s + r.productCount, 0),
      totalEmployees: stores.reduce((s, r) => s + r.employeeCount, 0),
      stores,
    };
  }

  // API succeeded — supplement each store's counts with localStorage data so
  // locally-added records (not yet pushed to the server) are reflected.
  const enrichedStores = stats.stores.map((store) => {
    const localEmps  = localEmployeeCount(store.userId);
    const localRev   = localSalesRevenue(store.userId);
    const localProds = localProductCount(store.userId);
    return {
      ...store,
      employeeCount: Math.max(store.employeeCount, localEmps),
      revenue:       Math.max(store.revenue,       localRev),
      productCount:  Math.max(store.productCount,  localProds),
    };
  });

  return {
    ...stats,
    stores:         enrichedStores,
    totalEmployees: enrichedStores.reduce((s, r) => s + r.employeeCount, 0),
    totalRevenue:   enrichedStores.reduce((s, r) => s + r.revenue, 0),
    totalProducts:  enrichedStores.reduce((s, r) => s + r.productCount, 0),
  };
}

// ── Store creation ────────────────────────────────────────────────────────────

export interface CreateStorePayload {
  storeName:    string;
  businessType?: string;
  /** Provide email + fullName only when explicitly assigning a manager. */
  email?:       string;
  fullName?:    string;
  password?:    string;
}

/** Create a store sub-account under the given business. */
export async function createStore(
  businessId: string,
  payload: CreateStorePayload,
): Promise<CreatedStore> {
  return apiJson<CreatedStore>(
    `/api/businesses/${businessId}/stores`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

// Legacy alias kept so any existing imports don't break.
export const createStoreUnderBusiness = createStore;

// Re-export type alias used in BusinessStoresPage
export type BusinessStore = StoreInfo;
