import { v4 as uuidv4 } from "uuid";

export function generateId(): string {
  return uuidv4();
}

export function generateReceiptNumber(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `RCP-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export function formatCurrency(amount: number, symbol: string = "$"): string {
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function getDayName(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

export function calcHoursWorked(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const diff = (endMs - startMs) / (1000 * 60 * 60);
  return Math.round(diff * 100) / 100;
}

export function now(): string {
  return new Date().toISOString();
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function renderText(raw: string): string {
  return raw
    .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, "$1")
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*]\s+/gm, "• ")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    MXN: "$",
    ARS: "$",
    COP: "$",
    PEN: "S/",
    BRL: "R$",
    CLP: "$",
    DOP: "RD$",
    GTQ: "Q",
    HNL: "L",
    CRC: "₡",
    PAB: "B/.",
    BOB: "Bs.",
    PYG: "₲",
    UYU: "$",
    VES: "Bs.S",
    NGN: "₦",
    GHS: "₵",
    KES: "KSh",
    ZAR: "R",
    EGP: "£",
    MAD: "MAD",
    INR: "₹",
    PKR: "₨",
    BDT: "৳",
    PHP: "₱",
    THB: "฿",
    IDR: "Rp",
    VND: "₫",
    CNY: "¥",
    JPY: "¥",
    KRW: "₩",
    CAD: "$",
    AUD: "$",
    NZD: "$",
  };
  return symbols[currency] ?? currency;
}
