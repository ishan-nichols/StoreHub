/**
 * csv-import.ts — Manual CSV import (fallback for any system not listed).
 *
 * Accepts CSV files for sales or inventory data.
 * Auto-detects columns and maps them to StoreHub's internal format.
 */

import type { NormalizedProduct, NormalizedSale, NormalizedInventory } from "./types";

export interface CSVColumn {
  header: string;
  mappedTo: string | null;
  sample: string;
}

export interface CSVPreview {
  columns: CSVColumn[];
  rowCount: number;
  rawHeaders: string[];
  rows: Record<string, string>[];
}

const PRODUCT_FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "product name", "item name", "description", "item", "product", "title"],
  sku: ["sku", "upc", "barcode", "code", "item code", "product code"],
  price: ["price", "retail price", "sale price", "unit price", "cost"],
  quantity: ["quantity", "qty", "stock", "on hand", "inventory", "count", "units"],
  category: ["category", "department", "type", "section", "class"],
  unit: ["unit", "uom", "unit of measure", "selling unit"],
};

const SALE_FIELD_ALIASES: Record<string, string[]> = {
  id: ["id", "transaction id", "order id", "receipt", "sale id"],
  total: ["total", "amount", "grand total", "sale total", "price"],
  timestamp: ["date", "time", "datetime", "transaction date", "created at", "date/time"],
  productName: ["product", "item", "name", "description", "product name"],
  quantity: ["quantity", "qty", "units sold"],
};

function detectMapping(header: string, aliases: Record<string, string[]>): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, fieldAliases] of Object.entries(aliases)) {
    if (fieldAliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return field;
    }
  }
  return null;
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

export function buildPreview(csvText: string, mode: "products" | "sales"): CSVPreview {
  const { headers, rows } = parseCSV(csvText);
  const aliases = mode === "products" ? PRODUCT_FIELD_ALIASES : SALE_FIELD_ALIASES;

  const columns: CSVColumn[] = headers.map((h) => ({
    header: h,
    mappedTo: detectMapping(h, aliases),
    sample: rows[0]?.[h] ?? "",
  }));

  return { columns, rowCount: rows.length, rawHeaders: headers, rows: rows.slice(0, 5) };
}

export function importProducts(
  csvText: string,
  columnMapping: Record<string, string>,
  source = "CSV Import",
): NormalizedProduct[] {
  const { rows } = parseCSV(csvText);

  return rows
    .map((row, i) => {
      const name = row[columnMapping.name] ?? "";
      if (!name) return null;

      return {
        id: `csv-${Date.now()}-${i}`,
        name,
        sku: row[columnMapping.sku] ?? "",
        price: parseFloat(row[columnMapping.price] ?? "0") || 0,
        quantity: parseFloat(row[columnMapping.quantity] ?? "0") || 0,
        category: row[columnMapping.category] ?? "General",
        unit: row[columnMapping.unit] ?? "each",
        source,
      } as NormalizedProduct;
    })
    .filter(Boolean) as NormalizedProduct[];
}

export function importSales(
  csvText: string,
  columnMapping: Record<string, string>,
  source = "CSV Import",
): NormalizedSale[] {
  const { rows } = parseCSV(csvText);

  return rows
    .map((row, i) => {
      const total = parseFloat(row[columnMapping.total] ?? "0") || 0;
      if (!total) return null;

      const productName = row[columnMapping.productName] ?? "Unknown Item";
      const quantity = parseFloat(row[columnMapping.quantity] ?? "1") || 1;

      return {
        id: row[columnMapping.id] ?? `csv-sale-${Date.now()}-${i}`,
        items: [{ productName, quantity, price: total / quantity, total }],
        total,
        timestamp: row[columnMapping.timestamp] ?? new Date().toISOString(),
        source,
      } as NormalizedSale;
    })
    .filter(Boolean) as NormalizedSale[];
}
