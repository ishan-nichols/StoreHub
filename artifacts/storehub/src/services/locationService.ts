import { API_BASE_URL } from "./dataService";

export interface StoreLocation {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  addressLine1?: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  createdAt: string;
}

const BASE = `${API_BASE_URL}/api/storehub/locations`;
const ACTIVE_KEY = "storehub_active_location";

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
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getLocations(): Promise<StoreLocation[]> {
  return apiFetch<StoreLocation[]>(BASE);
}

export async function createLocation(
  data: Omit<StoreLocation, "id" | "userId" | "createdAt">,
): Promise<StoreLocation> {
  return apiFetch<StoreLocation>(BASE, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateLocation(
  id: string,
  data: Partial<StoreLocation>,
): Promise<StoreLocation> {
  return apiFetch<StoreLocation>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteLocation(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`${BASE}/${id}`, { method: "DELETE" });
}

// ─── Active location (localStorage) ──────────────────────────────────────────

export function getActiveLocationId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveLocationId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, id);
  }
}
