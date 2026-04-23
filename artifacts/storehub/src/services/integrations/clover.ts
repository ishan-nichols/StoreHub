/**
 * clover.ts — Clover POS integration.
 *
 * Used at: restaurants, cafes, quick service, retail.
 *
 * REAL API CONNECTION:
 *   Base URL:  https://api.clover.com/v3/merchants/{merchantId}
 *   Auth:      Authorization: Bearer {accessToken}
 *   Endpoints:
 *     GET  /items               → product catalog
 *     GET  /orders              → sales transactions
 *     GET  /inventory/items     → inventory quantities
 *     GET  /employees           → employee roster
 *     GET  /shifts              → employee shift records
 *
 *   OAuth (required for published apps):
 *     https://sandbox.dev.clover.com/oauth/v2/authorize
 *     POST /oauth/v2/token → { access_token }
 *
 *   Webhooks: configure at https://www.clover.com/developers for real-time events
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee } from "./types";

const SOURCE = "Clover";
const delay = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

export const clover: Integration = {
  id: "clover",
  name: "Clover",
  isPetroleum: false,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET https://api.clover.com/v3/merchants/{creds.merchantId}/items
    // Authorization: Bearer {creds.accessToken}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /merchants/{creds.merchantId}/orders?startTimestamp={yesterday}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    // REAL: GET /merchants/{creds.merchantId}/employees
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData() {
    return null;
  },
};
