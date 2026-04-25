/**
 * taxService.ts — Complete Tax System
 *
 * Covers: sales tax, income tax, payroll tax, excise taxes.
 * All calculations are transparent and shown step-by-step.
 * Never files anything automatically — always requires owner confirmation.
 */

import type { Sale, Expense, Employee } from "../schemas";
import { CA_FEDERAL, CA_BRACKETS_2024 } from "../data/taxData";

// ─── Tax Profile ──────────────────────────────────────────────────────────────

export type BusinessStructure = "sole_prop" | "llc" | "s_corp" | "c_corp" | "partnership";
export type FilingFrequency    = "monthly" | "quarterly" | "annual";
export type FiscalYearType     = "calendar" | "custom";

export interface TaxProfile {
  country: "US" | "CA" | "MX";
  businessStructure: BusinessStructure;
  stateCode: string;
  stateName: string;
  city: string;
  hasEmployees: boolean;
  collectsSalesTax: boolean;
  salesTaxRegistered: boolean;
  fiscalYearType: FiscalYearType;
  fiscalYearStart?: string;       // "MM-DD" if custom
  filingFrequency: FilingFrequency;
  salesTaxRate: number;           // decimal e.g. 0.0875
  stateTaxRate: number;           // state portion
  countyTaxRate: number;
  cityTaxRate: number;
  setupComplete: boolean;
  updatedAt: string;
}

export interface TaxExemptProduct {
  productId: string;
  productName: string;
  reason: "food_grocery" | "medicine" | "clothing" | "other";
}

// ─── Tax bracket data ─────────────────────────────────────────────────────────

// 2024 Federal income tax brackets (single filer / self-employed)
const FEDERAL_BRACKETS_2024 = [
  { up_to: 11600,  rate: 0.10 },
  { up_to: 47150,  rate: 0.12 },
  { up_to: 100525, rate: 0.22 },
  { up_to: 191950, rate: 0.24 },
  { up_to: 243725, rate: 0.32 },
  { up_to: 609350, rate: 0.35 },
  { up_to: Infinity, rate: 0.37 },
];

// Self-employment tax rate (15.3% up to Social Security wage base)
const SE_TAX_RATE = 0.153;
const SS_WAGE_BASE_2024 = 168600;

// Standard deduction 2024
const STANDARD_DEDUCTION_2024 = 14600;

// Payroll tax rates
const SS_EMPLOYEE_RATE   = 0.062;
const SS_EMPLOYER_RATE   = 0.062;
const MEDICARE_EMPLOYEE  = 0.0145;
const MEDICARE_EMPLOYER  = 0.0145;
const FUTA_RATE          = 0.006;  // after SUTA credit
const FUTA_WAGE_BASE     = 7000;

// State payroll tax (SUTA) varies — rough estimates
const SUTA_RATES: Record<string, number> = {
  CA: 0.034, TX: 0.027, NY: 0.034, FL: 0.027, IL: 0.035,
  // default for all others
  DEFAULT: 0.027,
};
const SUTA_WAGE_BASE: Record<string, number> = {
  CA: 7000, TX: 9000, NY: 12300, FL: 7000, IL: 13590,
  DEFAULT: 7000,
};

// Canadian provincial income tax rates (approximate, for estimation)
const CA_PROVINCIAL_TAX_RATES: Record<string, number> = {
  ON: 0.0505, QC: 0.14, BC: 0.0506, AB: 0.10, MB: 0.108,
  SK: 0.105,  NS: 0.0879, NB: 0.0947, NL: 0.087, PE: 0.098,
  YT: 0.064,  NT: 0.059, NU: 0.04,
  DEFAULT: 0.10,
};

// Mexico ISR brackets (individual, simplified — 2024)
const MX_ISR_BRACKETS = [
  { up_to: 8952.49,   rate: 0.0192, fixed: 0 },
  { up_to: 75984.55,  rate: 0.064,  fixed: 171.88 },
  { up_to: 133536.07, rate: 0.1088, fixed: 4461.94 },
  { up_to: 155229.80, rate: 0.16,   fixed: 10723.55 },
  { up_to: 185852.57, rate: 0.1792, fixed: 14194.54 },
  { up_to: 374837.88, rate: 0.2136, fixed: 19682.13 },
  { up_to: 590795.99, rate: 0.2352, fixed: 60049.40 },
  { up_to: 1127926.84,rate: 0.30,   fixed: 110842.74 },
  { up_to: 1503902.46,rate: 0.32,   fixed: 271981.99 },
  { up_to: 4511707.37,rate: 0.34,   fixed: 392294.17 },
  { up_to: Infinity,   rate: 0.35,   fixed: 1414947.85 },
];

// Excise tax rates (per unit where applicable)
export const EXCISE_RATES = {
  tobacco_cigarettes_per_pack: 1.01, // federal per pack
  alcohol_beer_per_barrel:     18,   // federal per barrel
  alcohol_spirits_per_proof_gal: 13.50,
  fuel_gas_per_gallon:          0.184, // federal
  fuel_diesel_per_gallon:       0.244,
};

// IRS expense deduction categories
export const IRS_EXPENSE_CATEGORIES: Record<string, { irsCategory: string; schedule: string; fullyDeductible: boolean }> = {
  "Cost of Goods":   { irsCategory: "Cost of Goods Sold", schedule: "Schedule C Line 4", fullyDeductible: true },
  "Inventory":       { irsCategory: "Cost of Goods Sold", schedule: "Schedule C Line 4", fullyDeductible: true },
  "Rent":            { irsCategory: "Rent or lease", schedule: "Schedule C Line 20b", fullyDeductible: true },
  "Utilities":       { irsCategory: "Utilities", schedule: "Schedule C Line 25", fullyDeductible: true },
  "Payroll":         { irsCategory: "Wages", schedule: "Schedule C Line 26", fullyDeductible: true },
  "Insurance":       { irsCategory: "Insurance", schedule: "Schedule C Line 15", fullyDeductible: true },
  "Equipment":       { irsCategory: "Depreciation / Section 179", schedule: "Schedule C Line 13", fullyDeductible: true },
  "Marketing":       { irsCategory: "Advertising", schedule: "Schedule C Line 8", fullyDeductible: true },
  "Vehicle":         { irsCategory: "Car and truck expenses", schedule: "Schedule C Line 9", fullyDeductible: true },
  "Meals":           { irsCategory: "Meals (50% deductible)", schedule: "Schedule C Line 24b", fullyDeductible: false },
  "Professional":    { irsCategory: "Legal and professional", schedule: "Schedule C Line 17", fullyDeductible: true },
  "Office":          { irsCategory: "Office expense", schedule: "Schedule C Line 18", fullyDeductible: true },
  "Supplies":        { irsCategory: "Supplies", schedule: "Schedule C Line 22", fullyDeductible: true },
  "Bank Fees":       { irsCategory: "Bank charges", schedule: "Schedule C Line 27a", fullyDeductible: true },
  "Other":           { irsCategory: "Other expenses", schedule: "Schedule C Line 27a", fullyDeductible: true },
};

// Quarterly estimated tax deadlines — US (IRS)
export const QUARTERLY_DEADLINES_2024 = [
  { quarter: "Q1", period: "Jan 1 – Mar 31", dueDate: "2025-04-15", label: "April 15" },
  { quarter: "Q2", period: "Apr 1 – May 31", dueDate: "2025-06-16", label: "June 16" },
  { quarter: "Q3", period: "Jun 1 – Aug 31", dueDate: "2025-09-15", label: "Sep 15" },
  { quarter: "Q4", period: "Sep 1 – Dec 31", dueDate: "2026-01-15", label: "Jan 15, 2026" },
];

// Quarterly GST/HST return deadlines — Canada (CRA)
export const CA_QUARTERLY_DEADLINES = [
  { quarter: "Q1", period: "Jan–Mar", dueDate: "2024-04-30", description: "GST/HST Q1 Return", label: "April 30" },
  { quarter: "Q2", period: "Apr–Jun", dueDate: "2024-07-31", description: "GST/HST Q2 Return", label: "July 31" },
  { quarter: "Q3", period: "Jul–Sep", dueDate: "2024-10-31", description: "GST/HST Q3 Return", label: "October 31" },
  { quarter: "Q4", period: "Oct–Dec", dueDate: "2025-01-31", description: "GST/HST Q4 Return", label: "January 31, 2025" },
];

// Monthly IVA return deadlines — Mexico (SAT), due 17th of following month
export const MX_MONTHLY_DEADLINES = [
  { quarter: "Jan", period: "January",   dueDate: "2024-02-17", description: "IVA January Return",   label: "Feb 17" },
  { quarter: "Feb", period: "February",  dueDate: "2024-03-17", description: "IVA February Return",  label: "Mar 17" },
  { quarter: "Mar", period: "March",     dueDate: "2024-04-17", description: "IVA March Return",     label: "Apr 17" },
  { quarter: "Apr", period: "April",     dueDate: "2024-05-17", description: "IVA April Return",     label: "May 17" },
  { quarter: "May", period: "May",       dueDate: "2024-06-17", description: "IVA May Return",       label: "Jun 17" },
  { quarter: "Jun", period: "June",      dueDate: "2024-07-17", description: "IVA June Return",      label: "Jul 17" },
  { quarter: "Jul", period: "July",      dueDate: "2024-08-17", description: "IVA July Return",      label: "Aug 17" },
  { quarter: "Aug", period: "August",    dueDate: "2024-09-17", description: "IVA August Return",    label: "Sep 17" },
  { quarter: "Sep", period: "September", dueDate: "2024-10-17", description: "IVA September Return", label: "Oct 17" },
  { quarter: "Oct", period: "October",   dueDate: "2024-11-17", description: "IVA October Return",   label: "Nov 17" },
  { quarter: "Nov", period: "November",  dueDate: "2024-12-17", description: "IVA November Return",  label: "Dec 17" },
  { quarter: "Dec", period: "December",  dueDate: "2025-01-17", description: "IVA December Return",  label: "Jan 17, 2025" },
];

/** Return the correct deadline list for a given country */
export function getQuarterlyDeadlines(country: string): typeof QUARTERLY_DEADLINES_2024 {
  if (country === "CA") return CA_QUARTERLY_DEADLINES as typeof QUARTERLY_DEADLINES_2024;
  if (country === "MX") return MX_MONTHLY_DEADLINES  as typeof QUARTERLY_DEADLINES_2024;
  return QUARTERLY_DEADLINES_2024;
}

// ─── Sales Tax Calculations ───────────────────────────────────────────────────

export interface SalesTaxSummary {
  period: string;
  grossSales: number;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;
  taxRate: number;
  filingDeadline: string;
  daysUntilDeadline: number;
  remitAmount: number;
}

export function calculateSalesTax(
  sales: Sale[],
  profile: TaxProfile,
  periodStart: Date,
  periodEnd: Date,
  exemptProductIds: string[] = [],
): SalesTaxSummary {
  const periodSales = sales.filter(s => {
    const d = new Date(s.createdAt);
    return d >= periodStart && d <= periodEnd;
  });

  let grossSales  = 0;
  let taxableSales = 0;
  let taxCollected = 0;

  periodSales.forEach(sale => {
    grossSales += sale.total;
    sale.items.forEach((item: any) => {
      const exempt = exemptProductIds.includes(item.productId);
      if (!exempt) {
        taxableSales += item.price * item.quantity;
        taxCollected += (item.price * item.quantity) * profile.salesTaxRate;
      }
    });
  });

  const exemptSales = grossSales - taxableSales;

  // Filing deadline based on frequency
  const deadline = getNextSalesTaxDeadline(profile.filingFrequency, periodEnd);
  const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);

  return {
    period: `${periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    grossSales,
    taxableSales,
    exemptSales,
    taxCollected,
    taxRate: profile.salesTaxRate,
    filingDeadline: deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    daysUntilDeadline: Math.max(0, daysUntil),
    remitAmount: taxCollected,
  };
}

function getNextSalesTaxDeadline(frequency: FilingFrequency, periodEnd: Date): Date {
  const d = new Date(periodEnd);
  if (frequency === "monthly") {
    // Due 20th of next month
    return new Date(d.getFullYear(), d.getMonth() + 1, 20);
  } else if (frequency === "quarterly") {
    // Due last day of month after quarter ends
    const month = d.getMonth();
    const quarterEndMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
    const nextQEnd = quarterEndMonths.find(m => m >= month) ?? 11;
    return new Date(d.getFullYear(), nextQEnd + 2, 1); // 1st of month after
  } else {
    // Annual — Jan 31 of next year
    return new Date(d.getFullYear() + 1, 0, 31);
  }
}

// ─── Income Tax Calculations ──────────────────────────────────────────────────

export interface IncomeTaxSummary {
  grossRevenue: number;
  totalDeductions: number;
  deductionsByCategory: Record<string, { amount: number; irsCategory: string; fullyDeductible: boolean }>;
  netIncome: number;
  selfEmploymentTax: number;
  seTaxDeduction: number;         // 50% of SE tax is deductible
  adjustedGrossIncome: number;
  standardDeduction: number;
  taxableIncome: number;
  estimatedFederalTax: number;
  effectiveTaxRate: number;
  quarterlyPaymentDue: number;    // ~25% of estimated annual tax
  ytdPaid: number;
  breakdown: Array<{ bracket: string; rate: number; taxable: number; tax: number }>;
}

export function calculateIncomeTax(
  sales: Sale[],
  expenses: Expense[],
  profile: TaxProfile,
  ytdEstimatedPaid = 0,
): IncomeTaxSummary {
  // YTD revenue
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const ytdSales = sales.filter(s => new Date(s.createdAt) >= yearStart);
  const grossRevenue = ytdSales.reduce((sum, s) => sum + s.total, 0);

  // Categorize expenses
  const ytdExpenses = expenses.filter(e => new Date(e.date) >= yearStart);
  const deductionsByCategory: Record<string, { amount: number; irsCategory: string; fullyDeductible: boolean }> = {};

  ytdExpenses.forEach(exp => {
    const cat = IRS_EXPENSE_CATEGORIES[exp.category] ?? IRS_EXPENSE_CATEGORIES["Other"];
    if (!deductionsByCategory[exp.category]) {
      deductionsByCategory[exp.category] = { amount: 0, irsCategory: cat.irsCategory, fullyDeductible: cat.fullyDeductible };
    }
    const amt = cat.fullyDeductible ? exp.amount : exp.amount * 0.5;
    deductionsByCategory[exp.category].amount += amt;
  });

  const totalDeductions = Object.values(deductionsByCategory).reduce((s, d) => s + d.amount, 0);
  const netIncome = Math.max(0, grossRevenue - totalDeductions);

  const country = profile.country ?? "US";
  const isSelfEmployed = ["sole_prop", "llc", "partnership"].includes(profile.businessStructure);

  let selfEmploymentTax = 0;
  let seTaxDeduction    = 0;
  let standardDeduction = STANDARD_DEDUCTION_2024;
  let estimatedFederalTax = 0;
  const breakdown: IncomeTaxSummary["breakdown"] = [];

  if (country === "CA") {
    // ── Canada ──────────────────────────────────────────────────────────────
    standardDeduction = CA_FEDERAL.standardDeduction;

    // CPP self-employed: both employee + employer halves (11.9% total)
    if (isSelfEmployed && netIncome > 3500) {
      const cppBase     = Math.min(netIncome - 3500, CA_FEDERAL.cppMax - 3500);
      selfEmploymentTax = cppBase * (CA_FEDERAL.cppRate * 2); // both sides
      seTaxDeduction    = selfEmploymentTax * 0.5;
    }

    const adjustedIncome = Math.max(0, netIncome - seTaxDeduction);
    const taxableIncome  = Math.max(0, adjustedIncome - standardDeduction);

    // Federal brackets
    let remaining = taxableIncome;
    let prevLimit = 0;
    for (const bracket of CA_BRACKETS_2024) {
      if (remaining <= 0) break;
      const bracketSize = bracket.up_to === Infinity ? remaining : Math.min(remaining, bracket.up_to - prevLimit);
      const tax = bracketSize * bracket.rate;
      estimatedFederalTax += tax;
      if (bracketSize > 0) {
        breakdown.push({
          bracket: bracket.up_to === Infinity ? `Over $${prevLimit.toLocaleString()}` : `$${prevLimit.toLocaleString()} – $${bracket.up_to.toLocaleString()}`,
          rate: bracket.rate, taxable: bracketSize, tax,
        });
      }
      remaining -= bracketSize;
      prevLimit  = bracket.up_to;
    }

    // Add provincial income tax estimate
    const provRate = CA_PROVINCIAL_TAX_RATES[profile.stateCode] ?? CA_PROVINCIAL_TAX_RATES.DEFAULT;
    const provTax  = taxableIncome * provRate;
    estimatedFederalTax += provTax;
    if (provTax > 0) {
      breakdown.push({
        bracket: `Provincial (${profile.stateCode || "prov"}) ~${(provRate * 100).toFixed(2)}%`,
        rate: provRate, taxable: taxableIncome, tax: provTax,
      });
    }

    const totalTax = estimatedFederalTax + selfEmploymentTax;
    const effectiveTaxRate = grossRevenue > 0 ? totalTax / grossRevenue : 0;
    return {
      grossRevenue, totalDeductions, deductionsByCategory,
      netIncome, selfEmploymentTax, seTaxDeduction,
      adjustedGrossIncome: adjustedIncome, standardDeduction,
      taxableIncome, estimatedFederalTax,
      effectiveTaxRate,
      quarterlyPaymentDue: Math.ceil(totalTax / 4),
      ytdPaid: ytdEstimatedPaid,
      breakdown,
    };

  } else if (country === "MX") {
    // ── Mexico ───────────────────────────────────────────────────────────────
    standardDeduction = 0; // Mexico uses a different deduction system
    const taxableIncome = Math.max(0, netIncome);

    // ISR progressive brackets (annual amounts in MXN)
    let prevLimit = 0;
    for (const bracket of MX_ISR_BRACKETS) {
      if (taxableIncome <= prevLimit) break;
      const bracketSize = bracket.up_to === Infinity
        ? taxableIncome - prevLimit
        : Math.min(taxableIncome - prevLimit, bracket.up_to - prevLimit);
      if (bracketSize <= 0) { prevLimit = bracket.up_to; continue; }
      const tax = bracket.fixed + (taxableIncome - prevLimit) * bracket.rate;
      estimatedFederalTax = tax; // ISR uses table: fixed + marginal
      breakdown.push({
        bracket: bracket.up_to === Infinity
          ? `Over $${prevLimit.toLocaleString()} MXN`
          : `$${prevLimit.toLocaleString()} – $${bracket.up_to.toLocaleString()} MXN`,
        rate: bracket.rate, taxable: bracketSize, tax,
      });
      prevLimit = bracket.up_to;
      break; // ISR is a lookup — find the bracket and stop
    }

    const totalTax = estimatedFederalTax;
    const effectiveTaxRate = grossRevenue > 0 ? totalTax / grossRevenue : 0;
    return {
      grossRevenue, totalDeductions, deductionsByCategory,
      netIncome, selfEmploymentTax: 0, seTaxDeduction: 0,
      adjustedGrossIncome: netIncome, standardDeduction: 0,
      taxableIncome, estimatedFederalTax,
      effectiveTaxRate,
      quarterlyPaymentDue: Math.ceil(totalTax / 12), // Mexico = monthly ISR payments
      ytdPaid: ytdEstimatedPaid,
      breakdown,
    };

  } else {
    // ── United States (default) ────────────────────────────────────────────
    if (isSelfEmployed && netIncome > 400) {
      const seBase = netIncome * 0.9235;
      selfEmploymentTax = seBase <= SS_WAGE_BASE_2024
        ? seBase * SE_TAX_RATE
        : (SS_WAGE_BASE_2024 * 0.124) + (seBase * 0.029);
      seTaxDeduction = selfEmploymentTax * 0.5;
    }

    const adjustedGrossIncome = Math.max(0, netIncome - seTaxDeduction);
    const taxableIncome       = Math.max(0, adjustedGrossIncome - STANDARD_DEDUCTION_2024);

    let remaining = taxableIncome;
    let prevLimit = 0;
    for (const bracket of FEDERAL_BRACKETS_2024) {
      if (remaining <= 0) break;
      const bracketSize = bracket.up_to === Infinity ? remaining : Math.min(remaining, bracket.up_to - prevLimit);
      const tax = bracketSize * bracket.rate;
      estimatedFederalTax += tax;
      if (bracketSize > 0) {
        breakdown.push({
          bracket: bracket.up_to === Infinity ? `Over $${prevLimit.toLocaleString()}` : `$${prevLimit.toLocaleString()} – $${bracket.up_to.toLocaleString()}`,
          rate: bracket.rate, taxable: bracketSize, tax,
        });
      }
      remaining -= bracketSize;
      prevLimit  = bracket.up_to;
    }

    const totalTax = estimatedFederalTax + selfEmploymentTax;
    const effectiveTaxRate = grossRevenue > 0 ? totalTax / grossRevenue : 0;
    return {
      grossRevenue, totalDeductions, deductionsByCategory,
      netIncome, selfEmploymentTax, seTaxDeduction,
      adjustedGrossIncome, standardDeduction: STANDARD_DEDUCTION_2024,
      taxableIncome, estimatedFederalTax,
      effectiveTaxRate,
      quarterlyPaymentDue: Math.ceil(totalTax / 4),
      ytdPaid: ytdEstimatedPaid,
      breakdown,
    };
  }
}

// ─── Payroll Tax Calculations ─────────────────────────────────────────────────

export interface PayrollTaxSummary {
  country: "US" | "CA" | "MX";
  totalWages: number;
  employeeCount: number;
  // US fields
  employeeSSHeld: number;        // SS withheld from employees (US) / CPP employee (CA)
  employerSSMatch: number;       // employer SS match (US) / CPP employer (CA)
  employeeMedicareHeld: number;  // Medicare employee (US) / EI employee (CA)
  employerMedicareMatch: number; // Medicare employer (US) / EI employer (CA)
  futaTax: number;               // FUTA (US only)
  sutaTax: number;               // SUTA (US) / IMSS employer portion (MX) / 0 (CA)
  totalEmployerLiability: number;
  totalEmployeeWithholding: number;
  depositDeadline: string;
  perEmployee: Array<{
    name: string; wages: number; ssHeld: number; medicareHeld: number; netPay: number;
  }>;
}

export function calculatePayrollTax(
  employees: Employee[],
  hoursWorkedPerEmployee: Record<string, number>,
  stateCode: string,
  ytdWagesPerEmployee: Record<string, number> = {},
  country: "US" | "CA" | "MX" = "US",
): PayrollTaxSummary {
  if (country === "CA") {
    // ── Canada: CPP + EI ────────────────────────────────────────────────────
    let totalWages = 0;
    let employeeCPP = 0, employerCPP = 0;
    let employeeEI  = 0, employerEI  = 0;

    const perEmployee = employees.map(emp => {
      const hours = hoursWorkedPerEmployee[emp.id] ?? 0;
      const wages = emp.payrollType === "hourly"
        ? hours * emp.hourlyWage
        : emp.payrollType === "daily"
        ? emp.dailyWage
        : emp.hourlyWage;

      const ytdWages = ytdWagesPerEmployee[emp.id] ?? 0;

      // CPP: 5.95% employee on pensionable earnings up to $68,500, exemption $3,500
      const cppExemption = 3500;
      const pensionableWages = Math.max(0, Math.min(wages, CA_FEDERAL.cppMax - Math.max(ytdWages, cppExemption)));
      const cppEmp = pensionableWages * CA_FEDERAL.cppRate;
      const cppEr  = pensionableWages * CA_FEDERAL.cppRate; // employer matches exactly

      // EI: 1.66% employee on insurable earnings up to $63,200
      const eiWages = Math.max(0, Math.min(wages, CA_FEDERAL.eiMax - ytdWages));
      const eiEmp   = eiWages * CA_FEDERAL.eiRate;
      const eiEr    = eiEmp * CA_FEDERAL.eiEmployerMultiplier;

      totalWages  += wages;
      employeeCPP += cppEmp;
      employerCPP += cppEr;
      employeeEI  += eiEmp;
      employerEI  += eiEr;

      return {
        name: emp.name, wages,
        ssHeld:       cppEmp, // reuse field: CPP employee
        medicareHeld: eiEmp,  // reuse field: EI employee
        netPay: wages - cppEmp - eiEmp,
      };
    });

    const totalEmployeeWithholding = employeeCPP + employeeEI;
    const totalEmployerLiability   = employerCPP + employerEI;

    return {
      country: "CA",
      totalWages, employeeCount: employees.length,
      employeeSSHeld:        employeeCPP,
      employerSSMatch:       employerCPP,
      employeeMedicareHeld:  employeeEI,
      employerMedicareMatch: employerEI,
      futaTax: 0, sutaTax: 0,
      totalEmployerLiability,
      totalEmployeeWithholding,
      depositDeadline: getNextBusinessDay(3),
      perEmployee,
    };

  } else if (country === "MX") {
    // ── Mexico: IMSS ─────────────────────────────────────────────────────────
    // IMSS employer ~17.15%, employee ~1.25% (simplified — actual varies by salary band)
    const IMSS_EMPLOYER_RATE = 0.1715;
    const IMSS_EMPLOYEE_RATE = 0.0125;
    // INFONAVIT employer 5% of integrated salary (included in sutaTax field)
    const INFONAVIT_RATE = 0.05;

    let totalWages = 0, employeeIMSS = 0, employerIMSS = 0, infonavit = 0;

    const perEmployee = employees.map(emp => {
      const hours = hoursWorkedPerEmployee[emp.id] ?? 0;
      const wages = emp.payrollType === "hourly"
        ? hours * emp.hourlyWage
        : emp.payrollType === "daily"
        ? emp.dailyWage
        : emp.hourlyWage;

      const empIMSS = wages * IMSS_EMPLOYEE_RATE;
      const erIMSS  = wages * IMSS_EMPLOYER_RATE;
      const erINFO  = wages * INFONAVIT_RATE;

      totalWages   += wages;
      employeeIMSS += empIMSS;
      employerIMSS += erIMSS;
      infonavit    += erINFO;

      return {
        name: emp.name, wages,
        ssHeld: empIMSS,       // IMSS employee
        medicareHeld: 0,
        netPay: wages - empIMSS,
      };
    });

    return {
      country: "MX",
      totalWages, employeeCount: employees.length,
      employeeSSHeld:        employeeIMSS,
      employerSSMatch:       employerIMSS,
      employeeMedicareHeld:  0,
      employerMedicareMatch: 0,
      futaTax:  0,
      sutaTax:  infonavit,    // reuse field for INFONAVIT
      totalEmployerLiability:   employerIMSS + infonavit,
      totalEmployeeWithholding: employeeIMSS,
      depositDeadline: getNextBusinessDay(17),
      perEmployee,
    };

  } else {
    // ── United States (default) ──────────────────────────────────────────────
    const sutaRate  = SUTA_RATES[stateCode]    ?? SUTA_RATES.DEFAULT;
    const sutaBase  = SUTA_WAGE_BASE[stateCode] ?? SUTA_WAGE_BASE.DEFAULT;

    let totalWages = 0, employeeSSHeld = 0, employerSSMatch = 0;
    let employeeMedicareHeld = 0, employerMedicareMatch = 0;
    let futaTax = 0, sutaTax = 0;

    const perEmployee = employees.map(emp => {
      const hours = hoursWorkedPerEmployee[emp.id] ?? 0;
      const wages = emp.payrollType === "hourly"
        ? hours * emp.hourlyWage
        : emp.payrollType === "daily"
        ? emp.dailyWage
        : emp.hourlyWage;

      const ytdWages = ytdWagesPerEmployee[emp.id] ?? 0;

      const ssWages  = Math.max(0, Math.min(wages, SS_WAGE_BASE_2024 - ytdWages));
      const ssHeld   = ssWages * SS_EMPLOYEE_RATE;
      const ssMatch  = ssWages * SS_EMPLOYER_RATE;
      const medHeld  = wages * MEDICARE_EMPLOYEE;
      const medMatch = wages * MEDICARE_EMPLOYER;
      const futaWages = Math.max(0, Math.min(wages, FUTA_WAGE_BASE - ytdWages));
      const empFuta   = futaWages * FUTA_RATE;
      const sutaWages = Math.max(0, Math.min(wages, sutaBase - ytdWages));
      const empSuta   = sutaWages * sutaRate;

      totalWages             += wages;
      employeeSSHeld         += ssHeld;
      employerSSMatch        += ssMatch;
      employeeMedicareHeld   += medHeld;
      employerMedicareMatch  += medMatch;
      futaTax += empFuta;
      sutaTax += empSuta;

      return { name: emp.name, wages, ssHeld, medicareHeld: medHeld, netPay: wages - ssHeld - medHeld };
    });

    return {
      country: "US",
      totalWages, employeeCount: employees.length,
      employeeSSHeld, employerSSMatch,
      employeeMedicareHeld, employerMedicareMatch,
      futaTax, sutaTax,
      totalEmployerLiability:   employerSSMatch + employerMedicareMatch + futaTax + sutaTax,
      totalEmployeeWithholding: employeeSSHeld + employeeMedicareHeld,
      depositDeadline: getNextBusinessDay(3),
      perEmployee,
    };
  }
}

function getNextBusinessDay(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── Excise Taxes ─────────────────────────────────────────────────────────────

export interface ExciseTaxSummary {
  category: string;
  units: number;
  unitLabel: string;
  ratePerUnit: number;
  totalExcise: number;
  federalDueDate: string;
  notes: string;
}

export function estimateTobaccoExcise(packsOfCigarettes: number): ExciseTaxSummary {
  return {
    category: "Tobacco (Cigarettes)",
    units: packsOfCigarettes,
    unitLabel: "packs",
    ratePerUnit: EXCISE_RATES.tobacco_cigarettes_per_pack,
    totalExcise: packsOfCigarettes * EXCISE_RATES.tobacco_cigarettes_per_pack,
    federalDueDate: "Quarterly — end of month following quarter",
    notes: "Federal cigarette excise is $1.01/pack. State excise is additional — check your state's rate.",
  };
}

export function estimateFuelExcise(gallonsRegular: number, gallonsDiesel = 0): ExciseTaxSummary {
  const total = (gallonsRegular * EXCISE_RATES.fuel_gas_per_gallon) + (gallonsDiesel * EXCISE_RATES.fuel_diesel_per_gallon);
  return {
    category: "Motor Fuel",
    units: gallonsRegular + gallonsDiesel,
    unitLabel: "gallons",
    ratePerUnit: EXCISE_RATES.fuel_gas_per_gallon,
    totalExcise: total,
    federalDueDate: "Semi-monthly deposits required",
    notes: "Fuel excise is typically paid by the distributor, not the retailer. Verify with your supplier.",
  };
}

// ─── Tax Dashboard ─────────────────────────────────────────────────────────────

export interface TaxDashboard {
  salesTaxCollectedMTD: number;
  salesTaxCollectedQTD: number;
  salesTaxDueDate: string;
  salesTaxDaysUntilDue: number;
  estimatedIncomeTaxOwed: number;
  quarterlyTaxDue: number;
  nextQuarterlyDeadline: { quarter: string; dueDate: string; label: string };
  daysUntilQuarterly: number;
  payrollTaxDue: number | null;
  totalTaxLiability: number;
  upcomingDeadlines: Array<{ name: string; daysAway: number; amount: number | null; date: string }>;
}

export function buildTaxDashboard(
  salesTaxMTD: SalesTaxSummary | null,
  salesTaxQTD: SalesTaxSummary | null,
  incomeTax: IncomeTaxSummary | null,
  payrollTax: PayrollTaxSummary | null,
  country: "US" | "CA" | "MX" = "US",
): TaxDashboard {
  const now = new Date();

  // Next quarterly deadline (country-aware)
  const deadlineList = getQuarterlyDeadlines(country);
  const nextQ = deadlineList.find(q => new Date(q.dueDate) > now) ?? deadlineList[deadlineList.length - 1];
  const daysUntilQ = Math.ceil((new Date(nextQ.dueDate).getTime() - now.getTime()) / 86_400_000);

  const salesTaxLiability = salesTaxMTD?.remitAmount ?? 0;
  const incomeTaxLiability = incomeTax?.quarterlyPaymentDue ?? 0;
  const payrollLiability   = payrollTax?.totalEmployerLiability ?? 0;

  const totalTaxLiability = salesTaxLiability + incomeTaxLiability + payrollLiability;

  const deadlines: TaxDashboard["upcomingDeadlines"] = [];
  if (salesTaxMTD) {
    deadlines.push({
      name: "Sales Tax Filing",
      daysAway: salesTaxMTD.daysUntilDeadline,
      amount: salesTaxMTD.remitAmount,
      date: salesTaxMTD.filingDeadline,
    });
  }
  deadlines.push({
    name: `${nextQ.quarter} Estimated Tax`,
    daysAway: daysUntilQ,
    amount: incomeTax?.quarterlyPaymentDue ?? null,
    date: nextQ.label,
  });
  if (payrollTax) {
    deadlines.push({
      name: "Payroll Tax Deposit",
      daysAway: 3,
      amount: payrollTax.totalEmployerLiability + payrollTax.totalEmployeeWithholding,
      date: payrollTax.depositDeadline,
    });
  }

  return {
    salesTaxCollectedMTD: salesTaxMTD?.taxCollected ?? 0,
    salesTaxCollectedQTD: salesTaxQTD?.taxCollected ?? 0,
    salesTaxDueDate: salesTaxMTD?.filingDeadline ?? "N/A",
    salesTaxDaysUntilDue: salesTaxMTD?.daysUntilDeadline ?? 0,
    estimatedIncomeTaxOwed: incomeTax ? incomeTax.estimatedFederalTax + incomeTax.selfEmploymentTax : 0,
    quarterlyTaxDue: incomeTax?.quarterlyPaymentDue ?? 0,
    nextQuarterlyDeadline: nextQ,
    daysUntilQuarterly: daysUntilQ,
    payrollTaxDue: payrollTax ? payrollTax.totalEmployerLiability + payrollTax.totalEmployeeWithholding : null,
    totalTaxLiability,
    upcomingDeadlines: deadlines.sort((a, b) => a.daysAway - b.daysAway).slice(0, 3),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentQuarterDates(): { start: Date; end: Date } {
  const now = new Date();
  const month = now.getMonth();
  const q = Math.floor(month / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end   = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { start, end };
}

export function getCurrentMonthDates(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

export function formatTaxRate(rate: number): string {
  return (rate * 100).toFixed(3).replace(/\.?0+$/, "") + "%";
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export const TAX_PROFILE_KEY = "storehub_tax_profile";
export const TAX_EXEMPT_KEY  = "storehub_tax_exempt_products";

export function saveTaxProfile(profile: TaxProfile): void {
  localStorage.setItem(TAX_PROFILE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
}

export function loadTaxProfile(): TaxProfile | null {
  try {
    const raw = localStorage.getItem(TAX_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaxProfile;
    // Migration: older profiles without a country field default to "US"
    if (!parsed.country) parsed.country = "US";
    return parsed;
  } catch { return null; }
}

export function saveTaxExemptProducts(list: TaxExemptProduct[]): void {
  localStorage.setItem(TAX_EXEMPT_KEY, JSON.stringify(list));
}

export function loadTaxExemptProducts(): TaxExemptProduct[] {
  try {
    return JSON.parse(localStorage.getItem(TAX_EXEMPT_KEY) ?? "[]");
  } catch { return []; }
}

export function getTaxAlerts(dashboard: TaxDashboard): Array<{ level: "critical" | "warning" | "info"; message: string }> {
  const alerts: Array<{ level: "critical" | "warning" | "info"; message: string }> = [];

  dashboard.upcomingDeadlines.forEach(d => {
    if (d.daysAway <= 3) {
      alerts.push({
        level: "critical",
        message: `${d.name} is due in ${d.daysAway} day${d.daysAway !== 1 ? "s" : ""}${d.amount ? ` — remit ${formatUSD(d.amount)}` : ""}.`,
      });
    } else if (d.daysAway <= 14) {
      alerts.push({
        level: "warning",
        message: `${d.name} is due in ${d.daysAway} days${d.amount ? ` — ${formatUSD(d.amount)} owed` : ""}. Start preparing now.`,
      });
    }
  });

  if (dashboard.totalTaxLiability > 5000) {
    alerts.push({
      level: "info",
      message: `Your total current tax liability is ${formatUSD(dashboard.totalTaxLiability)}. Make sure funds are set aside.`,
    });
  }

  return alerts;
}
