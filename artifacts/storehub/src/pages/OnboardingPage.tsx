import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useApp } from "../contexts/useApp";
import type { UserProfile, BusinessType, Language, Theme, StoreSize, CurrentSystem, OpeningHours } from "../schemas";
import { generateId, getCurrencySymbol } from "../utils";
import { bulkCreateProducts, getSeedProducts, getProducts } from "../services/dataService";
import { Check, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

// ─── Step Sequence ────────────────────────────────────────────────────────────

type StepKey =
  | "businessType" | "storeSize" | "currentSystem" | "whichPos"
  | "painPoints" | "stockOuts" | "supplierStyle" | "scheduleStyle"
  | "goal" | "storeName" | "storeTaxRate" | "posConnect" | "welcome";

interface Answers {
  businessType: BusinessType;
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
}

function getStepSequence(answers: Partial<Answers>): StepKey[] {
  const hasPOS = answers.currentSystem === "pos" || answers.currentSystem === "multiple";
  return [
    "businessType",
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { setProfile } = useApp();
  const [, setLocation] = useLocation();

  const [answers, setAnswers] = useState<Answers>({
    businessType: "grocery", storeSize: "small", currentSystem: "paper",
    currentPosSystem: "", painPoints: [], stockOuts: [],
    supplierStyle: "", scheduleStyle: "", goal: "",
    storeName: "", ownerName: "", posConnect: "",
    language: "en", currency: "USD", taxRate: 8.5,
  });

  const [stepHistory, setStepHistory] = useState<StepKey[]>(["businessType"]);
  const currentStep = stepHistory[stepHistory.length - 1];
  const [visible,      setVisible]      = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const sequence    = getStepSequence(answers);
  const progressSeq = sequence.filter(s => s !== "welcome");
  const progressIdx = progressSeq.indexOf(currentStep as StepKey);
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

  function advanceFrom(step: StepKey, current: Answers) {
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
      lastUpdated:      new Date().toISOString(),
    };
    // Save completion flag synchronously FIRST — before any async work.
    // This is the single source of truth for startup routing.
    localStorage.setItem("onboardingComplete", "true");
    localStorage.setItem("userProfile", JSON.stringify(profile));
    console.log("Onboarding saved");
    // Now update React context state (async)
    await setProfile(profile);
    if (!isRetake) {
      await bulkCreateProducts(getSeedProducts(a.businessType));
    }
    setIsSaving(false);
  }

  async function goToWelcome(currentAnswers: Answers) {
    await saveProfile(currentAnswers);
    // Navigate directly to dashboard — no intermediate welcome screen detour.
    console.log("Onboarding complete, redirecting to dashboard");
    setLocation("/dashboard");
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const firstName   = answers.ownerName.split(" ")[0] || "there";
  const smartTips   = generateSmartTips(answers);
  const checklist   = generateChecklist(answers);
  const posName     = POS_SYSTEMS.find(p => p.value === answers.currentPosSystem)?.label ?? "your POS";

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col">
      <style>{`
        @keyframes ob-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ob-step { animation: ob-in 0.26s cubic-bezier(0.22,1,0.36,1); }
      `}</style>

      {/* Top bar */}
      <div className="shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl font-bold text-amber-600 tracking-tight">StoreHub</div>
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
            <div key={currentStep} className="ob-step">

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
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Step({ question, sub, children }: { question: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 leading-snug">{question}</h2>
        {sub && <p className="text-gray-400 mt-1.5 text-sm leading-relaxed">{sub}</p>}
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
      className={`flex items-center gap-3 px-4 py-4 rounded-2xl border-2 text-left transition-all active:scale-95 bg-white ${
        selected ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-amber-300 hover:bg-amber-50/50"
      } ${wide ? "w-full" : ""}`}
    >
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {desc && <div className="text-xs text-gray-400 mt-0.5">{desc}</div>}
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
      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all active:scale-95 w-full ${
        selected ? "border-amber-500 bg-amber-50" : "border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/50"
      }`}
    >
      <span className="text-xl shrink-0">{emoji}</span>
      <span className={`text-sm font-semibold flex-1 ${selected ? "text-amber-800" : "text-gray-800"}`}>{label}</span>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "border-amber-500 bg-amber-500" : "border-gray-300"}`}>
        {selected && <Check size={11} className="text-white" />}
      </div>
    </button>
  );
}
