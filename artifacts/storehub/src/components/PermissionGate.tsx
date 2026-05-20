import React from "react";
import { usePermissions, type Permission } from "../contexts/PermissionsContext";
import { useAuth } from "../contexts/AuthContext";

interface PermissionGateProps {
  /** All of these permissions must be granted */
  require?: Permission | Permission[];
  /** At least one of these permissions must be granted */
  requireAny?: Permission | Permission[];
  /** Rendered when the permission check fails */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders children only when the current user has the required permission(s).
 *
 * Usage:
 *   <PermissionGate require="inventory.edit">
 *     <EditButton />
 *   </PermissionGate>
 *
 *   <PermissionGate requireAny={["pos.void", "pos.refund"]} fallback={<p>No access</p>}>
 *     <RefundPanel />
 *   </PermissionGate>
 */
export function PermissionGate({ require, requireAny, fallback = null, children }: PermissionGateProps) {
  const { can, canAny } = usePermissions();
  const { isStoreOwner, isAdmin, isBusinessOwner } = useAuth();

  // Owners and admins always pass
  if (isStoreOwner || isAdmin || isBusinessOwner) return <>{children}</>;

  let allowed = true;

  if (require) {
    const perms = Array.isArray(require) ? require : [require];
    allowed = can(...perms);
  }

  if (allowed && requireAny) {
    const perms = Array.isArray(requireAny) ? requireAny : [requireAny];
    allowed = canAny(...perms);
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
}
