/**
 * cloudSync.ts — Bridges localStorage with the /api/storehub/* backend.
 *
 * Strategy:
 *   • App boot → pull everything from server → overwrite localStorage.
 *   • localStorage is the in-app read cache; the DB is the source of truth.
 *   • Auto-push is ONLY used for the user profile (single value).
 *     Collections are synced exclusively via direct API calls in dataService.ts
 *     (createEmployee, updateEmployee, deleteEmployee, etc.) to avoid the
 *     catastrophic "delete-all then re-insert from stale localStorage" pattern.
 */

import { API_BASE_URL } from "./dataService";
import { isCloudMode } from "./storageMode";

const BASE = `${API_BASE_URL}/api/storehub`;
const ACTIVE_STORE_KEY = "sh_active_store_id";

// Version key — bump this to force-clear stale localStorage collections on next boot.
const LS_CACHE_VERSION_KEY = "sh_ls_cache_v";
const LS_CACHE_VERSION = "2";

// Keys that get cleared when the cache version changes.
const COLLECTION_LS_PREFIXES = [
  "storehub_employees",
  "storehub_products",
  "storehub_sales",
  "storehub_expenses",
  "storehub_suppliers",
  "storehub_shifts",
  "storehub_recurring_expenses",
  "storehub_scheduled_prices",
];

/** Clear any stale collection data if the cache version changed. */
export function clearStaleLocalStorage(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LS_CACHE_VERSION_KEY) === LS_CACHE_VERSION) return;
  for (const key of Object.keys(localStorage)) {
    if (COLLECTION_LS_PREFIXES.some((p) => key === p || key.startsWith(p + "_"))) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem(LS_CACHE_VERSION_KEY, LS_CACHE_VERSION);
}

function getScopedStorageKey(key: string): string {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem(ACTIVE_STORE_KEY) : null;
  return activeStoreId ? `${key}_${activeStoreId}` : key;
}

/** Only the profile is auto-pushed. Collections are managed via direct CRUD calls. */
const PROFILE_KEY = "storehub_user_profile";

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const storeId = sessionStorage.getItem("sh_active_store_id");
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(storeId ? { "X-Store-User-Id": storeId } : {}),
      ...init?.headers,
    },
    ...init,
  });
}

// ─── Pull (cloud → local cache) ────────────────────────────────────────────
// Always OVERWRITES localStorage with server data — no merging.
// Merging stale local data back into localStorage would trigger the auto-push
// and corrupt the DB with old duplicated records.

const PULL_ENDPOINTS: Array<{ endpoint: string; storageKey: string; type: "single" | "collection" }> = [
  { endpoint: "profile",            storageKey: "storehub_user_profile",        type: "single"     },
  { endpoint: "sales",              storageKey: "storehub_sales",               type: "collection" },
  { endpoint: "expenses",           storageKey: "storehub_expenses",            type: "collection" },
  { endpoint: "suppliers",          storageKey: "storehub_suppliers",           type: "collection" },
  { endpoint: "employees",          storageKey: "storehub_employees",           type: "collection" },
  { endpoint: "shifts",             storageKey: "storehub_shifts",              type: "collection" },
  { endpoint: "recurring-expenses", storageKey: "storehub_recurring_expenses",  type: "collection" },
  { endpoint: "scheduled-prices",   storageKey: "storehub_scheduled_prices",    type: "collection" },
];

export async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const map of PULL_ENDPOINTS) {
      const res = await authedFetch(`/${map.endpoint}`);
      if (!res.ok) {
        if (res.status === 401) return { ok: false, error: "Not signed in" };
        continue;
      }
      const data = await res.json();
      const storageKey = getScopedStorageKey(map.storageKey);
      if (data == null) {
        if (map.type === "single") {
          ORIGINAL_REMOVE(storageKey);
        }
        // For collections, null from server means leave local cache alone.
      } else {
        // Always overwrite — server is the source of truth.
        // Use ORIGINAL_SET so this write does NOT trigger the auto-push.
        ORIGINAL_SET(storageKey, JSON.stringify(data));
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Push entire local state (one-time migration) ──────────────────────────

export async function pushSnapshot(): Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }> {
  try {
    const profileRaw = localStorage.getItem("storehub_user_profile");
    const profile = profileRaw ? JSON.parse(profileRaw) : null;

    function arr(key: string): unknown[] {
      const r = localStorage.getItem(getScopedStorageKey(key));
      try { return r ? JSON.parse(r) : []; } catch { return []; }
    }

    const body = {
      profile,
      products:              arr("storehub_products"),
      sales:                 arr("storehub_sales"),
      expenses:              arr("storehub_expenses"),
      suppliers:             arr("storehub_suppliers"),
      employees:             arr("storehub_employees"),
      shifts:                arr("storehub_shifts"),
      recurringExpenses:     arr("storehub_recurring_expenses"),
      scheduledPriceChanges: arr("storehub_scheduled_prices"),
    };

    const res = await authedFetch("/migrate", { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Migration failed" };
    return { ok: true, counts: data.counts };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Auto-push: profile only ───────────────────────────────────────────────
// Collections are intentionally excluded — they are managed via individual
// CRUD API calls (POST/PATCH/DELETE) in dataService.ts.

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 800;

function scheduleProfileSync(): void {
  if (!isCloudMode() && !sessionStorage.getItem(ACTIVE_STORE_KEY)) return;

  const existing = pending.get(PROFILE_KEY);
  if (existing) clearTimeout(existing);

  pending.set(PROFILE_KEY, setTimeout(() => {
    pending.delete(PROFILE_KEY);
    void pushProfile();
  }, DEBOUNCE_MS));
}

async function pushProfile(): Promise<void> {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    await authedFetch("/profile", { method: "PUT", body: JSON.stringify(parsed) });
  } catch (e) {
    console.warn("[cloudSync] push profile failed:", e);
  }
}

// ─── Wire to localStorage writes via custom event ──────────────────────────

const ORIGINAL_SET = localStorage.setItem.bind(localStorage);
const ORIGINAL_REMOVE = localStorage.removeItem.bind(localStorage);

export function installAutoPush(): void {
  if ((localStorage.setItem as unknown as { __sh_patched?: boolean }).__sh_patched) return;

  const patchedSet = function (this: Storage, k: string, v: string) {
    ORIGINAL_SET(k, v);
    if (k === PROFILE_KEY) scheduleProfileSync();
  };
  (patchedSet as unknown as { __sh_patched: boolean }).__sh_patched = true;
  localStorage.setItem = patchedSet;

  const patchedRemove = function (this: Storage, k: string) {
    ORIGINAL_REMOVE(k);
  };
  localStorage.removeItem = patchedRemove;
}

// Keep SYNCED_KEYS exported for any external callers that still reference it.
export const SYNCED_KEYS: Record<string, { endpoint: string; storageKey: string; type: "collection" | "single" }> = {
  storehub_user_profile: { endpoint: "profile", storageKey: "storehub_user_profile", type: "single" },
};
