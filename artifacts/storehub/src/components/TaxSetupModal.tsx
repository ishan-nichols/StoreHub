import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { TaxProfile, BusinessStructure, FilingFrequency } from "../services/taxService";
import { saveTaxProfile } from "../services/taxService";
import { US_REGIONS, CA_REGIONS, MX_REGIONS, fmtRate, getCountryRegions } from "../data/taxData";
import type { TaxRegion } from "../data/taxData";

type Country = "US" | "CA" | "MX";
type Step = "country" | "structure" | "location" | "employees" | "salestax" | "fiscal" | "review";

const STEPS: Step[] = ["country", "structure", "location", "employees", "salestax", "fiscal", "review"];

// ─── Country options ──────────────────────────────────────────────────────────

const COUNTRY_OPTIONS: { value: Country; flag: string; label: string; sub: string }[] = [
  { value: "US", flag: "🇺🇸", label: "United States", sub: "IRS, Sales Tax, SS/Medicare" },
  { value: "CA", flag: "🇨🇦", label: "Canada",         sub: "CRA, GST/HST, CPP/EI" },
  { value: "MX", flag: "🇲🇽", label: "Mexico",         sub: "SAT, IVA, IMSS/ISR" },
];

// ─── Business structure options (country-aware) ───────────────────────────────

function getStructures(country: Country): { value: BusinessStructure; label: string; desc: string; emoji: string }[] {
  if (country === "CA") {
    return [
      { value: "sole_prop",   emoji: "🧑",  label: "Sole Proprietor",       desc: "File on T1 General with business income" },
      { value: "llc",         emoji: "🏢",  label: "Corporation / Inc.",     desc: "CCPC — file T2 corporate return" },
      { value: "s_corp",      emoji: "📋",  label: "Professional Corp.",     desc: "For regulated professions (dentists, lawyers)" },
      { value: "c_corp",      emoji: "🏛️",  label: "Public Corporation",     desc: "Not a CCPC — general corporate rates apply" },
      { value: "partnership", emoji: "🤝",  label: "Partnership",           desc: "T5013 partnership return required" },
    ];
  }
  if (country === "MX") {
    return [
      { value: "sole_prop",   emoji: "🧑",  label: "Persona Física con Actividad Empresarial", desc: "Régimen General o Simplified Trust (RESICO)" },
      { value: "llc",         emoji: "🏢",  label: "Sociedad de Responsabilidad Limitada (S. de R.L.)", desc: "Similar to LLC — limited liability" },
      { value: "s_corp",      emoji: "📋",  label: "Sociedad Anónima (S.A.)",                  desc: "Standard Mexican corporation" },
      { value: "c_corp",      emoji: "🏛️",  label: "Sociedad Anónima de Capital Variable (S.A. de C.V.)", desc: "Variable capital corporation — most common" },
      { value: "partnership", emoji: "🤝",  label: "Sociedad Civil (S.C.)",                    desc: "Civil partnership for professional services" },
    ];
  }
  // US
  return [
    { value: "sole_prop",   emoji: "🧑",  label: "Sole Proprietor",  desc: "File on Schedule C (Form 1040)" },
    { value: "llc",         emoji: "🏢",  label: "LLC",              desc: "Taxed as sole prop or S-Corp" },
    { value: "s_corp",      emoji: "📋",  label: "S-Corporation",    desc: "Pass-through income to shareholders" },
    { value: "c_corp",      emoji: "🏛️",  label: "C-Corporation",    desc: "Entity-level taxation" },
    { value: "partnership", emoji: "🤝",  label: "Partnership",      desc: "Pass-through, file Form 1065" },
  ];
}

// ─── Filing frequency options (country-aware) ─────────────────────────────────

function getFrequencies(country: Country): { value: FilingFrequency; label: string; desc: string }[] {
  if (country === "CA") {
    return [
      { value: "monthly",   label: "Monthly",   desc: "Revenue > $6M/year — due 1 month after period" },
      { value: "quarterly", label: "Quarterly", desc: "Most small businesses — Apr 30, Jul 31, Oct 31, Jan 31" },
      { value: "annual",    label: "Annual",    desc: "Revenue < $1.5M — due Jun 15 (individuals)" },
    ];
  }
  if (country === "MX") {
    return [
      { value: "monthly",   label: "Monthly",   desc: "IVA filed monthly — due 17th of following month" },
      { value: "quarterly", label: "Quarterly", desc: "RESICO simplified regime quarterly payments" },
      { value: "annual",    label: "Annual",    desc: "Annual ISR declaration — April 30 for individuals" },
    ];
  }
  return [
    { value: "monthly",   label: "Monthly",   desc: "Over $1,200/month in sales tax" },
    { value: "quarterly", label: "Quarterly", desc: "Most small businesses" },
    { value: "annual",    label: "Annual",    desc: "Under $100/year in sales tax" },
  ];
}

// ─── Sales tax step labels (country-aware) ────────────────────────────────────

function getSalesTaxConfig(country: Country, stateName: string) {
  if (country === "CA") {
    return {
      question: "Are you registered for GST/HST?",
      subtitle: "Required if annual revenue exceeds $30,000 CAD.",
      yesLabel: "Yes, I am GST/HST registered",
      noLabel:  "No, below the $30,000 threshold",
      registrationQuestion: `Are you registered with the CRA in ${stateName || "your province"}?`,
      notRegisteredNote: `Action needed: Register for a GST/HST account with the CRA online if your revenue exceeds $30,000 CAD in any 12-month period.`,
    };
  }
  if (country === "MX") {
    return {
      question: "Are you registered for IVA?",
      subtitle: "16% IVA applies to most retail sales in Mexico.",
      yesLabel: "Yes, I collect IVA (16%)",
      noLabel:  "No, my sales are IVA-exempt",
      registrationQuestion: `Are you registered with the SAT for IVA in ${stateName || "your state"}?`,
      notRegisteredNote: `Action needed: Register with the SAT (servicioadministraciontributaria.gob.mx) for IVA. Most retail businesses must collect 16% IVA.`,
    };
  }
  return {
    question: "Do you collect sales tax?",
    subtitle: "Most retail businesses do. Most US states require sales tax collection on taxable goods.",
    yesLabel: "Yes, I collect sales tax",
    noLabel:  "No, my business is tax-exempt",
    registrationQuestion: `Are you registered for sales tax in ${stateName || "your state"}?`,
    notRegisteredNote: `Action needed: Register for a sales tax permit with ${stateName || "your state"}'s department of revenue before collecting. Most states offer free online registration.`,
  };
}

// ─── Location list label (country-aware) ────────────────────────────────────

function getLocationLabel(country: Country, region: TaxRegion): string {
  if (country === "CA") {
    const gst = 0.05;
    const prov = region.stateTaxRate;
    const combined = region.combinedAvgRate;
    if (prov === 0) return `GST ${fmtRate(gst)} only`;
    if (Math.abs(combined - prov) < 0.001) {
      return `HST ${fmtRate(prov)} · combined avg ${fmtRate(combined)}`;
    }
    return `Prov ${fmtRate(prov)} + GST 5% = ${fmtRate(combined)}`;
  }
  if (country === "MX") {
    return `IVA ${fmtRate(region.combinedAvgRate)}`;
  }
  return `${fmtRate(region.stateTaxRate)} state · ${fmtRate(region.combinedAvgRate)} avg combined`;
}

// ─── Review row helpers ───────────────────────────────────────────────────────

function getReviewRows(form: Omit<TaxProfile, "updatedAt">, country: Country, structures: ReturnType<typeof getStructures>, frequencies: ReturnType<typeof getFrequencies>) {
  const taxRateLabel = () => {
    if (!form.collectsSalesTax) return "N/A";
    if (country === "CA") {
      if (form.stateTaxRate === 0) return `GST 5% only (${fmtRate(form.salesTaxRate)})`;
      if (Math.abs(form.salesTaxRate - form.stateTaxRate) < 0.001) return `HST ${fmtRate(form.salesTaxRate)}`;
      return `GST 5% + Prov ${fmtRate(form.stateTaxRate)} = ${fmtRate(form.salesTaxRate)}`;
    }
    if (country === "MX") return `IVA ${fmtRate(form.salesTaxRate)}`;
    return `${fmtRate(form.salesTaxRate)} (combined avg)`;
  };

  const taxLabel = country === "CA" ? "GST/HST Rate" : country === "MX" ? "IVA Rate" : "Sales Tax Rate";
  const locationLabel = country === "CA" ? "Province" : country === "MX" ? "Estado" : "State";

  return [
    { label: "Country",            value: COUNTRY_OPTIONS.find(c => c.value === country)?.label ?? country },
    { label: "Business Structure", value: structures.find(s => s.value === form.businessStructure)?.label ?? form.businessStructure },
    { label: locationLabel,        value: form.stateName || "Not set" },
    { label: "City",               value: form.city || "Not specified" },
    { label: "Has Employees",      value: form.hasEmployees ? "Yes" : "No" },
    { label: country === "CA" ? "Collects GST/HST" : country === "MX" ? "Collects IVA" : "Collects Sales Tax",
      value: form.collectsSalesTax ? "Yes" : "No" },
    { label: taxLabel,             value: taxRateLabel() },
    { label: "Filing Frequency",   value: frequencies.find(f => f.value === form.filingFrequency)?.label ?? form.filingFrequency },
    { label: "Fiscal Year",        value: form.fiscalYearType === "calendar" ? "January – December" : "Custom" },
  ];
}

// ─── Blank form ───────────────────────────────────────────────────────────────

const BLANK: Omit<TaxProfile, "updatedAt"> = {
  country: "US",
  businessStructure: "sole_prop",
  stateCode: "", stateName: "", city: "",
  hasEmployees: false,
  collectsSalesTax: true,
  salesTaxRegistered: false,
  fiscalYearType: "calendar",
  filingFrequency: "quarterly",
  salesTaxRate: 0, stateTaxRate: 0, countyTaxRate: 0, cityTaxRate: 0,
  setupComplete: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TaxSetupModal({ existing, onSave, onClose }: {
  existing: Partial<TaxProfile> | null;
  onSave: (profile: TaxProfile) => void;
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx]   = useState(0);
  const [form, setForm]         = useState<Omit<TaxProfile, "updatedAt">>({ ...BLANK, ...(existing ?? {}) });
  const [locationSearch, setLocationSearch] = useState("");

  const currentStep = STEPS[stepIdx];
  const country: Country = form.country ?? "US";
  const structures  = getStructures(country);
  const frequencies = getFrequencies(country);
  const regions     = getCountryRegions(country);

  function setF<K extends keyof TaxProfile>(key: K, val: TaxProfile[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function selectCountry(c: Country) {
    // Reset location when country changes
    setForm(prev => ({
      ...prev,
      country: c,
      stateCode: "", stateName: "",
      salesTaxRate: 0, stateTaxRate: 0, countyTaxRate: 0, cityTaxRate: 0,
    }));
    setLocationSearch("");
    setStepIdx(i => i + 1);
  }

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx(i => i + 1);
  }
  function back() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  function save() {
    const profile: TaxProfile = { ...form, setupComplete: true, updatedAt: new Date().toISOString() };
    saveTaxProfile(profile);
    onSave(profile);
  }

  const progress = ((stepIdx + 1) / STEPS.length) * 100;
  const salesTaxCfg = getSalesTaxConfig(country, form.stateName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Tax Profile Setup</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-stone-100 rounded-full w-32 overflow-hidden">
                <div className="h-full bg-stone-900 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-stone-400">{stepIdx + 1}/{STEPS.length}</span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">

          {/* Step 0: Country */}
          {currentStep === "country" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-stone-900">Where is your business located?</h3>
                <p className="text-sm text-stone-400 mt-1">This determines which tax system applies.</p>
              </div>
              <div className="space-y-3">
                {COUNTRY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => selectCountry(opt.value)}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all ${
                      country === opt.value
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <span className="text-3xl">{opt.flag}</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-stone-900">{opt.label}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{opt.sub}</p>
                    </div>
                    {country === opt.value && <Check size={16} className="text-stone-900 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Business Structure */}
          {currentStep === "structure" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-stone-900">What's your business structure?</h3>
                <p className="text-sm text-stone-400 mt-1">This determines how your income taxes are calculated.</p>
              </div>
              <div className="space-y-2">
                {structures.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setF("businessStructure", s.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                      form.businessStructure === s.value
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-stone-900">{s.label}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{s.desc}</p>
                    </div>
                    {form.businessStructure === s.value && <Check size={16} className="text-stone-900 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Location */}
          {currentStep === "location" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-stone-900">
                  {country === "CA" ? "Which province or territory?" : country === "MX" ? "¿En qué estado opera?" : "Where is your business?"}
                </h3>
                <p className="text-sm text-stone-400 mt-1">
                  {country === "CA"
                    ? "Determines your GST/HST or PST/QST rates automatically."
                    : country === "MX"
                    ? "Determina tu tasa de IVA (8% zona fronteriza, 16% resto del país)."
                    : "Determines your sales tax rates automatically."}
                </p>
              </div>
              <input
                type="text"
                placeholder={country === "CA" ? "Search province…" : country === "MX" ? "Buscar estado…" : "Search state…"}
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                className="w-full border-2 border-stone-200 focus:border-stone-900 rounded-2xl px-4 py-3 text-sm focus:outline-none bg-white transition-colors"
                autoFocus
              />
              <div className="max-h-52 overflow-y-auto rounded-2xl border border-stone-200 bg-white divide-y divide-stone-50">
                {regions
                  .filter(r =>
                    r.stateName.toLowerCase().includes(locationSearch.toLowerCase()) ||
                    r.stateCode.toLowerCase().includes(locationSearch.toLowerCase())
                  )
                  .map(region => (
                    <button
                      key={region.code}
                      onClick={() => {
                        setForm(prev => ({
                          ...prev,
                          stateCode:    region.stateCode,
                          stateName:    region.stateName,
                          salesTaxRate: region.combinedAvgRate,
                          stateTaxRate: region.stateTaxRate,
                          countyTaxRate: region.countyTaxRate,
                          cityTaxRate:  region.cityTaxRate,
                        }));
                      }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                        form.stateCode === region.stateCode
                          ? "bg-stone-900 text-white font-semibold"
                          : "text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      <span className="font-medium">{region.stateName}</span>
                      <span className="ml-2 text-xs opacity-60">
                        {getLocationLabel(country, region)}
                      </span>
                    </button>
                  ))}
              </div>
              {form.stateCode && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm">
                  <p className="font-semibold text-emerald-800">✓ {form.stateName} selected</p>
                  <p className="text-emerald-700 mt-1">
                    {country === "CA" && form.stateTaxRate === 0 && "GST 5% only — no provincial sales tax."}
                    {country === "CA" && form.stateTaxRate > 0 && Math.abs(form.salesTaxRate - form.stateTaxRate) < 0.001 &&
                      `HST ${fmtRate(form.stateTaxRate)} (includes federal + provincial portion)`}
                    {country === "CA" && form.stateTaxRate > 0 && Math.abs(form.salesTaxRate - form.stateTaxRate) >= 0.001 &&
                      `GST 5% + Provincial ${fmtRate(form.stateTaxRate)} = Combined ${fmtRate(form.salesTaxRate)}`}
                    {country === "MX" &&
                      `IVA: ${fmtRate(form.salesTaxRate)}${form.salesTaxRate === 0.08 ? " (Zona Libre Frontera Norte)" : " (tasa estándar)"}`}
                    {country === "US" &&
                      <>Combined avg: <strong>{fmtRate(form.salesTaxRate)}</strong>
                      {" · "}State: {fmtRate(form.stateTaxRate)}
                      {form.countyTaxRate > 0 && ` · County: ${fmtRate(form.countyTaxRate)}`}
                      {form.cityTaxRate > 0 && ` · City: ${fmtRate(form.cityTaxRate)}`}</>}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  {country === "MX" ? "Ciudad (opcional)" : "City (optional)"}
                </label>
                <input
                  type="text"
                  placeholder={country === "MX" ? "ej. Guadalajara" : country === "CA" ? "e.g. Toronto" : "e.g. Austin"}
                  value={form.city}
                  onChange={e => setF("city", e.target.value)}
                  className="w-full border-2 border-stone-200 focus:border-stone-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none bg-white"
                />
              </div>
            </div>
          )}

          {/* Step 3: Employees */}
          {currentStep === "employees" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold text-stone-900">Do you have employees?</h3>
                <p className="text-sm text-stone-400 mt-1">
                  {country === "CA"
                    ? "Determines CPP and EI payroll obligations."
                    : country === "MX"
                    ? "Determines IMSS and INFONAVIT obligations."
                    : "Determines payroll tax obligations."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([{ val: false, emoji: "🧑", label: "No, just me" }, { val: true, emoji: "👥", label: "Yes, I have employees" }] as const).map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setF("hasEmployees", opt.val)}
                    className={`flex flex-col items-center gap-3 py-8 rounded-[28px] border-2 transition-all ${
                      form.hasEmployees === opt.val
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <span className="text-4xl">{opt.emoji}</span>
                    <span className="text-sm font-semibold text-stone-900">{opt.label}</span>
                    {form.hasEmployees === opt.val && <Check size={14} className="text-stone-900" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Sales Tax */}
          {currentStep === "salestax" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold text-stone-900">{salesTaxCfg.question}</h3>
                <p className="text-sm text-stone-400 mt-1">{salesTaxCfg.subtitle}</p>
              </div>
              <div className="space-y-2">
                {([
                  { val: true,  label: salesTaxCfg.yesLabel, emoji: "✅" },
                  { val: false, label: salesTaxCfg.noLabel,  emoji: "🚫" },
                ] as const).map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setF("collectsSalesTax", opt.val)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                      form.collectsSalesTax === opt.val
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-sm font-semibold text-stone-900">{opt.label}</span>
                    {form.collectsSalesTax === opt.val && <Check size={16} className="ml-auto text-stone-900 shrink-0" />}
                  </button>
                ))}
              </div>

              {form.collectsSalesTax && (
                <>
                  <div>
                    <h4 className="text-sm font-bold text-stone-700 mb-2">{salesTaxCfg.registrationQuestion}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { val: true,  label: "Yes, registered" },
                        { val: false, label: "Not yet / need to" },
                      ] as const).map(opt => (
                        <button
                          key={String(opt.val)}
                          onClick={() => setF("salesTaxRegistered", opt.val)}
                          className={`px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                            form.salesTaxRegistered === opt.val
                              ? "border-stone-900 bg-stone-50 text-stone-900"
                              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {!form.salesTaxRegistered && (
                      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                        <strong>Action needed:</strong> {salesTaxCfg.notRegisteredNote}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-stone-700 mb-2">Filing frequency</h4>
                    <div className="space-y-2">
                      {frequencies.map(f => (
                        <button
                          key={f.value}
                          onClick={() => setF("filingFrequency", f.value)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm text-left transition-all ${
                            form.filingFrequency === f.value
                              ? "border-stone-900 bg-stone-50"
                              : "border-stone-200 bg-white hover:border-stone-300"
                          }`}
                        >
                          <div>
                            <span className="font-semibold text-stone-900">{f.label}</span>
                            <span className="text-xs text-stone-400 ml-2">{f.desc}</span>
                          </div>
                          {form.filingFrequency === f.value && <Check size={14} className="text-stone-900 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: Fiscal Year */}
          {currentStep === "fiscal" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xl font-bold text-stone-900">What's your fiscal year?</h3>
                <p className="text-sm text-stone-400 mt-1">Most small businesses use the calendar year.</p>
              </div>
              <div className="space-y-2">
                {([
                  { val: "calendar" as const, emoji: "📅", label: "Calendar Year", desc: country === "MX" ? "1 enero – 31 diciembre" : "January 1 – December 31" },
                  { val: "custom"   as const, emoji: "🗓️", label: "Custom Fiscal Year", desc: "Different start date" },
                ]).map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setF("fiscalYearType", opt.val)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                      form.fiscalYearType === opt.val
                        ? "border-stone-900 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{opt.label}</p>
                      <p className="text-xs text-stone-400">{opt.desc}</p>
                    </div>
                    {form.fiscalYearType === opt.val && <Check size={16} className="ml-auto text-stone-900 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {currentStep === "review" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-stone-900">Review your tax profile</h3>
                <p className="text-sm text-stone-400 mt-1">Confirm everything looks right before saving.</p>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50 divide-y divide-stone-100 overflow-hidden text-sm">
                {getReviewRows(form, country, structures, frequencies).map(row => (
                  <div key={row.label} className="flex justify-between items-center px-4 py-3">
                    <span className="text-stone-500">{row.label}</span>
                    <span className="font-semibold text-stone-900">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700">
                {country === "CA"
                  ? "⚠️ GST/HST rates shown are accurate for your province. Consult a CPA or the CRA website to confirm your registration requirements."
                  : country === "MX"
                  ? "⚠️ Las tasas mostradas son las vigentes para 2024. Consulte a su contador o al SAT para confirmar sus obligaciones fiscales."
                  : "⚠️ Tax rates shown are averages for your state. Always verify the exact rate for your specific city with your state's department of revenue."}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-100">
          <button
            onClick={back}
            disabled={stepIdx === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {currentStep === "review" ? (
            <button
              onClick={save}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-800 transition-colors"
            >
              <Check size={16} /> Save Tax Profile
            </button>
          ) : currentStep === "country" ? null : (
            <button
              onClick={next}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-800 transition-colors"
            >
              Continue <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
