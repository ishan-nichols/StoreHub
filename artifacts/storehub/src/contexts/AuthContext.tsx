/**
 * AuthContext — Global authentication state
 *
 * Wraps the entire app. Any component can call useAuth() to check auth status.
 * On mount, calls /api/auth/me (or refreshes the access token) to restore session.
 * A background timer silently refreshes the access token 2 minutes before expiry.
 *
 * Store-view mode: business owners can "enter" a store without JWT switching.
 * The selected store's userId is stored in sessionStorage under "sh_active_store_id"
 * and included as the X-Store-User-Id header in all /api/store/* calls, which the
 * backend uses to scope data to that specific store.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { AuthUser } from "../services/authService";
import { getMe, logOut, refreshSession } from "../services/authService";

const ACTIVE_STORE_KEY = "sh_active_store_id";

interface AuthContextValue {
  user:             AuthUser | null;
  isLoading:        boolean;
  isAuthenticated:  boolean;
  isAdmin:          boolean;
  isBusinessOwner:  boolean;
  isStoreOwner:     boolean;
  businessId?:      string;
  /** userId of the store currently being managed by a business owner. */
  activeStoreId:    string | null;
  isSwitched:       boolean;
  setUser:          (user: AuthUser | null) => void;
  logout:           () => Promise<void>;
  recheckAuth:      () => Promise<void>;
  switchToStore:    (targetUserId: string, redirectTo?: string) => void;
  restoreBusiness:  () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_AHEAD_MS    =  2 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(
    () => sessionStorage.getItem(ACTIVE_STORE_KEY),
  );
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setUser(u: AuthUser | null) {
    setUserState(u);
    if (u) scheduleRefresh();
    else clearRefreshTimer();
  }

  function clearRefreshTimer() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }

  function scheduleRefresh() {
    clearRefreshTimer();
    refreshTimerRef.current = setTimeout(async () => {
      const refreshed = await refreshSession();
      if (refreshed) {
        setUserState(refreshed);
        scheduleRefresh();
      } else {
        setUserState(null);
      }
    }, ACCESS_TOKEN_TTL_MS - REFRESH_AHEAD_MS);
  }

  const recheckAuth = useCallback(async () => {
    let current = await getMe();
    if (!current) current = await refreshSession();
    setUser(current);
  }, []);

  useEffect(() => {
    recheckAuth().finally(() => setIsLoading(false));
    return () => clearRefreshTimer();
  }, []);

  async function logout() {
    await logOut();
    clearRefreshTimer();
    sessionStorage.removeItem(ACTIVE_STORE_KEY);
    setActiveStoreIdState(null);
    setUserState(null);
  }

  /**
   * Enter a store as a business owner.
   * No JWT switching — the business owner's token remains unchanged.
   * The store's userId is persisted in sessionStorage and sent as X-Store-User-Id
   * on all subsequent /api/store/* requests via cloudSync.authedFetch.
   */
  function switchToStore(targetUserId: string, redirectTo = "/dashboard") {
    sessionStorage.setItem(ACTIVE_STORE_KEY, targetUserId);
    setActiveStoreIdState(targetUserId);
    // Full reload so AppProvider re-mounts and CloudSyncBootstrap pulls the store's data.
    window.location.href = redirectTo;
  }

  /**
   * Leave store-view mode and return to the business owner dashboard.
   */
  function restoreBusiness() {
    sessionStorage.removeItem(ACTIVE_STORE_KEY);
    setActiveStoreIdState(null);
    window.location.href = "/business";
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      isAdmin:         user?.role === "superadmin",
      isBusinessOwner: user?.role === "business_owner",
      isStoreOwner:    user?.role === "store_owner",
      businessId:      (user as any)?.businessId,
      activeStoreId,
      // isSwitched supports the legacy JWT-switch path (store_owner sub-account sessions).
      isSwitched:      !!(user as any)?.switchedFromUserId,
      setUser,
      logout,
      recheckAuth,
      switchToStore,
      restoreBusiness,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
