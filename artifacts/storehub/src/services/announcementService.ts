// ─────────────────────────────────────────────────────────────────────────────
// announcementService.ts — Employer announcements for the employee portal
// ─────────────────────────────────────────────────────────────────────────────

export type AnnouncementPriority = "info" | "warning" | "urgent";

export interface Announcement {
  id:               string;
  title:            string;
  body:             string;
  priority:         AnnouncementPriority;
  pinned:           boolean;
  targetAll:        boolean;
  targetEmployeeIds: string[]; // empty means all
  expiresAt:        string | null; // ISO — null means no expiry
  createdBy:        string;
  createdAt:        string;
  readByEmployeeIds: string[]; // track who read it
}

export type InsertAnnouncement = Omit<
  Announcement,
  "id" | "createdAt" | "readByEmployeeIds"
>;

const KEY = "storehub_announcements";

function uid(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function readAll(): Announcement[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

function writeAll(data: Announcement[]): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function listAll(): Announcement[] {
  const now = new Date();
  return readAll()
    .filter((a) => !a.expiresAt || new Date(a.expiresAt) > now)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const priorityOrder = { urgent: 0, warning: 1, info: 2 };
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pd !== 0) return pd;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function listForEmployee(employeeId: string): Announcement[] {
  return listAll().filter(
    (a) => a.targetAll || a.targetEmployeeIds.length === 0 || a.targetEmployeeIds.includes(employeeId)
  );
}

export function getAnnouncement(id: string): Announcement | null {
  return readAll().find((a) => a.id === id) ?? null;
}

export function createAnnouncement(data: InsertAnnouncement): Announcement {
  const ann: Announcement = {
    ...data,
    id:               uid(),
    createdAt:        new Date().toISOString(),
    readByEmployeeIds: [],
  };
  writeAll([...readAll(), ann]);
  return ann;
}

export function updateAnnouncement(id: string, patch: Partial<Announcement>): Announcement | null {
  const all = readAll();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
  return all[idx];
}

export function deleteAnnouncement(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}

export function markRead(announcementId: string, employeeId: string): void {
  const all = readAll();
  const idx = all.findIndex((a) => a.id === announcementId);
  if (idx === -1) return;
  if (!all[idx].readByEmployeeIds.includes(employeeId)) {
    all[idx].readByEmployeeIds = [...all[idx].readByEmployeeIds, employeeId];
    writeAll(all);
  }
}

export function isRead(announcementId: string, employeeId: string): boolean {
  const ann = getAnnouncement(announcementId);
  return ann ? ann.readByEmployeeIds.includes(employeeId) : false;
}

export function unreadCount(employeeId: string): number {
  return listForEmployee(employeeId).filter((a) => !a.readByEmployeeIds.includes(employeeId)).length;
}
