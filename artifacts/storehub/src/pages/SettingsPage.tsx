import { useState, useEffect, useRef } from "react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import type { UserProfile, Language, Theme, MotionLevel, HoverStyle, SurfaceStyle, CornerRadius, BlurIntensity, ShadowDepth, ContrastLevel, TypographyWeight, SpacingDensity } from "../schemas";
import { updateUserProfile, clearAllData } from "../services/dataService";
import { COLOR_PRESETS, DEFAULT_ACCENT, applyAccentColor } from "../lib/themeColors";
import { getStorageMode, setStorageMode, type StorageMode } from "../services/storageMode";
import { pullAll, pushSnapshot } from "../services/cloudSync";
import { useLocation } from "wouter";
import { getCurrencySymbol } from "../utils";
import { US_REGIONS, MX_REGIONS, CA_REGIONS } from "../data/taxData";
import { ActionPill, PageHero, SectionTitle, SummaryTile, SurfaceCard } from "../components/page-shell";
import {
  CheckCircle, Printer, MapPin, Plug, Globe, RotateCcw, ChevronRight,
  Cloud, HardDrive, LogIn, LogOut, UploadCloud, DownloadCloud, Loader2, Sparkles, Wand2, Layers3,
  Palette, Wind, Lightbulb, Type, Grid3x3, Eye
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
  const { profile, t, refreshProfile, uiPreferences, updateUIPreferences } = useApp();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const didHydratePreview = useRef(false);

  const [storeName, setStoreName] = useState(profile?.storeName ?? "");
  const [ownerName, setOwnerName] = useState(profile?.ownerName ?? "");
  const [currency, setCurrency] = useState(profile?.currency ?? "USD");
  const [taxRate, setTaxRate] = useState(profile?.taxRate ?? 8.5);
  const [language, setLanguage] = useState<Language>(profile?.language ?? "en");
  const [theme, setTheme] = useState<Theme>(profile?.theme ?? "light");
  const [accentColor, setAccentColor] = useState<string>(profile?.accentColor ?? DEFAULT_ACCENT);
  const [motionLevel, setMotionLevel] = useState<MotionLevel>(uiPreferences.motionLevel);
  const [hoverStyle, setHoverStyle] = useState<HoverStyle>(uiPreferences.hoverStyle);
  const [surfaceStyle, setSurfaceStyle] = useState<SurfaceStyle>(uiPreferences.surfaceStyle);
  const [cornerRadius, setCornerRadius] = useState<CornerRadius | undefined>(uiPreferences.cornerRadius);
  const [blurIntensity, setBlurIntensity] = useState<BlurIntensity | undefined>(uiPreferences.blurIntensity);
  const [shadowDepth, setShadowDepth] = useState<ShadowDepth | undefined>(uiPreferences.shadowDepth);
  const [contrastLevel, setContrastLevel] = useState<ContrastLevel | undefined>(uiPreferences.contrastLevel);
  const [typographyWeight, setTypographyWeight] = useState<TypographyWeight | undefined>(uiPreferences.typographyWeight);
  const [spacingDensity, setSpacingDensity] = useState<SpacingDensity | undefined>(uiPreferences.spacingDensity);

  useEffect(() => {
    if (!didHydratePreview.current) {
      didHydratePreview.current = true;
      return;
    }
    if (
      uiPreferences.motionLevel === motionLevel &&
      uiPreferences.hoverStyle === hoverStyle &&
      uiPreferences.surfaceStyle === surfaceStyle &&
      uiPreferences.cornerRadius === cornerRadius &&
      uiPreferences.blurIntensity === blurIntensity &&
      uiPreferences.shadowDepth === shadowDepth &&
      uiPreferences.contrastLevel === contrastLevel &&
      uiPreferences.typographyWeight === typographyWeight &&
      uiPreferences.spacingDensity === spacingDensity &&
      uiPreferences.accentColor === accentColor
    ) {
      return;
    }
    void updateUIPreferences({
      motionLevel,
      hoverStyle,
      surfaceStyle,
      cornerRadius,
      blurIntensity,
      shadowDepth,
      contrastLevel,
      typographyWeight,
      spacingDensity,
      accentColor
    });
  }, [motionLevel, hoverStyle, surfaceStyle, cornerRadius, blurIntensity, shadowDepth, contrastLevel, typographyWeight, spacingDensity, accentColor, uiPreferences, updateUIPreferences]);

  function pickAccent(hex: string) {
    setAccentColor(hex);
    applyAccentColor(hex);
  }
  const [numEmployees, setNumEmployees] = useState(profile?.numEmployees ?? 0);
  const [country, setCountry] = useState<"US" | "CA" | "MX">((profile?.country as "US" | "CA" | "MX") ?? "US");
  const [stateCode, setStateCode] = useState(profile?.stateCode ?? "");
  const [storeCity, setStoreCity] = useState(profile?.storeCity ?? "");
  const [storeAddress, setStoreAddress] = useState(profile?.storeAddress ?? "");
  const [printerName, setPrinterName] = useState(profile?.printerName ?? "");
  const [printerConnection, setPrinterConnection] = useState<UserProfile["printerConnection"]>(
    profile?.printerConnection ?? "browser"
  );

  async function handleSave() {
    await updateUserProfile({
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      currency,
      currencySymbol: getCurrencySymbol(currency),
      taxRate,
      language,
      theme,
      accentColor,
      numEmployees,
      country,
      stateCode: stateCode || undefined,
      storeCity: storeCity.trim(),
      storeAddress: storeAddress.trim(),
      printerName: printerName.trim(),
      printerConnection,
      uiPreferences: {
        motionLevel,
        hoverStyle,
        surfaceStyle,
        cornerRadius,
        blurIntensity,
        shadowDepth,
        contrastLevel,
        typographyWeight,
        spacingDensity,
        accentColor,
      },
    });
    await refreshProfile();
    await updateUIPreferences({
      motionLevel,
      hoverStyle,
      surfaceStyle,
      cornerRadius,
      blurIntensity,
      shadowDepth,
      contrastLevel,
      typographyWeight,
      spacingDensity,
      accentColor,
    });
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

  const hasOnboardingV2 = profile?.onboardingVersion === 2;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHero
        eyebrow="Settings"
        title="Tune the feel of your workspace"
        description="Personalize the atmosphere, motion, and controls without losing the calm premium look. Everything here updates the app-wide experience."
        actions={
          <>
            <ActionPill>
              <Sparkles size={16} className="text-amber-500" />
              Live visual preferences
            </ActionPill>
            <ActionPill onClick={handleSave}>
              <CheckCircle size={16} className="text-emerald-600" />
              {saved ? "Saved" : "Save changes"}
            </ActionPill>
          </>
        }
        stats={
          <>
            <SummaryTile label="Motion" value={motionLabel(motionLevel)} hint="How animated the interface feels" />
            <SummaryTile label="Hover feel" value={hoverLabel(hoverStyle)} hint="Depth and movement on interaction" />
            <SummaryTile label="Surfaces" value={surfaceLabel(surfaceStyle)} hint="How glassy or solid panels appear" />
            <SummaryTile label="Accent" value={colorName(accentColor)} hint="Your current signature color" />
          </>
        }
      />

      {/* Your Setup Summary (v2 onboarding only) */}
      {hasOnboardingV2 && (
        <Section title="Your Setup Summary">
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Based on your onboarding answers, StoreHub is configured specifically for your store.
            </p>
            <div className="grid grid-cols-1 gap-2">
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
                  label="Top pain points"
                  value={(profile.painPoints ?? []).map(p => PAIN_POINT_LABELS[p] ?? p).join(" · ")}
                />
              )}
              {(profile?.stockOuts ?? []).length > 0 && (
                <SetupRow
                  label="Frequent stock-outs"
                  value={`${(profile.stockOuts ?? []).length} category${(profile.stockOuts ?? []).length > 1 ? "s" : ""} flagged`}
                />
              )}
              {profile?.currentSystem && (
                <SetupRow
                  label="Previous system"
                  value={{ paper: "Pen & paper", spreadsheets: "Spreadsheets", pos: "POS system", multiple: "Multiple systems" }[profile.currentSystem] ?? profile.currentSystem}
                />
              )}
            </div>

            <button
              onClick={() => setLocation("/onboarding")}
              className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 text-sm font-medium text-gray-600 hover:text-amber-700 transition-all w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <RotateCcw size={14} />
                Retake setup questionnaire
              </span>
              <ChevronRight size={14} />
            </button>
            <p className="text-xs text-gray-400">
              Retaking the questionnaire will keep your existing data and just re-configure the app.
            </p>
          </div>
        </Section>
      )}

      <SurfaceCard className="space-y-6">
        <SectionTitle
          title="Theme & Experience customization"
          description="Personalize how the app looks and feels. All changes preview instantly and sync across your devices."
          aside={
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              <Wand2 size={14} className="text-amber-500" />
              Live preview
            </div>
          }
        />

        {/* Live Preview Panel */}
        <CustomizationPreview
          motionLevel={motionLevel}
          hoverStyle={hoverStyle}
          surfaceStyle={surfaceStyle}
          cornerRadius={cornerRadius}
          blurIntensity={blurIntensity}
          shadowDepth={shadowDepth}
          contrastLevel={contrastLevel}
          typographyWeight={typographyWeight}
          spacingDensity={spacingDensity}
          accentColor={accentColor}
        />

        {/* Grid of Customization Controls */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Accent Color */}
          <PreferenceGroup
            icon={<Palette size={16} className="text-amber-600" />}
            title="Accent color"
            description="Your signature color for buttons, accents, and focus states."
          >
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-2">
                {COLOR_PRESETS.map((c) => {
                  const selected = accentColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickAccent(c.hex)}
                      title={c.name}
                      aria-label={c.name}
                      className={`relative h-10 rounded-lg border-2 transition-all ${
                        selected
                          ? "border-foreground ring-2 ring-offset-2 ring-foreground/30"
                          : "border-gray-200 dark:border-gray-700 hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {selected && (
                        <CheckCircle
                          size={16}
                          className="absolute inset-0 m-auto text-white drop-shadow"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="accent-custom"
                  type="color"
                  value={accentColor}
                  onChange={(e) => pickAccent(e.target.value)}
                  className="h-9 w-14 rounded cursor-pointer border border-gray-200 dark:border-gray-700 bg-transparent"
                  title="Custom color picker"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAccentColor(v);
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyAccentColor(v);
                  }}
                  className={`${inputCls} w-24 font-mono text-xs`}
                  placeholder="#hex"
                />
                <button
                  type="button"
                  onClick={() => pickAccent(DEFAULT_ACCENT)}
                  className="text-xs text-gray-500 hover:text-amber-600 underline"
                >
                  Reset
                </button>
              </div>
            </div>
          </PreferenceGroup>

          {/* Motion Style */}
          <PreferenceGroup
            icon={<Sparkles size={16} className="text-amber-600" />}
            title="Motion style"
            description="Control reveal speed and transition energy."
          >
            <PreferencePill
              active={motionLevel === "reduced"}
              title="Reduced"
              description="Clean and steady, minimal motion."
              onClick={() => setMotionLevel("reduced")}
            />
            <PreferencePill
              active={motionLevel === "gentle"}
              title="Gentle"
              description="Soft, calm transitions (default)."
              onClick={() => setMotionLevel("gentle")}
            />
            <PreferencePill
              active={motionLevel === "expressive"}
              title="Expressive"
              description="Cinematic, energetic feel."
              onClick={() => setMotionLevel("expressive")}
            />
          </PreferenceGroup>

          {/* Hover Depth */}
          <PreferenceGroup
            icon={<ArrowIcon />}
            title="Hover depth"
            description="How much interactive elements lift on hover."
          >
            <PreferencePill active={hoverStyle === "soft"} title="Soft" description="Subtle, minimal lift." onClick={() => setHoverStyle("soft")} />
            <PreferencePill active={hoverStyle === "lifted"} title="Lifted" description="Balanced, balanced depth." onClick={() => setHoverStyle("lifted")} />
            <PreferencePill active={hoverStyle === "dramatic"} title="Dramatic" description="Bold, pronounced lift." onClick={() => setHoverStyle("dramatic")} />
          </PreferenceGroup>

          {/* Surface Finish */}
          <PreferenceGroup
            icon={<Layers3 size={16} className="text-amber-600" />}
            title="Surface finish"
            description="How airy, glassy, or solid panels appear."
          >
            <PreferencePill active={surfaceStyle === "glass"} title="Glass" description="Translucent, atmospheric." onClick={() => setSurfaceStyle("glass")} />
            <PreferencePill active={surfaceStyle === "balanced"} title="Balanced" description="Soft glass, readable." onClick={() => setSurfaceStyle("balanced")} />
            <PreferencePill active={surfaceStyle === "solid"} title="Solid" description="Opaque, focused." onClick={() => setSurfaceStyle("solid")} />
          </PreferenceGroup>

          {/* Corner Radius */}
          <PreferenceGroup
            icon={<Eye size={16} className="text-amber-600" />}
            title="Corner radius"
            description="Roundness of buttons, cards, and inputs."
          >
            <PreferencePill active={cornerRadius === "sharp"} title="Sharp" description="Minimal rounding, technical." onClick={() => setCornerRadius("sharp")} />
            <PreferencePill active={cornerRadius === "rounded"} title="Rounded" description="Classic, balanced." onClick={() => setCornerRadius("rounded")} />
            <PreferencePill active={cornerRadius === "smooth"} title="Smooth" description="Soft, modern." onClick={() => setCornerRadius("smooth")} />
            <PreferencePill active={cornerRadius === "organic"} title="Organic" description="iOS-like, playful." onClick={() => setCornerRadius("organic")} />
          </PreferenceGroup>

          {/* Blur Intensity */}
          <PreferenceGroup
            icon={<Wind size={16} className="text-amber-600" />}
            title="Blur intensity"
            description="Glass panel translucency depth."
          >
            <PreferencePill active={blurIntensity === "minimal"} title="Minimal" description="Subtle effect." onClick={() => setBlurIntensity("minimal")} />
            <PreferencePill active={blurIntensity === "subtle"} title="Subtle" description="Light blur (default)." onClick={() => setBlurIntensity("subtle")} />
            <PreferencePill active={blurIntensity === "moderate"} title="Moderate" description="More atmospheric." onClick={() => setBlurIntensity("moderate")} />
            <PreferencePill active={blurIntensity === "strong"} title="Strong" description="Dramatic, theatrical." onClick={() => setBlurIntensity("strong")} />
          </PreferenceGroup>

          {/* Shadow Depth */}
          <PreferenceGroup
            icon={<Lightbulb size={16} className="text-amber-600" />}
            title="Shadow depth"
            description="Elevation perception via shadows."
          >
            <PreferencePill active={shadowDepth === "flat"} title="Flat" description="Minimal shadows." onClick={() => setShadowDepth("flat")} />
            <PreferencePill active={shadowDepth === "subtle"} title="Subtle" description="Slight depth." onClick={() => setShadowDepth("subtle")} />
            <PreferencePill active={shadowDepth === "lifted"} title="Lifted" description="Floating cards." onClick={() => setShadowDepth("lifted")} />
            <PreferencePill active={shadowDepth === "dramatic"} title="Dramatic" description="Maximum depth." onClick={() => setShadowDepth("dramatic")} />
          </PreferenceGroup>

          {/* Contrast Level */}
          <PreferenceGroup
            icon={<Lightbulb size={16} className="text-amber-600" />}
            title="Contrast level"
            description="Color saturation and brightness for accessibility."
          >
            <PreferencePill active={contrastLevel === "standard"} title="Standard" description="Default, WCAG AA." onClick={() => setContrastLevel("standard")} />
            <PreferencePill active={contrastLevel === "enhanced"} title="Enhanced" description="Boosted, WCAG AAA." onClick={() => setContrastLevel("enhanced")} />
            <PreferencePill active={contrastLevel === "high"} title="High" description="Maximum contrast." onClick={() => setContrastLevel("high")} />
          </PreferenceGroup>

          {/* Typography Weight */}
          <PreferenceGroup
            icon={<Type size={16} className="text-amber-600" />}
            title="Typography weight"
            description="Font boldness across the app."
          >
            <PreferencePill active={typographyWeight === "light"} title="Light" description="Elegant, thin." onClick={() => setTypographyWeight("light")} />
            <PreferencePill active={typographyWeight === "regular"} title="Regular" description="Default, balanced." onClick={() => setTypographyWeight("regular")} />
            <PreferencePill active={typographyWeight === "medium"} title="Medium" description="Heavier emphasis." onClick={() => setTypographyWeight("medium")} />
            <PreferencePill active={typographyWeight === "bold"} title="Bold" description="Maximum weight." onClick={() => setTypographyWeight("bold")} />
          </PreferenceGroup>

          {/* Spacing Density */}
          <PreferenceGroup
            icon={<Grid3x3 size={16} className="text-amber-600" />}
            title="Spacing density"
            description="Padding and gaps throughout."
          >
            <PreferencePill active={spacingDensity === "compact"} title="Compact" description="Tight, desktop-like." onClick={() => setSpacingDensity("compact")} />
            <PreferencePill active={spacingDensity === "comfortable"} title="Comfortable" description="Balanced (default)." onClick={() => setSpacingDensity("comfortable")} />
            <PreferencePill active={spacingDensity === "spacious"} title="Spacious" description="Relaxed, breathing room." onClick={() => setSpacingDensity("spacious")} />
            <PreferencePill active={spacingDensity === "airy"} title="Airy" description="Open, minimalist." onClick={() => setSpacingDensity("airy")} />
          </PreferenceGroup>
        </div>
      </SurfaceCard>

      {/* Retake for older users */}
      {!hasOnboardingV2 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/50 rounded-2xl p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
            Take the new setup questionnaire
          </p>
          <p className="text-xs text-amber-600 mb-3">
            Answer 10 quick questions and StoreHub will personalize your dashboard, navigation, and suggestions.
          </p>
          <button
            onClick={() => setLocation("/onboarding")}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <RotateCcw size={14} />
            Start personalization
          </button>
        </div>
      )}

      {/* Store Profile */}
      <Section title={t.settings.storeProfile}>
        <div className="space-y-4">
          <Field label="Store Name">
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Owner Name">
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Number of Employees">
            <input
              type="number"
              min={0}
              value={numEmployees}
              onChange={(e) => setNumEmployees(parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>

          <Field label="Country">
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "US" as const, flag: "🇺🇸", label: "United States" },
                { value: "CA" as const, flag: "🇨🇦", label: "Canada" },
                { value: "MX" as const, flag: "🇲🇽", label: "Mexico" },
              ]).map(c => (
                <button
                  key={c.value}
                  type="button"
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

          <Field label={country === "CA" ? "Province / Territory" : country === "MX" ? "Estado" : "State"}>
            <select
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              className={inputCls}
            >
              <option value="">— Select {country === "CA" ? "province" : country === "MX" ? "estado" : "state"} —</option>
              {(country === "CA" ? CA_REGIONS : country === "MX" ? MX_REGIONS : US_REGIONS).map(r => (
                <option key={r.code} value={r.stateCode}>{r.stateName}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Store Location */}
      <Section title={<><MapPin size={14} className="inline mr-1.5 mb-0.5" />Store Location</>}>
        <p className="text-xs text-gray-400 mb-3">
          Used to show real-time weather in your AI business reports and generate location-specific suggestions.
        </p>
        <div className="space-y-3">
          <Field label="City / Town">
            <input
              value={storeCity}
              onChange={(e) => setStoreCity(e.target.value)}
              placeholder="e.g. Houston, TX"
              className={inputCls}
            />
          </Field>
          <Field label="Street Address (optional)">
            <input
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              placeholder="e.g. 123 Main St"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* Preferences */}
      <Section title={t.settings.preferences}>
        <div className="space-y-4">
          <Field label={t.settings.currency}>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({getCurrencySymbol(c.code)})</option>
              ))}
            </select>
          </Field>

          <Field label="Sales Tax Rate (%)">
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                className={inputCls + " pr-8"}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Applied automatically at checkout in your POS. Enter 0 for tax-exempt stores.</p>
          </Field>

          <Field label={t.settings.language}>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "en" as Language, label: "English", flag: "🇺🇸" },
                { value: "es" as Language, label: "Español", flag: "🇲🇽" },
              ]).map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLanguage(l.value)}
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
                <button
                  key={th.value}
                  onClick={() => setTheme(th.value)}
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

      {/* Printer */}
      <Section title={<><Printer size={14} className="inline mr-1.5 mb-0.5" />Printer Setup</>}>
        <p className="text-xs text-gray-400 mb-3">
          Configure your receipt printer. StoreHub supports browser printing, network (IP-based), and Bluetooth thermal printers.
        </p>
        <div className="space-y-4">
          <Field label="Printer Name (for your reference)">
            <input
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
              placeholder="e.g. EPSON TM-T20, Front Counter Printer"
              className={inputCls}
            />
          </Field>
          <Field label="Connection Type">
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "browser" as const, label: "Browser", icon: "🖨️", desc: "Default" },
                { value: "network" as const, label: "Network/IP", icon: "🌐", desc: "LAN" },
                { value: "bluetooth" as const, label: "Bluetooth", icon: "📶", desc: "Wireless" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPrinterConnection(opt.value)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    printerConnection === opt.value
                      ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                      : "border-gray-200 hover:border-amber-200 text-gray-600 dark:text-gray-300 dark:border-gray-600"
                  }`}
                >
                  <span className="text-xl mb-1">{opt.icon}</span>
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-gray-400 text-xs">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Field>
          {printerConnection === "network" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
              For network printers, ensure your printer and device are on the same WiFi network. Browser printing will be used to send jobs to the network printer queue.
            </div>
          )}
          {printerConnection === "bluetooth" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
              For Bluetooth thermal printers, pair your printer with this device first in your operating system's Bluetooth settings, then select it in the print dialog.
            </div>
          )}
          <button
            onClick={handleTestPrint}
            disabled={testPrinting}
            className="w-full border-2 border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Printer size={15} />
            {testPrinting ? "Printing test page..." : "Test Print"}
          </button>
        </div>
      </Section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="motion-button w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl py-4 text-base transition-colors shadow-md shadow-amber-200 dark:shadow-amber-900/20 flex items-center justify-center gap-2"
      >
        {saved ? (
          <><CheckCircle size={18} /> {t.settings.saved}</>
        ) : (
          t.common.save + " Changes"
        )}
      </button>

      {/* Software Integrations */}
      <Section title={<><Plug size={14} className="inline mr-1.5 mb-0.5" />Software Integrations</>}>
        <p className="text-xs text-gray-400 mb-4">
          Connect StoreHub with the tools you already use. All integrations sync automatically to keep your data in one place.
        </p>
        <div className="space-y-3">
          {INTEGRATIONS.map((intg) => (
            <div
              key={intg.name}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-amber-200 dark:hover:border-gray-600 transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl ${intg.color} flex items-center justify-center flex-shrink-0`}>
                <Globe size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{intg.name}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{intg.tag}</span>
                </div>
                <div className="text-xs text-gray-400 truncate">{intg.desc}</div>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Want a specific integration? Ask the StoreHub AI assistant.
        </p>
      </Section>

      {/* Cloud Storage */}
      <StorageSection />

      {/* Danger Zone */}
      <Section title={t.settings.dangerZone}>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            This will permanently delete all your store data — products, sales, expenses, and more. You will be taken back to the setup screen.
          </p>
          <button
            onClick={() => setClearConfirm(true)}
            className="w-full border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            {t.settings.clearData}
          </button>
        </div>
      </Section>

      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-100">{t.settings.clearData}</h3>
            <p className="text-sm text-gray-500">{t.settings.clearDataConfirm}</p>
            <div className="flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-600">{t.common.cancel}</button>
              <button onClick={handleClearData} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-2.5 text-sm">{t.common.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomizationPreview({
  motionLevel,
  hoverStyle,
  surfaceStyle,
  cornerRadius,
  blurIntensity,
  shadowDepth,
  contrastLevel,
  typographyWeight,
  spacingDensity,
  accentColor,
}: {
  motionLevel: MotionLevel;
  hoverStyle: HoverStyle;
  surfaceStyle: SurfaceStyle;
  cornerRadius?: CornerRadius;
  blurIntensity?: BlurIntensity;
  shadowDepth?: ShadowDepth;
  contrastLevel?: ContrastLevel;
  typographyWeight?: TypographyWeight;
  spacingDensity?: SpacingDensity;
  accentColor: string;
}) {
  // Get radius class based on selection
  const radiusClass = cornerRadius === "sharp" ? "rounded-lg" : cornerRadius === "rounded" ? "rounded-xl" : cornerRadius === "smooth" ? "rounded-2xl" : "rounded-3xl";

  return (
    <div className="rounded-2xl border border-white/80 bg-white/60 backdrop-blur-sm p-6 space-y-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-stone-500">Live Preview</div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Primary Button */}
        <button
          className={`w-full py-3 px-4 text-white font-medium transition-all ${radiusClass}`}
          style={{
            backgroundColor: accentColor,
            transform: hoverStyle === "soft" ? "translateY(-2px)" : hoverStyle === "lifted" ? "translateY(-4px)" : "translateY(-6px)",
          }}
        >
          Primary Button
        </button>

        {/* Secondary Button */}
        <button
          className={`w-full py-3 px-4 font-medium transition-all border-2 ${radiusClass}`}
          style={{
            borderColor: accentColor,
            color: accentColor,
          }}
        >
          Secondary Button
        </button>

        {/* Card Preview */}
        <div
          className={`p-4 space-y-2 ${radiusClass}`}
          style={{
            backgroundColor: surfaceStyle === "solid" ? "rgba(255, 255, 255, 0.98)" : surfaceStyle === "balanced" ? "rgba(255, 255, 255, 0.82)" : "rgba(255, 255, 255, 0.65)",
            backdropFilter: blurIntensity === "minimal" ? "blur(2px)" : blurIntensity === "subtle" ? "blur(4px)" : blurIntensity === "moderate" ? "blur(8px)" : "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.7)",
          }}
        >
          <div
            className="font-semibold text-sm"
            style={{
              fontWeight: typographyWeight === "light" ? 300 : typographyWeight === "regular" ? 400 : typographyWeight === "medium" ? 500 : 600,
            }}
          >
            Card Title
          </div>
          <div className="text-xs text-stone-600">Sample card with current customization settings applied.</div>
        </div>

        {/* Accent Box */}
        <div
          className={`p-4 ${radiusClass}`}
          style={{
            backgroundColor: accentColor,
            opacity: contrastLevel === "high" ? 1 : contrastLevel === "enhanced" ? 0.9 : 0.8,
          }}
        >
          <div className="text-white font-medium text-sm">Accent color</div>
          <div className="text-white/80 text-xs mt-1">Previews accent usage</div>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="pt-3 border-t border-white/40 grid gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-stone-600">Motion:</span>
          <span className="font-medium capitalize">{motionLevel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-600">Hover:</span>
          <span className="font-medium capitalize">{hoverStyle}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-600">Surface:</span>
          <span className="font-medium capitalize">{surfaceStyle}</span>
        </div>
        {(cornerRadius || blurIntensity || shadowDepth || contrastLevel || typographyWeight || spacingDensity) && (
          <>
            <div className="flex justify-between">
              <span className="text-stone-600">Corners:</span>
              <span className="font-medium capitalize">{cornerRadius || "default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Blur:</span>
              <span className="font-medium capitalize">{blurIntensity || "default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Shadows:</span>
              <span className="font-medium capitalize">{shadowDepth || "default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Contrast:</span>
              <span className="font-medium capitalize">{contrastLevel || "default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Typography:</span>
              <span className="font-medium capitalize">{typographyWeight || "default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Spacing:</span>
              <span className="font-medium capitalize">{spacingDensity || "default"}</span>
            </div>
          </>
        )}
      </div>
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
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
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
    <Section title={<><Cloud size={14} className="inline mr-1.5 mb-0.5" />Storage & Sync</>}>
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
          <button onClick={() => void logout()} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800">
            <LogOut size={14} /> Log out
          </button>
        ) : (
          <button onClick={() => navigate("/login")} className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700">
            <LogIn size={14} /> Sign in
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-3">
        <ModeCard
          active={mode === "local"}
          icon={<HardDrive size={18} />}
          title="Local only"
          desc="Stays on this device. Fastest, works offline."
          onClick={switchToLocal}
        />
        <ModeCard
          active={mode === "cloud"}
          icon={<Cloud size={18} />}
          title="Cloud sync"
          desc="Backed up to your account. Sign-in required."
          onClick={switchToCloud}
          loading={busy === "switch"}
        />
      </div>

      {/* Manual sync controls — only when in cloud mode */}
      {mode === "cloud" && isAuthenticated && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={manualPush}
            disabled={busy !== ""}
            className="flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/30 disabled:opacity-50"
          >
            {busy === "push" ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            Push to cloud
          </button>
          <button
            onClick={manualPull}
            disabled={busy !== ""}
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
      onClick={onClick}
      disabled={loading}
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

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <SurfaceCard className="space-y-4">
      <h2 className="font-bold text-gray-700 dark:text-gray-200 text-sm uppercase tracking-wide">{title}</h2>
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
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0 mt-0.5 w-28">{label}</span>
      <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{value}</span>
    </div>
  );
}

function PreferenceGroup({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/80 bg-white/74 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function PreferencePill({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`motion-button w-full rounded-2xl border px-4 py-3 text-left transition-all ${
        active
          ? "border-amber-300 bg-amber-50/90 text-stone-900 shadow-sm"
          : "border-stone-200 bg-white/90 text-stone-600 hover:border-amber-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        {active && <CheckCircle size={16} className="text-amber-600" />}
      </div>
      <p className="mt-1 text-xs leading-5 text-stone-500">{description}</p>
    </button>
  );
}

function motionLabel(value: MotionLevel) {
  return { reduced: "Reduced", gentle: "Gentle", expressive: "Expressive" }[value];
}

function hoverLabel(value: HoverStyle) {
  return { soft: "Soft", lifted: "Lifted", dramatic: "Dramatic" }[value];
}

function surfaceLabel(value: SurfaceStyle) {
  return { glass: "Glass", balanced: "Balanced", solid: "Solid" }[value];
}

function colorName(hex: string) {
  return COLOR_PRESETS.find((preset) => preset.hex.toLowerCase() === hex.toLowerCase())?.name ?? "Custom";
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
