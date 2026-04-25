/**
 * complianceService.ts — Compliance Autopilot
 *
 * Manages business compliance items, deadlines, and renewal reminders.
 * All data persisted to localStorage.
 */

import { generateId } from "../utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceCategory =
  | "business_license"
  | "health_permit"
  | "sales_tax"
  | "income_tax"
  | "alcohol_license"
  | "tobacco_license"
  | "food_handler"
  | "fire_inspection"
  // Canada
  | "gst_hst_filing"
  | "cpp_ei_remittance"
  | "wsib_wcb"
  | "t4_slips"
  | "provincial_license"
  // Mexico
  | "iva_filing"
  | "isr_filing"
  | "imss_registration"
  | "sat_cfdi"
  | "municipal_license"
  | "cofepris"
  | "custom";

export interface ComplianceItem {
  id: string;
  name: string;
  category: ComplianceCategory;
  dueDate: string;            // ISO date string
  renewalPeriodDays: number;  // 365, 90, 30, etc.
  notes?: string;
  status: "current" | "due_soon" | "overdue" | "completed";
  completedAt?: string;
  alertDays: number[];        // [30, 14, 7, 1]
  jurisdiction?: string;      // state/city
}

export interface ComplianceAlert {
  item: ComplianceItem;
  daysUntilDue: number;
  severity: "critical" | "warning" | "info";
  message: string;
}

// ─── Storage key ─────────────────────────────────────────────────────────────

const ITEMS_KEY = "storehub_compliance_items";
const NOTIFICATIONS_KEY = "storehub_compliance_notifications";

// ─── Status computation ───────────────────────────────────────────────────────

function computeStatus(item: Omit<ComplianceItem, "id" | "status"> & { id?: string }): ComplianceItem["status"] {
  if (item.completedAt) return "completed";
  const daysUntil = Math.ceil(
    (new Date(item.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 30) return "due_soon";
  return "current";
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getItems(): ComplianceItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as ComplianceItem[];
    // Recompute status on every read
    return items.map((item) => ({ ...item, status: computeStatus(item) }));
  } catch {
    return [];
  }
}

export function saveItem(
  item: Omit<ComplianceItem, "id" | "status">,
): ComplianceItem {
  const items = getItems();
  const newItem: ComplianceItem = {
    ...item,
    id: generateId(),
    status: computeStatus(item),
  };
  items.push(newItem);
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  return newItem;
}

export function updateItem(id: string, updates: Partial<ComplianceItem>): void {
  const items = getItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const updated = { ...items[idx], ...updates };
  updated.status = computeStatus(updated);
  items[idx] = updated;
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function deleteItem(id: string): void {
  const items = getItems().filter((i) => i.id !== id);
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function markCompleted(id: string): void {
  updateItem(id, { completedAt: new Date().toISOString() });
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export function getAlerts(): ComplianceAlert[] {
  const items = getItems();
  const alerts: ComplianceAlert[] = [];

  for (const item of items) {
    if (item.status === "completed") continue;
    const daysUntilDue = Math.ceil(
      (new Date(item.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    let severity: ComplianceAlert["severity"];
    let message: string;

    if (daysUntilDue < 0) {
      severity = "critical";
      message = `Your ${item.name} is OVERDUE by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? "s" : ""}! Renew immediately.`;
    } else if (daysUntilDue <= 3) {
      severity = "critical";
      message = `Your ${item.name} expires in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}! Renew now.`;
    } else if (daysUntilDue <= 14) {
      severity = "warning";
      message = `${item.name} due in ${daysUntilDue} days. Start the renewal process.`;
    } else if (daysUntilDue <= 30) {
      severity = "info";
      message = `${item.name} coming up in ${daysUntilDue} days.`;
    } else {
      continue; // Not within alert window
    }

    alerts.push({ item, daysUntilDue, severity, message });
  }

  return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// ─── Province name lookup ─────────────────────────────────────────────────────

const CA_PROVINCE_NAMES: Record<string, string> = {
  ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta",
  MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", PE: "Prince Edward Island",
  YT: "Yukon", NT: "Northwest Territories", NU: "Nunavut",
};

const MX_STATE_NAMES: Record<string, string> = {
  AGU: "Aguascalientes", BCN: "Baja California", BCS: "Baja California Sur",
  CAM: "Campeche", CHP: "Chiapas", CHH: "Chihuahua", COA: "Coahuila",
  COL: "Colima", CDMX: "Ciudad de México", DGO: "Durango", GTO: "Guanajuato",
  GRO: "Guerrero", HGO: "Hidalgo", JAL: "Jalisco", MEX: "Estado de México",
  MIC: "Michoacán", MOR: "Morelos", NAY: "Nayarit", NLE: "Nuevo León",
  OAX: "Oaxaca", PUE: "Puebla", QRO: "Querétaro", ROO: "Quintana Roo",
  SLP: "San Luis Potosí", SIN: "Sinaloa", SON: "Sonora", TAB: "Tabasco",
  TAM: "Tamaulipas", TLA: "Tlaxcala", VER: "Veracruz", YUC: "Yucatán",
  ZAC: "Zacatecas",
};

function parseRegionCode(regionCode?: string): { country: string; stateCode: string } {
  if (!regionCode) return { country: "", stateCode: "" };
  const parts = regionCode.split("-");
  if (parts.length < 2) return { country: "", stateCode: "" };
  const country = parts[0];
  const stateCode = parts.slice(1).join("-");
  return { country, stateCode };
}

// ─── Business type defaults ───────────────────────────────────────────────────

export function getDefaultItemsForBusinessType(
  businessType: string,
  regionCode?: string,   // e.g. "CA-ON", "US-TX", "MX-JAL"
  country?: "US" | "CA" | "MX",
): Omit<ComplianceItem, "id" | "status">[] {
  const today = new Date();

  function isoDate(d: Date) {
    return d.toISOString().split("T")[0];
  }

  function addMonths(d: Date, months: number): Date {
    const result = new Date(d);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  function nextYear(): Date {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  function twoYears(): Date {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 2);
    return d;
  }

  // Next quarter end (for US)
  function nextUSQuarter(): Date {
    const d = new Date(today);
    const currentMonth = today.getMonth();
    const monthsToNextQuarter = 3 - (currentMonth % 3);
    d.setMonth(currentMonth + monthsToNextQuarter, 15);
    return d;
  }

  const bt = businessType.toLowerCase();
  const isFood = bt.includes("restaurant") || bt.includes("food") || bt.includes("cafe") ||
                 bt.includes("bakery") || bt.includes("bar") || bt.includes("grocery") || bt.includes("cstore");
  const isAlcohol = bt.includes("alcohol") || bt.includes("liquor") || bt.includes("bar") || bt.includes("restaurant");
  const isTobacco = bt.includes("tobacco") || bt.includes("smoke") || bt.includes("vape") || bt.includes("cstore");

  // ── Canada ──────────────────────────────────────────────────────────────────
  if (country === "CA") {
    const { stateCode } = parseRegionCode(regionCode);
    const provinceName = (stateCode && CA_PROVINCE_NAMES[stateCode]) ?? stateCode ?? "Your Province";

    // GST/HST quarterly deadlines: April 30, July 31, October 31, January 31
    const gstDates = [
      new Date(today.getFullYear(), 3, 30),   // Apr 30
      new Date(today.getFullYear(), 6, 31),   // Jul 31
      new Date(today.getFullYear(), 9, 31),   // Oct 31
      new Date(today.getFullYear() + 1, 0, 31), // Jan 31
    ];
    const nextGst = gstDates.find(d => d > today) ?? gstDates[gstDates.length - 1];

    // Provincial tax installment deadlines: Mar 15, Jun 15, Sep 15, Dec 15
    const provTaxDates = [
      new Date(today.getFullYear(), 2, 15),
      new Date(today.getFullYear(), 5, 15),
      new Date(today.getFullYear(), 8, 15),
      new Date(today.getFullYear(), 11, 15),
    ];
    const nextProvTax = provTaxDates.find(d => d > today) ?? new Date(today.getFullYear() + 1, 2, 15);

    // CPP/EI remittance: 15th of the following month
    const nextRemittance = new Date(today.getFullYear(), today.getMonth() + 1, 15);

    // T4 slips: February 28 of following year
    const nextT4 = new Date(today.getFullYear() + 1, 1, 28);

    const items: Omit<ComplianceItem, "id" | "status">[] = [
      {
        name: "Business License",
        category: "business_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [30, 14, 7, 1],
        jurisdiction: provinceName,
        notes: "Annual business operating licence — renew with your provincial or municipal authority.",
      },
      {
        name: "GST/HST Filing",
        category: "gst_hst_filing",
        dueDate: isoDate(nextGst),
        renewalPeriodDays: 90,
        alertDays: [30, 14, 7, 1],
        jurisdiction: "CRA",
        notes: "Required if revenue > $30k/yr. File quarterly via CRA My Business Account. HST provinces submit combined; GST+PST provinces file separately.",
      },
      {
        name: "T4 Slip Submission",
        category: "t4_slips",
        dueDate: isoDate(nextT4),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: "CRA",
        notes: "Annual employee income slips — equivalent of W-2. Submit to CRA by February 28 of following year and distribute to employees.",
      },
      {
        name: "CPP/EI Remittance",
        category: "cpp_ei_remittance",
        dueDate: isoDate(nextRemittance),
        renewalPeriodDays: 30,
        alertDays: [14, 7, 3, 1],
        jurisdiction: "CRA",
        notes: "Canada Pension Plan and Employment Insurance remittances. Due 15th of month following payroll. Required if you have employees.",
      },
      {
        name: "Provincial Income Tax Installment",
        category: "income_tax",
        dueDate: isoDate(nextProvTax),
        renewalPeriodDays: 90,
        alertDays: [30, 14, 7, 1],
        jurisdiction: provinceName,
        notes: "Quarterly provincial income tax installment. Due: March 15, June 15, September 15, December 15.",
      },
      {
        name: "WSIB/WCB Registration",
        category: "wsib_wcb",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14],
        jurisdiction: provinceName,
        notes: "Workers' Compensation Board registration. Required if you have employees. Rate varies by industry and province.",
      },
    ];

    if (isFood) {
      items.push({
        name: "Health Department Permit",
        category: "health_permit",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: provinceName,
        notes: "Annual health and sanitation inspection permit — required for all food-handling businesses.",
      });
      items.push({
        name: "Food Handler Certification",
        category: "food_handler",
        dueDate: isoDate(twoYears()),
        renewalPeriodDays: 730,
        alertDays: [60, 30, 14],
        jurisdiction: provinceName,
        notes: "Food handler safety certification for all food-handling employees. Requirements vary by province.",
      });
    }

    if (isAlcohol) {
      items.push({
        name: "Liquor Licence",
        category: "alcohol_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7, 1],
        jurisdiction: provinceName,
        notes: "Provincial liquor board licence — renewal requires compliance inspection. Contact your provincial liquor authority (LCBO, BCLDB, AGLC, SAQ, etc.).",
      });
    }

    if (isTobacco) {
      items.push({
        name: "Tobacco Retailer Authorization",
        category: "tobacco_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: provinceName,
        notes: "Health Canada and provincial authorization required to sell tobacco products. Must verify age — minimum age varies by province.",
      });
    }

    return items;
  }

  // ── Mexico ──────────────────────────────────────────────────────────────────
  if (country === "MX") {
    const { stateCode } = parseRegionCode(regionCode);
    const stateName = (stateCode && MX_STATE_NAMES[stateCode]) ?? stateCode ?? "Su Estado";

    // IVA/ISR monthly: 17th of each month
    const nextMonth17 = new Date(today.getFullYear(), today.getMonth() + (today.getDate() >= 17 ? 1 : 0), 17);

    // Annual SAT declaration: April 30
    let annualSat = new Date(today.getFullYear(), 3, 30);
    if (annualSat <= today) annualSat = new Date(today.getFullYear() + 1, 3, 30);

    const items: Omit<ComplianceItem, "id" | "status">[] = [
      {
        name: "Licencia de Funcionamiento Municipal",
        category: "municipal_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [30, 14, 7, 1],
        jurisdiction: stateName,
        notes: "Licencia de funcionamiento — requerida por el municipio para operar. Renovación anual en el ayuntamiento.",
      },
      {
        name: "Declaración Mensual de IVA",
        category: "iva_filing",
        dueDate: isoDate(nextMonth17),
        renewalPeriodDays: 30,
        alertDays: [14, 7, 3, 1],
        jurisdiction: "SAT",
        notes: "Declaración de IVA vía portal del SAT — a más tardar el día 17 de cada mes. IVA tasa general 16%; zona frontera norte 8%.",
      },
      {
        name: "Pago Provisional Mensual de ISR",
        category: "isr_filing",
        dueDate: isoDate(nextMonth17),
        renewalPeriodDays: 30,
        alertDays: [14, 7, 3, 1],
        jurisdiction: "SAT",
        notes: "Pago provisional de ISR — a más tardar el día 17 de cada mes via portal del SAT (Mi Portal).",
      },
      {
        name: "Facturación Electrónica CFDI (SAT)",
        category: "sat_cfdi",
        dueDate: isoDate(addMonths(today, 3)),
        renewalPeriodDays: 90,
        alertDays: [30, 14, 7],
        jurisdiction: "SAT",
        notes: "Asegurarse de que todas las ventas generen CFDI (Comprobante Fiscal Digital por Internet) a través de un PAC autorizado por el SAT.",
      },
      {
        name: "Registro IMSS",
        category: "imss_registration",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14],
        jurisdiction: "IMSS",
        notes: "Registrar a los empleados ante el Instituto Mexicano del Seguro Social (IMSS). Las cuotas patronales se pagan mensualmente.",
      },
      {
        name: "Declaración Anual ISR (SAT)",
        category: "isr_filing",
        dueDate: isoDate(annualSat),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: "SAT",
        notes: "Declaración anual de Impuesto Sobre la Renta ante el SAT. Fecha límite: 30 de abril.",
      },
    ];

    if (isFood) {
      items.push({
        name: "Licencia Sanitaria COFEPRIS",
        category: "cofepris",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: "COFEPRIS",
        notes: "Permiso sanitario federal requerido para establecimientos que manejen alimentos — emitido por la Comisión Federal para la Protección contra Riesgos Sanitarios.",
      });
    }

    if (isAlcohol) {
      items.push({
        name: "Licencia para Venta de Bebidas Alcohólicas",
        category: "alcohol_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7, 1],
        jurisdiction: stateName,
        notes: "Licencia municipal/estatal para venta de bebidas alcohólicas. Prohibida la venta a menores de 18 años. Renovación anual.",
      });
    }

    if (isTobacco) {
      items.push({
        name: "Licencia para Venta de Tabaco",
        category: "tobacco_license",
        dueDate: isoDate(nextYear()),
        renewalPeriodDays: 365,
        alertDays: [60, 30, 14, 7],
        jurisdiction: stateName,
        notes: "Autorización para venta de productos de tabaco. Prohibida la venta a menores de 18 años. Verificar normatividad local (LGCT).",
      });
    }

    return items;
  }

  // ── United States (default) ──────────────────────────────────────────────────
  const jurisdiction = regionCode
    ? (regionCode.startsWith("US-") ? regionCode.slice(3) : regionCode)
    : (typeof regionCode === "string" ? regionCode : "Your State");

  const items: Omit<ComplianceItem, "id" | "status">[] = [
    {
      name: "Business License",
      category: "business_license",
      dueDate: isoDate(nextYear()),
      renewalPeriodDays: 365,
      alertDays: [30, 14, 7, 1],
      jurisdiction,
      notes: "Annual business operating license renewal",
    },
    {
      name: "Sales Tax Filing",
      category: "sales_tax",
      dueDate: isoDate(nextUSQuarter()),
      renewalPeriodDays: 90,
      alertDays: [30, 14, 7, 1],
      jurisdiction,
      notes: "Quarterly sales tax return",
    },
    {
      name: "Income Tax Estimated Payment",
      category: "income_tax",
      dueDate: isoDate(nextUSQuarter()),
      renewalPeriodDays: 90,
      alertDays: [30, 14, 7, 1],
      jurisdiction: "Federal",
      notes: "Quarterly estimated income tax payment (Form 1040-ES)",
    },
  ];

  if (isFood) {
    items.push({
      name: "Health Department Permit",
      category: "health_permit",
      dueDate: isoDate(nextYear()),
      renewalPeriodDays: 365,
      alertDays: [60, 30, 14, 7],
      jurisdiction,
      notes: "Annual health and sanitation inspection permit",
    });

    items.push({
      name: "Food Handler Certification",
      category: "food_handler",
      dueDate: isoDate(twoYears()),
      renewalPeriodDays: 730,
      alertDays: [60, 30, 14],
      jurisdiction,
      notes: "Food handler safety certification for all food-handling employees",
    });
  }

  if (isAlcohol) {
    items.push({
      name: "Alcohol License",
      category: "alcohol_license",
      dueDate: isoDate(nextYear()),
      renewalPeriodDays: 365,
      alertDays: [60, 30, 14, 7, 1],
      jurisdiction,
      notes: "State liquor license — renewal requires compliance inspection",
    });
  }

  if (isTobacco) {
    items.push({
      name: "Tobacco Retailer License",
      category: "tobacco_license",
      dueDate: isoDate(nextYear()),
      renewalPeriodDays: 365,
      alertDays: [60, 30, 14, 7],
      jurisdiction,
      notes: "License to sell tobacco and/or vaping products",
    });
  }

  const nextFireInspection = new Date(today);
  nextFireInspection.setMonth(nextFireInspection.getMonth() + 6);
  items.push({
    name: "Fire Safety Inspection",
    category: "fire_inspection",
    dueDate: isoDate(nextFireInspection),
    renewalPeriodDays: 180,
    alertDays: [30, 14, 7],
    jurisdiction,
    notes: "Bi-annual fire marshal inspection of premises",
  });

  return items;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function scheduleNotifications(items: ComplianceItem[]): void {
  const upcoming: Array<{ itemId: string; name: string; alertDate: string; dueDate: string }> = [];

  for (const item of items) {
    if (item.status === "completed") continue;
    for (const days of item.alertDays) {
      const alertDate = new Date(item.dueDate);
      alertDate.setDate(alertDate.getDate() - days);
      if (alertDate > new Date()) {
        upcoming.push({
          itemId: item.id,
          name: item.name,
          alertDate: alertDate.toISOString(),
          dueDate: item.dueDate,
        });
      }
    }
  }

  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(upcoming));
}
