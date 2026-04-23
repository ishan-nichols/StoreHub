/**
 * shopify.ts — Shopify integration (Online + POS).
 *
 * Used at: omnichannel retailers selling online + in-store.
 *
 * REAL API CONNECTION:
 *   Base URL:  https://{shop}.myshopify.com/admin/api/2024-01
 *   Auth:      X-Shopify-Access-Token: {accessToken}
 *   Endpoints:
 *     GET  /products.json              → product catalog
 *     GET  /orders.json?status=any     → all orders (online + POS)
 *     GET  /inventory_levels.json      → inventory by location
 *     GET  /metafields.json            → custom fields if needed
 *
 *   OAuth app flow for public apps:
 *     GET /admin/oauth/authorize → redirect with code
 *     POST /admin/oauth/access_token → { access_token }
 *
 *   Webhooks for real-time: orders/create, inventory_levels/update
 */

import type { Integration, IntegrationCredentials, IntegrationResult, NormalizedProduct, NormalizedSale, NormalizedInventory, NormalizedEmployee, PriceUpdatePayload } from "./types";

const SOURCE = "Shopify";
const delay = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

export const shopify: Integration = {
  id: "shopify",
  name: "Shopify",
  isPetroleum: false,
  supportsPriceSync: true,

  async getProducts(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedProduct[]>> {
    // REAL: GET https://{creds.shopDomain}/admin/api/2024-01/products.json?limit=250
    // X-Shopify-Access-Token: {creds.accessToken}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getSales(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedSale[]>> {
    // REAL: GET /orders.json?created_at_min={yesterday}&status=any&source_name=pos
    await delay();
    return { success: true, data: [], error: null };
  },

  async getInventory(creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedInventory[]>> {
    // REAL: GET /inventory_levels.json?location_ids={creds.locationId}
    await delay();
    return { success: true, data: [], error: null };
  },

  async getEmployees(_creds: IntegrationCredentials): Promise<IntegrationResult<NormalizedEmployee[]>> {
    await delay();
    return { success: true, data: [], error: null };
  },

  async getFuelData() {
    return null;
  },

  async pushPriceUpdate(creds: IntegrationCredentials, payload: PriceUpdatePayload): Promise<IntegrationResult<{ queued: boolean }>> {
    // REAL: PUT https://{shop}.myshopify.com/admin/api/2024-04/variants/{variant_id}.json
    //   Body: { variant: { id: variantId, price: payload.newPrice.toFixed(2) } }
    //   Headers: X-Shopify-Access-Token: {creds.accessToken}
    void creds; void payload;
    await delay(300);
    return { success: true, data: { queued: false }, error: null };
  },
};
