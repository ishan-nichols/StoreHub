import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useApp } from "../contexts/useApp";
import type { UserProfile, BusinessType, Language, Theme, StoreSize, CurrentSystem, OpeningHours } from "../schemas";
import { generateId, getCurrencySymbol } from "../utils";
import { bulkCreateProducts, getSeedProducts, getProducts } from "../services/dataService";
import { TAX_REGIONS, US_REGIONS, MX_REGIONS, getRegion, fmtRate } from "../data/taxData";
import { Check, ChevronLeft, ChevronRight, ArrowRight, Upload, X, ImageIcon, FileText } from "lucide-react";
import { applyAccentColor } from "../lib/themeColors";

// ─── Step Sequence ────────────────────────────────────────────────────────────

type StepKey =
  | "businessName" | "businessType" | "logo" | "location" | "storeSize" | "currentSystem" | "whichPos"
  | "painPoints" | "stockOuts" | "supplierStyle" | "scheduleStyle"
  | "goal" | "storeName" | "storeTaxRate" | "catalog" | "posConnect" | "welcome";

interface Answers {
  businessName: string;
  businessDescription: string;
  businessWebsite: string;
  businessType: BusinessType;
  country: "US" | "MX" | "";
  stateCode: string;
  stateName: string;
  storeSize: StoreSize;
  currentSystem: CurrentSystem;
  currentPosSystem: string;
  painPoints: string[];
  stockOuts: string[];
  supplierStyle: string;
  scheduleStyle: string;
  goal: string;
  storeName: string;
  ownerName: string;
  posConnect: string;
  language: Language;
  currency: string;
  taxRate: number;
  // Branding
  logoDataUrl: string;
  logoAccentColor: string;
  // Catalog
  catalogItems: string[];       // product names extracted from uploaded catalog
  catalogFileName: string;      // original file name (for display)
}

function getStepSequence(answers: Partial<Answers>): StepKey[] {
  const hasPOS = answers.currentSystem === "pos" || answers.currentSystem === "multiple";
  return [
    "businessName",
    "businessType",
    "logo",          // NEW: optional logo upload after business type
    "location",
    "storeSize",
    "currentSystem",
    ...(hasPOS ? ["whichPos" as StepKey] : []),
    "painPoints",
    "stockOuts",
    "supplierStyle",
    "scheduleStyle",
    "goal",
    "storeName",
    "storeTaxRate",
    "catalog",       // NEW: optional menu/catalog upload before final steps
    ...(hasPOS ? ["posConnect" as StepKey] : []),
    "welcome",
  ];
}

// ─── Static data ──────────────────────────────────────────────────────────────

const BUSINESS_TYPES: { value: BusinessType; emoji: string; label: string }[] = [
  { value: "cstore",     emoji: "⛽", label: "Gas Station / C-Store"         },
  { value: "grocery",    emoji: "🛒", label: "Grocery Store / Bodega"         },
  { value: "butcher",    emoji: "🥩", label: "Butcher / Meat Shop"            },
  { value: "bakery",     emoji: "🍞", label: "Bakery"                         },
  { value: "liquor",     emoji: "🥃", label: "Liquor Store"                   },
  { value: "clothing",   emoji: "👗", label: "Clothing / General Merchandise" },
  { value: "restaurant", emoji: "🍽️", label: "Restaurant / Food Service"      },
  { value: "other",      emoji: "🏪", label: "Other"                          },
];

const STORE_SIZES: { value: StoreSize; emoji: string; label: string; desc: string }[] = [
  { value: "solo",   emoji: "🧑",  label: "Just me",            desc: "Solo operator"        },
  { value: "small",  emoji: "👥",  label: "Small",              desc: "2–5 people"           },
  { value: "medium", emoji: "🏢",  label: "Medium",             desc: "6–15 employees"       },
  { value: "multi",  emoji: "🏬",  label: "Multiple locations", desc: "More than one store"  },
];

const CURRENT_SYSTEMS: { value: CurrentSystem; emoji: string; label: string }[] = [
  { value: "paper",        emoji: "📝", label: "Nothing — pen & paper"  },
  { value: "spreadsheets", emoji: "📊", label: "Spreadsheets"           },
  { value: "pos",          emoji: "💻", label: "A POS system"           },
  { value: "multiple",     emoji: "🔀", label: "Multiple systems"       },
];

const POS_SYSTEMS = [
  { value: "verifone",   label: "Verifone Commander" },
  { value: "gilbarco",   label: "Gilbarco Passport"  },
  { value: "wayne",      label: "Wayne Nucleus"       },
  { value: "ncr",        label: "NCR Voyix"           },
  { value: "petrosoft",  label: "Petrosoft"           },
  { value: "square",     label: "Square"              },
  { value: "shopify",    label: "Shopify"             },
  { value: "lightspeed", label: "Lightspeed"          },
  { value: "clover",     label: "Clover"              },
  { value: "quickbooks", label: "QuickBooks"          },
  { value: "toast",      label: "Toast POS"           },
  { value: "other_pos",  label: "Other POS system"    },
];

const PAIN_POINTS: { value: string; emoji: string; label: string }[] = [
  { value: "reorder",   emoji: "📦", label: "Figuring out what to reorder"      },
  { value: "profits",   emoji: "💰", label: "Tracking what I'm actually making" },
  { value: "employees", emoji: "👥", label: "Managing employees and shifts"     },
  { value: "suppliers", emoji: "🚛", label: "Dealing with suppliers"            },
  { value: "numbers",   emoji: "📈", label: "Understanding my numbers"          },
  { value: "customers", emoji: "🛍️", label: "Keeping customers coming back"    },
];

const STOCK_OUTS_BY_TYPE: Record<string, { value: string; emoji: string; label: string }[]> = {
  cstore:     [{ value: "beer", emoji: "🍺", label: "Beer & Drinks" }, { value: "tobacco", emoji: "🚬", label: "Cigarettes & Tobacco" }, { value: "snacks", emoji: "🍿", label: "Snacks" }, { value: "fuel", emoji: "⛽", label: "Fuel" }, { value: "lottery", emoji: "🎟️", label: "Lottery Tickets" }],
  grocery:    [{ value: "produce", emoji: "🥦", label: "Produce" }, { value: "dairy", emoji: "🥛", label: "Dairy" }, { value: "meat", emoji: "🥩", label: "Meat" }, { value: "dry", emoji: "🌾", label: "Dry Goods" }, { value: "drinks", emoji: "🥤", label: "Drinks" }],
  butcher:    [{ value: "beef", emoji: "🥩", label: "Beef" }, { value: "pork", emoji: "🐷", label: "Pork" }, { value: "chicken", emoji: "🍗", label: "Chicken" }, { value: "packaging", emoji: "📦", label: "Packaging & Bags" }, { value: "season", emoji: "🧂", label: "Seasonings" }],
  bakery:     [{ value: "flour", emoji: "🌾", label: "Flour & Ingredients" }, { value: "packaging", emoji: "📦", label: "Packaging" }, { value: "baked", emoji: "🍞", label: "Baked Items" }, { value: "dairy", emoji: "🥛", label: "Dairy & Eggs" }, { value: "sugar", emoji: "🍬", label: "Sugar" }],
  liquor:     [{ value: "beer", emoji: "🍺", label: "Beer" }, { value: "spirits", emoji: "🥃", label: "Spirits & Liquors" }, { value: "wine", emoji: "🍷", label: "Wine" }, { value: "mixers", emoji: "🥤", label: "Mixers & Sodas" }, { value: "tobacco", emoji: "🚬", label: "Tobacco Products" }],
  clothing:   [{ value: "tops", emoji: "👕", label: "Tops & Shirts" }, { value: "bottoms", emoji: "👖", label: "Pants & Bottoms" }, { value: "footwear", emoji: "👟", label: "Footwear" }, { value: "acc", emoji: "👜", label: "Accessories" }, { value: "basics", emoji: "🧦", label: "Basics" }],
  restaurant: [{ value: "proteins", emoji: "🍖", label: "Proteins & Meats" }, { value: "produce", emoji: "🥬", label: "Produce & Veg" }, { value: "dry", emoji: "🌾", label: "Dry Goods" }, { value: "dairy", emoji: "🧀", label: "Dairy & Eggs" }, { value: "drinks", emoji: "🥤", label: "Beverages" }],
  pharmacy:   [{ value: "otc", emoji: "💊", label: "OTC Medicines" }, { value: "vitamins", emoji: "🧴", label: "Vitamins & Supps" }, { value: "personal", emoji: "🧼", label: "Personal Care" }, { value: "bandages", emoji: "🩹", label: "First Aid" }, { value: "rx", emoji: "📋", label: "Prescription Items" }],
  general:    [{ value: "supplies", emoji: "📦", label: "General Supplies" }, { value: "products", emoji: "🛍️", label: "Main Products" }, { value: "packaging", emoji: "📋", label: "Packaging" }, { value: "tools", emoji: "🔧", label: "Tools & Equipment" }, { value: "drinks", emoji: "🥤", label: "Beverages" }],
  other:      [{ value: "supplies", emoji: "📦", label: "General Supplies" }, { value: "products", emoji: "🛍️", label: "Main Products" }, { value: "packaging", emoji: "📋", label: "Packaging" }, { value: "tools", emoji: "🔧", label: "Tools & Equipment" }, { value: "drinks", emoji: "🥤", label: "Beverages" }],
};

const SUPPLIER_STYLES: { value: string; emoji: string; label: string }[] = [
  { value: "call",     emoji: "📞", label: "I call them directly"          },
  { value: "schedule", emoji: "📅", label: "They come to me on a schedule" },
  { value: "online",   emoji: "🌐", label: "I order online"                },
  { value: "auto",     emoji: "🤖", label: "My POS does it automatically"  },
  { value: "none",     emoji: "🤷", label: "I don't have a system for it"  },
];

const SCHEDULE_STYLES: { value: string; emoji: string; label: string }[] = [
  { value: "memory",   emoji: "🧠", label: "I keep it in my head"      },
  { value: "whatsapp", emoji: "💬", label: "WhatsApp or texts"         },
  { value: "paper",    emoji: "📋", label: "Paper schedule on the wall" },
  { value: "app",      emoji: "📱", label: "A scheduling app"           },
  { value: "solo",     emoji: "🧑", label: "I work alone"               },
];

const GOALS: { value: string; emoji: string; label: string }[] = [
  { value: "reorder",   emoji: "📦", label: "Know exactly what to reorder and when"        },
  { value: "profit",    emoji: "💰", label: "See if my business is actually making money"   },
  { value: "admin",     emoji: "⚡", label: "Spend less time on admin work"                 },
  { value: "customers", emoji: "🛍️", label: "Keep my best customers coming back"           },
  { value: "team",      emoji: "👥", label: "Manage my team better"                        },
];

const CURRENCIES = [
  { code: "USD", name: "US Dollar ($)" }, { code: "EUR", name: "Euro (€)" }, { code: "GBP", name: "British Pound (£)" },
  { code: "MXN", name: "Mexican Peso" },  { code: "COP", name: "Colombian Peso" },{ code: "ARS", name: "Argentine Peso" },
  { code: "PEN", name: "Peruvian Sol" },  { code: "BRL", name: "Brazilian Real" },{ code: "NGN", name: "Nigerian Naira" },
  { code: "GHS", name: "Ghanaian Cedi" }, { code: "KES", name: "Kenyan Shilling" },{ code: "INR", name: "Indian Rupee" },
  { code: "PHP", name: "Philippine Peso" },{ code: "CAD", name: "Canadian Dollar" },{ code: "AUD", name: "Australian Dollar" },
];

const DEFAULT_HOURS: Record<string, OpeningHours> = Object.fromEntries(
  ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day) => [
    day, { open: day === "Sunday" ? "10:00" : "08:00", close: day === "Sunday" ? "17:00" : "20:00", closed: day === "Sunday" },
  ])
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSmartTips(a: Answers): string[] {
  const tips: string[] = [];
  if (a.stockOuts.length > 0) {
    const first = (STOCK_OUTS_BY_TYPE[a.businessType] ?? STOCK_OUTS_BY_TYPE.other).find(s => s.value === a.stockOuts[0])?.label ?? a.stockOuts[0];
    tips.push(`You said ${first} runs out often — we set a low-stock alert for it. Adjust the threshold in Inventory.`);
  }
  if (a.supplierStyle === "schedule") tips.push("Your suppliers visit on a schedule — set their next visit date in Suppliers so we can remind you the day before.");
  if (a.painPoints.includes("employees") && a.storeSize !== "solo") tips.push("Employee clock-in/out is ready. Share the Employee Portal link so your team can sign in with their PIN.");
  if (a.painPoints.includes("profits") || a.goal === "profit") tips.push("Your P&L report is live under Reports → Daily. Check it at the end of every shift.");
  if (a.currentSystem === "paper" || a.currentSystem === "spreadsheets") tips.push("Coming from pen & paper? Use CSV Import in Integrations to bring your existing data over quickly.");
  return tips.slice(0, 3);
}

function generateChecklist(a: Answers): { icon: string; text: string }[] {
  const items: { icon: string; text: string }[] = [];
  if (a.stockOuts.length > 0 || a.painPoints.includes("reorder")) items.push({ icon: "📦", text: "Add your top products to Inventory" });
  if (a.storeSize !== "solo") items.push({ icon: "👥", text: "Add your employees and set their PINs" });
  if (a.supplierStyle !== "none" || a.painPoints.includes("suppliers")) items.push({ icon: "🚛", text: "Add your main suppliers" });
  if (a.currentPosSystem) items.push({ icon: "🔌", text: `Connect your ${POS_SYSTEMS.find(p => p.value === a.currentPosSystem)?.label ?? "POS"}` });
  items.push({ icon: "💰", text: "Make your first sale with the POS" });
  return items.slice(0, 3);
}

// ─── Logo / Catalog helpers ───────────────────────────────────────────────────

/** Extract the most vibrant (colorful) pixel color from a logo image. */
function extractLogoColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 64; // downsample for speed
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve("#f59e0b"); return; }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        let bestR = 0, bestG = 0, bestB = 0, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          // Skip near-whites and near-blacks
          const brightness = (r + g + b) / 3;
          if (brightness > 230 || brightness < 20) continue;
          // Score = saturation proxy: distance from gray
          const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
          const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
          if (saturation > bestScore) { bestScore = saturation; bestR = r; bestG = g; bestB = b; }
        }

        if (bestScore < 0) { resolve("#f59e0b"); return; }
        const hex = [bestR, bestG, bestB].map(v => v.toString(16).padStart(2, "0")).join("");
        resolve(`#${hex}`);
      } catch { resolve("#f59e0b"); }
    };
    img.onerror = () => resolve("#f59e0b");
    img.src = dataUrl;
  });
}

/** Parse a CSV or plain-text file into a list of product names. */
function parseCatalogText(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results: string[] = [];
  for (const line of lines) {
    // CSV: first column is the name (strip quotes)
    const name = line.split(",")[0].replace(/^"|"$/g, "").trim();
    if (name && name.length > 1 && !/^(name|item|product|sku|#)/i.test(name)) {
      results.push(name);
    }
  }
  return results.slice(0, 30);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { setProfile } = useApp();
  const [, setLocation] = useLocation();

  const [locationSearch, setLocationSearch] = useState("");

  const [answers, setAnswers] = useState<Answers>({
    businessName: "", businessDescription: "", businessWebsite: "",
    businessType: "grocery", country: "", stateCode: "", stateName: "",
    storeSize: "small", currentSystem: "paper",
    currentPosSystem: "", painPoints: [], stockOuts: [],
    supplierStyle: "", scheduleStyle: "", goal: "",
    storeName: "", ownerName: "", posConnect: "",
    language: "en", currency: "USD", taxRate: 8.5,
    logoDataUrl: "", logoAccentColor: "",
    catalogItems: [], catalogFileName: "",
  });

  const [stepHistory, setStepHistory] = useState<StepKey[]>(["businessName"]);
  const currentStep = stepHistory[stepHistory.length - 1];
  const [visible,      setVisible]      = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const sequence    = getStepSequence(answers);
  const progressSeq = sequence.filter(s => s !== "welcome");
  const progressIdx = progressSeq.indexOf(currentStep as Exclude<StepKey, "welcome">);
  const progress    = currentStep === "welcome" ? 100 : (progressIdx / progressSeq.length) * 100;

  function setA<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }

  function animateTo(next: StepKey) {
    setVisible(false);
    setTimeout(() => { setStepHistory(h => [...h, next]); setVisible(true); }, 180);
  }

  function goBack() {
    if (stepHistory.length <= 1) return;
    setVisible(false);
    setTimeout(() => { setStepHistory(h => h.slice(0, -1)); setVisible(true); }, 180);
  }

  // Single-select: set value and immediately advance
  function pickSingle<K extends keyof Answers>(key: K, value: Answers[K], extra?: Partial<Answers>) {
    const merged = { ...answers, [key]: value, ...extra };
    setAnswers(merged);
    setVisible(false);
    setTimeout(() => {
      const seq  = getStepSequence(merged);
      const idx  = seq.indexOf(currentStep);
      const next = seq[idx + 1];
      if (next) setStepHistory(h => [...h, next]);
      setVisible(true);
    }, 180);
  }

  function toggleMulti(key: "painPoints" | "stockOuts", value: string, max = 99) {
    setAnswers(prev => {
      const arr = prev[key];
      if (arr.includes(value)) return { ...prev, [key]: arr.filter(v => v !== value) };
      if (arr.length >= max) return { ...prev, [key]: [...arr.slice(1), value] };
      return { ...prev, [key]: [...arr, value] };
    });
  }

  function advanceFrom(step: Exclude<StepKey, "welcome">, current: Answers) {
    const seq  = getStepSequence(current);
    const idx  = seq.indexOf(step);
    const next = seq[idx + 1];
    if (next) animateTo(next);
  }

  // Save profile to storage — call this BEFORE navigating to welcome
  async function saveProfile(a: Answers) {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const existingProducts = await getProducts();
    const isRetake = existingProducts.length > 0;
    const numEmps = a.storeSize === "solo" ? 0 : a.storeSize === "small" ? 3 : a.storeSize === "medium" ? 8 : 15;

    try {
      // 1. Create business via API
      const businessRes = await fetch("/api/onboarding/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: a.businessName.trim(),
          businessDescription: a.businessDescription.trim() || null,
          businessWebsite: a.businessWebsite.trim() || null,
        }),
        credentials: "include",
      });

      if (!businessRes.ok) {
        const err = await businessRes.json();
        throw new Error(err.error || "Failed to create business");
      }

      const { business } = await businessRes.json();

      const profile: UserProfile = {
        id:               generateId(),
        storeName:        a.storeName.trim(),
        ownerName:        a.ownerName.trim(),
        businessType:     a.businessType,
        numEmployees:     numEmps,
        painPoint:        a.painPoints.includes("employees") ? "employees" :
                          a.painPoints.includes("profits")   ? "profits"   :
                          a.painPoints.includes("reorder")   ? "inventory" : "sales",
        currency:         a.currency,
        currencySymbol:   getCurrencySymbol(a.currency),
        language:         a.language,
        theme:            "light" as Theme,
        taxRate:          a.taxRate,
        openingHours:     DEFAULT_HOURS,
        preSeedData:      true,
        createdAt:        new Date().toISOString(),
        featureUsageCount: {},
        onboardingCompleted: true,
        onboardingVersion: 2,
        storeSize:        a.storeSize,
        currentSystem:    a.currentSystem,
        currentPosSystem: a.currentPosSystem || undefined,
        painPoints:       a.painPoints,
        stockOuts:        a.stockOuts,
        supplierStyle:    a.supplierStyle || undefined,
        scheduleStyle:    a.scheduleStyle || undefined,
        goal:             a.goal || undefined,
        country:          (a.country as "US" | "MX") || undefined,
        stateCode:        a.stateCode || undefined,
        stateName:        a.stateName || undefined,
        lastUpdated:      new Date().toISOString(),
        businessId:       business.id,
        logoDataUrl:      a.logoDataUrl || undefined,
        accentColor:      a.logoAccentColor || undefined,
      } as any;

      // Save completion flag synchronously FIRST — before any async work.
      // Use the same key that getUserProfile() reads from ("storehub_user_profile").
      localStorage.setItem("onboardingComplete", "true");
      localStorage.setItem("storehub_user_profile", JSON.stringify(profile));
      console.log("Onboarding saved with business:", business.id);

      // Apply accent color from logo immediately
      if (a.logoAccentColor) {
        applyAccentColor(a.logoAccentColor);
      }

      // Persist store profile to DB so admin dashboard can see it
      await fetch("/api/onboarding/ensure-store-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: a.storeName.trim(),
          ownerName: a.ownerName.trim(),
          businessType: a.businessType,
          businessId: business.id,
        }),
        credentials: "include",
      });

      // Now update React context state (async)
      await setProfile(profile);

      if (!isRetake) {
        const seedProducts = getSeedProducts(a.businessType);
        // Merge catalog items as additional products (prepend, no duplicates)
        if (a.catalogItems.length > 0) {
          const catalogProducts = a.catalogItems
            .filter(name => !seedProducts.some((p: { name: string }) => p.name.toLowerCase() === name.toLowerCase()))
            .map((name: string) => ({
              id:                generateId(),
              name,
              sku:               name.slice(0, 3).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
              category:          "From Menu",
              price:             0,
              quantity:          0,
              lowStockThreshold: 5,
              supplierId:        null,
              unit:              "unit",
              tags:              ["catalog"],
              createdAt:         new Date().toISOString(),
              updatedAt:         new Date().toISOString(),
            }));
          await bulkCreateProducts([...catalogProducts, ...seedProducts]);
        } else {
          await bulkCreateProducts(seedProducts);
        }
      }
    } catch (error) {
      console.error("Onboarding failed:", error);
      alert((error as Error).message || "Failed to complete onboarding");
      savingRef.current = false;
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
  }

  async function goToWelcome(currentAnswers: Answers) {
    await saveProfile(currentAnswers);
    // If they chose to connect POS, go to integrations. Otherwise dashboard.
    if (currentAnswers.posConnect === "yes") {
      setLocation("/integrations");
    } else {
      setLocation("/dashboard");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const firstName   = answers.ownerName.split(" ")[0] || "there";
  const smartTips   = generateSmartTips(answers);
  const checklist   = generateChecklist(answers);
  const posName     = POS_SYSTEMS.find(p => p.value === answers.currentPosSystem)?.label ?? "your POS";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_24%),linear-gradient(180deg,_#fbf7f1_0%,_#efe6d8_100%)]" />
      <div className="premium-grid absolute inset-0 opacity-35" />
      <style>{`
        @keyframes ob-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ob-step { animation: ob-in 0.26s cubic-bezier(0.22,1,0.36,1); }
      `}</style>
      <div className="relative flex min-h-screen flex-col">

      {/* Top bar */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl font-bold text-stone-950 tracking-tight">StoreHub</div>
          {stepHistory.length > 1 && currentStep !== "welcome" && (
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft size={16} /> Back
            </button>
          )}
        </div>

        {currentStep !== "welcome" && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Step {progressIdx + 1} of {progressSeq.length}</span>
              <span>{Math.round(progress)}% done</span>
            </div>
            <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 pb-10 pt-2 overflow-y-auto">
        <div className="w-full max-w-lg">
          {visible && (
            <div key={currentStep} className="glass-panel ob-step rounded-[32px] p-5 md:p-6">

              {/* Step 0: Business Name (NEW) */}
              {currentStep === "businessName" && (
                <Step question="What's your business name?" sub="This will appear on your dashboard and reports.">
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="e.g., Acme Grocery"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none"
                      value={answers.businessName}
                      onChange={(e) => setA("businessName", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && answers.businessName.trim()) {
                          const seq = getStepSequence(answers);
                          const idx = seq.indexOf(currentStep);
                          const next = seq[idx + 1];
                          if (next) animateTo(next);
                        }
                      }}
                      autoFocus
                    />
                    <textarea
                      placeholder="(Optional) Business description"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none"
                      rows={2}
                      value={answers.businessDescription}
                      onChange={(e) => setA("businessDescription", e.target.value)}
                    />
                    <input
                      type="url"
                      placeholder="(Optional) Website"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none"
                      value={answers.businessWebsite}
                      onChange={(e) => setA("businessWebsite", e.target.value)}
                    />
                    <button
                      onClick={() => {
                        if (answers.businessName.trim()) {
                          const seq = getStepSequence(answers);
                          const idx = seq.indexOf(currentStep);
                          const next = seq[idx + 1];
                          if (next) animateTo(next);
                        }
                      }}
                      disabled={!answers.businessName.trim()}
                      className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>
                </Step>
              )}

              {/* Step 1: Business Type */}
              {currentStep === "businessType" && (
                <Step question="What kind of store do you run?" sub="This shapes your entire StoreHub experience.">
                  <div className="grid grid-cols-2 gap-2.5">
                    {BUSINESS_TYPES.map(bt => (
                      <ChoiceBtn key={bt.value} selected={false} onClick={() => pickSingle("businessType", bt.value)} emoji={bt.emoji} label={bt.label} />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step: Logo Upload (optional) */}
              {currentStep === "logo" && (
                <LogoStep
                  logoDataUrl={answers.logoDataUrl}
                  onLogo={async (dataUrl) => {
                    const color = await extractLogoColor(dataUrl);
                    applyAccentColor(color);
                    setAnswers(prev => ({ ...prev, logoDataUrl: dataUrl, logoAccentColor: color }));
                  }}
                  onRemove={() => {
                    applyAccentColor(null);
                    setAnswers(prev => ({ ...prev, logoDataUrl: "", logoAccentColor: "" }));
                  }}
                  onContinue={() => advanceFrom("logo", answers)}
                  onSkip={() => advanceFrom("logo", answers)}
                />
              )}

              {/* Step: Location */}
              {currentStep === "location" && (
                <Step
                  question={answers.language === "es" ? "¿Dónde está tu tienda?" : "Where is your store located?"}
                  sub={answers.language === "es" ? "Usamos esto para aplicar el impuesto correcto y el salario mínimo." : "We use this to apply the correct tax rate and minimum wage."}
                >
                  <div className="space-y-4">
                    {/* Country toggle */}
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: "US" as const, flag: "🇺🇸", label: "United States" },
                        { value: "MX" as const, flag: "🇲🇽", label: "México" },
                      ]).map(c => (
                        <button
                          key={c.value}
                          onClick={() => {
                            setAnswers(prev => ({ ...prev, country: c.value, stateCode: "", stateName: "" }));
                            setLocationSearch("");
                          }}
                          className={`flex flex-col items-center gap-2 py-5 rounded-2xl border-2 text-sm font-semibold transition-all ${
                            answers.country === c.value
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                          }`}
                        >
                          <span className="text-3xl">{c.flag}</span>
                          <span>{c.label}</span>
                          {answers.country === c.value && <Check size={14} className="text-emerald-500" />}
                        </button>
                      ))}
                    </div>

                    {/* State/Region picker */}
                    {answers.country && (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          type="text"
                          value={locationSearch}
                          onChange={e => setLocationSearch(e.target.value)}
                          placeholder={answers.country === "MX" ? "Buscar estado…" : "Search state…"}
                          className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm focus:outline-none transition-colors bg-white"
                        />
                        <div className="max-h-52 overflow-y-auto rounded-2xl border border-gray-200 bg-white divide-y divide-gray-50">
                          {(answers.country === "US" ? US_REGIONS : MX_REGIONS)
                            .filter(r => r.stateName.toLowerCase().includes(locationSearch.toLowerCase()) || r.stateCode.toLowerCase().includes(locationSearch.toLowerCase()))
                            .map(region => (
                              <button
                                key={region.code}
                                onClick={() => {
                                  setAnswers(prev => ({
                                    ...prev,
                                    stateCode: region.stateCode,
                                    stateName: region.stateName,
                                    currency:  region.currency,
                                    taxRate:   parseFloat((region.salesTaxRate * 100).toFixed(4)),
                                  }));
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                  answers.stateCode === region.stateCode
                                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                                    : "text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                <span className="font-medium">{region.stateName}</span>
                                <span className="ml-2 text-xs text-gray-400">
                                  {fmtRate(region.stateTaxRate)}
                                  {(region.countyTaxRate + region.cityTaxRate) > 0 && (
                                    <> → {fmtRate(region.combinedAvgRate)} avg</>
                                  )}
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Summary card */}
                    {answers.stateCode && answers.country && (() => {
                      const region = getRegion(`${answers.country}-${answers.stateCode}`);
                      if (!region) return null;
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm space-y-2">
                          <div className="font-bold text-emerald-800">{region.stateName}</div>
                          {answers.country === "US" ? (
                            <>
                              {/* Three-tier tax breakdown */}
                              <div className="rounded-xl bg-white border border-emerald-100 divide-y divide-emerald-50 overflow-hidden">
                                <div className="flex justify-between items-center px-3 py-1.5 text-xs text-gray-600">
                                  <span>State tax</span>
                                  <span className="font-semibold tabular-nums">{fmtRate(region.stateTaxRate)}</span>
                                </div>
                                <div className="flex justify-between items-center px-3 py-1.5 text-xs text-gray-600">
                                  <span>County avg</span>
                                  <span className="font-semibold tabular-nums">{region.countyTaxRate > 0 ? `+${fmtRate(region.countyTaxRate)}` : "none"}</span>
                                </div>
                                <div className="flex justify-between items-center px-3 py-1.5 text-xs text-gray-600">
                                  <span>City avg</span>
                                  <span className="font-semibold tabular-nums">{region.cityTaxRate > 0 ? `+${fmtRate(region.cityTaxRate)}` : "none"}</span>
                                </div>
                                <div className="flex justify-between items-center px-3 py-2 text-sm bg-emerald-50">
                                  <span className="font-bold text-emerald-800">Combined avg</span>
                                  <span className="font-bold text-emerald-700 tabular-nums">{fmtRate(region.combinedAvgRate)}</span>
                                </div>
                                {region.combinedMaxRate > region.combinedAvgRate && (
                                  <div className="flex justify-between items-center px-3 py-1.5 text-xs text-gray-400">
                                    <span>Max possible in state</span>
                                    <span className="tabular-nums">{fmtRate(region.combinedMaxRate)}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-between text-xs text-emerald-700">
                                <span>Min wage</span>
                                <span className="font-semibold">${region.minimumWageHourly?.toFixed(2)}/hr</span>
                              </div>
                              <div className="text-emerald-600 text-xs">{region.incomeTaxNote}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-emerald-700">IVA: <strong>{fmtRate(region.stateTaxRate)}</strong> · Salario mínimo: <strong>${region.minimumWageDailyMXN?.toFixed(2)} MXN/día</strong></div>
                              <div className="text-emerald-600 text-xs">{region.incomeTaxNote}</div>
                            </>
                          )}
                          {region.specialNotes && <div className="text-gray-400 text-xs italic">{region.specialNotes}</div>}
                        </div>
                      );
                    })()}

                    <button
                      disabled={!answers.country || !answers.stateCode}
                      onClick={() => advanceFrom("location", answers)}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-base transition-colors"
                    >
                      Continue <ChevronRight size={18} />
                    </button>

                    <button
                      onClick={() => advanceFrom("location", answers)}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                    >
                      Skip for now
                    </button>
                  </div>
                </Step>
              )}

              {/* Step 2: Store Size */}
              {currentStep === "storeSize" && (
                <Step question="How big is your store?" sub="This decides which features we show you.">
                  <div className="grid grid-cols-2 gap-2.5">
                    {STORE_SIZES.map(s => (
                      <ChoiceBtn key={s.value} selected={false} onClick={() => pickSingle("storeSize", s.value)} emoji={s.emoji} label={s.label} desc={s.desc} />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 3: Current System */}
              {currentStep === "currentSystem" && (
                <Step question="What are you using right now to run your store?" sub="No judgment — we've seen it all.">
                  <div className="space-y-2.5">
                    {CURRENT_SYSTEMS.map(s => (
                      <ChoiceBtn key={s.value} selected={false} onClick={() => pickSingle("currentSystem", s.value)} emoji={s.emoji} label={s.label} wide />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 3b: Which POS */}
              {currentStep === "whichPos" && (
                <Step question="Which POS system are you using?" sub="We'll connect directly to pull your real data.">
                  <div className="grid grid-cols-2 gap-2">
                    {POS_SYSTEMS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => pickSingle("currentPosSystem", p.value)}
                        className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50 transition-all text-sm font-medium text-gray-700 text-left"
                      >
                        <ChevronRight size={13} className="text-amber-400 shrink-0" />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 4: Pain Points */}
              {currentStep === "painPoints" && (
                <Step question="What wastes most of your time every day?" sub="Pick up to 2 — the app focuses on fixing those first.">
                  <div className="space-y-2">
                    {PAIN_POINTS.map(pp => (
                      <MultiBtn key={pp.value} selected={answers.painPoints.includes(pp.value)} onClick={() => toggleMulti("painPoints", pp.value, 2)} emoji={pp.emoji} label={pp.label} />
                    ))}
                  </div>
                  <button
                    onClick={() => advanceFrom("painPoints", answers)}
                    disabled={answers.painPoints.length === 0}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-base transition-colors"
                  >
                    Continue <ChevronRight size={18} />
                  </button>
                </Step>
              )}

              {/* Step 5: Stock Outs */}
              {currentStep === "stockOuts" && (
                <Step question="What products do you run out of most often?" sub="Pick all that apply — we'll set up reorder alerts.">
                  <div className="grid grid-cols-2 gap-2">
                    {(STOCK_OUTS_BY_TYPE[answers.businessType] ?? STOCK_OUTS_BY_TYPE.other).map(item => (
                      <MultiBtn key={item.value} selected={answers.stockOuts.includes(item.value)} onClick={() => toggleMulti("stockOuts", item.value)} emoji={item.emoji} label={item.label} />
                    ))}
                  </div>
                  <button
                    onClick={() => advanceFrom("stockOuts", answers)}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors"
                  >
                    Continue <ChevronRight size={18} />
                  </button>
                </Step>
              )}

              {/* Step 6: Supplier Style */}
              {currentStep === "supplierStyle" && (
                <Step question="How do you order from suppliers right now?">
                  <div className="space-y-2.5">
                    {SUPPLIER_STYLES.map(s => (
                      <ChoiceBtn key={s.value} selected={false} onClick={() => pickSingle("supplierStyle", s.value)} emoji={s.emoji} label={s.label} wide />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 7: Schedule Style */}
              {currentStep === "scheduleStyle" && (
                <Step question="How do you manage employee schedules?">
                  <div className="space-y-2.5">
                    {SCHEDULE_STYLES.map(s => (
                      <ChoiceBtn key={s.value} selected={false} onClick={() => pickSingle("scheduleStyle", s.value)} emoji={s.emoji} label={s.label} wide />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 8: Goal */}
              {currentStep === "goal" && (
                <Step question="What do you most want from this app?" sub="This sets your home screen priority.">
                  <div className="space-y-2.5">
                    {GOALS.map(g => (
                      <ChoiceBtn key={g.value} selected={false} onClick={() => pickSingle("goal", g.value)} emoji={g.emoji} label={g.label} wide />
                    ))}
                  </div>
                </Step>
              )}

              {/* Step 9: Store Name */}
              {currentStep === "storeName" && (
                <Step question="Almost done! Tell us about yourself." sub="Your name and store name appear throughout the app.">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">What's your store called?</label>
                      <input
                        autoFocus
                        type="text"
                        value={answers.storeName}
                        onChange={e => setA("storeName", e.target.value)}
                        placeholder="e.g. Maria's Grocery"
                        className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-2xl px-4 py-4 text-lg focus:outline-none transition-colors bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">And your name?</label>
                      <input
                        type="text"
                        value={answers.ownerName}
                        onChange={e => setA("ownerName", e.target.value)}
                        placeholder="e.g. Maria Lopez"
                        className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-2xl px-4 py-4 text-lg focus:outline-none transition-colors bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">Currency</label>
                        <select
                          value={answers.currency}
                          onChange={e => setA("currency", e.target.value)}
                          className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors bg-white"
                        >
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">Language</label>
                        <div className="flex gap-2">
                          {([{ value: "en", flag: "🇺🇸", label: "EN" }, { value: "es", flag: "🇲🇽", label: "ES" }] as const).map(l => (
                            <button
                              key={l.value}
                              onClick={() => setA("language", l.value)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.language === l.value ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"}`}
                            >
                              <span>{l.flag}</span>{l.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (!answers.storeName.trim() || !answers.ownerName.trim()) return;
                        const seq  = getStepSequence(answers);
                        const idx  = seq.indexOf("storeName");
                        const next = seq[idx + 1];
                        if (next === "welcome") {
                          await goToWelcome(answers);
                        } else {
                          advanceFrom("storeName", answers);
                        }
                      }}
                      disabled={!answers.storeName.trim() || !answers.ownerName.trim() || isSaving}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-base transition-colors"
                    >
                      {isSaving ? "Saving…" : <><span>Continue</span><ChevronRight size={18} /></>}
                    </button>
                  </div>
                </Step>
              )}

              {/* Step: Sales Tax Rate */}
              {currentStep === "storeTaxRate" && (
                <Step question="What's your sales tax rate?" sub="Applied automatically at checkout. You can always change it in Settings.">
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={answers.taxRate}
                        onChange={e => setA("taxRate", parseFloat(e.target.value) || 0)}
                        className="w-full border-2 border-gray-200 focus:border-amber-400 rounded-2xl px-4 py-4 text-3xl font-bold text-center focus:outline-none transition-colors bg-white pr-12"
                        placeholder="8.5"
                      />
                      <span className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 6, 7, 8, 8.5, 10].map(rate => (
                        <button
                          key={rate}
                          onClick={() => setA("taxRate", rate)}
                          className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.taxRate === rate ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"}`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                      Not sure? Check your state or county rate. Enter 0 for tax-exempt stores.
                    </p>
                    <button
                      disabled={isSaving}
                      onClick={async () => {
                        const seq  = getStepSequence(answers);
                        const idx  = seq.indexOf("storeTaxRate");
                        const next = seq[idx + 1];
                        if (next === "welcome") {
                          await goToWelcome(answers);
                        } else {
                          advanceFrom("storeTaxRate", answers);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-2xl text-base transition-colors"
                    >
                      {isSaving ? "Saving…" : <><span>Continue</span> <ChevronRight size={18} /></>}
                    </button>
                  </div>
                </Step>
              )}

              {/* Step: Catalog / Menu Upload (optional) */}
              {currentStep === "catalog" && (
                <CatalogStep
                  fileName={answers.catalogFileName}
                  itemCount={answers.catalogItems.length}
                  businessType={answers.businessType}
                  onFile={async (file) => {
                    const text = await file.text().catch(() => "");
                    const items = parseCatalogText(text);
                    setAnswers(prev => ({
                      ...prev,
                      catalogFileName: file.name,
                      catalogItems: items,
                    }));
                  }}
                  onRemove={() => setAnswers(prev => ({ ...prev, catalogFileName: "", catalogItems: [] }))}
                  onContinue={async () => {
                    const seq = getStepSequence(answers);
                    const idx = seq.indexOf("catalog");
                    const next = seq[idx + 1];
                    if (next === "welcome") { await goToWelcome(answers); }
                    else { advanceFrom("catalog", answers); }
                  }}
                  onSkip={async () => {
                    const seq = getStepSequence(answers);
                    const idx = seq.indexOf("catalog");
                    const next = seq[idx + 1];
                    if (next === "welcome") { await goToWelcome(answers); }
                    else { advanceFrom("catalog", answers); }
                  }}
                  isSaving={isSaving}
                />
              )}

              {/* Step 10: POS Connect (conditional) */}
              {currentStep === "posConnect" && (
                <Step question={`Want to connect your ${posName} now?`} sub="We'll pull your real products and sales data automatically.">
                  <div className="space-y-2.5">
                    <ChoiceBtn
                      selected={false}
                      onClick={async () => { setA("posConnect", "yes"); await goToWelcome({ ...answers, posConnect: "yes" }); }}
                      emoji="🔌" label="Yes, let's connect it" desc="Pulls real data right away" wide
                    />
                    <ChoiceBtn
                      selected={false}
                      onClick={async () => { await goToWelcome({ ...answers, posConnect: "later" }); }}
                      emoji="⏰" label="I'll do it later" wide
                    />
                  </div>
                </Step>
              )}

              {/* Welcome Screen */}
              {currentStep === "welcome" && (
                <div className="text-center py-4">
                  <div className="text-6xl mb-4">🎉</div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-1">Welcome, {firstName}!</h1>
                  <p className="text-gray-500 mb-6">
                    <span className="font-semibold text-amber-600">{answers.storeName}</span> is all set.
                  </p>

                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Your first 3 steps</p>
                    <div className="space-y-3">
                      {checklist.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base shrink-0">{item.icon}</div>
                          <span className="text-sm font-medium text-gray-700 flex-1">{item.text}</span>
                          <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex items-center justify-center shrink-0">
                            <span className="text-xs text-gray-400">{i + 1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {smartTips.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left mb-5">
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Smart setup tips</p>
                      <div className="space-y-2">
                        {smartTips.map((tip, i) => (
                          <div key={i} className="flex gap-2 text-sm text-amber-800">
                            <span className="shrink-0">💡</span>
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setLocation("/dashboard")}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors"
                  >
                    Open My Dashboard <ArrowRight size={18} />
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Step({ question, sub, children }: { question: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-semibold tracking-[-0.04em] text-stone-950 leading-snug">{question}</h2>
        {sub && <p className="text-stone-500 mt-1.5 text-sm leading-relaxed">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function ChoiceBtn({ selected, onClick, emoji, label, desc, wide }: {
  selected: boolean; onClick: () => void; emoji: string; label: string; desc?: string; wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-4 rounded-[24px] border text-left transition-all active:scale-[0.99] bg-white ${
        selected ? "border-amber-300 bg-amber-50" : "border-stone-200 hover:border-amber-300 hover:bg-[#fcfbf8]"
      } ${wide ? "w-full" : ""}`}
    >
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-900">{label}</div>
        {desc && <div className="text-xs text-stone-400 mt-0.5">{desc}</div>}
      </div>
      {selected && <Check size={16} className="text-amber-500 shrink-0" />}
    </button>
  );
}

function MultiBtn({ selected, onClick, emoji, label }: {
  selected: boolean; onClick: () => void; emoji: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-[24px] border text-left transition-all active:scale-[0.99] w-full ${
        selected ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-300 hover:bg-[#fcfbf8]"
      }`}
    >
      <span className="text-xl shrink-0">{emoji}</span>
      <span className={`text-sm font-semibold flex-1 ${selected ? "text-amber-800" : "text-stone-900"}`}>{label}</span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "border-amber-500 bg-amber-500" : "border-stone-300"}`}>
        {selected && <Check size={11} className="text-white" />}
      </div>
    </button>
  );
}

// ─── Logo Step ────────────────────────────────────────────────────────────────

function LogoStep({ logoDataUrl, onLogo, onRemove, onContinue, onSkip }: {
  logoDataUrl: string;
  onLogo: (dataUrl: string) => Promise<void>;
  onRemove: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      await onLogo(dataUrl);
      setLoading(false);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Step question="Add your store logo" sub="Optional — your logo appears in the app and sets your color theme automatically.">
      <div className="space-y-4">
        {logoDataUrl ? (
          <div className="relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-amber-300 bg-amber-50">
            <img src={logoDataUrl} alt="Logo preview" className="max-h-28 max-w-full object-contain rounded-xl" />
            <button
              onClick={onRemove}
              className="absolute top-3 right-3 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
            >
              <X size={14} />
            </button>
            <p className="text-xs text-amber-700 font-medium">Looking good! We picked a color from your logo.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className={`w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed transition-all ${
              dragging
                ? "border-amber-400 bg-amber-50"
                : "border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/40"
            }`}
          >
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <ImageIcon size={22} className="text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Drop your logo here</p>
                  <p className="text-xs text-gray-400 mt-0.5">or click to browse · PNG, JPG, SVG, WEBP</p>
                </div>
              </>
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {logoDataUrl && (
          <button
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors"
          >
            Continue <ChevronRight size={18} />
          </button>
        )}
        <button
          onClick={onSkip}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          {logoDataUrl ? "Continue without logo" : "Skip for now"}
        </button>
      </div>
    </Step>
  );
}

// ─── Catalog Step ─────────────────────────────────────────────────────────────

function CatalogStep({ fileName, itemCount, businessType, onFile, onRemove, onContinue, onSkip, isSaving }: {
  fileName: string;
  itemCount: number;
  businessType: BusinessType;
  onFile: (file: File) => Promise<void>;
  onRemove: () => void;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
  isSaving: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const EXAMPLE_LABELS: Record<string, string> = {
    restaurant: "menu PDF or CSV",
    bakery: "product list or price sheet",
    grocery: "product catalog or price list",
    cstore: "product list",
    butcher: "cut list or price sheet",
    liquor: "catalog CSV",
    clothing: "product catalog",
    other: "product list or catalog",
  };
  const example = EXAMPLE_LABELS[businessType] ?? "product list or catalog";

  async function handleFile(file: File) {
    setLoading(true);
    await onFile(file);
    setLoading(false);
  }

  return (
    <Step
      question="Upload your menu or product catalog"
      sub={`Optional — upload your ${example} and we'll pre-fill your inventory.`}
    >
      <div className="space-y-4">
        {fileName ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 truncate">{fileName}</p>
              {itemCount > 0 ? (
                <p className="text-xs text-emerald-600 mt-0.5">
                  Found <strong>{itemCount} products</strong> — we'll add them to your inventory
                </p>
              ) : (
                <p className="text-xs text-emerald-600 mt-0.5">
                  File uploaded — our team will help import your products
                </p>
              )}
            </div>
            <button onClick={onRemove} className="p-1 rounded-full text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
          >
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Upload size={22} className="text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Drop your catalog here</p>
                  <p className="text-xs text-gray-400 mt-0.5">CSV, TXT · Image support coming soon</p>
                </div>
              </>
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {fileName && (
          <button
            onClick={onContinue}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-2xl text-base transition-colors"
          >
            {isSaving ? "Saving…" : <><span>Finish setup</span> <ChevronRight size={18} /></>}
          </button>
        )}
        <button
          onClick={onSkip}
          disabled={isSaving}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors py-1"
        >
          {isSaving ? "Saving…" : fileName ? "Skip catalog import" : "Skip for now"}
        </button>
      </div>
    </Step>
  );
}
