import { createContext } from "react";
import type {
  HoverStyle, Language, MotionLevel, SurfaceStyle, Theme, UIPreferences,
  CornerRadius, BlurIntensity, ShadowDepth, ContrastLevel, TypographyWeight, SpacingDensity,
} from "../schemas";
import type { Translations } from "../locales";
import type { UserProfile } from "../schemas";

export interface ResolvedUIPreferences {
  motionLevel: MotionLevel;
  hoverStyle: HoverStyle;
  surfaceStyle: SurfaceStyle;
  // Optional enhanced customization
  cornerRadius?: CornerRadius;
  blurIntensity?: BlurIntensity;
  shadowDepth?: ShadowDepth;
  contrastLevel?: ContrastLevel;
  typographyWeight?: TypographyWeight;
  spacingDensity?: SpacingDensity;
  accentColor?: string;
}

export interface AppContextValue {
  profile: UserProfile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  t: Translations;
  theme: Theme;
  language: Language;
  currencySymbol: string;
  setProfile: (profile: UserProfile) => Promise<void>;
  refreshProfile: () => Promise<void>;
  trackFeature: (feature: string) => Promise<void>;
  getFeatureOrder: () => string[];
  uiPreferences: ResolvedUIPreferences;
  updateUIPreferences: (updates: Partial<UIPreferences>) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);
