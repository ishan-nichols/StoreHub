export type BusinessType = "cstore" | "grocery" | "butcher" | "bakery" | "liquor" | "clothing" | "general" | "restaurant" | "pharmacy" | "other";
export type PainPoint = "inventory" | "sales" | "employees" | "profits";
export type Language = "en" | "es";
export type Theme = "light" | "dark";
export type StoreSize = "solo" | "small" | "medium" | "multi";
export type CurrentSystem = "paper" | "spreadsheets" | "pos" | "multiple";
export type MotionLevel = "reduced" | "gentle" | "expressive";
export type HoverStyle = "soft" | "lifted" | "dramatic";
export type SurfaceStyle = "glass" | "balanced" | "solid";
export type CornerRadius = "sharp" | "rounded" | "smooth" | "organic";
export type BlurIntensity = "minimal" | "subtle" | "moderate" | "strong";
export type ShadowDepth = "flat" | "subtle" | "lifted" | "dramatic";
export type ContrastLevel = "standard" | "enhanced" | "high";
export type TypographyWeight = "light" | "regular" | "medium" | "bold";
export type SpacingDensity = "compact" | "comfortable" | "spacious" | "airy";

export interface OpeningHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface UIPreferences {
  // Basic experience
  motionLevel?: MotionLevel;
  hoverStyle?: HoverStyle;
  surfaceStyle?: SurfaceStyle;
  accentColor?: string;

  // Enhanced experience (Apple design philosophy)
  cornerRadius?: CornerRadius;
  blurIntensity?: BlurIntensity;
  shadowDepth?: ShadowDepth;
  contrastLevel?: ContrastLevel;
  typographyWeight?: TypographyWeight;
  spacingDensity?: SpacingDensity;
}

export interface UserProfile {
  id: string;
  storeName: string;
  ownerName: string;
  businessType: BusinessType;
  numEmployees: number;
  painPoint: PainPoint;
  currency: string;
  currencySymbol: string;
  language: Language;
  theme: Theme;
  taxRate: number;
  openingHours: Record<string, OpeningHours>;
  preSeedData: boolean;
  createdAt: string;
  featureUsageCount: Record<string, number>;
  onboardingCompleted: boolean;
  storeCity?: string;
  storeAddress?: string;
  country?: "US" | "MX";
  stateCode?: string;
  stateName?: string;
  printerName?: string;
  printerConnection?: "browser" | "network" | "bluetooth";
  accentColor?: string;

  // ── Rich onboarding answers (v2) ──────────────────────────────────────────
  onboardingVersion?: number;
  storeSize?: StoreSize;
  currentSystem?: CurrentSystem;
  currentPosSystem?: string;
  painPoints?: string[];
  stockOuts?: string[];
  supplierStyle?: string;
  scheduleStyle?: string;
  goal?: string;
  lastUpdated?: string;
  uiPreferences?: UIPreferences;

  // ── Business relationship ──────────────────────────────────────────────────
  businessId?: string;

  // ── Branding ──────────────────────────────────────────────────────────────
  logoDataUrl?: string;        // base64 data URL of the store logo
}

export type PosSyncStatus = "synced" | "pending" | "failed" | "not_connected";

export interface PriceHistoryEntry {
  date: string;
  field: "price" | "cost";
  from: number;
  to: number;
  reason: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  lowStockThreshold: number;
  supplierId: string | null;
  unit: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  // Pricing & barcode
  barcode?: string;
  brand?: string;
  imageUrl?: string;
  size?: string;
  costPrice?: number;
  srp?: number;
  marginAlertPct?: number;
  priceHistory?: PriceHistoryEntry[];
  posSyncStatus?: PosSyncStatus;
  posSyncError?: string;
  lastCostChangeAt?: string;
  lastPriceChangeAt?: string;
}

export interface ScheduledPriceChange {
  id: string;
  productId: string;
  productName: string;
  newPrice: number;
  originalPrice: number;
  startsAt: string;
  endsAt: string | null;
  status: "pending" | "active" | "reverted" | "cancelled";
  createdAt: string;
}

export type InsertScheduledPriceChange = Omit<ScheduledPriceChange, "id" | "createdAt" | "status">;

export interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  unit: string;
}

export interface Sale {
  id: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  change: number;
  createdAt: string;
  receiptNumber: string;
  note: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  productIds: string[];
  reorderNotes: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  pin: string;
  hourlyWage: number;
  payrollType: "hourly" | "daily" | "salary";
  dailyWage: number;
  createdAt: string;
}

export interface DailyPayRecord {
  id: string;
  employeeId: string;
  workDate: string;
  daysWorked: number;
  dailyRate: number;
  totalPay: number;
  note?: string;
  createdAt: string;
}

export interface PayrollReportEntry {
  employee: { id: string; name: string; role: string; payrollType: string };
  hoursWorked?: number;
  estimatedPay: number;
  shifts?: Shift[];
  dailyRecords?: DailyPayRecord[];
}

export interface Shift {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftStart: string;
  shiftEnd: string | null;
  hoursWorked: number | null;
  createdAt: string;
}

export interface DashboardSummary {
  todayRevenue: number;
  todayExpenses: number;
  todayProfit: number;
  todaySalesCount: number;
  lowStockProducts: Product[];
  recentSales: Sale[];
  topSellingItems: Array<{ name: string; count: number }>;
  busiestDays: Array<{ day: string; count: number }>;
  biggestExpenseCategories: Array<{ category: string; total: number }>;
  smartTips: string[];
}

export type InsertProduct = Omit<Product, "id" | "createdAt" | "updatedAt">;
export type InsertSale = Omit<Sale, "id" | "createdAt">;
export type InsertExpense = Omit<Expense, "id" | "createdAt">;
export type InsertSupplier = Omit<Supplier, "id" | "createdAt">;
export type InsertEmployee = Omit<Employee, "id" | "createdAt">;
export type InsertShift = Omit<Shift, "id" | "createdAt">;
export type InsertDailyPayRecord = Omit<DailyPayRecord, "id" | "createdAt">;

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthOfYear?: number;
  enabled: boolean;
  lastProcessed: string | null;
  createdAt: string;
}

export type InsertRecurringExpense = Omit<RecurringExpense, "id" | "createdAt">;
