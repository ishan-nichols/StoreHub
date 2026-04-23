/**
 * quickbooks.ts — QuickBooks integration (accounting data).
 *
 * Used for: expense sync, profit/loss reports, payroll data.
 *
 * REAL API CONNECTION:
 *   Base URL:  https://quickbooks.api.intuit.com/v3/company/{realmId}
 *   Auth:      OAuth 2.0 (authorization code flow required by Intuit)
 *     Scopes: com.intuit.quickbooks.accounting
 *     Token:  POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 *   Endpoints:
 *     POST /query?query=SELECT * FROM Item   → products
 *     POST /query?query=SELECT * FROM Invoice → invoices/sales
 *     POST /query?query=SELECT * FROM Purchase → expenses
 *     POST /query?query=SELECT * FROM Employee → employees
 *
 *   SDK: intuit-oauth for Node.js (OAuth flow), node-quickbooks for data queries
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee } from "./types";

const SOURCE = "QuickBooks";
const delay = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

export const quickbooks: Integration = {
  id: "quickbooks",
  name: "QuickBooks",
  isPetroleum: false,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: POST /v3/company/{creds.realmId}/query
    // Body: { query: "SELECT * FROM Item WHERE Type = 'Inventory' MAXRESULTS 1000" }
    // Authorization: Bearer {creds.accessToken}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: Query Invoices or SalesReceipts for the date range
    // SELECT * FROM Invoice WHERE TxnDate >= '{yesterday}' AND TxnDate <= '{today}'
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(_creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    // REAL: SELECT * FROM Employee WHERE Active = true
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData() {
    return null;
  },
};
