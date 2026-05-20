import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  employeeRoles, employeeRoleAssignments, permissionOverrides,
} from "@workspace/db/schema";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { logAudit } from "../../lib/audit.js";
import { seedDefaultRoles, ALL_PERMISSIONS, type Permission } from "../../lib/rbac.js";

const router = Router();
router.use(requireAuth as any);

// GET /api/store/roles — list all roles for this store
router.get("/", async (req, res) => {
  const roles = await db
    .select()
    .from(employeeRoles)
    .where(eq(employeeRoles.storeUserId, req.userId!));
  return res.json(roles);
});

// POST /api/store/roles/seed — seed default role templates
router.post("/seed", async (req, res) => {
  await seedDefaultRoles(req.userId!, req.businessId);
  return res.json({ success: true });
});

// POST /api/store/roles — create custom role
router.post("/", async (req, res) => {
  const { name, description, permissions } = req.body as {
    name: string;
    description?: string;
    permissions: Record<string, boolean>;
  };
  if (!name) return res.status(400).json({ error: "name is required" });

  // Validate permission keys
  const validPerms = Object.fromEntries(
    Object.entries(permissions ?? {}).filter(([k]) => (ALL_PERMISSIONS as readonly string[]).includes(k))
  );

  const [role] = await db
    .insert(employeeRoles)
    .values({ storeUserId: req.userId!, businessId: req.businessId, name, description, permissions: validPerms })
    .returning();

  logAudit({ req }, { action: "role.create", resourceType: "role", resourceId: role.id, newValue: role });
  return res.status(201).json(role);
});

// PATCH /api/store/roles/:id
router.patch("/:id", async (req, res) => {
  const { name, description, permissions } = req.body as {
    name?: string; description?: string; permissions?: Record<string, boolean>;
  };

  const [existing] = await db
    .select()
    .from(employeeRoles)
    .where(and(eq(employeeRoles.id, req.params.id), eq(employeeRoles.storeUserId, req.userId!)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Role not found" });
  if (existing.isTemplate) return res.status(403).json({ error: "Cannot edit system templates" });

  const validPerms = permissions
    ? Object.fromEntries(
        Object.entries(permissions).filter(([k]) => (ALL_PERMISSIONS as readonly string[]).includes(k))
      )
    : undefined;

  const [updated] = await db
    .update(employeeRoles)
    .set({
      ...(name        ? { name }        : {}),
      ...(description ? { description } : {}),
      ...(validPerms  ? { permissions: validPerms } : {}),
      updatedAt: new Date(),
    })
    .where(eq(employeeRoles.id, req.params.id))
    .returning();

  logAudit({ req }, { action: "role.update", resourceType: "role", resourceId: req.params.id, oldValue: existing, newValue: updated });
  return res.json(updated);
});

// DELETE /api/store/roles/:id
router.delete("/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: employeeRoles.id, isTemplate: employeeRoles.isTemplate })
    .from(employeeRoles)
    .where(and(eq(employeeRoles.id, req.params.id), eq(employeeRoles.storeUserId, req.userId!)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Role not found" });
  if (existing.isTemplate) return res.status(403).json({ error: "Cannot delete system templates" });

  await db.delete(employeeRoles).where(eq(employeeRoles.id, req.params.id));
  logAudit({ req }, { action: "role.delete", resourceType: "role", resourceId: req.params.id });
  return res.json({ success: true });
});

// ─── Role Assignments ─────────────────────────────────────────────────────────

// GET /api/store/roles/assignments/:employeeId
router.get("/assignments/:employeeId", async (req, res) => {
  const rows = await db
    .select()
    .from(employeeRoleAssignments)
    .where(
      and(
        eq(employeeRoleAssignments.employeeId, req.params.employeeId),
        eq(employeeRoleAssignments.storeUserId, req.userId!),
      )
    );
  return res.json(rows);
});

// POST /api/store/roles/assignments
router.post("/assignments", async (req, res) => {
  const { employeeId, roleId, locationId, expiresAt } = req.body as {
    employeeId: string; roleId: string; locationId?: string; expiresAt?: string;
  };
  if (!employeeId || !roleId) return res.status(400).json({ error: "employeeId and roleId are required" });

  const [assignment] = await db
    .insert(employeeRoleAssignments)
    .values({
      employeeId,
      storeUserId: req.userId!,
      roleId,
      locationId: locationId ?? null,
      grantedBy:  req.userId!,
      expiresAt:  expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  logAudit({ req }, { action: "role.assign", resourceType: "employee", resourceId: employeeId, metadata: { roleId } });
  return res.status(201).json(assignment);
});

// DELETE /api/store/roles/assignments/:id
router.delete("/assignments/:id", async (req, res) => {
  await db
    .delete(employeeRoleAssignments)
    .where(and(eq(employeeRoleAssignments.id, req.params.id), eq(employeeRoleAssignments.storeUserId, req.userId!)));

  logAudit({ req }, { action: "role.unassign", resourceType: "assignment", resourceId: req.params.id });
  return res.json({ success: true });
});

// ─── Permission Overrides ─────────────────────────────────────────────────────

// PUT /api/store/roles/overrides/:employeeId/:permission
router.put("/overrides/:employeeId/:permission", async (req, res) => {
  const { employeeId, permission } = req.params;
  const { granted, reason, expiresAt } = req.body as { granted: boolean; reason?: string; expiresAt?: string };

  if (!(ALL_PERMISSIONS as readonly string[]).includes(permission)) {
    return res.status(400).json({ error: `Unknown permission: ${permission}` });
  }

  const [override] = await db
    .insert(permissionOverrides)
    .values({
      employeeId,
      storeUserId: req.userId!,
      permission:  permission as Permission,
      granted,
      reason:      reason   ?? null,
      grantedBy:   req.userId!,
      expiresAt:   expiresAt ? new Date(expiresAt) : null,
    })
    .onConflictDoUpdate({
      target: [permissionOverrides.employeeId, permissionOverrides.storeUserId, permissionOverrides.permission],
      set:    { granted, reason: reason ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null },
    })
    .returning();

  logAudit({ req }, {
    action:       "permission.override",
    resourceType: "employee",
    resourceId:   employeeId,
    metadata:     { permission, granted, reason },
  });
  return res.json(override);
});

// DELETE /api/store/roles/overrides/:employeeId/:permission
router.delete("/overrides/:employeeId/:permission", async (req, res) => {
  const { employeeId, permission } = req.params;

  await db
    .delete(permissionOverrides)
    .where(
      and(
        eq(permissionOverrides.employeeId, employeeId),
        eq(permissionOverrides.storeUserId, req.userId!),
        eq(permissionOverrides.permission, permission),
      )
    );

  logAudit({ req }, { action: "permission.override_remove", resourceType: "employee", resourceId: employeeId, metadata: { permission } });
  return res.json({ success: true });
});

export default router;
