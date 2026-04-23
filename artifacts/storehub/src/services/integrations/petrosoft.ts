/**
 * petrosoft.ts — Petrosoft CStoreOffice integration.
 *
 * Used at: independent gas stations and c-stores.
 * CStoreOffice is a cloud-based back-office solution for petroleum retail.
 *
 * REAL API CONNECTION:
 *   Petrosoft provides a REST API for CStoreOffice data access.
 *   Base URL:  https://api.cstoreoffice.com/v2
 *   Auth:      API Key in Authorization header
 *     Authorization: Bearer {apiKey}
 *   Endpoints:
 *     GET /stores/{storeId}/sales           → daily sales by department
 *     GET /stores/{storeId}/fuel            → fuel sales + reconciliation
 *     GET /stores/{storeId}/inventory       → inventory count data
 *     GET /stores/{storeId}/tanks           → ATG readings
 *     GET /stores/{storeId}/pricebook       → product catalog with prices
 *
 *   Contact: partner@petrosoft.com for API access credentials.
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData } from "./types";

const SOURCE = "Petrosoft CStoreOffice";
const delay = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));

export const petrosoft: Integration = {
  id: "petrosoft",
  name: "Petrosoft CStoreOffice",
  isPetroleum: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET https://api.cstoreoffice.com/v2/stores/{creds.storeId}/pricebook
    // Authorization: Bearer {creds.apiKey}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /stores/{creds.storeId}/sales?date={today}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(_creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData(creds: IntegrationCredentials): Promise<IntegrationResult<FuelData[]>> {
    // REAL: GET /stores/{creds.storeId}/fuel?date={today}
    // Returns: fuel_grades[], gallons_sold, book_inventory, physical_inventory, variance
    await delay();
    return {
      success: true,
      data: [{ date: new Date().toISOString().split("T")[0], grades: [], totalFuelRevenue: 0, totalStoreRevenue: 0, source: SOURCE }],
      error: null,
    };
  },
};
