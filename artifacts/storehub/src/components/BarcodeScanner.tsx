import { useEffect, useRef, useState } from "react";
import Quagga from "@ericblade/quagga2";
import {
  X, Loader2, CheckCircle2, AlertCircle,
  Keyboard, RefreshCw, ShieldAlert, ZapOff,
} from "lucide-react";
import { type BarcodeProductInfo } from "../services/barcodeService";
import { API_BASE_URL } from "../services/dataService";

interface Props {
  onClose:  () => void;
  onResult: (info: BarcodeProductInfo, isManualEntry: boolean) => void;
}

type Status =
  | "starting" | "scanning"
  | "found"    | "not-found"
  | "timeout"  | "permission-denied" | "no-camera" | "error" | "manual";

const TIMEOUT_MS = 40_000;

// ── Product lookup — goes through backend which tries free DBs then Claude ────
async function lookupUPC(barcode: string): Promise<BarcodeProductInfo | null> {
  try {
    const res  = await fetch(`${API_BASE_URL}/api/upc/${barcode}`);
    const data = await res.json() as { found?: boolean; name?: string; brand?: string; category?: string; description?: string; srp?: number };
    if (data.found && data.name) {
      return { barcode, name: data.name, brand: data.brand, category: data.category, description: data.description, srp: data.srp, source: "DB" };
    }
  } catch { /* fall through */ }
  return null;
}

export default function BarcodeScanner({ onClose, onResult }: Props) {
  const [status,     setStatus]     = useState<Status>("starting");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [result,     setResult]     = useState<BarcodeProductInfo | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [retryKey,   setRetryKey]   = useState(0);
  const [fetching,   setFetching]   = useState(false);

  const scannerDivRef = useRef<HTMLDivElement>(null);
  const doneRef       = useRef(false);
  const runningRef    = useRef(false);

  // ── Quagga scanner lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (status === "manual") return;

    let mounted = true;
    doneRef.current  = false;
    runningRef.current = false;
    setStatus("starting");

    const timeoutId = setTimeout(() => {
      if (mounted && !doneRef.current) setStatus("timeout");
    }, TIMEOUT_MS);

    // Small delay to ensure the div is mounted
    const initId = setTimeout(() => {
      if (!mounted || !scannerDivRef.current) return;

      Quagga.init(
        {
          inputStream: {
            type:        "LiveStream",
            target:      scannerDivRef.current,
            constraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          },
          decoder: {
            readers: [
              "ean_reader", "ean_8_reader",
              "upc_reader", "upc_e_reader",
              "code_128_reader", "code_39_reader",
              "codabar_reader", "i2of5_reader",
            ],
          },
          locate: true,
        },
        (err) => {
          if (!mounted) return;
          if (err) {
            const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
            if (/permission|denied/i.test(msg)) setStatus("permission-denied");
            else if (/not found|no device/i.test(msg)) setStatus("no-camera");
            else { setStatus("error"); setErrorMsg(err instanceof Error ? err.message : String(err)); }
            return;
          }
          Quagga.start();
          runningRef.current = true;
          if (mounted) setStatus("scanning");
        },
      );

      Quagga.onDetected(async (result) => {
        if (doneRef.current || !mounted) return;
        const raw     = result.codeResult.code ?? "";
        const barcode = raw.replace(/\D/g, "");
        if (barcode.length < 8) return;

        // Require consistent reads to avoid false positives
        doneRef.current = true;
        clearTimeout(timeoutId);
        if (runningRef.current) { Quagga.stop(); runningRef.current = false; }

        setFetching(true);
        const info = await lookupUPC(barcode);
        if (!mounted) return;
        setFetching(false);
        setResult(info ?? { barcode, name: "", source: "Manual" });
        setStatus(info ? "found" : "not-found");
      });
    }, 100);

    return () => {
      mounted = false;
      doneRef.current = true;
      clearTimeout(timeoutId);
      clearTimeout(initId);
      Quagga.offDetected();
      if (runningRef.current) { try { Quagga.stop(); } catch { /* ok */ } runningRef.current = false; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function retry() {
    setResult(null); setErrorMsg(null); setFetching(false);
    setRetryKey(k => k + 1); setStatus("starting");
  }
  function switchToManual() {
    doneRef.current = true;
    if (runningRef.current) { try { Quagga.stop(); } catch { /* ok */ } runningRef.current = false; }
    setStatus("manual");
  }
  async function handleManualLookup() {
    const barcode = manualCode.replace(/\D/g, "");
    if (!barcode) return;
    setFetching(true);
    const info = await lookupUPC(barcode);
    setFetching(false);
    setResult(info ?? { barcode, name: "", source: "Manual" });
    setStatus(info ? "found" : "not-found");
  }
  function handleConfirm() {
    if (result) onResult(result, status === "not-found" || status === "manual");
  }

  const cameraActive = status === "starting" || status === "scanning" || status === "timeout";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <style>{`
        @keyframes scanline { 0%,100%{transform:translateY(0)} 50%{transform:translateY(calc(100% - 2px))} }
        .scan-line { animation: scanline 1.5s ease-in-out infinite; }
        #quagga-target video { width:100%!important; height:100%!important; object-fit:cover; position:absolute; inset:0; }
        #quagga-target canvas { display:none!important; }
      `}</style>

      {/* Quagga renders its video inside this div */}
      <div
        id="quagga-target"
        ref={scannerDivRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: cameraActive ? "block" : "none" }}
      />

      {/* Targeting overlay */}
      {cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10" style={{ width: 280, height: 130 }}>
            <div className="absolute inset-0 border border-white/30 rounded-sm" />
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-sm" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-sm" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-sm" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-sm" />
            {status === "scanning" && !fetching && (
              <div className="scan-line absolute left-2 right-2 h-0.5 bg-emerald-400 opacity-80"
                style={{ boxShadow: "0 0 6px 1px #34d399" }} />
            )}
            {fetching && (
              <div className="absolute inset-0 flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                <span className="text-white text-sm font-medium">Looking up…</span>
              </div>
            )}
          </div>
          <div className="relative z-10 mt-4 text-center px-6">
            {status === "scanning" && !fetching && <p className="text-white text-sm font-medium">Point camera at barcode</p>}
            {status === "starting" && <div className="flex items-center gap-2 text-white/80 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Starting camera…</div>}
            {status === "timeout" && (
              <div className="space-y-3 pointer-events-auto">
                <div className="flex items-start justify-center gap-2">
                  <ZapOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-white text-sm font-medium">No barcode detected — try better lighting or move closer</p>
                </div>
                <button onClick={retry} className="px-5 py-2 bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center gap-2 mx-auto">
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white text-sm font-medium">
            {fetching ? "Looking up product…" : status === "scanning" ? "Scanning…" : status === "starting" ? "Starting…" : status === "timeout" ? "No barcode found" : "Scan Barcode"}
          </span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60"><X className="w-5 h-5" /></button>
      </div>

      {(status === "scanning" || status === "starting") && (
        <div className="relative z-20 mt-auto px-4 py-5 flex justify-center pointer-events-auto">
          <button onClick={switchToManual} className="text-white/70 hover:text-white text-sm flex items-center gap-1.5 bg-black/40 px-4 py-2 rounded-full">
            <Keyboard className="w-4 h-4" /> Type barcode instead
          </button>
        </div>
      )}

      {!cameraActive && (
        <div className="relative z-20 mt-auto bg-white dark:bg-slate-900 rounded-t-3xl w-full max-h-[75vh] overflow-y-auto">
          {status === "permission-denied" && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800 text-sm mb-1">Camera permission denied</p>
                  <p className="text-xs text-red-700">Enable camera in browser settings then tap Try again.</p>
                </div>
              </div>
              <button onClick={retry} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm">Try again</button>
              <button onClick={switchToManual} className="w-full py-2.5 border border-slate-300 rounded-xl font-medium text-sm">Enter manually</button>
            </div>
          )}
          {(status === "no-camera" || status === "error") && (
            <div className="p-6 space-y-4 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-sm text-slate-700">{errorMsg ?? "Camera unavailable."}</p>
              <button onClick={retry} className="w-full py-2.5 border border-slate-300 rounded-xl text-sm font-medium flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Try again</button>
              <button onClick={switchToManual} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm">Enter manually</button>
            </div>
          )}
          {status === "manual" && (
            <div className="p-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Enter barcode number</label>
              <input autoFocus type="text" inputMode="numeric" value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleManualLookup()}
                placeholder="e.g. 0123456789012"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl dark:bg-slate-800 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex gap-2">
                <button onClick={retry} className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium">Use camera</button>
                <button onClick={handleManualLookup} disabled={!manualCode.replace(/\D/g, "") || fetching}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {fetching ? <><Loader2 className="w-4 h-4 animate-spin" />Looking up…</> : "Look up"}
                </button>
              </div>
            </div>
          )}
          {result && (status === "found" || status === "not-found") && (
            <div className="p-4 space-y-3">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${status === "found" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"}`}>
                {status === "found" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <span>{status === "found" ? "Product found — confirm or edit before saving" : "Unknown product — fill in details and save"}</span>
              </div>
              <div className="space-y-2">
                <input type="text" value={result.name} onChange={e => setResult({ ...result, name: e.target.value })}
                  placeholder="Product name *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <input type="text" value={result.brand ?? ""} onChange={e => setResult({ ...result, brand: e.target.value })}
                  placeholder="Brand"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={result.category ?? ""} onChange={e => setResult({ ...result, category: e.target.value })}
                    placeholder="Category" className="px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" min="0" step="0.01" value={result.srp ?? ""}
                    onChange={e => setResult({ ...result, srp: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="SRP ($)" className="px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <p className="text-xs text-slate-400 px-1">Barcode: {result.barcode}{result.source && result.source !== "Manual" ? ` · ${result.source}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={retry} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <RefreshCw className="w-4 h-4" /> Scan another
                </button>
                <button disabled={!result.name.trim()} onClick={handleConfirm}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  Add to inventory
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
