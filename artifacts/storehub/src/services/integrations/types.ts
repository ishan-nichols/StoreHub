/**
 * types.ts — Shared interface for all StoreHub integrations.
 *
 * Every integration file must export functions conforming to these types.
 * The app only ever imports from integrationService.ts — never from
 * individual integration files directly.
 */

export interface NormalizedProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  category: string;
  unit: string;
  source: string;
}

export interface NormalizedSaleItem {
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

export interface NormalizedSale {
  id: string;
  items: NormalizedSaleItem[];
  total: number;
  timestamp: string;
  paymentMethod?: string;
  source: string;
}

export interface NormalizedInventory {
  productId: string;
  productName: string;
  quantity: number;
  reorderPoint: number;
  source: string;
}

export interface NormalizedEmployee {
  id: string;
  name: string;
  role: string;
  source: string;
}

export interface FuelGradeData {
  grade: string;
  gallonsSold: number;
  revenue: number;
  tankLevel: number | null;
  tankCapacity: number | null;
}

export interface FuelData {
  date: string;
  grades: FuelGradeData[];
  totalFuelRevenue: number;
  totalStoreRevenue: number;
  source: string;
}

export interface IntegrationResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface IntegrationCredentials {
  [key: string]: string;
}

/**
 * Standard interface every integration file must implement.
 * Adding a new integration = create one new file conforming to this interface.
 * Zero changes required anywhere else in the app.
 */
export interface PriceUpdatePayload {
  productId: string;
  newPrice: number;
  sku: string;
  barcode?: string;
}

export interface Integration {
  id: string;
  name: string;
  isPetroleum: boolean;
  /** True if this integration supports two-way price sync */
  supportsPriceSync?: boolean;
  getProducts: (creds: IntegrationCredentials) => Promise<IntegrationResult<NormalizedProduct[]>>;
  getSales: (creds: IntegrationCredentials) => Promise<IntegrationResult<NormalizedSale[]>>;
  getInventory: (creds: IntegrationCredentials) => Promise<IntegrationResult<NormalizedInventory[]>>;
  getEmployees: (creds: IntegrationCredentials) => Promise<IntegrationResult<NormalizedEmployee[]>>;
  getFuelData: (creds: IntegrationCredentials) => Promise<IntegrationResult<FuelData[]> | null>;
  /** Push a price update back to the POS. Default no-op for read-only integrations. */
  pushPriceUpdate?: (creds: IntegrationCredentials, payload: PriceUpdatePayload) => Promise<IntegrationResult<{ queued: boolean }>>;
}
