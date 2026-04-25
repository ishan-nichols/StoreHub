/**
 * cloudSync.ts — Bridges localStorage with the /api/store/* backend.
 *
 * Strategy:
 *   • App boot in cloud mode → pull everything from server → overwrite localStorage.
 *   • localStorage stays the in-app source of truth (so no UI changes are needed).
 *   • After every write to localStorage, an auto-push schedules a debounced
 *     replace-collection sync to the cloud.
 *
 * This is intentionally simple (last-write-wins, no conflict resolution).
 * For multi-device editing later, switch to per-row PATCH/POST/DELETE diffs.
 */

import { API_BASE_URL } from "./dataService";
import { isCloudMode } from "./storageMode";

const BASE = `${API_BASE_URL}/api/store`;

interface KeyMap {
  endpoint: string;
  storageKey: string;
  type: "collection" | "single";
}

export const SYNCED_KEYS: Record<string, KeyMap> = {
  storehub_user_profile:        { endpoint: "profile",            storageKey: "storehub_user_profile",        type: "single"     },
  storehub_products:            { endpoint: "products",           storageKey: "storehub_products",            type: "collection" },
  storehub_sales:               { endpoint: "sales",              storageKey: "storehub_sales",               type: "collection" },
  storehub_expenses:            { endpoint: "expenses",           storageKey: "storehub_expenses",            type: "collection" },
  storehub_suppliers:           { endpoint: "suppliers",          storageKey: "storehub_suppliers",           type: "collection" },
  storehub_employees:           { endpoint: "employees",          storageKey: "storehub_employees",           type: "collection" },
  storehub_shifts:              { endpoint: "shifts",             storageKey: "storehub_shifts",              type: "collection" },
  storehub_recurring_expenses:  { endpoint: "recurring-expenses", storageKey: "storehub_recurring_expenses",  type: "collection" },
  storehub_scheduled_prices:    { endpoint: "scheduled-prices",   storageKey: "storehub_scheduled_prices",    type: "collection" },
};

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

// ─── Pull (cloud → local) ──────────────────────────────────────────────────

export async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const map of Object.values(SYNCED_KEYS)) {
      const res = await authedFetch(`/${map.endpoint}`);
      if (!res.ok) {
        if (res.status === 401) return { ok: false, error: "Not signed in" };
        continue;
      }
      const data = await res.json();
      if (data == null) {
        if (map.type === "single") localStorage.removeItem(map.storageKey);
        else localStorage.setItem(map.storageKey, "[]");
      } else {
        localStorage.setItem(map.storageKey, JSON.stringify(data));
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
      const r = localStorage.getItem(key);
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

// ─── Per-key debounced auto-push (replace-collection semantics) ────────────

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 600;

function scheduleSync(storageKey: string): void {
  if (!isCloudMode()) return;
  const map = SYNCED_KEYS[storageKey];
  if (!map) return;

  const existing = pending.get(storageKey);
  if (existing) clearTimeout(existing);

  pending.set(storageKey, setTimeout(() => {
    pending.delete(storageKey);
    void pushKey(storageKey);
  }, DEBOUNCE_MS));
}

async function pushKey(storageKey: string): Promise<void> {
  const map = SYNCED_KEYS[storageKey];
  if (!map) return;
  const raw = localStorage.getItem(storageKey);

  if (map.type === "single") {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      await authedFetch(`/${map.endpoint}`, { method: "PUT", body: JSON.stringify(parsed) });
    } catch (e) {
      console.warn("[cloudSync] push single failed:", storageKey, e);
    }
    return;
  }

  // Collection → atomic delete-and-replace via /replace/:entity
  try {
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return;
    const entity = endpointToEntity(map.endpoint);
    await authedFetch(`/replace/${entity}`, { method: "POST", body: JSON.stringify({ items }) });
  } catch (e) {
    console.warn("[cloudSync] push collection failed:", storageKey, e);
  }
}

function endpointToEntity(endpoint: string): string {
  switch (endpoint) {
    case "recurring-expenses": return "recurringExpenses";
    case "scheduled-prices":   return "scheduledPriceChanges";
    default:                   return endpoint;
  }
}

// ─── Wire to localStorage writes via custom event ──────────────────────────

const ORIGINAL_SET = localStorage.setItem.bind(localStorage);
const ORIGINAL_REMOVE = localStorage.removeItem.bind(localStorage);

export function installAutoPush(): void {
  // Patch setItem/removeItem so we can detect writes to synced keys.
  // (idempotent: only patch once)
  if ((localStorage.setItem as unknown as { __sh_patched?: boolean }).__sh_patched) return;

  const patchedSet = function (this: Storage, k: string, v: string) {
    ORIGINAL_SET(k, v);
    if (SYNCED_KEYS[k]) scheduleSync(k);
  };
  (patchedSet as unknown as { __sh_patched: boolean }).__sh_patched = true;
  localStorage.setItem = patchedSet;

  const patchedRemove = function (this: Storage, k: string) {
    ORIGINAL_REMOVE(k);
    if (SYNCED_KEYS[k]) scheduleSync(k);
  };
  localStorage.removeItem = patchedRemove;
}
