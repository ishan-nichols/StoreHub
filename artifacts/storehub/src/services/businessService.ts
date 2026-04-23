import { API_BASE_URL } from "./dataService";

const BASE = `${API_BASE_URL}/api/businesses`;

async function biz(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });
}

export interface BusinessInfo {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  businessOwnerId: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface BusinessStore {
  userId: string;
  storeName: string;
  ownerName: string;
  businessType: string;
  onboardingCompleted: boolean;
  storageMode: string;
  storeCity: string | null;
  createdAt: string;
  lastUpdated: string;
  revenue: number;
  productCount: number;
  employeeCount: number;
}

export interface BusinessStats {
  totalStores: number;
  totalRevenue: number;
  totalProducts: number;
  totalEmployees: number;
  stores: BusinessStore[];
}

export async function getMyBusiness(): Promise<BusinessInfo | null> {
  const res = await biz("/");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch business");
  const list: BusinessInfo[] = data.businesses ?? [];
  return list[0] ?? null;
}

export async function getBusinessStats(businessId: string): Promise<BusinessStats> {
  const res = await biz(`/${businessId}/stats`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch stats");
  return data;
}

export async function updateBusiness(
  businessId: string,
  patch: { name?: string; description?: string; website?: string }
): Promise<BusinessInfo> {
  const res = await biz(`/${businessId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update");
  return data.business;
}

export async function createStoreUnderBusiness(
  businessId: string,
  payload: { email: string; fullName: string; storeName: string; businessType?: string }
): Promise<{ userId: string; email: string; fullName: string; tempPassword: string; message: string }> {
  const res = await biz(`/${businessId}/stores`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create store");
  return data;
}
