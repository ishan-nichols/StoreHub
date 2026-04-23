/**
 * integrationService.ts — Universal integration router for StoreHub.
 *
 * This is the ONLY file the rest of the app should import from.
 * The app never calls individual integration files directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND MIGRATION GUIDE (for a backend developer):
 *
 *   Current state: All data fetching happens client-side (browser).
 *   This file talks to stub integration adapters in /services/integrations/.
 *
 *   To migrate to a real backend:
 *   1. Create server-side equivalents of each integration file (same interface)
 *   2. Expose a single endpoint: POST /api/integrations/fetch
 *      Body: { systemId: string, dataType: "products"|"sales"|"inventory"|"employees"|"fuel" }
 *      Server uses stored credentials (env vars / secrets manager) to call the real API
 *      Returns: { success, data, error }
 *   3. Replace the direct integration calls in syncAll() below with fetch() to your endpoint
 *   4. That's it — zero UI changes required
 *
 *   Why this works: The UI only ever calls getProducts(), getSales(), etc. from this file.
 *   Swapping the data source means changing only this file and the server.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ADDING A NEW INTEGRATION:
 *   1. Create /services/integrations/your-system.ts conforming to the Integration interface
 *   2. Import and add it to the REGISTRY below
 *   3. Add a system definition to SYSTEM_DEFINITIONS in IntegrationsPage.tsx
 *   4. Done — the rest of the app picks it up automatically
 */

import type { NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData, IntegrationResult } from "./integrations/types";
import { getCredentials, getConnectionState, saveConnectionState } from "../config/integrations";
import { getProducts as dsGetProducts, createProduct, updateProduct } from "./dataService";
import { verifoneCommander } from "./integrations/verifone-commander";
import { gilbarcoPassport } from "./integrations/gilbarco-passport";
import { wayneNucleus } from "./integrations/wayne-nucleus";
import { ncrVoyix } from "./integrations/ncr-voyix";
import { petrosoft } from "./integrations/petrosoft";
import { square } from "./integrations/square";
import { shopify } from "./integrations/shopify";
import { lightspeed } from "./integrations/lightspeed";
import { clover } from "./integrations/clover";
import { quickbooks } from "./integrations/quickbooks";
import { toast } from "./integrations/toast";

// ─── Integration Registry ────────────────────────────────────────────────────
// To add a new integration: import it and add it here. Nothing else changes.

const REGISTRY = [
  verifoneCommander,
  gilbarcoPassport,
  wayneNucleus,
  ncrVoyix,
  petrosoft,
  square,
  shopify,
  lightspeed,
  clover,
  quickbooks,
  toast,
] as const;

// ─── Normalized Data Cache (in-memory, refreshed on sync) ───────────────────

let cachedProducts: NormalizedProduct[] = [];
let cachedSales: NormalizedSale[] = [];
let cachedInventory: NormalizedInventory[] = [];
let cachedEmployees: NormalizedEmployee[] = [];
let cachedFuelData: FuelData[] = [];

// ─── Public API ──────────────────────────────────────────────────────────────

export function getActiveIntegrationIds(): string[] {
  return REGISTRY.map((r) => r.id).filter((id) => {
    const state = getConnectionState(id);
    return state?.connected === true;
  });
}

export function hasPetroleumIntegration(): boolean {
  return REGISTRY.some((r) => r.isPetroleum && getConnectionState(r.id)?.connected === true);
}

export function getConnectedPetroleumSystem(): string | null {
  const system = REGISTRY.find((r) => r.isPetroleum && getConnectionState(r.id)?.connected === true);
  return system?.name ?? null;
}

export async function getProducts(): Promise<NormalizedProduct[]> {
  return cachedProducts;
}

export async function getSales(): Promise<NormalizedSale[]> {
  return cachedSales;
}

export async function getInventory(): Promise<NormalizedInventory[]> {
  return cachedInventory;
}

export async function getEmployees(): Promise<NormalizedEmployee[]> {
  return cachedEmployees;
}

export async function getFuelData(): Promise<FuelData[]> {
  return cachedFuelData;
}

// ─── Integration → DataService bridge ───────────────────────────────────────
// After a real sync, write the normalized data into the local dataService store
// so that all app pages (Inventory, POS, Reports, etc.) see the synced records.

async function upsertIntegrationProducts(
  normalized: NormalizedProduct[],
  inventoryCounts: NormalizedInventory[],
): Promise<void> {
  if (normalized.length === 0) return;

  // Build a quantity map keyed by the Square variation ID (= NormalizedProduct.id)
  const qtyById = new Map<string, number>(inventoryCounts.map((c) => [c.productId, c.quantity]));

  // Get existing products to avoid duplicates
  const existing = await dsGetProducts();
  const bySku = new Map<string, string>(
    existing.filter((p) => p.sku).map((p) => [p.sku, p.id]),
  );
  const byName = new Map<string, string>(existing.map((p) => [p.name.toLowerCase(), p.id]));

  for (const np of normalized) {
    const qty = qtyById.get(np.id) ?? np.quantity;
    const existingId = (np.sku ? bySku.get(np.sku) : undefined) ?? byName.get(np.name.toLowerCase());

    if (existingId) {
      await updateProduct(existingId, {
        name:     np.name,
        price:    np.price,
        quantity: qty,
        ...(np.category ? { category: np.category } : {}),
      });
    } else {
      const created = await createProduct({
        name:              np.name,
        sku:               np.sku || "",
        category:          np.category || "Uncategorized",
        price:             np.price,
        quantity:          qty,
        lowStockThreshold: 5,
        supplierId:        null,
        unit:              np.unit || "unit",
        tags:              [],
        srp:               np.price,
      });
      // Track newly created so subsequent iterations in the same batch don't duplicate
      if (created.sku) bySku.set(created.sku, created.id);
      byName.set(created.name.toLowerCase(), created.id);
    }
  }
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  systemId: string;
  systemName: string;
  success: boolean;
  error: string | null;
  dataTypes: string[];
}

export async function syncSystem(systemId: string): Promise<SyncResult> {
  const integration = REGISTRY.find((r) => r.id === systemId);
  if (!integration) {
    return { systemId, systemName: systemId, success: false, error: "System not found", dataTypes: [] };
  }

  const creds = getCredentials(systemId);
  const dataTypes: string[] = [];

  try {
    const [products, sales, inventory, employees] = await Promise.all([
      integration.getProducts(creds),
      integration.getSales(creds),
      integration.getInventory(creds),
      integration.getEmployees(creds),
    ]);

    if (products.success && products.data) {
      cachedProducts = [...cachedProducts.filter((p) => p.source !== integration.name), ...products.data];
      dataTypes.push("products");
    }
    if (sales.success && sales.data) {
      cachedSales = [...cachedSales.filter((s) => s.source !== integration.name), ...sales.data];
      dataTypes.push("sales");
    }
    if (inventory.success && inventory.data) {
      cachedInventory = [...cachedInventory.filter((i) => i.source !== integration.name), ...inventory.data];
      dataTypes.push("inventory");
    }
    if (employees.success && employees.data) {
      cachedEmployees = [...cachedEmployees.filter((e) => e.source !== integration.name), ...employees.data];
      dataTypes.push("employees");
    }

    // ── Bridge: write synced products/inventory into the local data store ──
    // This is what makes the synced data appear in Inventory, POS, Reports, etc.
    if (products.success && products.data && products.data.length > 0) {
      await upsertIntegrationProducts(
        products.data,
        inventory.success && inventory.data ? inventory.data : [],
      );
      // Notify all pages that are currently mounted to reload their product lists.
      window.dispatchEvent(new CustomEvent("storehub:products-updated"));
    }

    if (integration.isPetroleum) {
      const fuelResult = await integration.getFuelData(creds);
      if (fuelResult?.success && fuelResult.data) {
        cachedFuelData = [...cachedFuelData.filter((f) => f.source !== integration.name), ...fuelResult.data];
        dataTypes.push("fuel");
      }
    }

    const state = getConnectionState(systemId);
    if (state) {
      saveConnectionState({ ...state, lastSynced: new Date().toISOString(), error: null });
    }

    return { systemId, systemName: integration.name, success: true, error: null, dataTypes };
  } catch (err) {
    const errorMsg = "Connection failed. Please check your credentials and try again.";
    const state = getConnectionState(systemId);
    if (state) {
      saveConnectionState({ ...state, error: errorMsg });
    }
    return { systemId, systemName: integration.name, success: false, error: errorMsg, dataTypes: [] };
  }
}

export async function syncAll(): Promise<SyncResult[]> {
  const activeIds = getActiveIntegrationIds();
  if (activeIds.length === 0) return [];

  const results = await Promise.all(activeIds.map((id) => syncSystem(id)));
  return results;
}

export function addCSVProducts(products: NormalizedProduct[]): void {
  cachedProducts = [...cachedProducts.filter((p) => p.source !== "CSV Import"), ...products];
}

export function addCSVSales(sales: NormalizedSale[]): void {
  cachedSales = [...cachedSales.filter((s) => s.source !== "CSV Import"), ...sales];
}

// ─── Two-way price sync ──────────────────────────────────────────────────────

export interface PriceSyncResult {
  success: boolean;
  notConnected?: boolean;
  pushedTo: string[];
  queuedFor: string[];
  failedFor: { name: string; error: string }[];
  error?: string;
}

/**
 * Push a price update to all connected POS systems that support two-way sync.
 * Read-only integrations (no pushPriceUpdate) are queued for manual confirmation.
 */
export async function pushPriceUpdate(
  productId: string,
  newPrice: number,
  sku: string,
  barcode?: string,
): Promise<PriceSyncResult> {
  const activeIds = getActiveIntegrationIds();
  if (activeIds.length === 0) {
    return { success: true, notConnected: true, pushedTo: [], queuedFor: [], failedFor: [] };
  }

  const pushedTo: string[] = [];
  const queuedFor: string[] = [];
  const failedFor: { name: string; error: string }[] = [];

  for (const id of activeIds) {
    const integration = REGISTRY.find((r) => r.id === id);
    if (!integration) continue;
    if (!integration.pushPriceUpdate) {
      queuedFor.push(integration.name);
      continue;
    }
    try {
      const creds = getCredentials(id);
      const result = await integration.pushPriceUpdate(creds, { productId, newPrice, sku, barcode });
      if (result.success) pushedTo.push(integration.name);
      else failedFor.push({ name: integration.name, error: result.error ?? "Unknown error" });
    } catch (err) {
      failedFor.push({ name: integration.name, error: err instanceof Error ? err.message : "Push failed" });
    }
  }

  return {
    success: failedFor.length === 0,
    pushedTo,
    queuedFor,
    failedFor,
    error: failedFor.length > 0 ? failedFor[0].error : undefined,
  };
}
