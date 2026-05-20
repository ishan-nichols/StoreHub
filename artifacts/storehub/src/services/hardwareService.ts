/**
 * hardwareService.ts — Card reader and receipt printer management
 * 
 * Handles:
 * - Card reader detection, pairing, and settings
 * - Receipt printer configuration
 * - Bluetooth/USB/WiFi device scanning
 * - Hardware status and connection management
 */

import { generateId, now } from "../utils";

// ─── Card Reader Types ────────────────────────────────────────────────────────

export type CardReaderType =
  | "stripe_s700"
  | "stripe_m2"
  | "square_reader_gen2"
  | "square_reader"
  | "square_terminal"
  | "clover_mini"
  | "clover_flex"
  | "clover_go"
  | "verifone_p400"
  | "ingenico_lane3000"
  | "pax_a920"
  | "generic_bluetooth"
  | "generic_usb"
  | "generic_wifi";

export interface CardReader {
  id: string;
  type: CardReaderType;
  name: string;
  serialNumber?: string;
  connectionType: "bluetooth" | "usb" | "wifi";
  isConnected: boolean;
  lastConnected?: string;
  pairedAt: string;
  isPrimary: boolean;
  processor?: "stripe" | "square";
}

// ─── Receipt Printer Types ────────────────────────────────────────────────────

export type ReceiptPrinterType =
  | "star_tsp100"
  | "epson_tm_t88"
  | "epson_tm_m30"
  | "star_m200"
  | "generic_escpos"
  | "generic_network";

export interface ReceiptPrinter {
  id: string;
  type: ReceiptPrinterType;
  name: string;
  connectionType: "bluetooth" | "usb" | "wifi";
  ipAddress?: string;
  macAddress?: string;
  isConnected: boolean;
  lastConnected?: string;
  pairedAt: string;
  isPrimary: boolean;
  paperWidth: 58 | 80; // mm
  autoPrint: boolean;
}

// ─── Card Reader Management ───────────────────────────────────────────────────

const CARD_READERS_KEY = "storehub_card_readers";

export function getCardReaders(): CardReader[] {
  return JSON.parse(localStorage.getItem(CARD_READERS_KEY) || "[]");
}

export function getPrimaryCardReader(): CardReader | null {
  const readers = getCardReaders();
  return readers.find((r) => r.isPrimary) || null;
}

export function addCardReader(
  reader: Omit<CardReader, "id" | "pairedAt" | "isConnected">,
): CardReader {
  const newReader: CardReader = {
    ...reader,
    id: generateId(),
    pairedAt: now(),
    isConnected: false,
  };

  const readers = getCardReaders();
  // If this is primary, unset other primaries
  if (newReader.isPrimary) {
    readers.forEach((r) => (r.isPrimary = false));
  }

  readers.push(newReader);
  localStorage.setItem(CARD_READERS_KEY, JSON.stringify(readers));
  return newReader;
}

export function removeCardReader(id: string): boolean {
  const readers = getCardReaders();
  const filtered = readers.filter((r) => r.id !== id);
  localStorage.setItem(CARD_READERS_KEY, JSON.stringify(filtered));
  return filtered.length < readers.length;
}

export function updateCardReaderStatus(
  id: string,
  isConnected: boolean,
): CardReader | null {
  const readers = getCardReaders();
  const reader = readers.find((r) => r.id === id);

  if (!reader) return null;

  reader.isConnected = isConnected;
  if (isConnected) {
    reader.lastConnected = now();
  }

  localStorage.setItem(CARD_READERS_KEY, JSON.stringify(readers));
  return reader;
}

export function setCardReaderAsPrimary(id: string): CardReader | null {
  const readers = getCardReaders();
  readers.forEach((r) => (r.isPrimary = r.id === id));
  localStorage.setItem(CARD_READERS_KEY, JSON.stringify(readers));
  return readers.find((r) => r.id === id) || null;
}

export async function scanForCardReaders(): Promise<CardReader[]> {
  // In production, this would:
  // 1. Use Bluetooth API to scan for nearby devices
  // 2. Match device names/UUIDs to known reader types
  // 3. Filter by supported reader types
  
  // For now, return mock data
  return [];
}

// ─── Receipt Printer Management ────────────────────────────────────────────────

const RECEIPT_PRINTERS_KEY = "storehub_receipt_printers";

export function getReceiptPrinters(): ReceiptPrinter[] {
  return JSON.parse(localStorage.getItem(RECEIPT_PRINTERS_KEY) || "[]");
}

export function getPrimaryReceiptPrinter(): ReceiptPrinter | null {
  const printers = getReceiptPrinters();
  return printers.find((p) => p.isPrimary) || null;
}

export function addReceiptPrinter(
  printer: Omit<ReceiptPrinter, "id" | "pairedAt" | "isConnected">,
): ReceiptPrinter {
  const newPrinter: ReceiptPrinter = {
    ...printer,
    id: generateId(),
    pairedAt: now(),
    isConnected: false,
  };

  const printers = getReceiptPrinters();
  // If this is primary, unset other primaries
  if (newPrinter.isPrimary) {
    printers.forEach((p) => (p.isPrimary = false));
  }

  printers.push(newPrinter);
  localStorage.setItem(RECEIPT_PRINTERS_KEY, JSON.stringify(printers));
  return newPrinter;
}

export function removeReceiptPrinter(id: string): boolean {
  const printers = getReceiptPrinters();
  const filtered = printers.filter((p) => p.id !== id);
  localStorage.setItem(RECEIPT_PRINTERS_KEY, JSON.stringify(filtered));
  return filtered.length < printers.length;
}

export function updateReceiptPrinterStatus(
  id: string,
  isConnected: boolean,
): ReceiptPrinter | null {
  const printers = getReceiptPrinters();
  const printer = printers.find((p) => p.id === id);

  if (!printer) return null;

  printer.isConnected = isConnected;
  if (isConnected) {
    printer.lastConnected = now();
  }

  localStorage.setItem(RECEIPT_PRINTERS_KEY, JSON.stringify(printers));
  return printer;
}

export function setReceiptPrinterAsPrimary(id: string): ReceiptPrinter | null {
  const printers = getReceiptPrinters();
  printers.forEach((p) => (p.isPrimary = p.id === id));
  localStorage.setItem(RECEIPT_PRINTERS_KEY, JSON.stringify(printers));
  return printers.find((p) => p.id === id) || null;
}

export async function scanForReceiptPrinters(): Promise<ReceiptPrinter[]> {
  // In production, this would:
  // 1. Use Bluetooth API to scan for nearby devices
  // 2. Attempt mDNS discovery for WiFi printers
  // 3. Check USB devices for printers
  
  // For now, return mock data
  return [];
}

// ─── Device Capabilities ──────────────────────────────────────────────────

export interface DeviceCapabilities {
  hasBluetoothAPI: boolean;
  hasUSBAccess: boolean;
  hasWebauthn: boolean;
  supportedCardReaders: CardReaderType[];
  supportedReceiptPrinters: ReceiptPrinterType[];
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  const hasBluetoothAPI =
    typeof navigator !== "undefined" && "bluetooth" in navigator;
  
  const hasUSBAccess =
    typeof navigator !== "undefined" && "usb" in navigator;
  
  const hasWebauthn =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  // All reader/printer types can be supported with the right SDKs
  const supportedCardReaders: CardReaderType[] = [
    "stripe_s700",
    "stripe_m2",
    "square_reader_gen2",
    "square_reader",
    "square_terminal",
    "clover_mini",
    "clover_flex",
    "clover_go",
    "verifone_p400",
    "ingenico_lane3000",
    "pax_a920",
  ];

  if (hasBluetoothAPI) {
    supportedCardReaders.push("generic_bluetooth");
  }

  if (hasUSBAccess) {
    supportedCardReaders.push("generic_usb");
  }

  supportedCardReaders.push("generic_wifi");

  const supportedReceiptPrinters: ReceiptPrinterType[] = [
    "star_tsp100",
    "epson_tm_t88",
    "epson_tm_m30",
    "star_m200",
    "generic_escpos",
    "generic_network",
  ];

  return {
    hasBluetoothAPI,
    hasUSBAccess,
    hasWebauthn,
    supportedCardReaders,
    supportedReceiptPrinters,
  };
}
