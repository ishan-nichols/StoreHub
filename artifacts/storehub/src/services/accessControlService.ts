// ─────────────────────────────────────────────────────────────────────────────
// accessControlService.ts — Location-based and time-based access control
//
// Stores all rules in localStorage. In production, replace with:
//   GET/POST/DELETE /api/store/access-control/*
// ─────────────────────────────────────────────────────────────────────────────

export interface LocationRule {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // default 200
  active: boolean;
  createdAt: string;
}

export interface TimeWindow {
  dayOfWeek: number; // 0=Sun, 6=Sat
  startHour: number; // 0-23
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface TimeRule {
  id: string;
  name: string;
  windows: TimeWindow[];
  blockOutsideHours: boolean;
  active: boolean;
  createdAt: string;
}

export type AccessDecision = "allowed" | "blocked_location" | "blocked_time" | "allowed_override";

export interface AccessLogEntry {
  id: string;
  employeeId: string | null;
  employeeName: string;
  action: "clock_in" | "clock_out" | "portal_login" | "module_access" | "access_denied";
  decision: AccessDecision;
  locationState: "on_site" | "remote" | "unknown" | "store_device";
  distanceMeters: number | null;
  moduleName: string | null;
  userAgent: string;
  timestamp: string;
}

export interface AccessOverride {
  employeeId: string;
  bypassLocation: boolean;
  bypassTime: boolean;
  reason: string;
  expiresAt: string | null; // null = permanent
  grantedBy: string;
  grantedAt: string;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const LOCATION_RULES_KEY = "storehub_access_location_rules";
const TIME_RULES_KEY      = "storehub_access_time_rules";
const ACCESS_LOG_KEY      = "storehub_access_log";
const OVERRIDES_KEY       = "storehub_access_overrides";
const MAX_LOG_ENTRIES     = 500;

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}

function write<T>(key: string, data: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Location Rules ───────────────────────────────────────────────────────────

export function listLocationRules(): LocationRule[] {
  return read<LocationRule>(LOCATION_RULES_KEY);
}

export function createLocationRule(
  data: Omit<LocationRule, "id" | "createdAt">
): LocationRule {
  const rule: LocationRule = { ...data, id: uid(), createdAt: new Date().toISOString() };
  write(LOCATION_RULES_KEY, [...read<LocationRule>(LOCATION_RULES_KEY), rule]);
  return rule;
}

export function updateLocationRule(id: string, patch: Partial<LocationRule>): LocationRule | null {
  const all = read<LocationRule>(LOCATION_RULES_KEY);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  write(LOCATION_RULES_KEY, all);
  return all[idx];
}

export function deleteLocationRule(id: string): void {
  write(LOCATION_RULES_KEY, read<LocationRule>(LOCATION_RULES_KEY).filter((r) => r.id !== id));
}

// ─── Time Rules ───────────────────────────────────────────────────────────────

export function listTimeRules(): TimeRule[] {
  return read<TimeRule>(TIME_RULES_KEY);
}

export function createTimeRule(data: Omit<TimeRule, "id" | "createdAt">): TimeRule {
  const rule: TimeRule = { ...data, id: uid(), createdAt: new Date().toISOString() };
  write(TIME_RULES_KEY, [...read<TimeRule>(TIME_RULES_KEY), rule]);
  return rule;
}

export function updateTimeRule(id: string, patch: Partial<TimeRule>): TimeRule | null {
  const all = read<TimeRule>(TIME_RULES_KEY);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  write(TIME_RULES_KEY, all);
  return all[idx];
}

export function deleteTimeRule(id: string): void {
  write(TIME_RULES_KEY, read<TimeRule>(TIME_RULES_KEY).filter((r) => r.id !== id));
}

// ─── Access Overrides ─────────────────────────────────────────────────────────

export function listOverrides(): AccessOverride[] {
  const now = new Date();
  return read<AccessOverride>(OVERRIDES_KEY).filter(
    (o) => !o.expiresAt || new Date(o.expiresAt) > now
  );
}

export function setOverride(override: AccessOverride): void {
  const all = read<AccessOverride>(OVERRIDES_KEY).filter(
    (o) => o.employeeId !== override.employeeId
  );
  write(OVERRIDES_KEY, [...all, override]);
}

export function removeOverride(employeeId: string): void {
  write(OVERRIDES_KEY, read<AccessOverride>(OVERRIDES_KEY).filter((o) => o.employeeId !== employeeId));
}

export function getOverride(employeeId: string): AccessOverride | null {
  return listOverrides().find((o) => o.employeeId === employeeId) ?? null;
}

// ─── Access Evaluation ────────────────────────────────────────────────────────

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateTimeAccess(now = new Date()): { allowed: boolean; reason: string } {
  const rules = listTimeRules().filter((r) => r.active && r.blockOutsideHours);
  if (rules.length === 0) return { allowed: true, reason: "No time restrictions" };

  const dow = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const rule of rules) {
    const windowsToday = rule.windows.filter((w) => w.dayOfWeek === dow);
    for (const w of windowsToday) {
      const start = w.startHour * 60 + w.startMinute;
      const end   = w.endHour * 60 + w.endMinute;
      if (currentMinutes >= start && currentMinutes <= end) {
        return { allowed: true, reason: `Within window: ${rule.name}` };
      }
    }
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    allowed: false,
    reason: `Access is restricted outside working hours on ${dayNames[dow]}`,
  };
}

export function evaluateLocationAccess(
  userLat: number,
  userLng: number
): { allowed: boolean; closestRuleDistance: number | null; reason: string } {
  const rules = listLocationRules().filter((r) => r.active);
  if (rules.length === 0) return { allowed: true, closestRuleDistance: null, reason: "No location restrictions" };

  let closest: number | null = null;
  for (const rule of rules) {
    const dist = haversineM(userLat, userLng, rule.latitude, rule.longitude);
    if (closest === null || dist < closest) closest = dist;
    if (dist <= rule.radiusMeters) {
      return { allowed: true, closestRuleDistance: dist, reason: `Within ${rule.name}` };
    }
  }

  return {
    allowed: false,
    closestRuleDistance: closest,
    reason: "Outside all allowed locations",
  };
}

// ─── Access Log ───────────────────────────────────────────────────────────────

export function logAccessAttempt(entry: Omit<AccessLogEntry, "id" | "timestamp">): AccessLogEntry {
  const log = entry as AccessLogEntry;
  log.id = uid();
  log.timestamp = new Date().toISOString();
  const all = read<AccessLogEntry>(ACCESS_LOG_KEY);
  // Cap log at MAX_LOG_ENTRIES
  const updated = [log, ...all].slice(0, MAX_LOG_ENTRIES);
  write(ACCESS_LOG_KEY, updated);
  return log;
}

export function listAccessLog(limit = 100): AccessLogEntry[] {
  return read<AccessLogEntry>(ACCESS_LOG_KEY).slice(0, limit);
}

export function listAccessLogForEmployee(employeeId: string, limit = 50): AccessLogEntry[] {
  return read<AccessLogEntry>(ACCESS_LOG_KEY)
    .filter((e) => e.employeeId === employeeId)
    .slice(0, limit);
}

export function clearAccessLog(): void {
  write(ACCESS_LOG_KEY, []);
}
