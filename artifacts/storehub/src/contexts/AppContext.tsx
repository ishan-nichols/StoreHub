import React, { useState, useEffect, useCallback } from "react";
import type { UserProfile } from "../schemas";
import { getUserProfile, saveUserProfile, trackFeatureUsage } from "../services/dataService";
import { processScheduledChanges } from "../services/pricingService";
import { getTranslations } from "../locales";
import { AppContext } from "./AppContextDef";
import { applyAccentColor } from "../lib/themeColors";

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
    }
  }, []);

  const setProfile = useCallback(async (p: UserProfile) => {
    await saveUserProfile(p);
    setProfileState(p);
    applyTheme(p.theme);
    applyAccentColor(p.accentColor);
  }, []);

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

  const t = getTranslations(profile?.language ?? "en");
  const theme = profile?.theme ?? "light";
  const language = profile?.language ?? "en";
  const currencySymbol = profile?.currencySymbol ?? "$";

  return (
    <AppContext.Provider
      value={{
        profile,
        isLoading,
        isOnboarded: syncOnboarded || (!isLoading && profile?.onboardingCompleted === true),
        t,
        theme,
        language,
        currencySymbol,
        setProfile,
        refreshProfile,
        trackFeature,
        getFeatureOrder,
      }}
    >
      {children}
    </AppContext.Provider>
  );
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
