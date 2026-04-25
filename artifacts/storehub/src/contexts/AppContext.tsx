import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { UIPreferences, UserProfile } from "../schemas";
import { getUserProfile, saveUserProfile, trackFeatureUsage } from "../services/dataService";
import { processScheduledChanges } from "../services/pricingService";
import { getTranslations } from "../locales";
import { AppContext, type ResolvedUIPreferences } from "./AppContextDef";
import { applyAccentColor } from "../lib/themeColors";

const DEFAULT_UI_PREFERENCES: ResolvedUIPreferences = {
  motionLevel: "gentle",
  hoverStyle: "lifted",
  surfaceStyle: "balanced",
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncOnboarded] = useState<boolean>(
    () => localStorage.getItem("onboardingComplete") === "true"
  );

  useEffect(() => {
    getUserProfile().then((p) => {
      setProfileState(p);
      setIsLoading(false);
      if (p) {
        applyTheme(p.theme);
        applyAccentColor(p.accentColor);
        applyUIPreferences(p.uiPreferences);
      } else {
        applyUIPreferences(undefined);
      }
    });
  }, []);

  useEffect(() => {
    void processScheduledChanges();
    const id = window.setInterval(() => { void processScheduledChanges(); }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  function applyTheme(theme: string) {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  const refreshProfile = useCallback(async () => {
    const p = await getUserProfile();
    setProfileState(p);
    if (p) {
      applyTheme(p.theme);
      applyAccentColor(p.accentColor);
      applyUIPreferences(p.uiPreferences);
    } else {
      applyUIPreferences(undefined);
    }
  }, []);

  // When CloudSyncBootstrap finishes pulling store data into localStorage,
  // refresh the profile so components reflect the selected store's info.
  useEffect(() => {
    const handler = () => void refreshProfile();
    window.addEventListener("storehub:cloud-hydrated", handler);
    return () => window.removeEventListener("storehub:cloud-hydrated", handler);
  }, [refreshProfile]);

  const setProfile = useCallback(async (p: UserProfile) => {
    await saveUserProfile(p);
    setProfileState(p);
    applyTheme(p.theme);
    applyAccentColor(p.accentColor);
    applyUIPreferences(p.uiPreferences);
  }, []);

  const uiPreferences = resolveUIPreferences(profile?.uiPreferences);

  const updateUIPreferences = useCallback(async (updates: Partial<UIPreferences>) => {
    if (!profile) return;
    const nextProfile: UserProfile = {
      ...profile,
      uiPreferences: {
        ...resolveUIPreferences(profile.uiPreferences),
        ...updates,
      },
    };
    await saveUserProfile(nextProfile);
    setProfileState(nextProfile);
    applyUIPreferences(nextProfile.uiPreferences);
  }, [profile]);

  const trackFeature = useCallback(async (feature: string) => {
    await trackFeatureUsage(feature);
    await refreshProfile();
  }, [refreshProfile]);

  const getFeatureOrder = useCallback((): string[] => {
    if (!profile) return [];
    const counts = profile.featureUsageCount ?? {};
    const defaults = getDefaultFeatureOrder(profile.businessType, profile.numEmployees);
    return defaults.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  }, [profile]);

  const t = useMemo(() => getTranslations(profile?.language ?? "en"), [profile?.language]);
  const theme = profile?.theme ?? "light";
  const language = profile?.language ?? "en";
  const currencySymbol = profile?.currencySymbol ?? "$";
  const isOnboarded = syncOnboarded || (!isLoading && profile?.onboardingCompleted === true);

  const contextValue = useMemo(() => ({
    profile,
    isLoading,
    isOnboarded,
    t,
    theme,
    language,
    currencySymbol,
    setProfile,
    refreshProfile,
    trackFeature,
    getFeatureOrder,
    uiPreferences,
    updateUIPreferences,
  }), [
    profile,
    isLoading,
    isOnboarded,
    t,
    theme,
    language,
    currencySymbol,
    setProfile,
    refreshProfile,
    trackFeature,
    getFeatureOrder,
    uiPreferences,
    updateUIPreferences,
  ]);

  return (
    <AppContext.Provider
      value={contextValue}
    >
      {children}
    </AppContext.Provider>
  );
}

function resolveUIPreferences(preferences?: UIPreferences): ResolvedUIPreferences {
  return {
    motionLevel: preferences?.motionLevel ?? DEFAULT_UI_PREFERENCES.motionLevel,
    hoverStyle: preferences?.hoverStyle ?? DEFAULT_UI_PREFERENCES.hoverStyle,
    surfaceStyle: preferences?.surfaceStyle ?? DEFAULT_UI_PREFERENCES.surfaceStyle,
    cornerRadius: preferences?.cornerRadius,
    blurIntensity: preferences?.blurIntensity,
    shadowDepth: preferences?.shadowDepth,
    contrastLevel: preferences?.contrastLevel,
    typographyWeight: preferences?.typographyWeight,
    spacingDensity: preferences?.spacingDensity,
    accentColor: preferences?.accentColor,
  };
}

function applyUIPreferences(preferences?: UIPreferences) {
  const root = document.documentElement;
  const resolved = resolveUIPreferences(preferences);

  root.dataset.motion = resolved.motionLevel;
  root.dataset.surface = resolved.surfaceStyle;
  root.dataset.hover = resolved.hoverStyle;

  const motionVars: Record<ResolvedUIPreferences["motionLevel"], Record<string, string>> = {
    reduced: {
      "--hover-lift-base": "0px",
      "--hover-scale-base": "1",
      "--surface-tilt": "0deg",
      "--motion-duration": "180ms",
      "--motion-ease": "ease-out",
      "--scroll-lerp": "1",
      "--ambient-strength": "0.12",
    },
    gentle: {
      "--hover-lift-base": "-4px",
      "--hover-scale-base": "1.008",
      "--surface-tilt": "0.4deg",
      "--motion-duration": "280ms",
      "--motion-ease": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--scroll-lerp": "0.14",
      "--ambient-strength": "0.24",
    },
    expressive: {
      "--hover-lift-base": "-8px",
      "--hover-scale-base": "1.015",
      "--surface-tilt": "0.8deg",
      "--motion-duration": "420ms",
      "--motion-ease": "cubic-bezier(0.16, 1, 0.3, 1)",
      "--scroll-lerp": "0.1",
      "--ambient-strength": "0.35",
    },
  };

  const hoverVars: Record<ResolvedUIPreferences["hoverStyle"], Record<string, string>> = {
    soft: {
      "--hover-lift": "calc(var(--hover-lift-base) * 0.55)",
      "--hover-scale": "1.004",
      "--shadow-float": "0 20px 45px rgba(120, 98, 64, 0.1)",
    },
    lifted: {
      "--hover-lift": "var(--hover-lift-base)",
      "--hover-scale": "var(--hover-scale-base)",
      "--shadow-float": "0 28px 52px rgba(120, 98, 64, 0.14)",
    },
    dramatic: {
      "--hover-lift": "calc(var(--hover-lift-base) * 1.2)",
      "--hover-scale": "calc(var(--hover-scale-base) + 0.004)",
      "--shadow-float": "0 34px 60px rgba(120, 98, 64, 0.18)",
    },
  };

  const surfaceVars: Record<ResolvedUIPreferences["surfaceStyle"], Record<string, string>> = {
    glass: {
      "--glass-opacity": "0.74",
      "--soft-opacity": "0.88",
      "--panel-blur": "24px",
      "--panel-border": "rgba(255, 255, 255, 0.76)",
    },
    balanced: {
      "--glass-opacity": "0.82",
      "--soft-opacity": "0.94",
      "--panel-blur": "18px",
      "--panel-border": "rgba(255, 255, 255, 0.72)",
    },
    solid: {
      "--glass-opacity": "0.94",
      "--soft-opacity": "0.98",
      "--panel-blur": "8px",
      "--panel-border": "rgba(232, 224, 212, 0.95)",
    },
  };

  // Enhanced customization variables
  const cornerRadiusVars: Record<string, string> = {
    sharp: "--radius-current",
    rounded: "--radius-current",
    smooth: "--radius-current",
    organic: "--radius-current",
  };

  const blurIntensityVars: Record<string, string> = {
    minimal: "--blur-minimal",
    subtle: "--blur-subtle",
    moderate: "--blur-moderate",
    strong: "--blur-strong",
  };

  const shadowDepthVars: Record<string, string> = {
    flat: "--shadow-flat",
    subtle: "--shadow-subtle",
    lifted: "--shadow-lifted",
    dramatic: "--shadow-dramatic",
  };

  const typographyWeightVars: Record<string, string> = {
    light: "--font-weight-light",
    regular: "--font-weight-regular",
    medium: "--font-weight-medium",
    bold: "--font-weight-bold",
  };

  const spacingDensityVars: Record<string, string> = {
    compact: "--spacing-compact",
    comfortable: "--spacing-comfortable",
    spacious: "--spacing-spacious",
    airy: "--spacing-airy",
  };

  const merged = {
    ...motionVars[resolved.motionLevel],
    ...surfaceVars[resolved.surfaceStyle],
    ...hoverVars[resolved.hoverStyle],
    ...(resolved.cornerRadius && { "--radius-current": `var(--radius-${resolved.cornerRadius})` }),
    ...(resolved.blurIntensity && { "--blur-current": `var(${blurIntensityVars[resolved.blurIntensity]})` }),
    ...(resolved.shadowDepth && { "--shadow-current": `var(${shadowDepthVars[resolved.shadowDepth]})` }),
    ...(resolved.typographyWeight && { "--font-weight-current": `var(${typographyWeightVars[resolved.typographyWeight]})` }),
    ...(resolved.spacingDensity && { "--spacing-current": `var(${spacingDensityVars[resolved.spacingDensity]})` }),
    ...(resolved.contrastLevel && {
      "--contrast-boost": resolved.contrastLevel === "high" ? "1.5" : resolved.contrastLevel === "enhanced" ? "1.2" : "1",
      "--saturation-boost": resolved.contrastLevel === "high" ? "1.4" : resolved.contrastLevel === "enhanced" ? "1.1" : "1",
    }),
    ...(resolved.accentColor && {
      "--primary": resolved.accentColor,
      "--ring": resolved.accentColor,
      "--sidebar-primary": resolved.accentColor,
      "--sidebar-ring": resolved.accentColor,
      "--chart-1": resolved.accentColor,
    }),
  };

  Object.entries(merged).forEach(([key, value]) => root.style.setProperty(key, value));
}

function getDefaultFeatureOrder(businessType: string, numEmployees: number): string[] {
  const base = ["dashboard", "pos", "inventory", "sales", "expenses", "suppliers"];
  if (numEmployees > 0) base.push("employees");

  const prioritized: Record<string, string[]> = {
    grocery: ["dashboard", "inventory", "pos", "sales", "expenses", "suppliers"],
    butcher: ["dashboard", "inventory", "pos", "sales", "expenses", "suppliers"],
    bakery: ["dashboard", "pos", "inventory", "sales", "expenses", "suppliers"],
    clothing: ["dashboard", "inventory", "pos", "sales", "expenses", "suppliers"],
    general: ["dashboard", "pos", "inventory", "sales", "expenses", "suppliers"],
    other: ["dashboard", "pos", "inventory", "sales", "expenses", "suppliers"],
  };

  const ordered = prioritized[businessType] ?? base;
  if (numEmployees > 0 && !ordered.includes("employees")) {
    ordered.push("employees");
  }
  return ordered;
}
