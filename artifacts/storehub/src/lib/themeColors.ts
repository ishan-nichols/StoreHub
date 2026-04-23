export interface ColorPreset {
  id: string;
  name: string;
  hex: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "amber", name: "Amber", hex: "#f59e0b" },
  { id: "orange", name: "Orange", hex: "#ea580c" },
  { id: "rose", name: "Rose", hex: "#e11d48" },
  { id: "pink", name: "Pink", hex: "#db2777" },
  { id: "purple", name: "Purple", hex: "#9333ea" },
  { id: "indigo", name: "Indigo", hex: "#4f46e5" },
  { id: "blue", name: "Blue", hex: "#2563eb" },
  { id: "sky", name: "Sky", hex: "#0284c7" },
  { id: "teal", name: "Teal", hex: "#0d9488" },
  { id: "emerald", name: "Emerald", hex: "#059669" },
  { id: "green", name: "Green", hex: "#16a34a" },
  { id: "slate", name: "Slate", hex: "#475569" },
];

export const DEFAULT_ACCENT = "#f59e0b";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hexToHslString(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(...rgb);
  return `${h} ${s}% ${l}%`;
}

const ACCENT_VARS = [
  "--primary",
  "--ring",
  "--sidebar-primary",
  "--sidebar-ring",
  "--chart-1",
];

export function applyAccentColor(hex: string | undefined | null): void {
  const root = document.documentElement;
  const value = hex && hexToHslString(hex);
  if (!value) {
    ACCENT_VARS.forEach((v) => root.style.removeProperty(v));
    return;
  }
  ACCENT_VARS.forEach((v) => root.style.setProperty(v, value));
}
