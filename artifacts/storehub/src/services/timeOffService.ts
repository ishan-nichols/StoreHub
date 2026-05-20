// ─────────────────────────────────────────────────────────────────────────────
// timeOffService.ts — Time-off request and approval workflow
// ─────────────────────────────────────────────────────────────────────────────

export type TimeOffType   = "vacation" | "sick" | "personal" | "unpaid" | "other";
export type TimeOffStatus = "pending" | "approved" | "denied" | "cancelled";

export interface TimeOffRequest {
  id:           string;
  employeeId:   string;
  employeeName: string;
  type:         TimeOffType;
  startDate:    string; // YYYY-MM-DD
  endDate:      string; // YYYY-MM-DD
  totalDays:    number;
  reason:       string;
  status:       TimeOffStatus;
  reviewNote:   string | null;
  reviewedBy:   string | null;
  reviewedAt:   string | null;
  createdAt:    string;
}

export type InsertTimeOffRequest = Pick<
  TimeOffRequest,
  "employeeId" | "employeeName" | "type" | "startDate" | "endDate" | "reason"
>;

const KEY = "storehub_time_off_requests";

function uid(): string {
  return `tor_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function readAll(): TimeOffRequest[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function writeAll(data: TimeOffRequest[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function businessDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

export function listAllRequests(): TimeOffRequest[] {
  return readAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function listRequestsByEmployee(employeeId: string): TimeOffRequest[] {
  return readAll()
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function listPendingRequests(): TimeOffRequest[] {
  return readAll().filter((r) => r.status === "pending");
}

export function getRequest(id: string): TimeOffRequest | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function createRequest(data: InsertTimeOffRequest): TimeOffRequest {
  const request: TimeOffRequest = {
    ...data,
    id:         uid(),
    totalDays:  businessDays(data.startDate, data.endDate),
    status:     "pending",
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt:  new Date().toISOString(),
  };
  writeAll([...readAll(), request]);
  return request;
}

export function approveRequest(id: string, reviewedBy: string, note = ""): TimeOffRequest | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = {
    ...all[idx],
    status:     "approved",
    reviewNote: note || null,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[idx];
}

export function denyRequest(id: string, reviewedBy: string, note = ""): TimeOffRequest | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = {
    ...all[idx],
    status:     "denied",
    reviewNote: note || null,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[idx];
}

export function cancelRequest(id: string, employeeId: string): TimeOffRequest | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id && r.employeeId === employeeId && r.status === "pending");
  if (idx === -1) return null;
  all[idx] = { ...all[idx], status: "cancelled" };
  writeAll(all);
  return all[idx];
}

export function deleteRequest(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

// Returns dates that have approved time-off for any employee (for calendar rendering)
export function getApprovedDates(): { employeeId: string; employeeName: string; date: string }[] {
  const result: { employeeId: string; employeeName: string; date: string }[] = [];
  for (const req of readAll()) {
    if (req.status !== "approved") continue;
    const cur = new Date(req.startDate);
    const end = new Date(req.endDate);
    while (cur <= end) {
      result.push({
        employeeId:   req.employeeId,
        employeeName: req.employeeName,
        date:         cur.toISOString().slice(0, 10),
      });
      cur.setDate(cur.getDate() + 1);
    }
  }
  return result;
}
