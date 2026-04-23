/**
 * square.ts — Square POS integration (production + sandbox).
 *
 * Environment is detected automatically from the access token:
 *   token starts with "EAAAl" → sandbox  (connect.squareupsandbox.com)
 *   anything else             → production (connect.squareup.com)
 *
 * All Square calls are proxied through /api/square/proxy on the API server.
 * The browser never sends the token directly to Square — the server does.
 * The rest of the app sees identical NormalizedProduct / NormalizedSale / etc.
 * regardless of which environment is active.
 *
 * Credentials stored via integrations config:
 *   accessToken  — OAuth access token (or personal access token)
 *   locationId   — Square location ID (required for inventory / orders)
 */

import type {
  Integration,
  IntegrationCredentials,
  IntegrationResult,
  NormalizedProduct,
  NormalizedSale,
  NormalizedInventory,
  NormalizedEmployee,
  PriceUpdatePayload,
} from "./types";

// ── Config ────────────────────────────────────────────────────────────────────

const SOURCE = "Square";

// Resolve proxy URL — same as API_BASE_URL in dataService, re-derived here
// to avoid a circular import between the integration layer and the data layer.
function proxyBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string) ?? "";
}

// ── Core proxy helper ─────────────────────────────────────────────────────────

async function squareCall<T = unknown>(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${proxyBase()}/api/square/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, path, method, body }),
    credentials: "include",
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Square proxy error ${res.status}`);
  }
  return data;
}

// Paginated GET — collects all pages for endpoints that use cursor-based pagination.
async function squareGetAll<T>(
  token: string,
  path: string,
  itemsKey: string,
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined;

  do {
    const url = cursor ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : path;
    const page = await squareCall<Record<string, unknown>>(token, url);
    const items = (page[itemsKey] as T[] | undefined) ?? [];
    results.push(...items);
    cursor = page.cursor as string | undefined;
  } while (cursor);

  return results;
}

// ── Data normalizers ──────────────────────────────────────────────────────────

interface SquareMoney { amount: number; currency: string }
interface SquareCatalogVariation {
  id: string;
  type: string;
  item_variation_data?: {
    name?: string;
    sku?: string;
    price_money?: SquareMoney;
    location_overrides?: Array<{ location_id: string; price_money?: SquareMoney }>;
  };
}
interface SquareCatalogObject {
  id: string;
  type: string;
  item_data?: {
    name?: string;
    category_id?: string;
    variations?: SquareCatalogVariation[];
  };
  category_data?: { name?: string };
}
interface SquareLineItem {
  name?: string;
  quantity?: string;
  base_price_money?: SquareMoney;
  total_money?: SquareMoney;
}
interface SquareOrder {
  id: string;
  created_at?: string;
  line_items?: SquareLineItem[];
  total_money?: SquareMoney;
  tenders?: Array<{ type?: string }>;
}
interface SquareInventoryCount {
  catalog_object_id: string;
  quantity?: string;
}
interface SquareTeamMember {
  id: string;
  display_name?: string;
  given_name?: string;
  family_name?: string;
  status?: string;
  job_title?: string;
}

function centsToAmount(money: SquareMoney | undefined): number {
  if (!money) return 0;
  return money.amount / 100;
}

function normalizeProducts(objects: SquareCatalogObject[], locationId: string): NormalizedProduct[] {
  const out: NormalizedProduct[] = [];

  for (const obj of objects) {
    if (obj.type !== "ITEM" || !obj.item_data) continue;
    const { name = "Unnamed", variations = [] } = obj.item_data;

    // Only append variation name when there are truly multiple meaningful variants.
    // Single-variation items (or items where all variants are "Regular"/"Default")
    // should just use the item name directly.
    const GENERIC_VARIATION_NAMES = new Set(["regular", "default", "standard", "normal", "one size"]);
    const meaningfulVariations = variations.filter(
      (v) =>
        v.type === "ITEM_VARIATION" &&
        v.item_variation_data &&
        !GENERIC_VARIATION_NAMES.has((v.item_variation_data.name ?? "").toLowerCase()),
    );
    const useVariationSuffix = meaningfulVariations.length > 1;

    for (const variation of variations) {
      if (variation.type !== "ITEM_VARIATION" || !variation.item_variation_data) continue;
      const vd = variation.item_variation_data;

      // Use location-specific price if available, fall back to global price.
      const locationPrice = vd.location_overrides?.find((o) => o.location_id === locationId)?.price_money;
      const price = centsToAmount(locationPrice ?? vd.price_money);

      const isGeneric = GENERIC_VARIATION_NAMES.has((vd.name ?? "").toLowerCase());
      const varName = useVariationSuffix && !isGeneric ? `${name} — ${vd.name}` : name;

      out.push({
        id:       variation.id,
        name:     varName,
        sku:      vd.sku ?? "",
        price,
        quantity: 0, // populated separately from inventory counts
        category: "", // category name resolved below via catalog objects
        unit:     "unit",
        source:   SOURCE,
      });
    }
  }

  return out;
}

function normalizeSales(orders: SquareOrder[]): NormalizedSale[] {
  return orders.map((order) => ({
    id:            order.id,
    items:         (order.line_items ?? []).map((li) => ({
      productName: li.name ?? "",
      quantity:    parseFloat(li.quantity ?? "1"),
      price:       centsToAmount(li.base_price_money),
      total:       centsToAmount(li.total_money),
    })),
    total:         centsToAmount(order.total_money),
    timestamp:     order.created_at ?? new Date().toISOString(),
    paymentMethod: order.tenders?.[0]?.type ?? undefined,
    source:        SOURCE,
  }));
}

function normalizeInventory(counts: SquareInventoryCount[]): NormalizedInventory[] {
  return counts.map((c) => ({
    productId:    c.catalog_object_id,
    productName:  "",  // filled in by the UI layer from the product list
    quantity:     parseFloat(c.quantity ?? "0"),
    reorderPoint: 0,
    source:       SOURCE,
  }));
}

function normalizeEmployees(members: SquareTeamMember[]): NormalizedEmployee[] {
  return members
    .filter((m) => m.status !== "INACTIVE")
    .map((m) => ({
      id:     m.id,
      name:   m.display_name ?? ([m.given_name, m.family_name].filter(Boolean).join(" ") || "Unknown"),
      role:   m.job_title ?? "Team Member",
      source: SOURCE,
    }));
}

// ── Integration object ────────────────────────────────────────────────────────

export const square: Integration = {
  id:   "square",
  name: SOURCE,
  isPetroleum:     false,
  supportsPriceSync: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    const { accessToken: token, locationId = "" } = creds;
    if (!token) return { success: false, data: null, error: "Access token not configured" };

    try {
      // Fetch all ITEM and ITEM_VARIATION catalog objects in one paginated sweep.
      const objects = await squareGetAll<SquareCatalogObject>(
        token,
        "/catalog/list?types=ITEM,ITEM_VARIATION,CATEGORY",
        "objects",
      );
      const products = normalizeProducts(objects, locationId);
      return { success: true, data: products, error: null };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    const { accessToken: token, locationId } = creds;
    if (!token) return { success: false, data: null, error: "Access token not configured" };
    if (!locationId) return { success: false, data: null, error: "Location ID not configured" };

    try {
      // Last 30 days of closed orders.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const response = await squareCall<{ orders?: SquareOrder[] }>(
        token,
        "/orders/search",
        "POST",
        {
          location_ids: [locationId],
          query: {
            filter: {
              state_filter: { states: ["COMPLETED"] },
              date_time_filter: { closed_at: { start_at: since } },
            },
          },
          limit: 500,
        },
      );
      const sales = normalizeSales(response.orders ?? []);
      return { success: true, data: sales, error: null };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    const { accessToken: token, locationId } = creds;
    if (!token) return { success: false, data: null, error: "Access token not configured" };
    if (!locationId) return { success: false, data: null, error: "Location ID not configured" };

    try {
      // Square requires POST for inventory batch-retrieve with cursor pagination.
      const allCounts: SquareInventoryCount[] = [];
      let cursor: string | undefined;

      do {
        const page = await squareCall<{ counts?: SquareInventoryCount[]; cursor?: string }>(
          token,
          "/inventory/batch-retrieve-counts",
          "POST",
          { location_ids: [locationId], ...(cursor ? { cursor } : {}) },
        );
        allCounts.push(...(page.counts ?? []));
        cursor = page.cursor;
      } while (cursor);

      return { success: true, data: normalizeInventory(allCounts), error: null };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async getEmployees(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    const { accessToken: token, locationId } = creds;
    if (!token) return { success: false, data: null, error: "Access token not configured" };

    try {
      const response = await squareCall<{ team_members?: SquareTeamMember[] }>(
        token,
        "/team-members/search",
        "POST",
        locationId
          ? { query: { filter: { location_ids: [locationId] } } }
          : {},
      );
      const employees = normalizeEmployees(response.team_members ?? []);
      return { success: true, data: employees, error: null };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async getFuelData() {
    return null; // Square is not a petroleum system
  },

  async pushPriceUpdate(
    creds: IntegrationCredentials,
    payload: PriceUpdatePayload,
  ): Promise<IntegrationResult<{ queued: boolean }>> {
    const { accessToken: token } = creds;
    if (!token) return { success: false, data: null, error: "Access token not configured" };
    if (!payload.productId) return { success: false, data: null, error: "Product ID (variation ID) required" };

    try {
      // Square price updates use the catalog upsert endpoint.
      // The productId stored on our side should be the Square item_variation ID.
      await squareCall(token, "/catalog/object", "PUT", {
        idempotency_key: `price-${payload.productId}-${Date.now()}`,
        object: {
          type: "ITEM_VARIATION",
          id:   payload.productId,
          item_variation_data: {
            price_money: {
              amount:   Math.round(payload.newPrice * 100), // Square uses cents
              currency: "USD",
            },
          },
        },
      });
      return { success: true, data: { queued: false }, error: null };
    } catch (err) {
      return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
