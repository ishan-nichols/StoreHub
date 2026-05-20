import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";

// ─── Permission registry (must match backend rbac.ts) ────────────────────────

export const ALL_PERMISSIONS = [
  "pos.access", "pos.void", "pos.refund", "pos.discount", "pos.override_price",
  "inventory.view", "inventory.create", "inventory.edit", "inventory.delete", "inventory.adjust_stock",
  "sales.view", "sales.export",
  "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
  "reports.view", "reports.export",
  "employees.view", "employees.create", "employees.edit", "employees.delete", "employees.manage_permissions",
  "schedule.view", "schedule.create", "schedule.edit", "schedule.delete",
  "payroll.view", "payroll.run", "payroll.export",
  "customers.view", "customers.edit", "customers.delete", "customers.loyalty_manage",
  "settings.view", "settings.edit", "settings.billing",
  "cash.open_drawer", "cash.close_shift", "cash.reconcile",
  "tax.view", "tax.edit", "compliance.view",
  "suppliers.view", "suppliers.create", "suppliers.edit",
  "audit.view",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type PermissionMap = Record<Permission, boolean>;

interface PermissionsContextValue {
  permissions: PermissionMap;
  /** True if the current user has ALL specified permissions */
  can: (...perms: Permission[]) => boolean;
  /** True if the current user has ANY of the specified permissions */
  canAny: (...perms: Permission[]) => boolean;
  isLoading: boolean;
  refresh: () => void;
}

// Store owners and admins get everything
const ALL_GRANTED = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])) as PermissionMap;
const ALL_DENIED  = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, false])) as PermissionMap;

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: ALL_DENIED,
  can:     () => false,
  canAny:  () => false,
  isLoading: false,
  refresh: () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, isStoreOwner, isAdmin, isBusinessOwner } = useAuth();
  const [permissions, setPermissions] = useState<PermissionMap>(ALL_DENIED);
  const [isLoading, setIsLoading]     = useState(false);

  const fetchPermissions = useCallback(async () => {
    // Owners/admins bypass: they have every permission
    if (!user || isStoreOwner || isAdmin || isBusinessOwner) {
      setPermissions(ALL_GRANTED);
      return;
    }

    // Employee (portal context): fetch resolved permissions from API
    setIsLoading(true);
    try {
      const res = await fetch("/api/store/employees/me/permissions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { permissions: PermissionMap };
        setPermissions({ ...ALL_DENIED, ...data.permissions });
      } else {
        setPermissions(ALL_DENIED);
      }
    } catch {
      setPermissions(ALL_DENIED);
    } finally {
      setIsLoading(false);
    }
  }, [user, isStoreOwner, isAdmin, isBusinessOwner]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const can = useCallback(
    (...perms: Permission[]) => perms.every((p) => permissions[p] === true),
    [permissions],
  );

  const canAny = useCallback(
    (...perms: Permission[]) => perms.some((p) => permissions[p] === true),
    [permissions],
  );

  return (
    <PermissionsContext.Provider value={{ permissions, can, canAny, isLoading, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
