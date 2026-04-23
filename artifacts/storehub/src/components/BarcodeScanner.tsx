/**
 * BarcodeScanner.tsx — Hybrid scanner for maximum speed + robustness.
 *
 * Primary:  html5-qrcode client-side decoder (no network, ~instant).
 * Fallback: Claude Vision API (catches difficult/partial barcodes).
 *
 * Every 300 ms the current camera frame is decoded client-side.
 * If 4 consecutive frames fail (barcode unclear), a Claude Vision
 * request is also fired in the background every 2 s.
 * Whichever reads the barcode first wins and stops everything.
 */

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  X, Loader2, CheckCircle2, AlertCircle,
  Keyboard, RefreshCw, ShieldAlert, ZapOff,
} from "lucide-react";
import { lookupBarcode, type BarcodeProductInfo } from "../services/barcodeService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose:  () => void;
  onResult: (info: BarcodeProductInfo, isManualEntry: boolean) => void;
}

type Status =
  | "starting" | "scanning"
  | "found"    | "not-found"
  | "timeout"  | "permission-denied" | "no-camera" | "error" | "manual";

const LOCAL_INTERVAL_MS  = 300;   // client-side decode: very fast, try often
const CLAUDE_INTERVAL_MS = 2000;  // Claude fallback: only when local decode fails
const LOCAL_FAIL_BEFORE_CLAUDE = 4; // how many local failures before Claude kicks in
const TIMEOUT_MS = 15_000;

// ─── Component ────────────────────────────────────────────────────────────────

export default function BarcodeScanner({ onClose, onResult }: Props) {
  const [status,     setStatus]     = useState<Status>("starting");
  const [fetching,   setFetching]   = useState(false);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [result,     setResult]     = useState<BarcodeProductInfo | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [retryKey,   setRetryKey]   = useState(0);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const decoderRef  = useRef<Html5Qrcode | null>(null);

  // ── Camera lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "manual") return;

    let mounted = true;
    setStatus("starting");

    // Html5Qrcode needs a real DOM element — give it a hidden one
    const el = document.createElement("div");
    el.id = `qr-worker-${Date.now()}`;
    el.style.display = "none";
    document.body.appendChild(el);
    const decoder = new Html5Qrcode(el.id, { verbose: false });
    decoderRef.current = decoder;

    (async () => {
      try {
        const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (!md?.getUserMedia) {
          if (!mounted) return;
          const secure =
            typeof globalThis !== "undefined" &&
            "isSecureContext" in globalThis &&
            (globalThis as { isSecureContext?: boolean }).isSecureContext === false;
          setStatus(secure ? "error" : "no-camera");
          setErrorMsg(
            secure
              ? "Camera requires a secure context (HTTPS). Open StoreHub over HTTPS or use manual entry."
              : "This browser does not expose camera APIs (mediaDevices). Use manual entry or a supported browser.",
          );
          return;
        }
        const stream = await md.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (mounted) setStatus("scanning");
      } catch (err) {
        if (!mounted) return;
        const s = classifyError(err);
        setStatus(s);
        if (s === "error") setErrorMsg(friendlyMsg(err));
      }
    })();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      try { decoder.clear(); } catch { /* ok */ }
      decoderRef.current = null;
      document.body.removeChild(el);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // ── Scan loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "scanning") return;

    let mounted       = true;
    let claudeSending = false;
    let localFails    = 0;
    let done          = false;

    // Claude UPC lookup — camera stays live, result slides in when ready
    async function handleUPC(upc: string) {
      if (done || !mounted) return;
      done = true;
      setFetching(true);
      const info = await lookupBarcode(upc).catch(() => null);
      if (!mounted) return;
      setFetching(false);
      if (info) {
        setResult(info);
        setStatus("found");
      } else {
        setResult({ barcode: upc, name: "", source: "Manual" });
        setStatus("not-found");
      }
    }

    // ── Fast path: html5-qrcode reads barcode → exact DB lookup ──────────
    const localId = setInterval(async () => {
      if (done || !mounted) return;
      const frame = captureFrameFile(videoRef.current, canvasRef.current);
      if (!frame) return;

      try {
        const decoded = await decoderRef.current?.scanFileV2(await frame, false);
        if (decoded?.decodedText) {
          const upc = decoded.decodedText.replace(/\D/g, "");
          if (upc.length >= 8) {
            clearInterval(localId);
            clearInterval(claudeId);
            await handleUPC(upc);
            return;
          }
        }
        localFails++;
      } catch { localFails++; }
    }, LOCAL_INTERVAL_MS);

    // ── Fallback: Claude Vision reads barcode digits only, then DB lookup ─
    const claudeId = setInterval(async () => {
      if (done || !mounted || claudeSending || localFails < LOCAL_FAIL_BEFORE_CLAUDE) return;
      const b64 = captureFrameB64(videoRef.current, canvasRef.current);
      if (!b64) return;
      claudeSending = true;
      try {
        const { API_BASE_URL: base } = await import("../services/dataService");
        const res = await fetch(`${base}/api/vision/barcode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: b64, mimeType: "image/jpeg" }),
        });
        if (!mounted || done) return;
        const data = (await res.json()) as { upc?: string | null };
        if (data.upc) {
          clearInterval(claudeId);
          await handleUPC(data.upc);
        }
      } catch { /* keep trying */ }
      finally { claudeSending = false; }
    }, CLAUDE_INTERVAL_MS);

    // ── Timeout ───────────────────────────────────────────────────────────
    const timeoutId = setTimeout(() => {
      if (mounted && !done) setStatus("timeout");
    }, TIMEOUT_MS);

    return () => {
      mounted = false;
      clearInterval(localId);
      clearInterval(claudeId);
      clearTimeout(timeoutId);
    };
  }, [status]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function retry() {
    setResult(null); setErrorMsg(null); setFetching(false);
    setRetryKey((k) => k + 1); setStatus("starting");
  }
  function switchToManual() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("manual");
  }
  async function handleManualLookup() {
    const code = manualCode.replace(/\D/g, "");
    if (!code) return;
    setFetching(true);
    const info = await lookupBarcode(code).catch(() => null);
    setFetching(false);
    if (info) { setResult(info); setStatus("found"); }
    else       { setResult({ barcode: code, name: "", source: "Manual" }); setStatus("not-found"); }
  }
  function handleConfirm() {
    if (result) onResult(result, status === "not-found" || status === "manual");
  }

  const cameraActive =
    status === "starting" || status === "scanning" || status === "timeout";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(calc(100% - 2px)); }
          100% { transform: translateY(0); }
        }
        .scan-line { animation: scanline 1.5s ease-in-out infinite; }
      `}</style>

      {/* Live video */}
      <video ref={videoRef} muted playsInline autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: cameraActive ? "block" : "none" }} />
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera overlay */}
      {cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />

          {/* Targeting box */}
          <div className="relative z-10" style={{ width: 280, height: 130 }}>
            <div className="absolute inset-0 border border-white/30 rounded-sm" />
            {/* corners */}
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
                <span className="text-white text-sm font-medium">Identifying…</span>
              </div>
            )}
          </div>

          {/* Label / timeout */}
          <div className="relative z-10 mt-4 text-center px-6">
            {status === "scanning" && !fetching && (
              <p className="text-white text-sm font-medium tracking-wide">Point at barcode</p>
            )}
            {status === "starting" && (
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Starting camera…
              </div>
            )}
            {status === "timeout" && (
              <div className="space-y-3 pointer-events-auto">
                <div className="flex items-start justify-center gap-2">
                  <ZapOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-white text-sm font-medium">
                    Could not find barcode — try moving closer or improving lighting
                  </p>
                </div>
                <button onClick={retry}
                  className="px-5 py-2 bg-emerald-500 text-white rounded-xl font-medium text-sm hover:bg-emerald-600 flex items-center gap-2 mx-auto">
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
            {fetching              ? "Got it — asking Claude…" :
             status === "scanning" ? "Scanning…" :
             status === "starting" ? "Starting…" :
             status === "timeout"  ? "No barcode" : "Scan Barcode"}
          </span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom bar while scanning */}
      {(status === "scanning" || status === "starting") && (
        <div className="relative z-20 mt-auto px-4 py-5 flex justify-center pointer-events-auto">
          <button onClick={switchToManual}
            className="text-white/70 hover:text-white text-sm flex items-center gap-1.5 bg-black/40 px-4 py-2 rounded-full">
            <Keyboard className="w-4 h-4" /> Type barcode instead
          </button>
        </div>
      )}

      {/* Non-camera states */}
      {!cameraActive && (
        <div className="relative z-20 mt-auto bg-white dark:bg-slate-900 rounded-t-3xl w-full max-h-[75vh] overflow-y-auto">

          {status === "permission-denied" && (
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl p-4">
                <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300 text-sm mb-1">Camera permission denied</p>
                  <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">Enable camera access in your device settings.</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide">iPhone / iPad (Safari)</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-slate-400 text-xs">
                    <li>Open <strong>Settings</strong> → <strong>Safari</strong></li>
                    <li>Tap <strong>Camera</strong> → <strong>Allow</strong></li>
                    <li>Return here and tap <strong>Try again</strong></li>
                  </ol>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-200 text-xs uppercase tracking-wide">Android (Chrome)</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-slate-400 text-xs">
                    <li>Tap the lock icon → <strong>Permissions</strong> → <strong>Camera</strong> → <strong>Allow</strong></li>
                    <li>Reload and tap <strong>Try again</strong></li>
                  </ol>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={retry} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700">Try again</button>
                <button onClick={switchToManual} className="w-full py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl font-medium text-sm">Enter barcode manually</button>
              </div>
            </div>
          )}

          {status === "no-camera" && (
            <div className="p-6 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-sm text-slate-700 dark:text-slate-300">No camera found on this device.</p>
              <button onClick={switchToManual} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700">Enter barcode manually</button>
            </div>
          )}

          {status === "error" && (
            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <p className="text-sm text-slate-700 dark:text-slate-300">{errorMsg ?? "Camera unavailable."}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={retry} className="w-full py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
                <button onClick={switchToManual} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700">Enter barcode manually</button>
              </div>
            </div>
          )}

          {status === "manual" && (
            <div className="p-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Enter barcode number</label>
              <input autoFocus type="text" inputMode="numeric"
                value={manualCode} onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                placeholder="e.g. 0123456789012"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl dark:bg-slate-800 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex gap-2">
                <button onClick={retry} className="flex-1 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium">Use camera</button>
                <button onClick={handleManualLookup} disabled={!manualCode.replace(/\D/g, "")}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  Look up
                </button>
              </div>
            </div>
          )}

          {result && (status === "found" || status === "not-found") && (
            <div className="p-4 space-y-3">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
                status === "found"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              }`}>
                {status === "found" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <span>{status === "found" ? "Product found — confirm or edit before saving" : "Product unknown — fill in details and save"}</span>
              </div>

              <div className="space-y-2">
                <input type="text" value={result.name} onChange={(e) => setResult({ ...result, name: e.target.value })}
                  placeholder="Product name *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <input type="text" value={result.brand ?? ""} onChange={(e) => setResult({ ...result, brand: e.target.value })}
                  placeholder="Brand"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={result.category ?? ""} onChange={(e) => setResult({ ...result, category: e.target.value })}
                    placeholder="Category"
                    className="px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" min="0" step="0.01"
                    value={result.srp ?? ""}
                    onChange={(e) => setResult({ ...result, srp: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="SRP ($)"
                    className="px-3 py-2 border border-slate-300 rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                {(result.size || result.description) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 px-1 leading-relaxed">{result.size ?? result.description}</p>
                )}
                <p className="text-xs text-slate-400 px-1">
                  Barcode: {result.barcode}
                  {result.source && result.source !== "Manual" ? ` · ${result.source}` : ""}
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={retry}
                  className="flex flex-1 items-center justify-center gap-1.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Capture frame as a File (for html5-qrcode.scanFileV2) */
async function captureFrameFile(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): Promise<File | null> {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return null;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], "frame.jpg", { type: "image/jpeg" }) : null);
    }, "image/jpeg", 0.85);
  });
}

/** Capture frame as base64 string (for Claude Vision) */
function captureFrameB64(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): string | null {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return null;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.split(",")[1] ?? null;
}

function classifyError(err: unknown): Status {
  const name = err instanceof DOMException ? err.name : "";
  const msg  = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (name === "NotAllowedError" || /permission|denied/i.test(msg)) return "permission-denied";
  if (name === "NotFoundError"   || /not found|no camera/i.test(msg)) return "no-camera";
  return "error";
}

function friendlyMsg(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotSupportedError") return "Camera requires HTTPS.";
    if (err.name === "NotReadableError")  return "Camera is in use by another app.";
    return err.message || "Camera unavailable.";
  }
  return (err instanceof Error ? err.message : String(err)) || "Camera unavailable.";
}
