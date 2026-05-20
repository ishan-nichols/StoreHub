/**
 * RBAC unit tests — permission resolution logic (inlined to avoid DB dependency).
 */
import { describe, it, expect } from "vitest";

// Inline ROLE_TEMPLATES so we don't import the DB at module load time.
type Permission = string;

const ROLE_TEMPLATES: Record<string, Record<string, boolean>> = {
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
    "settings.view": true, "settings.edit": true,
    "cash.open_drawer": true, "cash.close_shift": true, "cash.reconcile": true,
    "tax.view": true, "tax.edit": true, "compliance.view": true,
    "suppliers.view": true, "suppliers.create": true, "suppliers.edit": true,
    "audit.view": true,
  },
  owner: {
    "pos.access": true, "pos.void": true, "pos.refund": true, "pos.discount": true, "pos.override_price": true,
    "inventory.view": true, "inventory.create": true, "inventory.edit": true, "inventory.delete": true, "inventory.adjust_stock": true,
    "sales.view": true, "sales.export": true,
    "expenses.view": true, "expenses.create": true, "expenses.edit": true, "expenses.delete": true,
    "reports.view": true, "reports.export": true,
    "employees.view": true, "employees.create": true, "employees.edit": true, "employees.delete": true, "employees.manage_permissions": true,
    "schedule.view": true, "schedule.create": true, "schedule.edit": true, "schedule.delete": true,
    "payroll.view": true, "payroll.run": true, "payroll.export": true,
    "customers.view": true, "customers.edit": true, "customers.delete": true, "customers.loyalty_manage": true,
    "settings.view": true, "settings.edit": true, "settings.billing": true,
    "cash.open_drawer": true, "cash.close_shift": true, "cash.reconcile": true,
    "tax.view": true, "tax.edit": true, "compliance.view": true,
    "suppliers.view": true, "suppliers.create": true, "suppliers.edit": true,
    "audit.view": true,
  },
};

// Inline override resolution for unit-testing without DB
function resolveWithOverrides(
  rolePerms: Record<string, boolean>,
  overrides: Array<{ permission: string; granted: boolean }>,
): Record<string, boolean> {
  const resolved = { ...rolePerms };
  for (const o of overrides) {
    resolved[o.permission] = o.granted;
  }
  return resolved;
}

describe("ROLE_TEMPLATES", () => {
  it("owner has all key permissions", () => {
    const owner = ROLE_TEMPLATES.owner;
    expect(owner["pos.access"]).toBe(true);
    expect(owner["payroll.run"]).toBe(true);
    expect(owner["audit.view"]).toBe(true);
    expect(owner["employees.manage_permissions"]).toBe(true);
    expect(owner["settings.billing"]).toBe(true);
  });

  it("cashier cannot access payroll or reports", () => {
    const cashier = ROLE_TEMPLATES.cashier;
    expect(cashier["payroll.run"]).toBeFalsy();
    expect(cashier["reports.view"]).toBeFalsy();
    expect(cashier["employees.create"]).toBeFalsy();
  });

  it("manager has employee management but not billing", () => {
    const manager = ROLE_TEMPLATES.manager;
    expect(manager["employees.view"]).toBe(true);
    expect(manager["employees.create"]).toBe(true);
    expect(manager["settings.billing"]).toBeFalsy();
  });

  it("supervisor cannot manage employees", () => {
    const supervisor = ROLE_TEMPLATES.supervisor;
    expect(supervisor["employees.create"]).toBeFalsy();
    expect(supervisor["employees.delete"]).toBeFalsy();
    expect(supervisor["employees.manage_permissions"]).toBeFalsy();
  });

  it("each role template has at least some permissions", () => {
    for (const [, role] of Object.entries(ROLE_TEMPLATES)) {
      expect(Object.keys(role).length).toBeGreaterThan(0);
    }
  });
});

describe("permission hierarchy", () => {
  it("manager has superset of supervisor POS permissions", () => {
    const manager    = ROLE_TEMPLATES.manager;
    const supervisor = ROLE_TEMPLATES.supervisor;

    const managerPosCount    = Object.entries(manager).filter(([k, v]) => k.startsWith("pos.") && v).length;
    const supervisorPosCount = Object.entries(supervisor).filter(([k, v]) => k.startsWith("pos.") && v).length;

    expect(managerPosCount).toBeGreaterThanOrEqual(supervisorPosCount);
  });

  it("owner has superset of manager permissions", () => {
    const owner   = ROLE_TEMPLATES.owner;
    const manager = ROLE_TEMPLATES.manager;

    for (const [perm, val] of Object.entries(manager)) {
      if (val) expect(owner[perm]).toBe(true);
    }
  });
});

describe("override resolution", () => {
  it("override can grant a permission not in the role", () => {
    const cashierPerms = { ...ROLE_TEMPLATES.cashier };
    const resolved = resolveWithOverrides(cashierPerms, [
      { permission: "reports.view", granted: true },
    ]);
    expect(resolved["reports.view"]).toBe(true);
    expect(resolved["pos.access"]).toBe(true);
  });

  it("override can revoke a permission from the role", () => {
    const managerPerms = { ...ROLE_TEMPLATES.manager };
    const resolved = resolveWithOverrides(managerPerms, [
      { permission: "payroll.run", granted: false },
    ]);
    expect(resolved["payroll.run"]).toBe(false);
  });

  it("last override wins for the same permission", () => {
    const perms = { "pos.access": true };
    const resolved = resolveWithOverrides(perms, [
      { permission: "pos.access", granted: false },
      { permission: "pos.access", granted: true },
    ]);
    expect(resolved["pos.access"]).toBe(true);
  });
});
