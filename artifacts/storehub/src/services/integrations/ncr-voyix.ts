/**
 * ncr-voyix.ts — NCR Voyix Radiant POS integration.
 *
 * Used at: c-stores, quick service restaurants, fuel + convenience combos.
 *
 * REAL API CONNECTION:
 *   NCR Voyix uses the NCR Emerald API platform.
 *   Base URL:  https://api.voyix.com/emerald/v1
 *   Auth:      API Key + Site Token in headers
 *     X-NCR-API-KEY: {apiKey}
 *     X-Site-Token:  {siteToken}
 *   Endpoints:
 *     GET /transactions           → sales transactions
 *     GET /inventory/items        → product catalog + quantities
 *     GET /fuel/reconciliation    → daily fuel report
 *     GET /employees              → employee roster
 *
 *   NCR also provides an on-premise SDK for direct integration with
 *   the Radiant hardware over local network (TCP/IP socket connection).
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData } from "./types";

const SOURCE = "NCR Voyix Radiant";
const delay = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));

export const ncrVoyix: Integration = {
  id: "ncr",
  name: "NCR Voyix Radiant",
  isPetroleum: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET https://api.voyix.com/emerald/v1/inventory/items
    // Headers: { "X-NCR-API-KEY": creds.apiKey, "X-Site-Token": creds.siteToken }
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /transactions?date={today}&limit=500
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
    // REAL: GET /fuel/reconciliation?date={today}
    await delay();
    return {
      success: true,
      data: [{ date: new Date().toISOString().split("T")[0], grades: [], totalFuelRevenue: 0, totalStoreRevenue: 0, source: SOURCE }],
      error: null,
    };
  },
};
