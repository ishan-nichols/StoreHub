import { createContext } from "react";
import type { Language, Theme } from "../schemas";
import type { Translations } from "../locales";
import type { UserProfile } from "../schemas";

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
}

export const AppContext = createContext<AppContextValue | null>(null);
