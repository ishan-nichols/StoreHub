/**
 * lightspeed.ts — Lightspeed Retail POS integration.
 *
 * Used at: specialty retailers, bike shops, clothing boutiques, hardware stores.
 *
 * REAL API CONNECTION:
 *   Lightspeed uses OAuth 2.0 (authorization code flow).
 *   Base URL:  https://api.lightspeedapp.com/API/V3/Account/{accountID}
 *   Auth:      Authorization: Bearer {accessToken}
 *   Endpoints:
 *     GET  /Item.json            → product catalog
 *     GET  /Sale.json            → sales transactions
 *     GET  /ItemShop.json        → inventory by shop location
 *     GET  /Employee.json        → employee roster
 *
 *   OAuth: https://cloud.lightspeedapp.com/oauth/authorize
 *   Token: POST https://cloud.lightspeedapp.com/oauth/access_token
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee } from "./types";

const SOURCE = "Lightspeed";
const delay = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

export const lightspeed: Integration = {
  id: "lightspeed",
  name: "Lightspeed",
  isPetroleum: false,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET /Account/{creds.accountId}/Item.json?load_relations=["ItemShops"]
    // Authorization: Bearer {creds.accessToken}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /Account/{creds.accountId}/Sale.json?completed=true&timeStamp=>,{yesterday}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    // REAL: GET /Account/{creds.accountId}/ItemShop.json?shopID={creds.shopId}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    // REAL: GET /Account/{creds.accountId}/Employee.json
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData() {
    return null;
  },
};
