/**
 * toast.ts — Toast POS integration.
 *
 * Used at: full-service restaurants, QSR, bars, food trucks.
 * Relevant for c-stores and gas stations with food service operations.
 *
 * REAL API CONNECTION:
 *   Toast uses OAuth 2.0 client credentials (machine-to-machine).
 *   Base URL:  https://ws-api.toasttab.com
 *   Auth:      POST /usermgmt/v1/authentications → { token: { accessToken } }
 *     clientId + clientSecret in request body
 *   Endpoints:
 *     GET  /orders/v2/orders?restaurantGuid={guid}&startDate={date} → orders
 *     GET  /restaurants/v1/menus?restaurantGuid={guid}              → menu items
 *     GET  /labor/v1/timeEntries?restaurantGuid={guid}              → employee time
 *
 *   Note: Toast API requires a partner agreement for production access.
 *   Sandbox: https://ws-sandbox-api.toasttab.com (use for testing)
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee } from "./types";

const SOURCE = "Toast POS";
const delay = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

export const toast: Integration = {
  id: "toast",
  name: "Toast POS",
  isPetroleum: false,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET /restaurants/v1/menus?restaurantGuid={creds.restaurantGuid}
    // Authorization: Bearer {accessToken from /usermgmt/v1/authentications}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /orders/v2/orders?restaurantGuid={creds.restaurantGuid}&startDate={today}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(_creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    // Toast does not have native inventory; use getProducts for menu items
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    // REAL: GET /labor/v1/timeEntries?restaurantGuid={creds.restaurantGuid}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData() {
    return null;
  },
};
