import { US_STATE_SALES_TAX_AVG } from "../data/usStateSalesTaxAvg.js";

const MX_BORDER_IVA_STATES = new Set(["BCN", "CHH", "COA", "SON", "TAM", "NLE"]);

export type SalesTaxEstimateInput = {
  country?: string | null;
  stateCode?: string | null;
  businessType?: string | null;
  storeCity?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Client already dismissed these prompt ids */
  dismissedPromptIds?: string[];
  /** Profile already confirmed this jurisdiction (ISO-ish key e.g. US-TX) */
  confirmedJurisdictionKey?: string | null;
  taxJurisdictionConfirmedAt?: Date | string | null;
};

export type TaxPrompt = { id: string; message: string };

export type SalesTaxEstimateResult = {
  jurisdictionKey: string;
  /** Decimal rate e.g. 0.0825 for 8.25% */
  recommendedRate: number;
  /** Same as recommendedRate * 100 for POS display */
  recommendedTaxPercent: number;
  basis: "us_state_avg" | "mx_iva_general" | "mx_iva_border" | "unknown";
  notes: string[];
  prompts: TaxPrompt[];
  duplicatePromptsSuppressed: boolean;
};

function normCountry(c?: string | null): string {
  const u = (c ?? "US").toUpperCase();
  if (u === "USA") return "US";
  return u.length === 2 ? u : "US";
}

function normState(c?: string | null): string {
  return (c ?? "").toUpperCase().trim().slice(0, 20);
}

/**
 * Heuristic sales-tax suggestion from jurisdiction + store type.
 * Not legal advice; POS should still allow manual override.
 */
export function estimateSalesTax(input: SalesTaxEstimateInput): SalesTaxEstimateResult {
  const country = normCountry(input.country);
  const state = normState(input.stateCode);
  const notes: string[] = [];
  const prompts: TaxPrompt[] = [];
  let duplicatePromptsSuppressed = false;

  const businessType = (input.businessType ?? "other").toLowerCase();
  if (businessType === "grocery" || businessType === "butcher" || businessType === "bakery") {
    notes.push(
      "Many jurisdictions exempt or reduce tax on unprepared food; verify categories at checkout — this rate is a default retail estimate.",
    );
  }
  if (businessType === "restaurant") {
    notes.push("Prepared food is often fully taxable even where groceries are reduced; confirm local rules for dine-in vs takeout.");
  }

  if (input.latitude != null && input.longitude != null) {
    notes.push(
      "Coordinates were considered for future precision; current suggestion still uses state-level averages until local-rate data is wired.",
    );
  }
  if (input.storeCity?.trim()) {
    notes.push(`City "${input.storeCity.trim()}" may add local surcharges beyond the state average — review ${state || "your"} local tax authority.`);
  }

  if (country === "MX") {
    const mxState = state || "DEFAULT";
    const border = MX_BORDER_IVA_STATES.has(mxState);
    const rate = border ? 0.08 : 0.16;
    const jurisdictionKey = `MX-${mxState || "XX"}`;
    const confirmId = "confirm_mx_jurisdiction";
    if (input.confirmedJurisdictionKey === jurisdictionKey && input.taxJurisdictionConfirmedAt) {
      duplicatePromptsSuppressed = true;
    } else if (!(input.dismissedPromptIds ?? []).includes(confirmId)) {
      prompts.push({
        id: confirmId,
        message: "Confirm your store is in Mexico and the correct state for IVA (16% general, 8% in listed border municipalities).",
      });
    }
    return {
      jurisdictionKey,
      recommendedRate: rate,
      recommendedTaxPercent: rate * 100,
      basis: border ? "mx_iva_border" : "mx_iva_general",
      notes,
      prompts,
      duplicatePromptsSuppressed,
    };
  }

  if (!state || state.length !== 2) {
    const jurisdictionKey = "US-??";
    const id = "missing_state";
    if (!(input.dismissedPromptIds ?? []).includes(id)) {
      prompts.push({ id, message: "Set your country and state/province in store settings for a sales tax estimate." });
    }
    return {
      jurisdictionKey,
      recommendedRate: 0,
      recommendedTaxPercent: 0,
      basis: "unknown",
      notes,
      prompts,
      duplicatePromptsSuppressed: false,
    };
  }

  const jurisdictionKey = `US-${state}`;
  const avg = US_STATE_SALES_TAX_AVG[state];
  const rate = typeof avg === "number" ? avg : 0;

  const confirmId = "confirm_us_state_jurisdiction";
  if (input.confirmedJurisdictionKey === jurisdictionKey && input.taxJurisdictionConfirmedAt) {
    duplicatePromptsSuppressed = true;
  } else if (!(input.dismissedPromptIds ?? []).includes(confirmId)) {
    prompts.push({
      id: confirmId,
      message: `Confirm retail sales tax for ${state} — shown rate is an average (state + typical local). Actual due may differ by exact address.`,
    });
  }

  if (rate === 0 && state !== "DE" && state !== "NH" && state !== "OR" && state !== "MT") {
    notes.push("This state shows 0% combined average in our table — verify exemptions still apply for your product categories.");
  }

  return {
    jurisdictionKey,
    recommendedRate: rate,
    recommendedTaxPercent: Number((rate * 100).toFixed(3)),
    basis: "us_state_avg",
    notes,
    prompts,
    duplicatePromptsSuppressed,
  };
}
