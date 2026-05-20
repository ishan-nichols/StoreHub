/**
 * SquareReaderPairing.tsx — Square Reader for Contactless and Chip 2nd Gen
 *
 * Pairing flow:
 *   1. Click "Pair Reader" → browser opens Bluetooth picker (filtered to Square readers)
 *   2. Owner selects their reader from the list
 *   3. Reader is paired and saved to localStorage for auto-reconnect
 *   4. Status badge shows Connected (green) or Disconnected (red)
 */

import { useState, useEffect } from "react";
import {
  Bluetooth,
  CheckCircle2,
  XCircle,
  Loader2,
  Unplug,
  Zap,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  getSavedSquareReader,
  pairSquareReader,
  unpairSquareReader,
  scanForSquareReaders,
  reconnectSquareReader,
  updateSquareReaderStatus,
  isBluetoothAvailable,
  type SquareReaderDevice,
  type ScannedSquareReader,
} from "../services/squareReaderService";
import { toast } from "sonner";

interface SquareReaderPairingProps {
  onReaderChange?: (reader: SquareReaderDevice | null) => void;
}

type PairingStep = "idle" | "scanning" | "found" | "pairing" | "paired" | "reconnecting";

export function SquareReaderPairing({ onReaderChange }: SquareReaderPairingProps) {
  const [step, setStep] = useState<PairingStep>("idle");
  const [pairedReader, setPairedReader] = useState<SquareReaderDevice | null>(null);
  const [foundReaders, setFoundReaders] = useState<ScannedSquareReader[]>([]);
  const [bluetoothSupported, setBluetoothSupported] = useState(true);

  // Load saved reader on mount and attempt auto-reconnect
  useEffect(() => {
    const saved = getSavedSquareReader();
    if (saved) {
      setPairedReader(saved);
      setStep("paired");
      // Attempt silent reconnect in background
      reconnectSquareReader().then((ok) => {
        if (ok) {
          const updated = { ...saved, isConnected: true };
          setPairedReader(updated);
        }
      });
    }
    setBluetoothSupported(isBluetoothAvailable());
  }, []);

  const handleStartPairing = async () => {
    if (!bluetoothSupported) {
      toast.error("Bluetooth is not available. Use Chrome or Edge with Bluetooth enabled.");
      return;
    }

    setStep("scanning");
    setFoundReaders([]);

    try {
      // Opens the browser's native Bluetooth picker — user selects their Square reader
      const readers = await scanForSquareReaders();

      if (readers.length === 0) {
        // User cancelled the picker
        setStep("idle");
        return;
      }

      setFoundReaders(readers);
      setStep("found");
    } catch (error: any) {
      setStep("idle");
      toast.error(
        error.message?.includes("Bluetooth")
          ? error.message
          : "Bluetooth scan failed. Make sure Bluetooth is on and try again.",
      );
    }
  };

  const handleSelectReader = async (scanned: ScannedSquareReader) => {
    setStep("pairing");
    try {
      const reader = await pairSquareReader(scanned);
      setPairedReader(reader);
      setStep("paired");
      onReaderChange?.(reader);
      toast.success(`${reader.name} paired and connected`);
    } catch (error) {
      setStep("found");
      toast.error("Failed to pair reader. Make sure it is powered on and nearby.");
    }
  };

  const handleUnpair = async () => {
    await unpairSquareReader();
    setPairedReader(null);
    setFoundReaders([]);
    setStep("idle");
    onReaderChange?.(null);
    toast.success("Square Reader unpaired");
  };

  const handleReconnect = async () => {
    if (!pairedReader) return;
    setStep("reconnecting");
    try {
      const ok = await reconnectSquareReader();
      if (ok) {
        const updated = updateSquareReaderStatus(true);
        if (updated) {
          setPairedReader(updated);
          onReaderChange?.(updated);
        }
        toast.success("Reader reconnected");
      } else {
        toast.error("Could not reconnect. Make sure the reader is powered on and nearby.");
      }
    } catch {
      toast.error("Reconnect failed");
    } finally {
      setStep("paired");
    }
  };

  // ── Paired state ────────────────────────────────────────────────────────────
  if (step === "paired" && pairedReader) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2">
              <Bluetooth className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900 text-sm">{pairedReader.name}</p>
              <p className="text-xs text-emerald-700 mt-0.5">Square Reader for Contactless &amp; Chip</p>
            </div>
          </div>
          {pairedReader.isConnected ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white">
              <XCircle className="h-3.5 w-3.5" />
              Disconnected
            </span>
          )}
        </div>

        {!pairedReader.isConnected && (
          <button
            onClick={handleReconnect}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reconnect Reader
          </button>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            <span>Contactless tap — Apple Pay, Google Pay, contactless cards</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            <span>Chip insert (EMV)</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-slate-500">Swipe and PIN not supported on this reader</span>
          </div>
        </div>

        <button
          onClick={handleUnpair}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <Unplug className="h-4 w-4" />
          Unpair Reader
        </button>
      </div>
    );
  }

  // ── Reconnecting state ───────────────────────────────────────────────────────
  if (step === "reconnecting") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm font-semibold text-slate-700">Reconnecting to Square Reader...</p>
      </div>
    );
  }

  // ── Found readers state ──────────────────────────────────────────────────────
  if (step === "found" && foundReaders.length > 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Found {foundReaders.length} reader{foundReaders.length !== 1 ? "s" : ""} — tap to pair</p>
        {foundReaders.map((r) => (
          <button
            key={r.bluetoothId}
            onClick={() => handleSelectReader(r)}
            className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-left hover:bg-emerald-50 transition-colors"
          >
            <div className="rounded-xl bg-emerald-100 p-2">
              <Bluetooth className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">{r.name}</p>
              <p className="text-xs text-slate-500">Square Reader for Contactless &amp; Chip</p>
            </div>
            <Zap className="ml-auto h-4 w-4 text-emerald-500" />
          </button>
        ))}
        <button
          onClick={() => { setStep("idle"); setFoundReaders([]); }}
          className="w-full rounded-2xl border border-slate-200 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Pairing in progress ──────────────────────────────────────────────────────
  if (step === "pairing") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm font-semibold text-slate-700">Pairing with Square Reader...</p>
        <p className="text-xs text-slate-500">Keep the reader nearby</p>
      </div>
    );
  }

  // ── Scanning state ───────────────────────────────────────────────────────────
  if (step === "scanning") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="relative">
          <Bluetooth className="h-10 w-10 text-emerald-600" />
          <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Opening Bluetooth scanner...</p>
        <p className="text-xs text-slate-500">Select your Square Reader from the list</p>
      </div>
    );
  }

  // ── Idle / initial state ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {!bluetoothSupported && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Bluetooth not detected in this browser. Use <strong>Chrome</strong> or <strong>Edge</strong> on a desktop or Android device with Bluetooth.
          </span>
        </div>
      )}

      <button
        onClick={handleStartPairing}
        disabled={!bluetoothSupported}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Bluetooth className="h-5 w-5" />
        Pair Square Reader
      </button>

      <p className="text-xs text-slate-500 text-center leading-5">
        Make sure your Square Reader is charged and powered on.
        Bluetooth will scan for nearby readers automatically.
      </p>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
        <p className="font-semibold text-slate-700 mb-2">Supported payment methods</p>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          <span>Contactless tap — Apple Pay, Google Pay, contactless cards</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          <span>Chip insert (EMV)</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <span className="text-slate-500">Swipe and PIN not supported on this reader</span>
        </div>
      </div>
    </div>
  );
}
