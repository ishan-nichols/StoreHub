/**
 * verifone-commander.ts — Verifone Commander Site Controller integration.
 *
 * Covers ALL Verifone hardware through one connection to Commander:
 *   Ruby | Ruby2 | RubyCi | Topaz | Topaz XL | Sapphire
 *
 * REAL API CONNECTION:
 *   Verifone Commander exposes a SOAP/REST API at the site controller IP.
 *   Replace the placeholder fetch calls below with real Commander API requests:
 *
 *   Base URL:  http://{host}/commander/api/v1
 *   Auth:      Basic Auth — username + password passed in headers
 *   Endpoints:
 *     GET  /transactions?from={date}&to={date}   → sales data
 *     GET  /inventory                             → product catalog + levels
 *     GET  /fuel/sales?date={date}               → fuel transactions by grade
 *     GET  /fuel/tanks                            → current tank levels
 *     GET  /promotions                            → active promotions
 *
 *   NOTE: Commander uses a proprietary XML format for some endpoints.
 *   A real implementation will need an XML parser (e.g., fast-xml-parser).
 *   All async/await structure below is already in place — just swap the bodies.
 *
 * HARDWARE MODEL:
 *   Stored for display purposes only. The API connection is identical
 *   for Ruby, Ruby2, RubyCi, Topaz, Topaz XL, and Sapphire.
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData, PriceUpdatePayload } from "./types";

const SOURCE = "Verifone Commander";

export const verifoneCommander: Integration = {
  id: "verifone",
  name: "Verifone Commander",
  isPetroleum: true,
  supportsPriceSync: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL IMPLEMENTATION:
    // const response = await fetch(`http://${creds.host}/commander/api/v1/inventory`, {
    //   headers: { Authorization: `Basic ${btoa(`${creds.username}:${creds.password}`)}` }
    // });
    // const xml = await response.text();
    // const data = parseXml(xml);
    // return { success: true, data: data.products.map(normalizeProduct), error: null };

    await simulateDelay();
    return {
      success: true,
      data: [
        { id: "vf-001", name: "Regular Gasoline", sku: "FUEL-REG", price: 3.459, quantity: 8500, category: "Fuel", unit: "gallon", source: SOURCE },
        { id: "vf-002", name: "Premium Gasoline", sku: "FUEL-PRM", price: 3.959, quantity: 4200, category: "Fuel", unit: "gallon", source: SOURCE },
        { id: "vf-003", name: "Diesel", sku: "FUEL-DSL", price: 3.799, quantity: 6000, category: "Fuel", unit: "gallon", source: SOURCE },
        { id: "vf-004", name: "Energy Drink 16oz", sku: "BEV-001", price: 3.49, quantity: 48, category: "Beverages", unit: "can", source: SOURCE },
        { id: "vf-005", name: "Hot Dog", sku: "FOOD-001", price: 1.99, quantity: 24, category: "Food Service", unit: "each", source: SOURCE },
      ],
      error: null,
    };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL IMPLEMENTATION:
    // const today = new Date().toISOString().split("T")[0];
    // const response = await fetch(`http://${creds.host}/commander/api/v1/transactions?from=${today}&to=${today}`, {
    //   headers: { Authorization: `Basic ${btoa(`${creds.username}:${creds.password}`)}` }
    // });
    // return normalizeTransactions(await response.json());

    await simulateDelay();
    return {
      success: true,
      data: [
        { id: "vf-sale-001", items: [{ productName: "Regular Gasoline", quantity: 12.5, price: 3.459, total: 43.24 }], total: 43.24, timestamp: new Date().toISOString(), paymentMethod: "Credit", source: SOURCE },
        { id: "vf-sale-002", items: [{ productName: "Energy Drink 16oz", quantity: 2, price: 3.49, total: 6.98 }, { productName: "Hot Dog", quantity: 1, price: 1.99, total: 1.99 }], total: 8.97, timestamp: new Date().toISOString(), paymentMethod: "Cash", source: SOURCE },
      ],
      error: null,
    };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    // REAL IMPLEMENTATION: GET /inventory from Commander
    await simulateDelay();
    return {
      success: true,
      data: [
        { productId: "vf-001", productName: "Regular Gasoline", quantity: 8500, reorderPoint: 2000, source: SOURCE },
        { productId: "vf-004", productName: "Energy Drink 16oz", quantity: 48, reorderPoint: 12, source: SOURCE },
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
    // const today = new Date().toISOString().split("T")[0];
    // const salesResp = await fetch(`http://${creds.host}/commander/api/v1/fuel/sales?date=${today}`, { ... });
    // const tankResp = await fetch(`http://${creds.host}/commander/api/v1/fuel/tanks`, { ... });

    await simulateDelay();
    return {
      success: true,
      data: [
        {
          date: new Date().toISOString().split("T")[0],
          grades: [
            { grade: "Regular", gallonsSold: 842, revenue: 2912.78, tankLevel: 8500, tankCapacity: 12000 },
            { grade: "Plus", gallonsSold: 234, revenue: 889.27, tankLevel: 4200, tankCapacity: 8000 },
            { grade: "Premium", gallonsSold: 156, revenue: 617.60, tankLevel: 3100, tankCapacity: 6000 },
            { grade: "Diesel", gallonsSold: 421, revenue: 1599.38, tankLevel: 6000, tankCapacity: 10000 },
          ],
          totalFuelRevenue: 6019.03,
          totalStoreRevenue: 1842.55,
          source: SOURCE,
        },
      ],
      error: null,
    };
  },

  async pushPriceUpdate(creds: IntegrationCredentials, payload: PriceUpdatePayload): Promise<IntegrationResult<{ queued: boolean }>> {
    // REAL: POST https://{commanderHost}/api/items/price
    //   Body: { upc: payload.barcode || payload.sku, price: payload.newPrice }
    //   Auth: Basic {base64(creds.username:creds.password)}
    void creds; void payload;
    await simulateDelay(400);
    return { success: true, data: { queued: false }, error: null };
  },
};

function simulateDelay(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
