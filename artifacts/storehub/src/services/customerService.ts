import { API_BASE_URL } from "./dataService";

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisitAt?: string;
  tags: string[];
  createdAt: string;
  isLapsed?: boolean;
}

export interface CustomerWithHistory extends Customer {
  purchaseHistory: PurchaseSale[];
}

export interface PurchaseSale {
  id: string;
  total: number;
  items: Array<{ productName?: string; name?: string; quantity: number; price: number }>;
  createdAt: string;
  receiptNumber: string;
}

export interface CustomerOffer {
  customerId: string;
  offer: string;
  generatedAt: string;
}

const BASE = `${API_BASE_URL}/api/customers`;

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem("sh_active_store_id") : null;
  const res = await fetch(url, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(activeStoreId ? { "X-Store-User-Id": activeStoreId } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const errorMessage = (body && body.error) || text || `HTTP ${res.status}`;
    throw new Error(`${url} -> ${errorMessage}`);
  }
  return res.json() as Promise<T>;
}

// ─── List & Read ──────────────────────────────────────────────────────────────

export async function listCustomers(): Promise<Customer[]> {
  return apiFetch<Customer[]>(BASE);
}

export async function getTopCustomers(): Promise<Customer[]> {
  return apiFetch<Customer[]>(`${BASE}/top`);
}

export async function getLapsedCustomers(): Promise<Customer[]> {
  return apiFetch<Customer[]>(`${BASE}/lapsed`);
}

export async function getCustomer(id: string): Promise<CustomerWithHistory> {
  return apiFetch<CustomerWithHistory>(`${BASE}/${id}`);
}

// ─── Create & Update ──────────────────────────────────────────────────────────

export async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  return apiFetch<Customer>(BASE, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  const payload = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(payload).length === 0) {
    return getCustomer(id);
  }

  return apiFetch<Customer>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export async function lookupByPhone(phone: string): Promise<Customer | null> {
  return apiFetch<Customer | null>(`${BASE}/lookup`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

// ─── Loyalty Points ───────────────────────────────────────────────────────────

export async function addPoints(id: string, points: number): Promise<void> {
  await apiFetch<{ loyaltyPoints: number }>(`${BASE}/${id}/add-points`, {
    method: "POST",
    body: JSON.stringify({ points }),
  });
}

export async function redeemPoints(id: string, points: number): Promise<void> {
  await apiFetch<{ loyaltyPoints: number }>(`${BASE}/${id}/redeem-points`, {
    method: "POST",
    body: JSON.stringify({ points }),
  });
}

// ─── AI Offer ─────────────────────────────────────────────────────────────────

const OFFER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function offerCacheKey(customerId: string): string {
  return `storehub_offer_${customerId}`;
}

function getCachedOffer(customerId: string): string | null {
  try {
    const raw = localStorage.getItem(offerCacheKey(customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { offer: string; expiresAt: number };
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(offerCacheKey(customerId));
      return null;
    }
    return parsed.offer;
  } catch {
    return null;
  }
}

function setCachedOffer(customerId: string, offer: string): void {
  try {
    localStorage.setItem(
      offerCacheKey(customerId),
      JSON.stringify({ offer, expiresAt: Date.now() + OFFER_CACHE_TTL_MS }),
    );
  } catch {
    // localStorage full — ignore
  }
}

export async function generateOffer(id: string, customer?: CustomerWithHistory): Promise<string> {
  const cached = getCachedOffer(id);
  if (cached) return cached;

  const payload = customer ?? (await getCustomer(id));
  const { offer } = await apiFetch<{ offer: string }>(`${BASE}/${id}/offer`, {
    method: "POST",
    body: JSON.stringify({ customer: payload }),
  });
  setCachedOffer(id, offer);
  return offer;
}

// ─── Loyalty Transaction Logging ──────────────────────────────────────────────

export async function logLoyaltyTransaction(
  customerId: string,
  type: "earn" | "redeem" | "reward_unlock" | "admin_adjust",
  pointsChange: number,
  options?: {
    saleAmount?: number;
    rewardUsed?: string;
    saleId?: string;
    notes?: string;
    metadata?: Record<string, any>;
  }
): Promise<{ transaction: any; customerBalanceAfter: number }> {
  return apiFetch<{ transaction: any; customerBalanceAfter: number }>(
    `${BASE}/${customerId}/log-transaction`,
    {
      method: "POST",
      body: JSON.stringify({
        type,
        pointsChange,
        ...options,
      }),
    }
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const RATE_KEY = "storehub_loyalty_rate";

export function getPointsPerDollar(): number {
  const raw = localStorage.getItem(RATE_KEY);
  if (!raw) return 1;
  const val = parseFloat(raw);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

export function setPointsPerDollar(rate: number): void {
  localStorage.setItem(RATE_KEY, String(rate));
}
