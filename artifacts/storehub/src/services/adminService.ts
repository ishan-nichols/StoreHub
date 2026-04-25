import { API_BASE_URL } from "./dataService";

const BASE = `${API_BASE_URL}/api/admin`;

async function adminFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });
}

export interface AdminStats {
  totalStores: number;
  totalRevenue: number;
  onboardedCount: number;
  newThisMonth: number;
  totalProducts: number;
  avgRevenuePerStore: number;
}

export interface AdminStore {
  userId: string;
  storeName: string;
  ownerName: string;
  businessType: string;
  onboardingCompleted: boolean;
  storageMode: string;
  storeCity: string | null;
  createdAt: string;
  lastUpdated: string;
  email: string | null;
  fullName: string;
  role: string;
  userCreatedAt: string;
  lastLoginAt: string | null;
  revenue: number;
  productCount: number;
  employeeCount: number;
}

export interface AdminStoreDetail {
  user: {
    id: string;
    email: string | null;
    fullName: string;
    role: string;
    emailVerified: boolean;
    phoneNumber: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  profile: Record<string, unknown>;
  stats: {
    revenue: number;
    expenseTotal: number;
    saleCount: number;
    productCount: number;
    employeeCount: number;
    supplierCount: number;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await adminFetch("/stats");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function listStores(): Promise<AdminStore[]> {
  const res = await adminFetch("/stores");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreDetail(userId: string): Promise<AdminStoreDetail> {
  const res = await adminFetch(`/stores/${userId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreProducts(userId: string): Promise<unknown[]> {
  const res = await adminFetch(`/stores/${userId}/products`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreSales(userId: string): Promise<unknown[]> {
  const res = await adminFetch(`/stores/${userId}/sales`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreEmployees(userId: string): Promise<unknown[]> {
  const res = await adminFetch(`/stores/${userId}/employees`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreExpenses(userId: string): Promise<unknown[]> {
  const res = await adminFetch(`/stores/${userId}/expenses`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function getStoreSuppliers(userId: string): Promise<unknown[]> {
  const res = await adminFetch(`/stores/${userId}/suppliers`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function updateStoreProfile(userId: string, patch: Record<string, unknown>): Promise<void> {
  const res = await adminFetch(`/stores/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Update failed");
  }
}

export async function updateStoreUser(
  userId: string,
  patch: { fullName?: string; email?: string; phoneNumber?: string; role?: string },
): Promise<void> {
  const res = await adminFetch(`/stores/${userId}/user`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Update failed");
  }
}

export async function resetUserPassword(userId: string, password?: string): Promise<{ tempPassword: string }> {
  const res = await adminFetch(`/stores/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify(password ? { password } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Reset failed");
  return data;
}

export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string;
  role: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  businessId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function listAllUsers(role?: string): Promise<AdminUser[]> {
  const url = role ? `/users?role=${encodeURIComponent(role)}` : "/users";
  const res = await adminFetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export interface DeleteCascade {
  blocked: boolean;
  reason?: string;
  businesses: string[];
  stores: { storeName: string; businessName: string }[];
  dataSummary: Record<string, number>;
}

export async function getDeleteCascade(userId: string): Promise<DeleteCascade> {
  const res = await adminFetch(`/users/${userId}/cascade`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

export async function createStore(data: {
  email: string;
  fullName: string;
  storeName: string;
  businessType?: string;
  password?: string;
}): Promise<{ userId: string; email: string; fullName: string; tempPassword: string }> {
  const res = await adminFetch("/stores", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to create store");
  return json;
}

export async function deleteStore(userId: string): Promise<void> {
  const res = await adminFetch(`/stores/${userId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Delete failed");
  }
}
