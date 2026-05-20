import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import type {
  UserProfile, BusinessType, Language, Theme, OpeningHours,
  BusinessCategory, FoodBevType, RetailType, ServiceType,
} from "../schemas";
import { generateId, getCurrencySymbol } from "../utils";
import { bulkCreateProducts, getSeedProducts, getProducts } from "../services/dataService";
import { US_REGIONS, MX_REGIONS, CA_REGIONS, getRegion, fmtRate } from "../data/taxData";
import { Check, ChevronLeft, ChevronRight, Upload, X, ImageIcon, FileText } from "lucide-react";
import { applyAccentColor } from "../lib/themeColors";

// ─── Step Keys ────────────────────────────────────────────────────────────────

type StepKey =
  // Category & sub-type
  | "businessCategory" | "foodBevType" | "retailType" | "serviceType"
  // Food/Bev branches
  | "restaurant_alcohol" | "restaurant_delivery" | "restaurant_tables"
  | "fastfood_drivethrough" | "fastfood_online"
  | "cafe_menu" | "cafe_mobile"
  | "bar_food" | "bar_kitchen"
  // Retail branches
  | "grocery_produce" | "grocery_meat" | "grocery_hotfood"
  | "liquor_snacks" | "liquor_lottery"
  | "clothing_audience" | "clothing_model"
  | "vape_tobacco" | "vape_cbd"
  // Gas station branches
  | "gas_fuel" | "gas_carwash" | "gas_kitchen" | "gas_pos"
  // Service branches
  | "salon_retail" | "salon_appointments"
  // Other branches
  | "other_description" | "other_products" | "other_inventory"
  // Universal
  | "staffCount" | "currentSystem" | "posSystemName" | "paymentMethod"
  | "painPoints" | "stockOuts" | "supplierStyle" | "goal"
  // Country selection
  | "country" | "province"
  | "storeInfo" | "logo" | "catalog" | "welcome";

// ─── Answers ──────────────────────────────────────────────────────────────────

interface Answers {
  // Business identity
  businessName: string;
  businessDescription: string;
  businessWebsite: string;

  // Category & sub-type
  businessCategory: BusinessCategory | "";
  foodBevType: FoodBevType | "";
  retailType: RetailType | "";
  serviceType: ServiceType | "";

  // Food/Bev flags
  servesAlcohol: boolean;
  doesDelivery: boolean;
  hasTables: boolean;
  hasDriveThrough: boolean;
  doesOnlineOrders: boolean;
  hasFoodMenu: boolean;
  doesMobileOrders: boolean;
  servesFood: boolean;
  hasKitchen: boolean;

  // Retail flags
  sellsFreshProduce: boolean;
  sellsMeat: boolean;
  sellsHotFood: boolean;
  sellsSnacks: boolean;
  sellsLottery: boolean;
  clothingAudience: string;
  clothingModel: string;
  sellsTobacco: boolean;
  sellsCBD: boolean;

  // Gas station flags
  sellsFuel: boolean;
  hasCarWash: boolean;
  hasDeli: boolean;
  gasStationPos: string;

  // Service flags
  sellsRetailProducts: boolean;
  takesAppointments: boolean;

  // Other flags
  otherDescription: string;
  sellsPhysicalProducts: boolean;
  hasInventoryToTrack: boolean;

  // Universal
  staffCount: "solo" | "small" | "medium" | "multi" | "";
  currentSystem: "paper" | "spreadsheets" | "pos" | "multiple" | "";
  posSystemName: string;
  paymentMethod: "has_pos" | "cash_register" | "card_reader" | "cash_only" | "need_solution" | "";
  painPoints: string[];
  stockOuts: string[];
  supplierStyle: string;
  goal: string;

  // Country & region
  country: "US" | "CA" | "MX" | "";
  province: string; // province/state code for CA or MX selected separately

  // Store info
  storeName: string;
  ownerName: string;
  stateCode: string;
  stateName: string;
  language: Language;
  currency: string;
  taxRate: number;

  // Branding
  logoDataUrl: string;
  logoAccentColor: string;

  // Catalog
  catalogItems: string[];
  catalogFileName: string;
}

const BLANK: Answers = {
  businessName: "", businessDescription: "", businessWebsite: "",
  businessCategory: "", foodBevType: "", retailType: "", serviceType: "",
  servesAlcohol: false, doesDelivery: false, hasTables: false,
  hasDriveThrough: false, doesOnlineOrders: false, hasFoodMenu: false,
  doesMobileOrders: false, servesFood: false, hasKitchen: false,
  sellsFreshProduce: false, sellsMeat: false, sellsHotFood: false,
  sellsSnacks: false, sellsLottery: false,
  clothingAudience: "", clothingModel: "",
  sellsTobacco: false, sellsCBD: false,
  sellsFuel: false, hasCarWash: false, hasDeli: false, gasStationPos: "",
  sellsRetailProducts: false, takesAppointments: false,
  otherDescription: "", sellsPhysicalProducts: false, hasInventoryToTrack: false,
  staffCount: "", currentSystem: "", posSystemName: "", paymentMethod: "",
  painPoints: [], stockOuts: [], supplierStyle: "", goal: "",
  country: "", province: "",
  storeName: "", ownerName: "", stateCode: "", stateName: "",
  language: "en", currency: "USD", taxRate: 8.5,
  logoDataUrl: "", logoAccentColor: "",
  catalogItems: [], catalogFileName: "",
};

// ─── Graph navigation ─────────────────────────────────────────────────────────

function getNextStep(step: StepKey, a: Partial<Answers>): StepKey | null {
  switch (step) {
    // ── Category branches ──────────────────────────────────────────────────
    case "businessCategory":
      if (a.businessCategory === "food_beverage") return "foodBevType";
      if (a.businessCategory === "retail")        return "retailType";
      if (a.businessCategory === "gas_station")   return "gas_fuel";
      if (a.businessCategory === "service")       return "serviceType";
      return "other_description";

    case "foodBevType":
      if (a.foodBevType === "restaurant") return "restaurant_alcohol";
      if (a.foodBevType === "fastfood")   return "fastfood_drivethrough";
      if (a.foodBevType === "cafe")       return "cafe_menu";
      if (a.foodBevType === "bar")        return "bar_food";
      return "staffCount"; // bakery

    case "retailType":
      if (a.retailType === "grocery")  return "grocery_produce";
      if (a.retailType === "liquor")   return "liquor_snacks";
      if (a.retailType === "clothing") return "clothing_audience";
      if (a.retailType === "vape")     return "vape_tobacco";
      return "staffCount"; // general_retail

    case "serviceType":
      if (a.serviceType === "salon") return "salon_retail";
      return "other_products"; // auto, cleaning, repair, other_service

    // ── Restaurant ────────────────────────────────────────────────────────
    case "restaurant_alcohol":   return "restaurant_delivery";
    case "restaurant_delivery":  return "restaurant_tables";
    case "restaurant_tables":    return "staffCount";

    // ── Fast food ─────────────────────────────────────────────────────────
    case "fastfood_drivethrough": return "fastfood_online";
    case "fastfood_online":       return "staffCount";

    // ── Cafe ──────────────────────────────────────────────────────────────
    case "cafe_menu":   return "cafe_mobile";
    case "cafe_mobile": return "staffCount";

    // ── Bar ───────────────────────────────────────────────────────────────
    case "bar_food":    return a.servesFood ? "bar_kitchen" : "staffCount";
    case "bar_kitchen": return "staffCount";

    // ── Grocery ───────────────────────────────────────────────────────────
    case "grocery_produce": return "grocery_meat";
    case "grocery_meat":    return "grocery_hotfood";
    case "grocery_hotfood": return "staffCount";

    // ── Liquor ────────────────────────────────────────────────────────────
    case "liquor_snacks":  return "liquor_lottery";
    case "liquor_lottery": return "staffCount";

    // ── Clothing ──────────────────────────────────────────────────────────
    case "clothing_audience": return "clothing_model";
    case "clothing_model":    return "staffCount";

    // ── Vape ──────────────────────────────────────────────────────────────
    case "vape_tobacco": return "vape_cbd";
    case "vape_cbd":     return "staffCount";

    // ── Gas station ───────────────────────────────────────────────────────
    case "gas_fuel":    return "gas_carwash";
    case "gas_carwash": return "gas_kitchen";
    case "gas_kitchen": return "gas_pos";
    case "gas_pos":     return "staffCount";

    // ── Salon ─────────────────────────────────────────────────────────────
    case "salon_retail":       return "salon_appointments";
    case "salon_appointments": return "staffCount";

    // ── Other ─────────────────────────────────────────────────────────────
    case "other_description": return "other_products";
    case "other_products":    return a.sellsPhysicalProducts ? "other_inventory" : "staffCount";
    case "other_inventory":   return "staffCount";

    // ── Universal ─────────────────────────────────────────────────────────
    case "staffCount":
      return "currentSystem";
    case "currentSystem":
      return (a.currentSystem === "pos" || a.currentSystem === "multiple") ? "posSystemName" : "paymentMethod";
    case "posSystemName": return "paymentMethod";
    case "paymentMethod": return "painPoints";
    case "painPoints":    return "stockOuts";
    case "stockOuts":     return "supplierStyle";
    case "supplierStyle": return "goal";
    case "goal":          return "country";

    // ── Country → province or storeInfo ───────────────────────────────────
    case "country":
      if (a.country === "CA") return "province";
      return "storeInfo";
    case "province":  return "storeInfo";

    case "storeInfo": return "logo";
    case "logo":      return "catalog";
    case "catalog":   return "welcome";
    default:          return null;
  }
}

// Rough progress position for each step (0–16 scale, welcome = 17)
const STEP_POS: Partial<Record<StepKey, number>> = {
  businessCategory: 0,
  foodBevType: 1, retailType: 1, serviceType: 1,
  restaurant_alcohol: 2, fastfood_drivethrough: 2, cafe_menu: 2, bar_food: 2,
  grocery_produce: 2, liquor_snacks: 2, clothing_audience: 2, vape_tobacco: 2,
  gas_fuel: 2, salon_retail: 2, other_description: 2,
  restaurant_delivery: 3, fastfood_online: 3, cafe_mobile: 3, bar_kitchen: 3,
  grocery_meat: 3, liquor_lottery: 3, clothing_model: 3, vape_cbd: 3,
  gas_carwash: 3, salon_appointments: 3, other_products: 3,
  restaurant_tables: 4, grocery_hotfood: 4, gas_kitchen: 4, other_inventory: 4,
  gas_pos: 5,
  staffCount: 6, currentSystem: 7, posSystemName: 8, paymentMethod: 9,
  painPoints: 10, stockOuts: 11, supplierStyle: 12, goal: 13,
  country: 14, province: 14,
  storeInfo: 15, logo: 16, catalog: 17,
};
const TOTAL_STEPS = 17;

// ─── Data-driven config ───────────────────────────────────────────────────────

interface YesNoConfig { question: string; sub?: string; answerKey: keyof Answers }
const YESNO_CONFIG: Partial<Record<StepKey, YesNoConfig>> = {
  restaurant_alcohol:    { question: "Do you serve alcohol?",                             answerKey: "servesAlcohol" },
  restaurant_delivery:   { question: "Do you offer delivery?",         sub: "DoorDash, Uber Eats, in-house, etc.",      answerKey: "doesDelivery" },
  restaurant_tables:     { question: "Do customers sit down to eat?",  sub: "Dine-in with tables.",                     answerKey: "hasTables" },
  fastfood_drivethrough: { question: "Do you have a drive-through?",                      answerKey: "hasDriveThrough" },
  fastfood_online:       { question: "Do you take online orders?",                        answerKey: "doesOnlineOrders" },
  cafe_menu:             { question: "Do you also serve food?",         sub: "Sandwiches, pastries, etc.",               answerKey: "hasFoodMenu" },
  cafe_mobile:           { question: "Do you take mobile or app orders?",                 answerKey: "doesMobileOrders" },
  bar_food:              { question: "Do you serve any food?",          sub: "Bar bites, appetizers, full menu.",        answerKey: "servesFood" },
  bar_kitchen:           { question: "Do you have a full kitchen?",                       answerKey: "hasKitchen" },
  grocery_produce:       { question: "Do you sell fresh produce?",      sub: "Fruits and vegetables.",                   answerKey: "sellsFreshProduce" },
  grocery_meat:          { question: "Do you sell fresh meat or fish?",                   answerKey: "sellsMeat" },
  grocery_hotfood:       { question: "Do you sell hot prepared food?",  sub: "Rotisserie, hot bar, deli counter.",       answerKey: "sellsHotFood" },
  liquor_snacks:         { question: "Do you also sell snacks and drinks?", sub: "Chips, sodas, energy drinks.",         answerKey: "sellsSnacks" },
  liquor_lottery:        { question: "Do you sell lottery tickets?",                      answerKey: "sellsLottery" },
  vape_tobacco:          { question: "Do you also sell traditional tobacco?", sub: "Cigarettes, cigars, chewing tobacco.", answerKey: "sellsTobacco" },
  vape_cbd:              { question: "Do you sell CBD or hemp products?",                 answerKey: "sellsCBD" },
  gas_fuel:              { question: "Do you sell fuel?",               sub: "Gas, diesel, propane.",                    answerKey: "sellsFuel" },
  gas_carwash:           { question: "Do you have a car wash?",                           answerKey: "hasCarWash" },
  gas_kitchen:           { question: "Do you have a deli or hot food area?", sub: "Hot dogs, sandwiches, pizza slices.", answerKey: "hasDeli" },
  salon_retail:          { question: "Do you sell retail products too?", sub: "Shampoos, accessories, beauty products.", answerKey: "sellsRetailProducts" },
  salon_appointments:    { question: "Do customers book appointments?",                   answerKey: "takesAppointments" },
  other_products:        { question: "Do you sell physical products?",  sub: "Merchandise people buy and take home.",    answerKey: "sellsPhysicalProducts" },
  other_inventory:       { question: "Do you need to track inventory?", sub: "Stock levels, reorder alerts, etc.",       answerKey: "hasInventoryToTrack" },
};

interface SelectOption { value: string; emoji: string; label: string; desc?: string }
interface SelectConfig  { question: string; sub?: string; answerKey: keyof Answers; options: SelectOption[]; wide?: boolean }
const SELECT_CONFIG: Partial<Record<StepKey, SelectConfig>> = {
  businessCategory: {
    question: "What kind of business do you run?",
    sub: "This shapes your entire StoreHub experience.",
    answerKey: "businessCategory",
    options: [
      { value: "food_beverage", emoji: "🍽️", label: "Food & Beverage",   desc: "Restaurant, cafe, bar, bakery" },
      { value: "retail",        emoji: "🛍️", label: "Retail Store",       desc: "Grocery, clothing, liquor, etc." },
      { value: "gas_station",   emoji: "⛽",  label: "Gas Station / C-Store", desc: "Fuel, convenience, deli" },
      { value: "service",       emoji: "✂️",  label: "Service Business",  desc: "Salon, auto, cleaning, repair" },
      { value: "other",         emoji: "🏪",  label: "Something else",    desc: "Let us know more" },
    ],
  },
  foodBevType: {
    question: "Which best describes your place?",
    answerKey: "foodBevType",
    options: [
      { value: "restaurant", emoji: "🍽️", label: "Restaurant",      desc: "Sit-down or casual dining" },
      { value: "fastfood",   emoji: "🍔", label: "Fast Food / QSR", desc: "Counter service, quick bites" },
      { value: "cafe",       emoji: "☕", label: "Café / Coffee Shop", desc: "Coffee, tea, light bites" },
      { value: "bar",        emoji: "🍺", label: "Bar / Nightclub",  desc: "Drinks-first, maybe food" },
      { value: "bakery",     emoji: "🥐", label: "Bakery",           desc: "Bread, pastries, desserts" },
    ],
  },
  retailType: {
    question: "What kind of retail store?",
    answerKey: "retailType",
    options: [
      { value: "grocery",      emoji: "🛒", label: "Grocery / Bodega",      desc: "Fresh goods, daily staples" },
      { value: "liquor",       emoji: "🥃", label: "Liquor Store",           desc: "Beer, wine, spirits" },
      { value: "clothing",     emoji: "👗", label: "Clothing / Apparel",     desc: "Fashion, shoes, accessories" },
      { value: "vape",         emoji: "💨", label: "Vape / Smoke Shop",      desc: "Vapes, e-liquids, tobacco" },
      { value: "general_retail", emoji: "🏪", label: "General Merchandise", desc: "Hardware, gifts, mixed goods" },
    ],
  },
  serviceType: {
    question: "What kind of service do you offer?",
    answerKey: "serviceType",
    options: [
      { value: "salon",        emoji: "✂️", label: "Salon / Barbershop",  desc: "Hair, nails, beauty" },
      { value: "auto",         emoji: "🚗", label: "Auto Shop",           desc: "Repair, detailing, tires" },
      { value: "cleaning",     emoji: "🧹", label: "Cleaning Service",    desc: "Residential or commercial" },
      { value: "repair",       emoji: "🔧", label: "Repair Shop",         desc: "Electronics, appliances, etc." },
      { value: "other_service",emoji: "🤝", label: "Other Services",      desc: "Consulting, lessons, etc." },
    ],
  },
  clothing_audience: {
    question: "Who do you sell clothes to?",
    answerKey: "clothingAudience",
    options: [
      { value: "women",    emoji: "👩", label: "Women" },
      { value: "men",      emoji: "👨", label: "Men" },
      { value: "kids",     emoji: "🧒", label: "Kids & Babies" },
      { value: "everyone", emoji: "👨‍👩‍👧‍👦", label: "Everyone" },
      { value: "unisex",   emoji: "🧑", label: "Unisex / Streetwear" },
    ],
  },
  clothing_model: {
    question: "What best describes your store's style?",
    answerKey: "clothingModel",
    options: [
      { value: "fast_fashion", emoji: "⚡", label: "Fast Fashion",   desc: "Trend-driven, high volume" },
      { value: "boutique",     emoji: "💎", label: "Boutique",        desc: "Curated, higher-end" },
      { value: "vintage",      emoji: "📼", label: "Vintage / Thrift", desc: "Second-hand, unique finds" },
      { value: "athletic",     emoji: "🏋️", label: "Athletic / Sportswear", desc: "Gym, outdoor, sports" },
    ],
  },
  gas_pos: {
    question: "Which forecourt / POS system do you use?",
    sub: "We'll connect directly to pull fuel and store sales.",
    answerKey: "gasStationPos",
    options: [
      { value: "verifone",  emoji: "💻", label: "Verifone Commander" },
      { value: "gilbarco",  emoji: "💻", label: "Gilbarco Passport" },
      { value: "wayne",     emoji: "💻", label: "Wayne Nucleus" },
      { value: "petrosoft", emoji: "💻", label: "Petrosoft" },
      { value: "ncr",       emoji: "💻", label: "NCR Voyix" },
      { value: "other_gas", emoji: "🔀", label: "Other / None" },
    ],
  },
  staffCount: {
    question: "How many people work at your store?",
    sub: "This decides which team features we show you.",
    answerKey: "staffCount",
    options: [
      { value: "solo",   emoji: "🧑",  label: "Just me",             desc: "I run it solo" },
      { value: "small",  emoji: "👥",  label: "2–5 people",          desc: "Small team" },
      { value: "medium", emoji: "🏢",  label: "6–15 employees",      desc: "Growing team" },
      { value: "multi",  emoji: "🏬",  label: "Multiple locations",  desc: "More than one store" },
    ],
  },
  currentSystem: {
    question: "What are you using right now to run your store?",
    sub: "No judgment — we've seen it all.",
    answerKey: "currentSystem",
    options: [
      { value: "paper",        emoji: "📝", label: "Nothing — pen & paper",  wide: true } as SelectOption,
      { value: "spreadsheets", emoji: "📊", label: "Spreadsheets",            wide: true } as SelectOption,
      { value: "pos",          emoji: "💻", label: "A POS system",            wide: true } as SelectOption,
      { value: "multiple",     emoji: "🔀", label: "Multiple systems",        wide: true } as SelectOption,
    ],
    wide: true,
  },
  posSystemName: {
    question: "Which POS system are you using?",
    sub: "We'll connect directly to pull your real data.",
    answerKey: "posSystemName",
    options: [
      { value: "square",     emoji: "💳", label: "Square" },
      { value: "shopify",    emoji: "🛍️", label: "Shopify POS" },
      { value: "clover",     emoji: "🍀", label: "Clover" },
      { value: "toast",      emoji: "🍞", label: "Toast POS" },
      { value: "lightspeed", emoji: "⚡", label: "Lightspeed" },
      { value: "ncr",        emoji: "💻", label: "NCR Voyix" },
      { value: "quickbooks", emoji: "📒", label: "QuickBooks" },
      { value: "other_pos",  emoji: "🔀", label: "Other POS" },
    ],
  },
  paymentMethod: {
    question: "How do you currently accept payments?",
    answerKey: "paymentMethod",
    options: [
      { value: "has_pos",       emoji: "💳", label: "I have a POS system already" },
      { value: "cash_register", emoji: "🏪", label: "I have a cash register" },
      { value: "card_reader",   emoji: "📱", label: "I use a card reader" },
      { value: "cash_only",     emoji: "💵", label: "I use cash only" },
      { value: "need_solution", emoji: "🆘", label: "I need a payment solution" },
    ],
    wide: true,
  },
  supplierStyle: {
    question: "How do you order from suppliers?",
    answerKey: "supplierStyle",
    options: [
      { value: "call",     emoji: "📞", label: "I call them directly" },
      { value: "schedule", emoji: "📅", label: "They come on a set schedule" },
      { value: "online",   emoji: "🌐", label: "I order online" },
      { value: "auto",     emoji: "🤖", label: "My POS does it automatically" },
      { value: "none",     emoji: "🤷", label: "I don't have a system" },
    ],
    wide: true,
  },
  goal: {
    question: "What do you most want from StoreHub?",
    sub: "We'll set up your home screen around this.",
    answerKey: "goal",
    options: [
      { value: "reorder",   emoji: "📦", label: "Know exactly what to reorder and when" },
      { value: "profit",    emoji: "💰", label: "See if my business is actually making money" },
      { value: "admin",     emoji: "⚡", label: "Spend less time on admin work" },
      { value: "customers", emoji: "🛍️", label: "Keep my best customers coming back" },
      { value: "team",      emoji: "👥", label: "Manage my team better" },
    ],
    wide: true,
  },
};

const PAIN_POINTS = [
  { value: "reorder",   emoji: "📦", label: "Figuring out what to reorder" },
  { value: "profits",   emoji: "💰", label: "Tracking what I'm actually making" },
  { value: "employees", emoji: "👥", label: "Managing employees and shifts" },
  { value: "suppliers", emoji: "🚛", label: "Dealing with suppliers" },
  { value: "numbers",   emoji: "📈", label: "Understanding my numbers" },
  { value: "customers", emoji: "🛍️", label: "Keeping customers coming back" },
];

type StockKey = BusinessType | FoodBevType | "general" | "vape" | "salon";
const STOCK_OUTS: Record<string, { value: string; emoji: string; label: string }[]> = {
  restaurant: [{ value: "proteins", emoji: "🍖", label: "Proteins & Meats" }, { value: "produce", emoji: "🥬", label: "Produce & Veg" }, { value: "dry", emoji: "🌾", label: "Dry Goods" }, { value: "dairy", emoji: "🧀", label: "Dairy & Eggs" }, { value: "drinks", emoji: "🥤", label: "Beverages" }],
  fastfood:   [{ value: "proteins", emoji: "🍖", label: "Proteins" }, { value: "buns", emoji: "🍞", label: "Buns & Bread" }, { value: "condiments", emoji: "🧴", label: "Condiments & Sauces" }, { value: "packaging", emoji: "📦", label: "Packaging" }, { value: "drinks", emoji: "🥤", label: "Drinks" }],
  cafe:       [{ value: "coffee", emoji: "☕", label: "Coffee Beans" }, { value: "milk", emoji: "🥛", label: "Milk & Oat Milk" }, { value: "pastry", emoji: "🥐", label: "Pastries & Snacks" }, { value: "syrups", emoji: "🍯", label: "Syrups" }, { value: "cups", emoji: "🧃", label: "Cups & Lids" }],
  bar:        [{ value: "beer", emoji: "🍺", label: "Beer & Draft" }, { value: "spirits", emoji: "🥃", label: "Spirits & Liquors" }, { value: "wine", emoji: "🍷", label: "Wine" }, { value: "mixers", emoji: "🥤", label: "Mixers & Sodas" }, { value: "garnish", emoji: "🍋", label: "Garnishes & Ice" }],
  bakery:     [{ value: "flour", emoji: "🌾", label: "Flour & Grains" }, { value: "dairy", emoji: "🥛", label: "Dairy & Eggs" }, { value: "sugar", emoji: "🍬", label: "Sugar & Sweeteners" }, { value: "packaging", emoji: "📦", label: "Packaging & Boxes" }, { value: "toppings", emoji: "🍓", label: "Toppings & Fillings" }],
  grocery:    [{ value: "produce", emoji: "🥦", label: "Produce" }, { value: "dairy", emoji: "🥛", label: "Dairy" }, { value: "meat", emoji: "🥩", label: "Meat" }, { value: "dry", emoji: "🌾", label: "Dry Goods" }, { value: "drinks", emoji: "🥤", label: "Drinks" }],
  liquor:     [{ value: "beer", emoji: "🍺", label: "Beer" }, { value: "spirits", emoji: "🥃", label: "Spirits & Liquors" }, { value: "wine", emoji: "🍷", label: "Wine" }, { value: "mixers", emoji: "🥤", label: "Mixers & Sodas" }, { value: "tobacco", emoji: "🚬", label: "Tobacco" }],
  clothing:   [{ value: "tops", emoji: "👕", label: "Tops & Shirts" }, { value: "bottoms", emoji: "👖", label: "Pants & Bottoms" }, { value: "footwear", emoji: "👟", label: "Footwear" }, { value: "accessories", emoji: "👜", label: "Accessories" }, { value: "basics", emoji: "🧦", label: "Basics & Underwear" }],
  vape:       [{ value: "devices", emoji: "💨", label: "Devices & Mods" }, { value: "eliquid", emoji: "🧪", label: "E-Liquid & Pods" }, { value: "coils", emoji: "🔩", label: "Coils & Accessories" }, { value: "tobacco", emoji: "🚬", label: "Tobacco Products" }, { value: "cbd", emoji: "🌿", label: "CBD Products" }],
  cstore:     [{ value: "beer", emoji: "🍺", label: "Beer & Drinks" }, { value: "tobacco", emoji: "🚬", label: "Tobacco" }, { value: "snacks", emoji: "🍿", label: "Snacks" }, { value: "fuel", emoji: "⛽", label: "Fuel" }, { value: "lottery", emoji: "🎟️", label: "Lottery" }],
  salon:      [{ value: "color", emoji: "🎨", label: "Hair Color" }, { value: "shampoo", emoji: "🧴", label: "Shampoo & Conditioner" }, { value: "tools", emoji: "✂️", label: "Tools & Equipment" }, { value: "retail", emoji: "🛍️", label: "Retail Products" }, { value: "supplies", emoji: "📦", label: "General Supplies" }],
  general:    [{ value: "main", emoji: "🛍️", label: "Main Products" }, { value: "supplies", emoji: "📦", label: "Supplies" }, { value: "packaging", emoji: "📋", label: "Packaging" }, { value: "tools", emoji: "🔧", label: "Tools & Equipment" }, { value: "drinks", emoji: "🥤", label: "Beverages" }],
};

function getStockOuts(a: Partial<Answers>) {
  if (a.businessCategory === "food_beverage" && a.foodBevType) return STOCK_OUTS[a.foodBevType] ?? STOCK_OUTS.general;
  if (a.businessCategory === "retail") {
    if (a.retailType === "grocery")  return STOCK_OUTS.grocery;
    if (a.retailType === "liquor")   return STOCK_OUTS.liquor;
    if (a.retailType === "clothing") return STOCK_OUTS.clothing;
    if (a.retailType === "vape")     return STOCK_OUTS.vape;
    return STOCK_OUTS.general;
  }
  if (a.businessCategory === "gas_station") return STOCK_OUTS.cstore;
  if (a.businessCategory === "service" && a.serviceType === "salon") return STOCK_OUTS.salon;
  return STOCK_OUTS.general;
}

// Map new category/sub-type → legacy BusinessType for backward compat
function toLegacyBusinessType(a: Partial<Answers>): BusinessType {
  if (a.businessCategory === "food_beverage") {
    if (a.foodBevType === "bakery") return "bakery";
    return "restaurant";
  }
  if (a.businessCategory === "retail") {
    if (a.retailType === "grocery")  return "grocery";
    if (a.retailType === "liquor")   return "liquor";
    if (a.retailType === "clothing") return "clothing";
    return "general";
  }
  if (a.businessCategory === "gas_station") return "cstore";
  return "other";
}

const DEFAULT_HOURS: Record<string, OpeningHours> = Object.fromEntries(
  ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day => [
    day, { open: day === "Sunday" ? "10:00" : "08:00", close: day === "Sunday" ? "17:00" : "20:00", closed: day === "Sunday" },
  ])
);

const CURRENCIES = [
  { code: "USD", name: "US Dollar ($)" }, { code: "CAD", name: "Canadian Dollar" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "EUR", name: "Euro (€)" },      { code: "GBP", name: "British Pound (£)" },
  { code: "COP", name: "Colombian Peso" },{ code: "ARS", name: "Argentine Peso" },
  { code: "PEN", name: "Peruvian Sol" },  { code: "BRL", name: "Brazilian Real" },
  { code: "NGN", name: "Nigerian Naira" },{ code: "GHS", name: "Ghanaian Cedi" },
  { code: "KES", name: "Kenyan Shilling" },{ code: "INR", name: "Indian Rupee" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "AUD", name: "Australian Dollar" },
];

// ─── Logo / Catalog helpers ───────────────────────────────────────────────────

function extractLogoColor(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 64;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve("#f59e0b"); return; }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        let bestR = 0, bestG = 0, bestB = 0, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness > 230 || brightness < 20) continue;
          const maxC = Math.max(r,g,b), minC = Math.min(r,g,b);
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
          if (sat > bestScore) { bestScore = sat; bestR = r; bestG = g; bestB = b; }
        }
        if (bestScore < 0) { resolve("#f59e0b"); return; }
        resolve("#" + [bestR,bestG,bestB].map(v => v.toString(16).padStart(2,"0")).join(""));
      } catch { resolve("#f59e0b"); }
    };
    img.onerror = () => resolve("#f59e0b");
    img.src = dataUrl;
  });
}

function parseCatalogText(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results: string[] = [];
  for (const line of lines) {
    const name = line.split(",")[0].replace(/^"|"$/g, "").trim();
    if (name && name.length > 1 && !/^(name|item|product|sku|#)/i.test(name)) results.push(name);
  }
  return results.slice(0, 30);
}

// ─── Smart tips & checklist ───────────────────────────────────────────────────

function generateSmartTips(a: Answers): { text: string }[] {
  const tips: { text: string }[] = [];
  if (a.stockOuts.length > 0) {
    const opts = getStockOuts(a);
    const first = opts.find(s => s.value === a.stockOuts[0])?.label ?? a.stockOuts[0];
    tips.push({ text: `You said "${first}" runs out often — we've set a low-stock alert for it.` });
  }
  if (a.supplierStyle === "schedule") tips.push({ text: "Your suppliers visit on a schedule — set their next visit date in Suppliers so we can remind you the day before." });
  if (a.painPoints.includes("employees") && a.staffCount !== "solo") tips.push({ text: "Employee clock-in/out is ready. Share the Employee Portal link so your team can sign in with their PIN." });
  if (a.painPoints.includes("profits") || a.goal === "profit") tips.push({ text: "Your P&L report is live under Reports → Daily. Check it at the end of every shift." });
  if (a.currentSystem === "paper" || a.currentSystem === "spreadsheets") tips.push({ text: "Coming from pen & paper? Use CSV Import in Integrations to bring your existing data over quickly." });
  return tips.slice(0, 3);
}

function generateChecklist(a: Answers): { icon: string; text: string }[] {
  const items: { icon: string; text: string }[] = [];
  if (a.paymentMethod === "need_solution") items.push({ icon: "💳", text: "Set up payment methods in Payments & POS" });
  if (a.stockOuts.length > 0 || a.painPoints.includes("reorder")) items.push({ icon: "📦", text: "Add your top products to Inventory" });
  if (a.staffCount !== "solo") items.push({ icon: "👥", text: "Add your employees and set their PINs" });
  if (a.supplierStyle && a.supplierStyle !== "none") items.push({ icon: "🚛", text: "Add your main suppliers" });
  if (a.posSystemName) items.push({ icon: "🔌", text: `Connect your ${a.posSystemName.replace("_pos","").replace("_"," ")} POS` });
  items.push({ icon: "💰", text: "Make your first sale with the POS" });
  return items.slice(0, 4);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { setProfile } = useApp();
  const [, setLocation] = useLocation();
  const { isSwitched } = useAuth();

  const [answers, setAnswers]     = useState<Answers>({ ...BLANK });
  const [stepHistory, setStepHistory] = useState<StepKey[]>(["businessCategory"]);
  const [visible, setVisible]     = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const savingRef = useRef(false);

  const currentStep = stepHistory[stepHistory.length - 1];
  const pos = STEP_POS[currentStep] ?? TOTAL_STEPS;
  const progress = currentStep === "welcome" ? 100 : Math.min(98, (pos / TOTAL_STEPS) * 100);

  function setA<K extends keyof Answers>(key: K, val: Answers[K]) {
    setAnswers(prev => ({ ...prev, [key]: val }));
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

  // For yes/no and single-select: set answer and immediately advance
  function pick<K extends keyof Answers>(key: K, value: Answers[K]) {
    const merged = { ...answers, [key]: value };
    setAnswers(merged);
    setVisible(false);
    setTimeout(() => {
      const next = getNextStep(currentStep, merged);
      if (next) setStepHistory(h => [...h, next]);
      setVisible(true);
    }, 180);
  }

  function toggleMulti(key: "painPoints" | "stockOuts", value: string, max = 99) {
    setAnswers(prev => {
      const arr = prev[key] as string[];
      if (arr.includes(value)) return { ...prev, [key]: arr.filter(v => v !== value) };
      if (arr.length >= max) return { ...prev, [key]: [...arr.slice(1), value] };
      return { ...prev, [key]: [...arr, value] };
    });
  }

  function advanceMulti() {
    const next = getNextStep(currentStep, answers);
    if (next) animateTo(next);
  }

  // Pick a country and immediately advance
  function pickCountry(c: "US" | "CA" | "MX") {
    // Set currency/language defaults based on country
    const currency = c === "CA" ? "CAD" : c === "MX" ? "MXN" : "USD";
    const language: Language = c === "MX" ? "es" : "en";
    const merged: Answers = { ...answers, country: c, currency, language, province: "", stateCode: "", stateName: "" };
    setAnswers(merged);
    setVisible(false);
    setTimeout(() => {
      const next = getNextStep("country", merged);
      if (next) setStepHistory(h => [...h, next]);
      setVisible(true);
    }, 180);
  }

  // ── Save & finish ─────────────────────────────────────────────────────────

  async function finish(a: Answers) {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    const existingProducts = await getProducts();
    const isRetake = existingProducts.length > 0;
    const numEmps = a.staffCount === "solo" ? 0 : a.staffCount === "small" ? 3 : a.staffCount === "medium" ? 8 : 15;
    const legacyType = toLegacyBusinessType(a);

    // Resolve country — default to "US"
    const resolvedCountry: "US" | "CA" | "MX" = (a.country as "US" | "CA" | "MX") || "US";
    // For Canada use the province code from the province step; for US/MX use stateCode from storeInfo
    const resolvedStateCode = resolvedCountry === "CA" ? a.province : (a.stateCode ?? "");
    const resolvedCurrency = resolvedCountry === "CA" ? "CAD" : resolvedCountry === "MX" ? "MXN" : (a.currency || "USD");
    const resolvedCurrencySymbol = resolvedCountry === "CA" ? "CAD $" : resolvedCountry === "MX" ? "$" : "$";
    const resolvedLanguage: Language = resolvedCountry === "MX" ? "es" : (a.language || "en");

    try {
      // 1. Create / update business
      const businessRes = await fetch("/api/onboarding/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: (a.storeName.trim() || a.businessName.trim() || "My Business"),
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
        id:              generateId(),
        storeName:       a.storeName.trim() || a.businessName.trim(),
        ownerName:       a.ownerName.trim(),
        businessType:    legacyType,
        numEmployees:    numEmps,
        painPoint:       a.painPoints.includes("employees") ? "employees" :
                         a.painPoints.includes("profits")   ? "profits"   :
                         a.painPoints.includes("reorder")   ? "inventory" : "sales",
        currency:        resolvedCurrency,
        currencySymbol:  resolvedCurrencySymbol,
        language:        resolvedLanguage,
        theme:           "light" as Theme,
        taxRate:         a.taxRate,
        openingHours:    DEFAULT_HOURS,
        preSeedData:     true,
        createdAt:       new Date().toISOString(),
        featureUsageCount: {},
        onboardingCompleted: true,
        onboardingVersion: 3,
        storeSize:       (a.staffCount as any) || "small",
        staffCount:      (a.staffCount as any) || undefined,
        currentSystem:   (a.currentSystem as any) || undefined,
        currentPosSystem: a.posSystemName || undefined,
        painPoints:      a.painPoints,
        stockOuts:       a.stockOuts,
        supplierStyle:   a.supplierStyle || undefined,
        goal:            a.goal || undefined,
        country:         resolvedCountry,
        stateCode:       resolvedStateCode || undefined,
        stateName:       a.stateName || undefined,
        businessId:      business.id,
        logoDataUrl:     a.logoDataUrl || undefined,
        accentColor:     a.logoAccentColor || undefined,
        lastUpdated:     new Date().toISOString(),
        // Deep answers
        businessCategory: (a.businessCategory as any) || undefined,
        foodBevType:     (a.foodBevType as any) || undefined,
        retailType:      (a.retailType as any) || undefined,
        serviceType:     (a.serviceType as any) || undefined,
        servesAlcohol:   a.servesAlcohol || undefined,
        doesDelivery:    a.doesDelivery || undefined,
        hasTables:       a.hasTables || undefined,
        hasDriveThrough: a.hasDriveThrough || undefined,
        doesOnlineOrders: a.doesOnlineOrders || undefined,
        hasFoodMenu:     a.hasFoodMenu || undefined,
        doesMobileOrders: a.doesMobileOrders || undefined,
        servesFood:      a.servesFood || undefined,
        hasKitchen:      a.hasKitchen || undefined,
        sellsFreshProduce: a.sellsFreshProduce || undefined,
        sellsMeat:       a.sellsMeat || undefined,
        sellsHotFood:    a.sellsHotFood || undefined,
        sellsSnacks:     a.sellsSnacks || undefined,
        sellsLottery:    a.sellsLottery || undefined,
        clothingAudience: a.clothingAudience || undefined,
        clothingModel:   a.clothingModel || undefined,
        sellsTobacco:    a.sellsTobacco || undefined,
        sellsCBD:        a.sellsCBD || undefined,
        sellsFuel:       a.sellsFuel || undefined,
        hasCarWash:      a.hasCarWash || undefined,
        hasDeli:         a.hasDeli || undefined,
        gasStationPos:   a.gasStationPos || undefined,
        sellsRetailProducts: a.sellsRetailProducts || undefined,
        takesAppointments: a.takesAppointments || undefined,
        otherDescription: a.otherDescription || undefined,
        sellsPhysicalProducts: a.sellsPhysicalProducts || undefined,
        hasInventoryToTrack: a.hasInventoryToTrack || undefined,
        paymentMethod: a.paymentMethod || undefined,
        paymentsEnabled: true,
      } as any;

      localStorage.setItem("onboardingComplete", "true");
      localStorage.setItem("storehub_user_profile", JSON.stringify(profile));

      if (a.logoAccentColor) applyAccentColor(a.logoAccentColor);

      await fetch("/api/onboarding/ensure-store-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName:    profile.storeName,
          ownerName:    profile.ownerName,
          businessType: legacyType,
          businessId:   business.id,
        }),
        credentials: "include",
      });

      // Mark onboarding complete in the DB so the business stores page
      // reflects the correct status (storeProfiles.onboardingCompleted = true)
      await fetch("/api/store/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
        credentials: "include",
      });

      await setProfile(profile);

      if (!isRetake) {
        const seedProducts = getSeedProducts(legacyType);
        if (a.catalogItems.length > 0) {
          const extra = a.catalogItems
            .filter(n => !seedProducts.some((p: any) => p.name.toLowerCase() === n.toLowerCase()))
            .map((name: string) => ({
              id: generateId(), name,
              sku: name.slice(0, 3).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
              category: "From Catalog", price: 0, quantity: 0,
              lowStockThreshold: 5, supplierId: null, unit: "unit",
              tags: ["catalog"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            }));
          await bulkCreateProducts([...extra, ...seedProducts]);
        } else {
          await bulkCreateProducts(seedProducts);
        }
      }
    } catch (error) {
      alert((error as Error).message || "Failed to complete onboarding");
      savingRef.current = false;
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    // If we're in a switched store session → stay in the store dashboard (wouter nav is fine).
    // Otherwise this is first-time setup: the server just upgraded the user role to
    // "business_owner", but the JWT in AuthContext is still stale. A full page reload
    // forces AuthContext to re-read the new role from the DB so BusinessOwnerApp renders.
    if (isSwitched) {
      setLocation("/dashboard");
    } else {
      window.location.href = "/business";
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const yesno   = YESNO_CONFIG[currentStep];
  const select  = SELECT_CONFIG[currentStep];
  const stockOutOpts = getStockOuts(answers);

  const firstName = answers.ownerName.split(" ")[0] || answers.storeName.split(" ")[0] || "there";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_24%),linear-gradient(180deg,_#fbf7f1_0%,_#efe6d8_100%)]" />
      <div className="premium-grid absolute inset-0 opacity-35" />
      <style>{`
        @keyframes ob-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ob-step { animation: ob-in 0.24s cubic-bezier(0.22,1,0.36,1); }
      `}</style>

      <div className="relative flex min-h-screen flex-col">
        {/* Top bar */}
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xl font-bold text-stone-950 tracking-tight">StoreHub</div>
            {stepHistory.length > 1 && currentStep !== "welcome" && (
              <button onClick={goBack} className="flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>
          {currentStep !== "welcome" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-stone-400">
                <span>Setting up your store</span>
                <span>{Math.round(progress)}%</span>
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

                {/* ── Yes/No steps ── */}
                {yesno && (
                  <YesNoStep
                    question={yesno.question}
                    sub={yesno.sub}
                    onAnswer={val => pick(yesno.answerKey, val as any)}
                  />
                )}

                {/* ── Single-select steps ── */}
                {!yesno && select && (
                  <SelectStep
                    config={select}
                    onSelect={val => pick(select.answerKey, val as any)}
                  />
                )}

                {/* ── Country step ── */}
                {!yesno && !select && currentStep === "country" && (
                  <CountryStep onSelect={pickCountry} />
                )}

                {/* ── Province step (Canada only) ── */}
                {!yesno && !select && currentStep === "province" && (
                  <ProvinceStep
                    selectedProvince={answers.province}
                    locationSearch={locationSearch}
                    setLocationSearch={setLocationSearch}
                    onChange={(code, name, rate) => {
                      setAnswers(prev => ({
                        ...prev,
                        province: code,
                        stateCode: code,
                        stateName: name,
                        taxRate: rate,
                      }));
                    }}
                    onContinue={() => {
                      const next = getNextStep("province", answers);
                      if (next) animateTo(next);
                    }}
                  />
                )}

                {/* ── Other description text input ── */}
                {!yesno && !select && currentStep === "other_description" && (
                  <Step question="Tell us about your business." sub="What do you do or sell?">
                    <div className="space-y-3">
                      <textarea
                        autoFocus
                        rows={3}
                        value={answers.otherDescription}
                        onChange={e => setA("otherDescription", e.target.value)}
                        placeholder="e.g. I run a laundromat and sell cleaning supplies…"
                        className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none bg-white transition-colors"
                      />
                      <ContinueBtn onClick={() => {
                        const next = getNextStep("other_description", answers);
                        if (next) animateTo(next);
                      }} />
                    </div>
                  </Step>
                )}

                {/* ── Pain Points (multi) ── */}
                {!yesno && !select && currentStep === "painPoints" && (
                  <Step question="What wastes most of your time every day?" sub="Pick up to 2 — the app focuses on fixing those first.">
                    <div className="space-y-2">
                      {PAIN_POINTS.map(pp => (
                        <MultiBtn key={pp.value} selected={answers.painPoints.includes(pp.value)}
                          onClick={() => toggleMulti("painPoints", pp.value, 2)} emoji={pp.emoji} label={pp.label} />
                      ))}
                    </div>
                    <button
                      onClick={advanceMulti}
                      disabled={answers.painPoints.length === 0}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-base transition-colors"
                    >
                      Continue <ChevronRight size={18} />
                    </button>
                  </Step>
                )}

                {/* ── Stock Outs (multi) ── */}
                {!yesno && !select && currentStep === "stockOuts" && (
                  <Step question="What do you run out of most often?" sub="Pick all that apply — we'll set up reorder alerts.">
                    <div className="grid grid-cols-2 gap-2">
                      {stockOutOpts.map(item => (
                        <MultiBtn key={item.value} selected={answers.stockOuts.includes(item.value)}
                          onClick={() => toggleMulti("stockOuts", item.value)} emoji={item.emoji} label={item.label} />
                      ))}
                    </div>
                    <button
                      onClick={advanceMulti}
                      className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors"
                    >
                      Continue <ChevronRight size={18} />
                    </button>
                  </Step>
                )}

                {/* ── Store Info ── */}
                {!yesno && !select && currentStep === "storeInfo" && (
                  <StoreInfoStep
                    answers={answers}
                    locationSearch={locationSearch}
                    setLocationSearch={setLocationSearch}
                    onChange={(key, val) => setA(key as keyof Answers, val as any)}
                    onContinue={() => {
                      const next = getNextStep("storeInfo", answers);
                      if (next) animateTo(next);
                    }}
                  />
                )}

                {/* ── Logo ── */}
                {!yesno && !select && currentStep === "logo" && (
                  <LogoStep
                    logoDataUrl={answers.logoDataUrl}
                    onLogo={async dataUrl => {
                      const color = await extractLogoColor(dataUrl);
                      applyAccentColor(color);
                      setAnswers(prev => ({ ...prev, logoDataUrl: dataUrl, logoAccentColor: color }));
                    }}
                    onRemove={() => { applyAccentColor(null); setAnswers(prev => ({ ...prev, logoDataUrl: "", logoAccentColor: "" })); }}
                    onContinue={() => animateTo("catalog")}
                    onSkip={() => animateTo("catalog")}
                  />
                )}

                {/* ── Catalog ── */}
                {!yesno && !select && currentStep === "catalog" && (
                  <CatalogStep
                    fileName={answers.catalogFileName}
                    itemCount={answers.catalogItems.length}
                    onFile={async file => {
                      const text = await file.text().catch(() => "");
                      const items = parseCatalogText(text);
                      setAnswers(prev => ({ ...prev, catalogFileName: file.name, catalogItems: items }));
                    }}
                    onRemove={() => setAnswers(prev => ({ ...prev, catalogFileName: "", catalogItems: [] }))}
                    onContinue={() => finish(answers)}
                    onSkip={() => finish(answers)}
                    isSaving={isSaving}
                  />
                )}

                {/* ── Welcome ── */}
                {currentStep === "welcome" && (
                  <WelcomeScreen
                    firstName={firstName}
                    storeName={answers.storeName || answers.businessName}
                    tips={generateSmartTips(answers)}
                    checklist={generateChecklist(answers)}
                    onGo={() => {
                      if (isSwitched) {
                        setLocation("/dashboard");
                      } else {
                        window.location.href = "/business";
                      }
                    }}
                  />
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

function ContinueBtn({ onClick, disabled, loading }: { onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-base transition-colors"
    >
      {loading ? "Saving…" : <><span>Continue</span> <ChevronRight size={18} /></>}
    </button>
  );
}

// ── Yes/No step ───────────────────────────────────────────────────────────────

function YesNoStep({ question, sub, onAnswer }: { question: string; sub?: string; onAnswer: (val: boolean) => void }) {
  return (
    <Step question={question} sub={sub}>
      <div className="grid grid-cols-2 gap-3">
        {([
          { val: true,  emoji: "✅", label: "Yes" },
          { val: false, emoji: "❌", label: "No" },
        ] as const).map(opt => (
          <button
            key={String(opt.val)}
            onClick={() => onAnswer(opt.val)}
            className="flex flex-col items-center gap-3 py-8 rounded-[28px] border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50 transition-all active:scale-[0.98] text-center"
          >
            <span className="text-4xl">{opt.emoji}</span>
            <span className="text-lg font-bold text-stone-900">{opt.label}</span>
          </button>
        ))}
      </div>
    </Step>
  );
}

// ── Single select step ────────────────────────────────────────────────────────

function SelectStep({ config, onSelect }: { config: SelectConfig; onSelect: (val: string) => void }) {
  return (
    <Step question={config.question} sub={config.sub}>
      {config.wide ? (
        <div className="space-y-2.5">
          {config.options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-[24px] border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50/60 transition-all active:scale-[0.99] text-left"
            >
              <span className="text-2xl shrink-0">{opt.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-stone-900">{opt.label}</div>
                {opt.desc && <div className="text-xs text-stone-400 mt-0.5">{opt.desc}</div>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {config.options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="flex flex-col gap-2 px-4 py-5 rounded-[24px] border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50/60 transition-all active:scale-[0.98] text-left"
            >
              <span className="text-2xl">{opt.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-stone-900">{opt.label}</div>
                {opt.desc && <div className="text-xs text-stone-400 mt-0.5">{opt.desc}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </Step>
  );
}

// ── Multi select button ───────────────────────────────────────────────────────

function MultiBtn({ selected, onClick, emoji, label }: { selected: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-[24px] border-2 text-left transition-all active:scale-[0.99] w-full ${
        selected ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-300 hover:bg-[#fcfbf8]"
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

// ── Country Step ──────────────────────────────────────────────────────────────

function CountryStep({ onSelect }: { onSelect: (c: "US" | "CA" | "MX") => void }) {
  const options: { value: "US" | "CA" | "MX"; flag: string; label: string; note: string }[] = [
    { value: "US", flag: "🇺🇸", label: "United States", note: "USD · English" },
    { value: "CA", flag: "🇨🇦", label: "Canada",        note: "CAD · English / French" },
    { value: "MX", flag: "🇲🇽", label: "Mexico",        note: "MXN · Español" },
  ];

  return (
    <Step question="Where is your store located?" sub="We'll set up tax rates, currency, and compliance requirements for your country.">
      <div className="space-y-3">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className="w-full flex items-center gap-4 px-5 py-5 rounded-[24px] border-2 border-stone-200 bg-white hover:border-amber-400 hover:bg-amber-50/60 transition-all active:scale-[0.99] text-left"
          >
            <span className="text-4xl shrink-0">{opt.flag}</span>
            <div className="flex-1">
              <div className="text-base font-bold text-stone-900">{opt.label}</div>
              <div className="text-xs text-stone-400 mt-0.5">{opt.note}</div>
            </div>
            <ChevronRight size={16} className="text-stone-300 shrink-0" />
          </button>
        ))}
      </div>
    </Step>
  );
}

// ── Province Step (Canada) ────────────────────────────────────────────────────

function ProvinceStep({
  selectedProvince,
  locationSearch,
  setLocationSearch,
  onChange,
  onContinue,
}: {
  selectedProvince: string;
  locationSearch: string;
  setLocationSearch: (v: string) => void;
  onChange: (code: string, name: string, taxRate: number) => void;
  onContinue: () => void;
}) {
  const filtered = CA_REGIONS.filter(
    r =>
      r.stateName.toLowerCase().includes(locationSearch.toLowerCase()) ||
      r.stateCode.toLowerCase().includes(locationSearch.toLowerCase()),
  );

  return (
    <Step question="Which province or territory?" sub="We'll pre-fill your provincial tax rate and compliance requirements.">
      <div className="space-y-3">
        <input
          type="text"
          autoFocus
          value={locationSearch}
          onChange={e => setLocationSearch(e.target.value)}
          placeholder="Search province or territory…"
          className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-2xl px-4 py-3 text-sm focus:outline-none transition-colors bg-white"
        />
        <div className="max-h-52 overflow-y-auto rounded-2xl border border-stone-200 bg-white divide-y divide-stone-50">
          {filtered.map(region => (
            <button
              key={region.code}
              type="button"
              onClick={() =>
                onChange(region.stateCode, region.stateName, parseFloat((region.combinedAvgRate * 100).toFixed(4)))
              }
              className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${
                selectedProvince === region.stateCode
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-stone-700 hover:bg-stone-50"
              }`}
            >
              <span>{region.stateName}</span>
              <span className="text-xs text-stone-400">
                {fmtRate(region.combinedAvgRate)}
                {region.stateCode === "AB" ? " (GST only)" : ""}
              </span>
            </button>
          ))}
        </div>
        {selectedProvince && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
            Province selected: <strong>
              {CA_REGIONS.find(r => r.stateCode === selectedProvince)?.stateName ?? selectedProvince}
            </strong>
          </div>
        )}
        <ContinueBtn onClick={onContinue} disabled={!selectedProvince} />
      </div>
    </Step>
  );
}

// ── Store Info step ───────────────────────────────────────────────────────────

function StoreInfoStep({ answers, locationSearch, setLocationSearch, onChange, onContinue }: {
  answers: Answers;
  locationSearch: string;
  setLocationSearch: (v: string) => void;
  onChange: (key: string, val: unknown) => void;
  onContinue: () => void;
}) {
  const valid = answers.storeName.trim() && answers.ownerName.trim();
  const country = answers.country || "US";

  // For Canada, region picker is handled in the province step; show confirmation only
  // For US and MX, show the full region picker
  const showRegionPicker = country === "US" || country === "MX";
  const regionList = country === "MX" ? MX_REGIONS : US_REGIONS;
  const regionSearchPlaceholder = country === "MX" ? "Buscar estado…" : "Search state…";
  const regionLabel = country === "CA" ? "Province" : country === "MX" ? "Estado" : "State";

  return (
    <Step question="Almost done! Tell us about yourself." sub="Your name and store name appear throughout the app.">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-2">Store name</label>
          <input
            autoFocus
            type="text"
            value={answers.storeName}
            onChange={e => onChange("storeName", e.target.value)}
            placeholder="e.g. Maria's Grocery"
            className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-2xl px-4 py-3.5 text-lg focus:outline-none transition-colors bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-2">Your name</label>
          <input
            type="text"
            value={answers.ownerName}
            onChange={e => onChange("ownerName", e.target.value)}
            placeholder="e.g. Maria Lopez"
            className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-2xl px-4 py-3.5 text-lg focus:outline-none transition-colors bg-white"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-2">
            {regionLabel} <span className="font-normal text-stone-400">(optional — for tax rates)</span>
          </label>

          {/* Canada: province was already picked, show confirmation */}
          {country === "CA" && answers.province && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
              Province: <strong>{CA_REGIONS.find(r => r.stateCode === answers.province)?.stateName ?? answers.province}</strong>
            </div>
          )}

          {/* US / MX: show region picker */}
          {showRegionPicker && (
            <div className="space-y-1.5">
              <input
                type="text"
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                placeholder={regionSearchPlaceholder}
                className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors bg-white"
              />
              <div className="max-h-36 overflow-y-auto rounded-xl border border-stone-200 bg-white divide-y divide-stone-50">
                {regionList
                  .filter(r => r.stateName.toLowerCase().includes(locationSearch.toLowerCase()) || r.stateCode.toLowerCase().includes(locationSearch.toLowerCase()))
                  .map(region => (
                    <button
                      key={region.code}
                      type="button"
                      onClick={() => {
                        onChange("stateCode", region.stateCode);
                        onChange("stateName", region.stateName);
                        onChange("currency", region.currency);
                        onChange("taxRate", parseFloat((region.salesTaxRate * 100).toFixed(4)));
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${answers.stateCode === region.stateCode ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-stone-700 hover:bg-stone-50"}`}
                    >
                      {region.stateName}
                      <span className="ml-2 text-xs text-stone-400">
                        {fmtRate(region.stateTaxRate)}
                        {(region.countyTaxRate + region.cityTaxRate) > 0 && <> → {fmtRate(region.combinedAvgRate)} avg</>}
                      </span>
                    </button>
                  ))}
              </div>
              {answers.stateCode && (() => {
                const region = getRegion(`${country}-${answers.stateCode}`);
                if (!region) return null;
                return (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
                    ✓ {region.stateName} — avg combined rate: <strong>{fmtRate(region.combinedAvgRate)}</strong>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1.5">Currency</label>
            <select value={answers.currency} onChange={e => onChange("currency", e.target.value)} className="w-full border-2 border-stone-200 focus:border-amber-400 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white">
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1.5">Language</label>
            <div className="flex gap-2">
              {([
                { value: "en" as const, flag: "🇺🇸", label: "EN" },
                { value: "es" as const, flag: "🇲🇽", label: "ES" },
              ]).map(l => (
                <button key={l.value} type="button" onClick={() => onChange("language", l.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.language === l.value ? "border-amber-500 bg-amber-50 text-amber-700" : "border-stone-200 bg-white text-stone-600 hover:border-amber-300"}`}>
                  <span>{l.flag}</span>{l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ContinueBtn onClick={onContinue} disabled={!valid} />
      </div>
    </Step>
  );
}

// ── Logo Step ─────────────────────────────────────────────────────────────────

function LogoStep({ logoDataUrl, onLogo, onRemove, onContinue, onSkip }: {
  logoDataUrl: string; onLogo: (d: string) => Promise<void>;
  onRemove: () => void; onContinue: () => void; onSkip: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async e => { await onLogo(e.target?.result as string); setLoading(false); };
    reader.readAsDataURL(file);
  }

  return (
    <Step question="Add your store logo" sub="Optional — your logo appears in the app and sets your color theme automatically.">
      <div className="space-y-4">
        {logoDataUrl ? (
          <div className="relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-amber-300 bg-amber-50">
            <img src={logoDataUrl} alt="Logo preview" className="max-h-28 max-w-full object-contain rounded-xl" />
            <button onClick={onRemove} className="absolute top-3 right-3 p-1 rounded-full bg-white border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-300 transition-colors">
              <X size={14} />
            </button>
            <p className="text-xs text-amber-700 font-medium">Looking good! We picked a color from your logo.</p>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed transition-all ${dragging ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/40"}`}
          >
            {loading ? <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" /> : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <ImageIcon size={22} className="text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-stone-700">Drop your logo here</p>
                  <p className="text-xs text-stone-400 mt-0.5">or click to browse · PNG, JPG, SVG, WEBP</p>
                </div>
              </>
            )}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {logoDataUrl && <ContinueBtn onClick={onContinue} />}
        <button onClick={onSkip} className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1">
          {logoDataUrl ? "Continue without logo" : "Skip for now"}
        </button>
      </div>
    </Step>
  );
}

// ── Catalog Step ──────────────────────────────────────────────────────────────

function CatalogStep({ fileName, itemCount, onFile, onRemove, onContinue, onSkip, isSaving }: {
  fileName: string; itemCount: number;
  onFile: (f: File) => Promise<void>; onRemove: () => void;
  onContinue: () => void; onSkip: () => void; isSaving: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) { setLoading(true); await onFile(file); setLoading(false); }

  return (
    <Step question="Upload your product catalog" sub="Optional — upload a CSV and we'll pre-fill your inventory.">
      <div className="space-y-4">
        {fileName ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 truncate">{fileName}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {itemCount > 0 ? <><strong>{itemCount} products</strong> found — we'll add them to inventory</> : "File uploaded"}
              </p>
            </div>
            <button onClick={onRemove} className="p-1 rounded-full text-stone-400 hover:text-red-500 transition-colors"><X size={14} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed border-stone-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 transition-all"
          >
            {loading ? <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" /> : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Upload size={22} className="text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-stone-700">Drop your catalog here</p>
                  <p className="text-xs text-stone-400 mt-0.5">CSV, TXT — one product per line</p>
                </div>
              </>
            )}
          </button>
        )}
        <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {fileName && <ContinueBtn onClick={onContinue} loading={isSaving} />}
        <button onClick={onSkip} disabled={isSaving} className="w-full text-center text-sm text-stone-400 hover:text-stone-600 disabled:opacity-50 transition-colors py-1">
          {isSaving ? "Saving…" : fileName ? "Skip catalog import" : "Skip for now"}
        </button>
      </div>
    </Step>
  );
}

// ── Welcome Screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ firstName, storeName, tips, checklist, onGo }: {
  firstName: string; storeName: string;
  tips: { text: string }[]; checklist: { icon: string; text: string }[];
  onGo: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="text-6xl mb-4">🎉</div>
      <h1 className="text-3xl font-bold text-stone-900 mb-1">Welcome, {firstName}!</h1>
      <p className="text-stone-500 mb-6"><span className="font-semibold text-amber-600">{storeName}</span> is all set.</p>

      {checklist.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 text-left mb-4">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Your first 3 steps</p>
          <div className="space-y-3">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-base shrink-0">{item.icon}</div>
                <span className="text-sm font-medium text-stone-700 flex-1">{item.text}</span>
                <div className="w-5 h-5 rounded-full border-2 border-stone-200 flex items-center justify-center shrink-0">
                  <span className="text-xs text-stone-400">{i + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left mb-5">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Smart setup tips</p>
          <div className="space-y-2">
            {tips.map((tip, i) => (
              <div key={i} className="flex gap-2 text-sm text-amber-800">
                <span className="shrink-0">💡</span>
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onGo}
        className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-base transition-colors"
      >
        Open My Dashboard <ChevronRight size={18} />
      </button>
    </div>
  );
}
