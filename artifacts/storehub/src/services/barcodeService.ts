/**
 * barcodeService.ts
 *
 * Exact UPC lookup via UPCitemdb — covers all major US retail:
 * tobacco, beverages, gum, candy, snacks, health & beauty, etc.
 * No AI guessing — real database, exact match.
 */

import { API_BASE_URL } from "./dataService";

const LIBRARY_KEY = "storehub_barcode_library";

export interface BarcodeProductInfo {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  size?: string;
  srp?: number;
  source: "UPCitemdb" | "Open Food Facts" | "My Library" | "Manual";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function lookupBarcode(upc: string): Promise<BarcodeProductInfo | null> {
  const cleaned = upc.replace(/\D/g, "");
  if (!cleaned) return null;

  const local = lookupLocal(cleaned);
  if (local) return local;

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE_URL}/api/barcode/lookup?upc=${cleaned}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      found: boolean; source?: string; name?: string; brand?: string;
      category?: string; size?: string; srp?: number; description?: string;
    };
    if (!data.found || !data.name) return null;
    return {
      barcode: cleaned,
      name: data.name,
      brand: data.brand,
      category: data.category,
      size: data.size,
      srp: data.srp,
      description: data.description,
      source: (data.source as BarcodeProductInfo["source"]) ?? "UPCitemdb",
    };
  } catch { return null; }
}

// ─── Local library ────────────────────────────────────────────────────────────

function getLibrary(): Record<string, BarcodeProductInfo> {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BarcodeProductInfo>) : {};
  } catch { return {}; }
}

export function lookupLocal(barcode: string): BarcodeProductInfo | null {
  return getLibrary()[barcode] ?? null;
}

export function saveToLibrary(info: BarcodeProductInfo): void {
  const lib = getLibrary();
  lib[info.barcode] = { ...info, source: "My Library" };
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}
