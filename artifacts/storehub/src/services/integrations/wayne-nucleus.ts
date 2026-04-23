/**
 * wayne-nucleus.ts — Wayne Nucleus POS integration (Dover Fueling Solutions).
 *
 * Used at: branded fuel retailers, major petroleum chains.
 *
 * REAL API CONNECTION:
 *   Wayne Nucleus uses a REST API through the Dover Fueling Cloud platform.
 *   Base URL:  https://api.doverfuelingsolutions.com/nucleus/v1
 *   Auth:      OAuth 2.0 client credentials flow
 *     POST /oauth/token → { access_token } (client_id + client_secret)
 *   Endpoints:
 *     GET /sites/{siteId}/transactions  → sales
 *     GET /sites/{siteId}/inventory     → product levels
 *     GET /sites/{siteId}/fuel          → fuel sales by grade
 *     GET /sites/{siteId}/tanks         → ATG tank data
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, FuelData } from "./types";

const SOURCE = "Wayne Nucleus";
const delay = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));

export const wayneNucleus: Integration = {
  id: "wayne",
  name: "Wayne Nucleus",
  isPetroleum: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET /sites/{creds.siteId}/inventory with Bearer token from OAuth flow
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /sites/{creds.siteId}/transactions?date={today}
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
    // REAL: GET /sites/{creds.siteId}/fuel?date={today}
    await delay();
    return {
      success: true,
      data: [{
        date: new Date().toISOString().split("T")[0],
        grades: [],
        totalFuelRevenue: 0,
        totalStoreRevenue: 0,
        source: SOURCE,
      }],
      error: null,
    };
  },
};
