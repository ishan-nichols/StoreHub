import type { UserProfile } from "../schemas";

export interface ProfileFeatures {
  // Staff
  isSolo: boolean;
  hasEmployees: boolean;

  // System
  hasPOS: boolean;
  isFirstTimePaper: boolean;

  // Business category shortcuts
  isFoodBev: boolean;
  isRetail: boolean;
  isGasStation: boolean;
  isService: boolean;

  // Food sub-types
  isRestaurant: boolean;
  isFastFood: boolean;
  isCafe: boolean;
  isBar: boolean;
  isBakery: boolean;

  // Retail sub-types
  isGrocery: boolean;
  isLiquorStore: boolean;
  isClothingStore: boolean;
  isVapeShop: boolean;

  // Feature flags
  servesAlcohol: boolean;
  hasDelivery: boolean;
  hasTables: boolean;
  hasDriveThrough: boolean;
  hasFuel: boolean;
  hasCarWash: boolean;
  hasFreshProduce: boolean;
  hasMeat: boolean;
  hasHotFood: boolean;
  hasKitchen: boolean;
  hasDeli: boolean;
  hasAppointments: boolean;
  sellsLottery: boolean;
  sellsTobacco: boolean;
  sellsCBD: boolean;

  // Nav personalization
  firstNavKey: string;
  showEmployees: boolean;
  showSuppliers: boolean;
  showDelivery: boolean;
  showFuelSection: boolean;
  showAppointments: boolean;
}

export function computeProfileFeatures(profile: UserProfile | null): ProfileFeatures {
  const cat  = profile?.businessCategory;
  const food = profile?.foodBevType;
  const ret  = profile?.retailType;
  const staff = profile?.staffCount ?? (profile?.storeSize);

  // If staffCount is explicitly set, trust it over numEmployees.
  // Only fall back to numEmployees when staffCount is absent.
  const isSolo         = staff ? staff === "solo" : (profile?.numEmployees ?? 0) === 0;
  const hasEmployees   = !isSolo;
  const hasPOS         = profile?.currentSystem === "pos" || profile?.currentSystem === "multiple";
  const isFirstTimePaper = profile?.currentSystem === "paper" || profile?.currentSystem === "spreadsheets";

  const isFoodBev    = cat === "food_beverage";
  const isRetail     = cat === "retail";
  const isGasStation = cat === "gas_station";
  const isService    = cat === "service";

  const isRestaurant = isFoodBev && food === "restaurant";
  const isFastFood   = isFoodBev && food === "fastfood";
  const isCafe       = isFoodBev && food === "cafe";
  const isBar        = isFoodBev && food === "bar";
  const isBakery     = isFoodBev && food === "bakery";

  const isGrocery      = isRetail && ret === "grocery";
  const isLiquorStore  = isRetail && ret === "liquor";
  const isClothingStore = isRetail && ret === "clothing";
  const isVapeShop     = isRetail && ret === "vape";

  // Backward compat: legacy businessType
  const legacy = profile?.businessType;
  const isLegacyRestaurant = legacy === "restaurant";
  const isLegacyGrocery    = legacy === "grocery";
  const isLegacyLiquor     = legacy === "liquor";
  const isLegacyCstore     = legacy === "cstore";

  const servesAlcohol  = Boolean(profile?.servesAlcohol)  || isBar || isLegacyLiquor;
  const hasDelivery    = Boolean(profile?.doesDelivery);
  const hasTables      = Boolean(profile?.hasTables)      || isLegacyRestaurant;
  const hasDriveThrough = Boolean(profile?.hasDriveThrough);
  const hasFuel        = Boolean(profile?.sellsFuel)      || isGasStation || isLegacyCstore;
  const hasCarWash     = Boolean(profile?.hasCarWash);
  const hasFreshProduce = Boolean(profile?.sellsFreshProduce) || isLegacyGrocery;
  const hasMeat        = Boolean(profile?.sellsMeat);
  const hasHotFood     = Boolean(profile?.sellsHotFood)   || Boolean(profile?.hasDeli);
  const hasKitchen     = Boolean(profile?.hasKitchen);
  const hasDeli        = Boolean(profile?.hasDeli);
  const hasAppointments = Boolean(profile?.takesAppointments);
  const sellsLottery   = Boolean(profile?.sellsLottery);
  const sellsTobacco   = Boolean(profile?.sellsTobacco);
  const sellsCBD       = Boolean(profile?.sellsCBD);

  // Nav priorities from goal/painPoints
  const goal       = profile?.goal ?? "";
  const painPoints = profile?.painPoints ?? [];

  // Show Employees tab when:
  //   • they have a team (staffCount is not "solo" AND numEmployees > 0), OR
  //   • they explicitly said employees are a pain point, OR
  //   • their main goal is team management
  const wantsEmployees = goal === "team" || painPoints.includes("employees");

  let firstNavKey = "dashboard";
  if (goal === "profit" || goal === "numbers" || painPoints.includes("profits")) firstNavKey = "reports";
  else if (goal === "reorder" || painPoints.includes("reorder")) firstNavKey = "inventory";
  else if (wantsEmployees) firstNavKey = "employees";

  return {
    isSolo, hasEmployees, hasPOS, isFirstTimePaper,
    isFoodBev, isRetail, isGasStation, isService,
    isRestaurant, isFastFood, isCafe, isBar, isBakery,
    isGrocery, isLiquorStore, isClothingStore, isVapeShop,
    servesAlcohol, hasDelivery, hasTables, hasDriveThrough,
    hasFuel, hasCarWash, hasFreshProduce, hasMeat, hasHotFood,
    hasKitchen, hasDeli, hasAppointments,
    sellsLottery, sellsTobacco, sellsCBD,
    firstNavKey,
    showEmployees: hasEmployees || wantsEmployees,
    showSuppliers: !isSolo || (profile?.supplierStyle ?? "") !== "none",
    showDelivery: hasDelivery || isRestaurant || isFastFood,
    showFuelSection: hasFuel,
    showAppointments: hasAppointments || isService,
  };
}
