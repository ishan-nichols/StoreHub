/**
 * AuthContext — Global authentication state
 *
 * Wraps the entire app. Any component can call useAuth() to check auth status.
 * On mount, calls /api/auth/me (or refreshes the access token) to restore session.
 * A background timer silently refreshes the access token 2 minutes before expiry.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { AuthUser } from "../services/authService";
import { getMe, logOut, refreshSession } from "../services/authService";

interface AuthContextValue {
  user:             AuthUser | null;
  isLoading:        boolean;
  isAuthenticated:  boolean;
  isAdmin:          boolean;
  isBusinessOwner:  boolean;
  isStoreOwner:     boolean;
  businessId?:      string;
  setUser:          (user: AuthUser | null) => void;
  logout:           () => Promise<void>;
  recheckAuth:      () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Access token lifespan in milliseconds (must match server JWT_ACCESS_TTL)
const ACCESS_TOKEN_TTL_MS  = 15 * 60 * 1000;  // 15 min
const REFRESH_AHEAD_MS     = 2  * 60 * 1000;  // refresh 2 min before expiry

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  async function recheckAuth() {
    // Try current access token first (fast path)
    let current = await getMe();
    if (!current) {
      // Try to refresh
      current = await refreshSession();
    }
    setUser(current);
    return;
  }

  useEffect(() => {
    recheckAuth().finally(() => setIsLoading(false));
    return () => clearRefreshTimer();
  }, []);

  async function logout() {
    await logOut();
    clearRefreshTimer();
    setUserState(null);
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      isAdmin: user?.role === "superadmin",
      isBusinessOwner: user?.role === "business_owner",
      isStoreOwner: user?.role === "store_owner",
      businessId: (user as any)?.businessId,
      setUser,
      logout,
      recheckAuth,
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
