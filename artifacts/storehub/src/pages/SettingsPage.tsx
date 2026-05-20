import { useState, useEffect } from "react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import type { UserProfile, Language, Theme } from "../schemas";
import { updateUserProfile, clearAllData } from "../services/dataService";
import { getStorageMode, setStorageMode, type StorageMode } from "../services/storageMode";
import { pullAll, pushSnapshot } from "../services/cloudSync";
import { useLocation } from "wouter";
import { getCurrencySymbol } from "../utils";
import { US_REGIONS, MX_REGIONS, CA_REGIONS } from "../data/taxData";
import { PageHero, SurfaceCard } from "../components/page-shell";
import { CardReaderSettings } from "../components/CardReaderSettings";
import {
  CheckCircle, Printer, Plug, Globe, RotateCcw, ChevronRight,
  Cloud, HardDrive, LogIn, LogOut, UploadCloud, DownloadCloud,
  Loader2, Banknote, User, MapPin,
} from "lucide-react";

const PAIN_POINT_LABELS: Record<string, string> = {
  reorder: "Figuring out what to reorder",
  profits: "Tracking profits",
  employees: "Managing employees",
  suppliers: "Dealing with suppliers",
  numbers: "Understanding numbers",
  customers: "Keeping customers",
};

const GOAL_LABELS: Record<string, string> = {
  reorder: "Know what to reorder and when",
  profit: "See if the business is profitable",
  admin: "Spend less time on admin",
  customers: "Keep best customers coming back",
  team: "Manage team better",
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  cstore: "Gas Station / C-Store", grocery: "Grocery Store / Bodega",
  butcher: "Butcher / Meat Shop", bakery: "Bakery", liquor: "Liquor Store",
  clothing: "Clothing / General Merchandise", restaurant: "Restaurant / Food Service",
  pharmacy: "Pharmacy", general: "General Store", other: "Other",
};

const SIZE_LABELS: Record<string, string> = {
  solo: "Solo operator (just me)", small: "Small (2–5 people)",
  medium: "Medium (6–15 employees)", multi: "Multiple locations",
};

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "OTHER", name: "Other" },
];

const INTEGRATIONS = [
  { name: "Shopify", desc: "Sync inventory and online orders automatically", color: "bg-green-500", tag: "E-commerce" },
  { name: "Square", desc: "Connect your Square POS and card reader", color: "bg-blue-600", tag: "Payments" },
  { name: "QuickBooks", desc: "Auto-export expenses and sales to accounting", color: "bg-green-600", tag: "Accounting" },
  { name: "Clover", desc: "Integrate your Clover POS terminal", color: "bg-emerald-500", tag: "POS" },
  { name: "Lightspeed", desc: "Sync Lightspeed retail inventory and sales", color: "bg-red-500", tag: "Retail POS" },
  { name: "Toast POS", desc: "Connect Toast for restaurant orders and menus", color: "bg-orange-500", tag: "Restaurant" },
  { name: "QuickBooks Payroll", desc: "Export employee hours and payroll data", color: "bg-blue-500", tag: "Payroll" },
  { name: "Mailchimp", desc: "Send promotions to your customer list", color: "bg-yellow-500", tag: "Marketing" },
];

export default function SettingsPage() {
  const { profile, t, refreshProfile } = useApp();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [togglingPayments, setTogglingPayments] = useState(false);

  const [storeName, setStoreName] = useState(profile?.storeName ?? "");
  const [ownerName, setOwnerName] = useState(profile?.ownerName ?? "");
  const [currency, setCurrency] = useState(profile?.currency ?? "USD");
  const [taxRate, setTaxRate] = useState(profile?.taxRate ?? 8.5);
  const [language, setLanguage] = useState<Language>(profile?.language ?? "en");
  const [theme, setTheme] = useState<Theme>(profile?.theme ?? "light");
  const [numEmployees, setNumEmployees] = useState(profile?.numEmployees ?? 0);
  const [country, setCountry] = useState<"US" | "CA" | "MX">((profile?.country as "US" | "CA" | "MX") ?? "US");
  const [stateCode, setStateCode] = useState(profile?.stateCode ?? "");
  const [storeCity, setStoreCity] = useState(profile?.storeCity ?? "");
  const [storeAddress, setStoreAddress] = useState(profile?.storeAddress ?? "");
  const [printerName, setPrinterName] = useState(profile?.printerName ?? "");
  const [printerConnection, setPrinterConnection] = useState<UserProfile["printerConnection"]>(
    profile?.printerConnection ?? "browser"
  );
  const [managerPinRequired, setManagerPinRequired] = useState<boolean>(
    profile?.paymentSettings?.managerPinRequired ?? false
  );

  useEffect(() => {
    setManagerPinRequired(profile?.paymentSettings?.managerPinRequired ?? false);
  }, [profile?.paymentSettings?.managerPinRequired]);

  const paymentsEnabled = profile?.paymentsEnabled !== false;

  async function togglePayments(enabled: boolean) {
    setTogglingPayments(true);
    try {
      await updateUserProfile({ paymentsEnabled: enabled });
      await refreshProfile();
    } finally {
      setTogglingPayments(false);
    }
  }

  async function updateManagerPin(enabled: boolean) {
    setManagerPinRequired(enabled);
    const settings = profile?.paymentSettings ?? {
      paymentsEnabled: true, stripeConnected: false, squareConnected: false,
      connectedReader: null, receiptHeader: "", receiptFooter: "",
      managerPinRequired: false, managerPinThreshold: 100, openingFloat: 0,
    };
    await updateUserProfile({ paymentSettings: { ...settings, managerPinRequired: enabled } });
    await refreshProfile();
  }

  async function handleSave() {
    await updateUserProfile({
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      currency,
      currencySymbol: getCurrencySymbol(currency),
      taxRate,
      language,
      theme,
      numEmployees,
      country,
      stateCode: stateCode || undefined,
      storeCity: storeCity.trim(),
      storeAddress: storeAddress.trim(),
      printerName: printerName.trim(),
      printerConnection,
    });
    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleClearData() {
    await clearAllData();
    setClearConfirm(false);
    setLocation("/onboarding");
  }

  function handleTestPrint() {
    setTestPrinting(true);
    const win = window.open("", "_blank", "width=400,height=600");
    if (win) {
      win.document.write(`
        <html><head><title>Test Print — ${storeName || "StoreHub"}</title>
        <style>
          body { font-family: monospace; padding: 20px; font-size: 12px; }
          h2 { text-align: center; font-size: 14px; }
          p { text-align: center; margin: 4px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
        </style></head><body>
        <h2>${storeName || "My Store"}</h2>
        <p>${storeAddress || ""}</p>
        <div class="divider"></div>
        <p>*** TEST PRINT ***</p>
        <p>Printer: ${printerName || "Browser Default"}</p>
        <p>Connection: ${printerConnection ?? "browser"}</p>
        <p>Date: ${new Date().toLocaleString()}</p>
        <div class="divider"></div>
        <p>StoreHub — Ready to print!</p>
        <script>window.print(); setTimeout(() => window.close(), 1000);</script>
        </body></html>
      `);
      win.document.close();
    }
    setTimeout(() => setTestPrinting(false), 2000);
  }

  const hasOnboardingV2 = (profile?.onboardingVersion ?? 0) >= 2;
  const defaultPaymentSettings = {
    paymentsEnabled: true, stripeConnected: false, squareConnected: false,
    connectedReader: null, receiptHeader: "", receiptFooter: "",
    managerPinRequired: false, managerPinThreshold: 100, openingFloat: 0,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHero
        eyebrow="Settings"
        title="Settings"
        description="Manage your store, preferences, and integrations."
      />

      {/* ── 1. Store ───────────────────────────────────────────────────────── */}
      <Section icon={<User size={14} />} title="Store">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Store Name">
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Owner Name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Number of Employees">
            <input
              type="number" min={0} value={numEmployees}
              onChange={(e) => setNumEmployees(parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <MapPin size={11} /> Location
          </p>
          <Field label="Country">
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "US" as const, flag: "🇺🇸", label: "United States" },
                { value: "CA" as const, flag: "🇨🇦", label: "Canada" },
                { value: "MX" as const, flag: "🇲🇽", label: "Mexico" },
              ]).map(c => (
                <button
                  key={c.value} type="button"
                  onClick={() => { setCountry(c.value); setStateCode(""); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    country === c.value
                      ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      : "border-gray-200 hover:border-amber-200 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  }`}
                >
                  <span className="text-xl">{c.flag}</span>
                  <span className="text-center leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={country === "CA" ? "Province / Territory" : country === "MX" ? "Estado" : "State"}>
              <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {(country === "CA" ? CA_REGIONS : country === "MX" ? MX_REGIONS : US_REGIONS).map(r => (
                  <option key={r.code} value={r.stateCode}>{r.stateName}</option>
                ))}
              </select>
            </Field>
            <Field label="City / Town">
              <input
                value={storeCity} onChange={(e) => setStoreCity(e.target.value)}
                placeholder="e.g. Houston, TX" className={inputCls}
              />
            </Field>
          </div>

          <Field label="Street Address (optional)">
            <input
              value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)}
              placeholder="e.g. 123 Main St" className={inputCls}
            />
          </Field>
          <p className="text-xs text-gray-400">
            Used in AI business reports and for location-specific suggestions.
          </p>
        </div>
      </Section>

      {/* ── 2. Preferences ─────────────────────────────────────────────────── */}
      <Section icon={<Globe size={14} />} title={t.settings.preferences}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t.settings.currency}>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({getCurrencySymbol(c.code)})</option>
              ))}
            </select>
          </Field>
          <Field label="Sales Tax Rate (%)">
            <div className="relative">
              <input
                type="number" min={0} max={100} step={0.1} value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                className={inputCls + " pr-8"}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Enter 0 for tax-exempt stores.</p>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t.settings.language}>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "en" as Language, label: "English", flag: "🇺🇸" },
                { value: "es" as Language, label: "Español", flag: "🇲🇽" },
              ]).map((l) => (
                <button key={l.value} onClick={() => setLanguage(l.value)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    language === l.value
                      ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      : "border-gray-200 hover:border-amber-200 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  }`}
                >
                  <span className="text-xl">{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.settings.theme}>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "light" as Theme, label: t.settings.lightMode, icon: "☀️" },
                { value: "dark" as Theme, label: t.settings.darkMode, icon: "🌙" },
              ]).map((th) => (
                <button key={th.value} onClick={() => setTheme(th.value)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    theme === th.value
                      ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      : "border-gray-200 hover:border-amber-200 text-gray-700 dark:text-gray-200 dark:border-gray-600"
                  }`}
                >
                  <span className="text-xl">{th.icon}</span>
                  <span>{th.label}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* ── 3. Point of Sale ───────────────────────────────────────────────── */}
      <Section icon={<Banknote size={14} />} title="Point of Sale">
        {/* Payments toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Accept Payments</p>
            <p className="text-xs text-gray-500 mt-0.5">Enable card readers, mobile checkout, and POS controls.</p>
          </div>
          <button
            type="button"
            onClick={() => void togglePayments(!paymentsEnabled)}
            disabled={togglingPayments}
            aria-pressed={paymentsEnabled}
            className={`relative inline-flex h-7 w-12 items-center rounded-full border transition shrink-0 disabled:opacity-50 ${
              paymentsEnabled ? "border-amber-500 bg-amber-500" : "border-gray-300 bg-gray-200 dark:bg-gray-700 dark:border-gray-600"
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              paymentsEnabled ? "translate-x-5" : "translate-x-1"
            }`} />
          </button>
        </div>

        {/* Payment methods */}
        {paymentsEnabled && (
          <div className="grid grid-cols-3 gap-2">
            {["Cash", "Card Reader", "Apple Pay", "Google Pay", "Mobile Pay", "Store Credit"].map((method) => (
              <div key={method} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 px-3 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-300 text-center">
                {method}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
          {/* Card Reader */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Card Reader</p>
            <CardReaderSettings
              connectedReader={profile?.paymentSettings?.connectedReader}
              onPair={async (reader) => {
                const settings = profile?.paymentSettings ?? defaultPaymentSettings;
                await updateUserProfile({ paymentSettings: { ...settings, connectedReader: reader } });
              }}
              onUnpair={async () => {
                const settings = profile?.paymentSettings ?? defaultPaymentSettings;
                await updateUserProfile({ paymentSettings: { ...settings, connectedReader: null } });
              }}
            />
          </div>

          {/* Manager PIN */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Manager PIN</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Require approval for refunds, voids, and sensitive actions.
                {managerPinRequired && <span className="ml-1">Current PIN: <strong className="text-gray-700 dark:text-gray-200">1234</strong>.</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void updateManagerPin(!managerPinRequired)}
              disabled={!paymentsEnabled || togglingPayments}
              aria-pressed={managerPinRequired}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition shrink-0 disabled:opacity-50 ${
                managerPinRequired ? "bg-amber-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                managerPinRequired ? "translate-x-5" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <Printer size={11} /> Printer
          </p>
          <p className="text-xs text-gray-400">
            StoreHub supports browser printing, network (IP-based), and Bluetooth thermal printers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Printer Name">
              <input
                value={printerName} onChange={(e) => setPrinterName(e.target.value)}
                placeholder="e.g. EPSON TM-T20" className={inputCls}
              />
            </Field>
            <Field label="Connection Type">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "browser" as const, label: "Browser", icon: "🖨️" },
                  { value: "network" as const, label: "Network", icon: "🌐" },
                  { value: "bluetooth" as const, label: "Bluetooth", icon: "📶" },
                ]).map((opt) => (
                  <button
                    key={opt.value} onClick={() => setPrinterConnection(opt.value)}
                    className={`flex flex-col items-center p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                      printerConnection === opt.value
                        ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                        : "border-gray-200 hover:border-amber-200 text-gray-600 dark:text-gray-300 dark:border-gray-600"
                    }`}
                  >
                    <span className="text-lg mb-0.5">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </Field>
          </div>
          {(printerConnection === "network" || printerConnection === "bluetooth") && (
            <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5">
              {printerConnection === "network"
                ? "Ensure your printer and device are on the same WiFi network."
                : "Pair your printer in your OS Bluetooth settings first, then select it in the print dialog."}
            </p>
          )}
          <button
            onClick={handleTestPrint} disabled={testPrinting}
            className="w-full border-2 border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Printer size={15} />
            {testPrinting ? "Printing test page..." : "Test Print"}
          </button>
        </div>
      </Section>

      {/* ── 4. Integrations ────────────────────────────────────────────────── */}
      <Section icon={<Plug size={14} />} title="Integrations">
        <p className="text-xs text-gray-400">
          Connect StoreHub with the tools you already use. All integrations sync automatically.
        </p>
        <div className="space-y-2">
          {INTEGRATIONS.map((intg) => (
            <div
              key={intg.name}
              className="flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-amber-200 dark:hover:border-gray-600 transition-colors"
            >
              <div className={`w-9 h-9 rounded-xl ${intg.color} flex items-center justify-center shrink-0`}>
                <Globe size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{intg.name}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{intg.tag}</span>
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{intg.desc}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          Want a specific integration? Ask the StoreHub AI assistant.
        </p>
      </Section>

      {/* ── 5. Account & Sync ──────────────────────────────────────────────── */}
      <StorageSection />

      {/* ── 6. Personalization ─────────────────────────────────────────────── */}
      <Section icon={<RotateCcw size={14} />} title="Personalization">
        <p className="text-xs text-gray-400">
          {hasOnboardingV2
            ? "Your dashboard, navigation, and suggestions are personalized based on your setup answers."
            : "Answer 10 quick questions to personalize your dashboard, navigation, and suggestions."}
        </p>

        {hasOnboardingV2 && (
          <div className="space-y-2">
            {profile?.businessType && (
              <SetupRow label="Store type" value={BUSINESS_TYPE_LABELS[profile.businessType] ?? profile.businessType} />
            )}
            {profile?.storeSize && (
              <SetupRow label="Team size" value={SIZE_LABELS[profile.storeSize] ?? profile.storeSize} />
            )}
            {profile?.goal && (
              <SetupRow label="Main goal" value={GOAL_LABELS[profile.goal] ?? profile.goal} />
            )}
            {(profile?.painPoints ?? []).length > 0 && (
              <SetupRow
                label="Pain points"
                value={(profile?.painPoints ?? []).map(p => PAIN_POINT_LABELS[p] ?? p).join(" · ")}
              />
            )}
            {profile?.currentSystem && (
              <SetupRow
                label="Previous system"
                value={{ paper: "Pen & paper", spreadsheets: "Spreadsheets", pos: "POS system", multiple: "Multiple systems" }[profile.currentSystem] ?? profile.currentSystem}
              />
            )}
          </div>
        )}

        <button
          onClick={() => setLocation("/onboarding")}
          className="flex items-center justify-between gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-amber-700 dark:hover:text-amber-300 transition-all"
        >
          <span className="flex items-center gap-2">
            <RotateCcw size={14} />
            {hasOnboardingV2 ? "Retake setup questionnaire" : "Start personalization"}
          </span>
          <ChevronRight size={14} />
        </button>
        {hasOnboardingV2 && (
          <p className="text-xs text-gray-400">
            Retaking keeps your existing data and just re-configures the app.
          </p>
        )}
      </Section>

      {/* ── Save Button ────────────────────────────────────────────────────── */}
      <button
        onClick={handleSave}
        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl py-4 text-base transition-colors shadow-md shadow-amber-200 dark:shadow-amber-900/20 flex items-center justify-center gap-2"
      >
        {saved ? (
          <><CheckCircle size={18} /> {t.settings.saved}</>
        ) : (
          <>{t.common.save} Changes</>
        )}
      </button>

      {/* ── 7. Danger Zone ─────────────────────────────────────────────────── */}
      <Section title={t.settings.dangerZone}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Permanently delete all store data — products, sales, expenses, and more. You'll be taken back to the setup screen.
        </p>
        <button
          onClick={() => setClearConfirm(true)}
          className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 font-semibold rounded-xl py-3 text-sm transition-colors"
        >
          {t.settings.clearData}
        </button>
      </Section>

      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100">{t.settings.clearData}</h3>
            <p className="text-sm text-gray-500">{t.settings.clearDataConfirm}</p>
            <div className="flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300">{t.common.cancel}</button>
              <button onClick={handleClearData} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-2.5 text-sm">{t.common.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StorageSection() {
  const { isAuthenticated, user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<StorageMode>(() => getStorageMode());
  const [busy, setBusy] = useState<"" | "switch" | "push" | "pull">("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    function refresh() { setMode(getStorageMode()); }
    window.addEventListener("storehub:storage-mode-changed", refresh);
    return () => window.removeEventListener("storehub:storage-mode-changed", refresh);
  }, []);

  async function switchToCloud() {
    if (!isAuthenticated) { navigate("/login"); return; }
    setBusy("switch");
    setMsg(null);
    const push = await pushSnapshot();
    if (!push.ok) {
      setBusy("");
      setMsg(`Migration failed: ${push.error ?? "unknown error"}`);
      return;
    }
    setStorageMode("cloud");
    const pull = await pullAll();
    setBusy("");
    if (!pull.ok) {
      setMsg(`Switched, but couldn't refresh from cloud: ${pull.error}`);
      return;
    }
    const totals = push.counts ? Object.entries(push.counts).map(([k, v]) => `${v} ${k}`).join(", ") : "";
    setMsg(`Cloud sync on. Uploaded ${totals || "nothing new"}.`);
    setTimeout(() => window.location.reload(), 800);
  }

  function switchToLocal() {
    setStorageMode("local");
    setMsg("Switched to local-only mode. Data stays on this device.");
  }

  async function manualPush() {
    setBusy("push");
    const r = await pushSnapshot();
    setBusy("");
    setMsg(r.ok ? "Uploaded local data to cloud." : `Upload failed: ${r.error}`);
  }

  async function manualPull() {
    setBusy("pull");
    const r = await pullAll();
    setBusy("");
    if (r.ok) { setMsg("Pulled latest from cloud."); setTimeout(() => window.location.reload(), 600); }
    else setMsg(`Pull failed: ${r.error}`);
  }

  return (
    <Section icon={<Cloud size={14} />} title="Account & Sync">
      {/* Account row */}
      <div className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">Account</p>
          {isAuthenticated ? (
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {user?.email ?? user?.phoneNumber ?? "Signed in"}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Not signed in</p>
          )}
        </div>
        {isAuthenticated ? (
          <button onClick={() => void logout()} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100">
            <LogOut size={14} /> Log out
          </button>
        ) : (
          <button onClick={() => navigate("/login")} className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700">
            <LogIn size={14} /> Sign in
          </button>
        )}
      </div>

      {/* Storage mode */}
      <div className="grid grid-cols-2 gap-3">
        <ModeCard
          active={mode === "local"} icon={<HardDrive size={18} />}
          title="Local only" desc="Stays on this device. Fastest, works offline."
          onClick={switchToLocal}
        />
        <ModeCard
          active={mode === "cloud"} icon={<Cloud size={18} />}
          title="Cloud sync" desc="Backed up to your account. Sign-in required."
          onClick={switchToCloud} loading={busy === "switch"}
        />
      </div>

      {mode === "cloud" && isAuthenticated && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={manualPush} disabled={busy !== ""}
            className="flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-50"
          >
            {busy === "push" ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            Push to cloud
          </button>
          <button
            onClick={manualPull} disabled={busy !== ""}
            className="flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-50"
          >
            {busy === "pull" ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
            Pull from cloud
          </button>
        </div>
      )}

      {msg && (
        <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}
    </Section>
  );
}

function ModeCard({ active, icon, title, desc, onClick, loading }: {
  active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={loading}
      className={
        "text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-50 " +
        (active
          ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
          : "border-gray-200 dark:border-gray-700 hover:border-amber-300")
      }
    >
      <div className="flex items-center gap-2 mb-1 text-gray-800 dark:text-gray-100">
        {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
        <span className="font-semibold text-sm">{title}</span>
        {active && <CheckCircle size={14} className="text-amber-500 ml-auto" />}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
    </button>
  );
}

const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-700 dark:text-gray-100";

function Section({ icon, title, children }: { icon?: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <SurfaceCard className="space-y-4">
      <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {children}
    </SurfaceCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SetupRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0 mt-0.5 w-24">{label}</span>
      <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{value}</span>
    </div>
  );
}
