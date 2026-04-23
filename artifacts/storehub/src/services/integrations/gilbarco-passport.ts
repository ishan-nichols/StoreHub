/**
 * gilbarco-passport.ts — Gilbarco Passport POS integration.
 *
 * Used at: high-volume gas stations, truck stops, cardlocks.
 *
 * REAL API CONNECTION:
 *   Gilbarco provides cloud-based APIs through their Insite360 platform.
 *   Replace the placeholder fetch calls below with real API requests:
 *
 *   Base URL:  https://api.gilbarco.com/insite360/v2
 *   Auth:      API Key in X-API-Key header
 *   Endpoints:
 *     GET  /accounts/{accountId}/stores/{storeId}/sales      → transactions
 *     GET  /accounts/{accountId}/stores/{storeId}/inventory  → product levels
 *     GET  /accounts/{accountId}/stores/{storeId}/fuel       → fuel reconciliation
 *     GET  /accounts/{accountId}/stores/{storeId}/tanks      → ATG tank readings
 *     GET  /accounts/{accountId}/employees                   → employee roster
 *
 *   Gilbarco uses JWT for some endpoints — check the Insite360 developer portal
 *   for the full OAuth flow: POST /auth/token → { access_token, expires_in }
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData, PriceUpdatePayload } from "./types";

const SOURCE = "Gilbarco Passport";

export const gilbarcoPassport: Integration = {
  id: "gilbarco",
  name: "Gilbarco Passport",
  isPetroleum: true,
  supportsPriceSync: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL IMPLEMENTATION:
    // const resp = await fetch(
    //   `https://api.gilbarco.com/insite360/v2/accounts/${creds.accountId}/stores/${creds.storeId}/inventory`,
    //   { headers: { "X-API-Key": creds.apiKey, "Content-Type": "application/json" } }
    // );
    // if (!resp.ok) return { success: false, data: null, error: "Gilbarco API error: " + resp.status };
    // const json = await resp.json();
    // return { success: true, data: json.items.map(normalizeProduct), error: null };

    await simulateDelay();
    return {
      success: true,
      data: [
        { id: "gp-001", name: "Unleaded 87", sku: "FUEL-87", price: 3.499, quantity: 9200, category: "Fuel", unit: "gallon", source: SOURCE },
        { id: "gp-002", name: "Diesel #2", sku: "FUEL-D2", price: 3.849, quantity: 7100, category: "Fuel", unit: "gallon", source: SOURCE },
        { id: "gp-003", name: "Coffee 16oz", sku: "BEV-COF", price: 1.99, quantity: 60, category: "Beverages", unit: "cup", source: SOURCE },
      ],
      error: null,
    };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL IMPLEMENTATION:
    // const today = new Date().toISOString().split("T")[0];
    // const resp = await fetch(
    //   `https://api.gilbarco.com/insite360/v2/accounts/${creds.accountId}/stores/${creds.storeId}/sales?date=${today}`,
    //   { headers: { "X-API-Key": creds.apiKey } }
    // );

    await simulateDelay();
    return {
      success: true,
      data: [
        { id: "gp-sale-001", items: [{ productName: "Unleaded 87", quantity: 15.3, price: 3.499, total: 53.54 }], total: 53.54, timestamp: new Date().toISOString(), paymentMethod: "Card at Pump", source: SOURCE },
      ],
      error: null,
    };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    await simulateDelay();
    return {
      success: true,
      data: [
        { productId: "gp-001", productName: "Unleaded 87", quantity: 9200, reorderPoint: 2500, source: SOURCE },
        { productId: "gp-002", productName: "Diesel #2", quantity: 7100, reorderPoint: 3000, source: SOURCE },
      ],
      error: null,
    };
  },

  async getEmployees(_creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    await simulateDelay();
    return { success: true, data: [], error: null };
  },

  async getFuelData(creds: IntegrationCredentials): Promise<IntegrationResult<FuelData[]>> {
    // REAL IMPLEMENTATION:
    // GET /accounts/{accountId}/stores/{storeId}/fuel?date={today}
    // Returns fuel reconciliation report — gallons sold, ATG tank readings, etc.

    await simulateDelay();
    return {
      success: true,
      data: [
        {
          date: new Date().toISOString().split("T")[0],
          grades: [
            { grade: "Unleaded 87", gallonsSold: 1102, revenue: 3856.90, tankLevel: 9200, tankCapacity: 15000 },
            { grade: "Diesel #2", gallonsSold: 612, revenue: 2355.49, tankLevel: 7100, tankCapacity: 12000 },
          ],
          totalFuelRevenue: 6212.39,
          totalStoreRevenue: 2104.88,
          source: SOURCE,
        },
      ],
      error: null,
    };
  },

  async pushPriceUpdate(creds: IntegrationCredentials, payload: PriceUpdatePayload): Promise<IntegrationResult<{ queued: boolean }>> {
    // REAL: POST https://{passportHost}/api/v1/items/{upc}/price
    //   Body: { price: payload.newPrice }
    //   Auth: Bearer {creds.apiKey}
    void creds; void payload;
    await simulateDelay(450);
    return { success: true, data: { queued: false }, error: null };
  },
};

function simulateDelay(ms = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
