import { db } from "@workspace/db";
import { employeeRoles, employeeRoleAssignments, permissionOverrides } from "@workspace/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";

// ─── Permission Registry ──────────────────────────────────────────────────────

export const ALL_PERMISSIONS = [
  // POS
  "pos.access", "pos.void", "pos.refund", "pos.discount", "pos.override_price",
  // Inventory
  "inventory.view", "inventory.create", "inventory.edit", "inventory.delete", "inventory.adjust_stock",
  // Sales
  "sales.view", "sales.export",
  // Expenses
  "expenses.view", "expenses.create", "expenses.edit", "expenses.delete",
  // Reports
  "reports.view", "reports.export",
  // Employees
  "employees.view", "employees.create", "employees.edit", "employees.delete", "employees.manage_permissions",
  // Scheduling
  "schedule.view", "schedule.create", "schedule.edit", "schedule.delete",
  // Payroll
  "payroll.view", "payroll.run", "payroll.export",
  // Customers
  "customers.view", "customers.edit", "customers.delete", "customers.loyalty_manage",
  // Settings
  "settings.view", "settings.edit", "settings.billing",
  // Cash
  "cash.open_drawer", "cash.close_shift", "cash.reconcile",
  // Tax & Compliance
  "tax.view", "tax.edit", "compliance.view",
  // Suppliers
  "suppliers.view", "suppliers.create", "suppliers.edit",
  // Audit
  "audit.view",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ─── Role Templates ───────────────────────────────────────────────────────────

export const ROLE_TEMPLATES: Record<string, Partial<Record<Permission, boolean>>> = {
  cashier: {
    "pos.access": true,
    "customers.view": true,
    "customers.loyalty_manage": true,
    "cash.open_drawer": true,
    "sales.view": true,
  },
  associate: {
    "pos.access": true,
    "inventory.view": true,
    "inventory.adjust_stock": true,
    "customers.view": true,
    "customers.loyalty_manage": true,
    "cash.open_drawer": true,
    "sales.view": true,
    "suppliers.view": true,
  },
  supervisor: {
    "pos.access": true, "pos.void": true, "pos.discount": true,
    "inventory.view": true, "inventory.create": true, "inventory.edit": true, "inventory.adjust_stock": true,
    "sales.view": true, "sales.export": true,
    "expenses.view": true, "expenses.create": true,
    "customers.view": true, "customers.edit": true, "customers.loyalty_manage": true,
    "cash.open_drawer": true, "cash.close_shift": true,
    "suppliers.view": true,
    "schedule.view": true,
    "reports.view": true,
    "tax.view": true, "compliance.view": true,
  },
  manager: {
    "pos.access": true, "pos.void": true, "pos.refund": true, "pos.discount": true, "pos.override_price": true,
    "inventory.view": true, "inventory.create": true, "inventory.edit": true, "inventory.delete": true, "inventory.adjust_stock": true,
    "sales.view": true, "sales.export": true,
    "expenses.view": true, "expenses.create": true, "expenses.edit": true, "expenses.delete": true,
    "reports.view": true, "reports.export": true,
    "employees.view": true, "employees.create": true, "employees.edit": true,
    "schedule.view": true, "schedule.create": true, "schedule.edit": true, "schedule.delete": true,
    "payroll.view": true, "payroll.run": true, "payroll.export": true,
    "customers.view": true, "customers.edit": true, "customers.delete": true, "customers.loyalty_manage": true,
    "settings.view": true,
    "cash.open_drawer": true, "cash.close_shift": true, "cash.reconcile": true,
    "tax.view": true, "tax.edit": true, "compliance.view": true,
    "suppliers.view": true, "suppliers.create": true, "suppliers.edit": true,
    "audit.view": true,
  },
  owner: Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, true])) as Record<Permission, boolean>,
};

// ─── Permission Resolution ────────────────────────────────────────────────────

export interface ResolvedPermissions {
  permissions: Record<Permission, boolean>;
  // Role names that contributed to this resolution (for debugging)
  sources: string[];
}

/**
 * Resolve the full effective permission set for an employee in a store.
 * Precedence (highest wins):
 *   1. Per-employee overrides (permissionOverrides table)
 *   2. Union of all assigned roles' permission sets
 *   3. Default deny for everything else
 */
export async function resolvePermissions(
  employeeId: string,
  storeUserId: string,
): Promise<ResolvedPermissions> {
  const now = new Date();

  // Load active role assignments
  const assignments = await db
    .select({ roleId: employeeRoleAssignments.roleId })
    .from(employeeRoleAssignments)
    .where(
      and(
        eq(employeeRoleAssignments.employeeId, employeeId),
        eq(employeeRoleAssignments.storeUserId, storeUserId),
        or(isNull(employeeRoleAssignments.expiresAt), gt(employeeRoleAssignments.expiresAt, now)),
      )
    );

  const roleIds = assignments.map((a) => a.roleId);

  // Load role permission sets
  const base: Record<string, boolean> = {};
  const sources: string[] = [];

  if (roleIds.length > 0) {
    const roles = await db
      .select({ name: employeeRoles.name, permissions: employeeRoles.permissions })
      .from(employeeRoles)
      .where(eq(employeeRoles.storeUserId, storeUserId));

    for (const role of roles) {
      if (roleIds.some((id) => roles.find((r) => r.name === role.name))) {
        sources.push(role.name);
        const perms = role.permissions as Record<string, boolean>;
        for (const [key, val] of Object.entries(perms)) {
          if (val === true) base[key] = true; // union: any role that grants wins
        }
      }
    }
  }

  // Apply per-employee overrides (highest precedence)
  const overrides = await db
    .select({ permission: permissionOverrides.permission, granted: permissionOverrides.granted })
    .from(permissionOverrides)
    .where(
      and(
        eq(permissionOverrides.employeeId, employeeId),
        eq(permissionOverrides.storeUserId, storeUserId),
        or(isNull(permissionOverrides.expiresAt), gt(permissionOverrides.expiresAt, now)),
      )
    );

  for (const ov of overrides) {
    base[ov.permission] = ov.granted;
  }

  // Build typed result — default deny for anything not in base
  const permissions = Object.fromEntries(
    ALL_PERMISSIONS.map((p) => [p, base[p] === true])
  ) as Record<Permission, boolean>;

  return { permissions, sources };
}

/**
 * Fast check: does this employee have a specific permission?
 * Also accepts a legacy flat permissions map (from the employees.permissions JSONB column)
 * for backward compatibility with stores that haven't migrated to roles yet.
 */
export async function hasPermission(
  employeeId: string,
  storeUserId: string,
  permission: Permission,
  legacyPermissions?: Record<string, boolean> | null,
): Promise<boolean> {
  // Fast path: check role assignments exist first
  const count = await db
    .select({ roleId: employeeRoleAssignments.roleId })
    .from(employeeRoleAssignments)
    .where(
      and(
        eq(employeeRoleAssignments.employeeId, employeeId),
        eq(employeeRoleAssignments.storeUserId, storeUserId),
      )
    )
    .limit(1);

  if (count.length === 0 && legacyPermissions) {
    // Fall back to legacy flat JSONB permissions
    // Map granular permission keys to legacy keys (e.g. "inventory.view" → "inventory")
    const legacyKey = permission.split(".")[0];
    return legacyPermissions[legacyKey] === true;
  }

  const { permissions } = await resolvePermissions(employeeId, storeUserId);
  return permissions[permission] === true;
}

/**
 * Seed system role templates for a new store.
 * Called once during onboarding / store creation.
 */
export async function seedDefaultRoles(storeUserId: string, businessId?: string): Promise<void> {
  const existing = await db
    .select({ id: employeeRoles.id })
    .from(employeeRoles)
    .where(and(eq(employeeRoles.storeUserId, storeUserId), eq(employeeRoles.isTemplate, true)))
    .limit(1);

  if (existing.length > 0) return; // already seeded

  const values = Object.entries(ROLE_TEMPLATES).map(([name, permissions]) => ({
    storeUserId,
    businessId: businessId ?? null,
    name,
    description: `System template: ${name}`,
    isTemplate: true,
    permissions,
  }));

  await db.insert(employeeRoles).values(values).onConflictDoNothing();
}
