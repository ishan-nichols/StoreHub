import { useState, useRef } from "react";
import {
  X, Camera, ImageUp, Loader2, Check, AlertTriangle,
  Package, Edit3, Barcode, ScanLine, PlusCircle,
} from "lucide-react";
import {
  scanReceipt, resolveFinalPrice,
  type ScannedDelivery, type ScannedDeliveryItem,
} from "../services/receiptScanService";
import { updatePrice, updateCost, marginPct, marginColor } from "../services/pricingService";
import { createProduct, updateProduct, createExpense, API_BASE_URL } from "../services/dataService";
import { useApp } from "../contexts/useApp";

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

export default function ReceiveDeliveryModal({ onClose, onComplete }: Props) {
  const { profile } = useApp();
  const symbol      = profile?.currencySymbol ?? "$";
  const cameraRef   = useRef<HTMLInputElement>(null);
  const galleryRef  = useRef<HTMLInputElement>(null);

  const [stage,       setStage]       = useState<"choose" | "scanning" | "review" | "saving">("choose");
  const [delivery,    setDelivery]    = useState<ScannedDelivery | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [dupWarning,  setDupWarning]  = useState<{ scannedAt: string; itemCount: number } | null>(null);
  const [editableDate,  setEditableDate]  = useState<string>("");
  const [editableTotal, setEditableTotal] = useState<string>("");
  const [expenseAdded,  setExpenseAdded]  = useState(false);
  const pendingDelivery = useRef<ScannedDelivery | null>(null);

  const MARKUP_KEY = "deliveryMarkupPct";
  const [markup, setMarkup] = useState<number>(() => {
    try { return Number(localStorage.getItem(MARKUP_KEY)) || 30; } catch { return 30; }
  });

  function withMarkup(d: ScannedDelivery, pct: number): ScannedDelivery {
    return {
      ...d,
      items: d.items.map((it) => ({
        ...it,
        srp: it.cost > 0 ? Math.round(it.cost * (1 + pct / 100) * 100) / 100 : it.srp,
      })),
    };
  }

  function handleMarkupChange(pct: number) {
    const safe = Math.max(0, Math.min(pct, 999));
    setMarkup(safe);
    try { localStorage.setItem(MARKUP_KEY, String(safe)); } catch {}
    if (delivery) setDelivery(withMarkup(delivery, safe));
  }

  // ─── Duplicate invoice detection ─────────────────────────────────────────────

  function invoiceFingerprint(delivery: ScannedDelivery): string {
    const baseNames = delivery.items
      .map((i) => i.name.replace(/\s+single$/i, "").toLowerCase().trim())
      .filter((n, idx, arr) => arr.indexOf(n) === idx)
      .sort();
    return baseNames.join("|");
  }

  function checkDuplicate(delivery: ScannedDelivery): { scannedAt: string; itemCount: number } | null {
    try {
      const key = "recentInvoiceScans";
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
        fingerprint: string; scannedAt: string; itemCount: number;
      }>;
      const fp = invoiceFingerprint(delivery);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return stored.find(
        (s) => s.fingerprint === fp && new Date(s.scannedAt).getTime() > cutoff,
      ) ?? null;
    } catch { return null; }
  }

  function recordScan(delivery: ScannedDelivery) {
    try {
      const key = "recentInvoiceScans";
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
        fingerprint: string; scannedAt: string; itemCount: number;
      }>;
      const fp = invoiceFingerprint(delivery);
      const next = [
        { fingerprint: fp, scannedAt: new Date().toISOString(), itemCount: delivery.items.length },
        ...stored.filter((s) => s.fingerprint !== fp),
      ].slice(0, 20);
      localStorage.setItem(key, JSON.stringify(next));
    } catch { /* ignore */ }
  }

  // ─── File handler ───────────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);
    setStage("scanning");
    try {
      const result = await scanReceipt(file);
      if (result.items.length === 0) {
        setError("No items could be read from this image. Try a clearer photo.");
        setStage("choose");
        return;
      }
      const dup = checkDuplicate(result);
      if (dup) {
        pendingDelivery.current = result;
        setDupWarning(dup);
        setStage("choose");
        return;
      }
      setEditableDate(result.date ?? "");
      setExpenseAdded(false);
      const lineSum = result.items.reduce((s, i) => s + (i.totalCost ?? 0), 0);
      setEditableTotal((result.invoiceTotal ?? lineSum).toFixed(2));
      setDelivery(withMarkup(result, markup));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan receipt");
      setStage("choose");
    }
  }

  function proceedAnyway() {
    if (!pendingDelivery.current) return;
    recordScan(pendingDelivery.current);
    setEditableDate(pendingDelivery.current.date ?? "");
    setExpenseAdded(false);
    const lineSum = pendingDelivery.current.items.reduce((s, i) => s + (i.totalCost ?? 0), 0);
    setEditableTotal((pendingDelivery.current.invoiceTotal ?? lineSum).toFixed(2));
    setDelivery(withMarkup(pendingDelivery.current, markup));
    pendingDelivery.current = null;
    setDupWarning(null);
    setStage("review");
  }

  // ─── Add to Expenses ─────────────────────────────────────────────────────────

  async function handleAddToExpenses() {
    const amount = parseFloat(editableTotal);
    if (!amount || amount <= 0) return;
    const date = editableDate || new Date().toISOString().split("T")[0];
    await createExpense({
      description: delivery?.supplierName
        ? `Supplier Delivery — ${delivery.supplierName}`
        : "Supplier Delivery",
      amount,
      category: "Supplier Delivery",
      date,
    });
    setExpenseAdded(true);
  }

  function cancelDup() {
    pendingDelivery.current = null;
    setDupWarning(null);
  }

  // ─── Item patching ──────────────────────────────────────────────────────────

  function patchItem(tempId: number, patch: Partial<ScannedDeliveryItem>) {
    if (!delivery) return;
    setDelivery({
      ...delivery,
      items: delivery.items.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)),
    });
  }

  // ─── Confirm ────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!delivery) return;
    setStage("saving");
    recordScan(delivery);
    const items = delivery.items.filter((i) => i.selected);

    const matchedGroups = new Map<string, ScannedDeliveryItem[]>();
    const newItems: ScannedDeliveryItem[] = [];

    for (const it of items) {
      if (it.matchedProduct) {
        const id  = it.matchedProduct.id;
        const arr = matchedGroups.get(id) ?? [];
        arr.push(it);
        matchedGroups.set(id, arr);
      } else {
        newItems.push(it);
      }
    }

    for (const [productId, group] of matchedGroups) {
      const product  = group[0].matchedProduct!;
      const totalQty = group.reduce((s, g) => s + g.quantity, 0);
      const latest   = group[group.length - 1];
      await updateProduct(productId, {
        quantity: product.quantity + totalQty,
        srp: latest.srp ?? product.srp,
        ...(latest.upc && !product.barcode ? { barcode: latest.upc } : {}),
      });
      if (latest.cost > 0 && latest.cost !== (product.costPrice ?? 0)) {
        await updateCost(productId, latest.cost, "Cost from delivery receipt");
      }
      const finalPrice = resolveFinalPrice(latest);
      if (finalPrice != null && finalPrice !== product.price) {
        await updatePrice(productId, finalPrice, { reason: "Receipt — accepted suggestion" });
      }
    }

    for (const item of newItems) {
      const startingPrice = resolveFinalPrice(item) ?? item.srp ?? Number((item.cost * 1.3).toFixed(2));
      await createProduct({
        name:              item.name,
        sku:               item.upc ?? "",
        category:          item.category,
        price:             startingPrice,
        quantity:          item.quantity,
        lowStockThreshold: 5,
        supplierId:        null,
        unit:              item.unit,
        tags:              [],
        barcode:           item.upc,
        costPrice:         item.cost,
        srp:               item.srp ?? undefined,
      });
    }

    setStage("review");
    onComplete();
    onClose();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            <h2 className="font-semibold">Receive Delivery</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Choose ─────────────────────────────────────────────────────────── */}
        {stage === "choose" && (
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Duplicate invoice warning */}
            {dupWarning && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                      This invoice looks like it was already scanned
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {dupWarning.itemCount} items · scanned{" "}
                      {new Date(dupWarning.scannedAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={proceedAnyway}
                    className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                  >
                    Proceed anyway
                  </button>
                  <button
                    onClick={cancelDup}
                    className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Snap a photo or upload your supplier invoice. Every line will be extracted, multi-packs automatically split into bulk and single-unit entries, and everything matched to your inventory.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 bg-emerald-600 text-white py-5 rounded-xl font-medium hover:bg-emerald-700"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm">Take Photo</span>
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300 py-5 rounded-xl font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                <ImageUp className="w-6 h-6" />
                <span className="text-sm">Upload from Camera Roll</span>
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
            <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleFile} />
          </div>
        )}

        {/* ── Scanning ───────────────────────────────────────────────────────── */}
        {stage === "scanning" && (
          <div className="p-12 text-center text-slate-600 dark:text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            <p className="font-medium">Reading your receipt…</p>
            <p className="text-sm mt-1 text-slate-400">Extracting every line, splitting multi-packs, matching inventory</p>
          </div>
        )}

        {/* ── Saving ─────────────────────────────────────────────────────────── */}
        {stage === "saving" && (
          <div className="p-12 text-center text-slate-600 dark:text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            Updating inventory &amp; syncing prices…
          </div>
        )}

        {/* ── Review ─────────────────────────────────────────────────────────── */}
        {stage === "review" && delivery && (
          <>
            {/* ── Item count banner ──────────────────────────────────────────── */}
            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/30 shrink-0">
              <p className="text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                {delivery.items.length} {delivery.items.length === 1 ? "item" : "items"} detected
                <span className="font-normal text-emerald-600 dark:text-emerald-400 ml-2">
                  — uncheck anything that looks wrong, then confirm
                </span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

              {/* Delivery metadata bar */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 space-y-2">
                {delivery.supplierName && (
                  <p className="text-sm"><span className="font-semibold text-slate-700 dark:text-slate-300">Supplier:</span> {delivery.supplierName}</p>
                )}

                {/* Delivery Date — editable */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">Delivery Date:</span>
                  <input
                    type="date"
                    value={editableDate}
                    onChange={(e) => setEditableDate(e.target.value)}
                    className="text-sm border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                  {!editableDate && (
                    <span className="text-xs text-slate-400 italic">not found on receipt</span>
                  )}
                </div>

                {/* Markup % — auto-calculates SRP for all items */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">Markup %:</span>
                  <input
                    type="number" min="0" max="999" step="1"
                    value={markup}
                    onChange={(e) => handleMarkupChange(Number(e.target.value) || 0)}
                    className="w-20 text-sm border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                  <span className="text-xs text-slate-400">SRP auto-set to cost × {(1 + markup / 100).toFixed(2)}</span>
                </div>

                {/* Invoice Total + Add to Expenses — always visible */}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">Invoice Total:</span>
                    <span className="text-slate-500 text-sm shrink-0">{symbol}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editableTotal}
                      onChange={(e) => { setEditableTotal(e.target.value); setExpenseAdded(false); }}
                      className="w-24 text-sm font-semibold text-emerald-700 dark:text-emerald-400 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 bg-white dark:bg-slate-800"
                    />
                    {delivery.invoiceTotal == null && (
                      <span className="text-xs text-slate-400 italic">from line items</span>
                    )}
                  </div>
                  {expenseAdded ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <Check className="w-3.5 h-3.5" /> Added to Expenses
                    </span>
                  ) : (
                    <button
                      onClick={handleAddToExpenses}
                      disabled={!editableTotal || parseFloat(editableTotal) <= 0}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add to Expenses
                    </button>
                  )}
                </div>
              </div>

              {/* ── Summary counts ──────────────────────────────────────────── */}
              <ReviewSummary delivery={delivery} />

              {/* ── Items ──────────────────────────────────────────────────── */}
              {delivery.items.map((item) => (
                <ItemCard
                  key={item.tempId}
                  item={item}
                  symbol={symbol}
                  patchItem={patchItem}
                  apiBase={API_BASE_URL}
                />
              ))}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 gap-2">
              <button
                onClick={() => { setDelivery(null); setStage("choose"); }}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
              >
                Discard
              </button>
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {delivery.items.filter((i) => i.selected).length} of {delivery.items.length} selected
                </p>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-1.5 text-sm"
                >
                  <Check className="w-4 h-4" /> Confirm delivery
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Review summary bar ───────────────────────────────────────────────────────

function ReviewSummary({ delivery }: { delivery: ScannedDelivery }) {
  const all       = delivery.items;
  const matched   = all.filter((i) => i.matchedProduct).length;
  const newItems  = all.filter((i) => !i.matchedProduct && !i.isAmbiguous).length;
  const ambiguous = all.filter((i) => i.isAmbiguous).length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Scan summary</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Pill color="slate" label="Detected" value={all.length} />
        <Pill color="emerald" label="Matched inventory" value={matched} />
        <Pill color="blue" label="New items" value={newItems} />
        {ambiguous > 0 && (
          <Pill color="amber" label="Review needed" value={ambiguous} />
        )}
      </div>
      {delivery.totalRawCount !== all.length && (
        <p className="text-xs text-slate-400 mt-2">
          {delivery.totalRawCount} lines on receipt · {all.length} items returned by scan
        </p>
      )}
    </div>
  );
}

function Pill({ color, label, value }: { color: "slate" | "emerald" | "blue" | "amber"; label: string; value: number }) {
  const colors: Record<string, string> = {
    slate:   "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    blue:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    amber:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color]}`}>
      {value} {label}
    </span>
  );
}

// ─── Individual item card ─────────────────────────────────────────────────────

interface ItemCardProps {
  item: ScannedDeliveryItem;
  symbol: string;
  apiBase: string;
  patchItem: (id: number, patch: Partial<ScannedDeliveryItem>) => void;
}

function ItemCard({ item, symbol, apiBase, patchItem }: ItemCardProps) {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [bcState,       setBcState]      = useState<"idle" | "scanning" | "done" | "manual">("idle");
  const [manualBarcode, setManualBarcode] = useState("");

  async function handleBarcodeCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBcState("scanning");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      const [header, base64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      const res = await fetch(`${apiBase}/api/vision/barcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const data = await res.json() as { upc?: string | null };
      if (data.upc) {
        patchItem(item.tempId, { upc: data.upc });
        setBcState("done");
      } else {
        setBcState("manual");
      }
    } catch {
      setBcState("manual");
    }
  }

  function saveManualBarcode() {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    patchItem(item.tempId, { upc: trimmed });
    setBcState("done");
  }

  const finalPrice = resolveFinalPrice(item) ?? item.currentPrice ?? 0;
  const margin     = item.cost > 0 ? marginPct(finalPrice, item.cost) : 0;
  const color      = marginColor(margin);

  const borderClass = item.selected
    ? item.isAmbiguous
      ? "border-amber-300 dark:border-amber-700"
      : item.isSingleDerived
        ? "border-blue-200 dark:border-blue-800"
        : "border-emerald-300 dark:border-emerald-700"
    : "border-slate-200 dark:border-slate-700 opacity-60";

  return (
    <div className={`border rounded-xl p-3 ${borderClass}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={item.selected}
          onChange={(e) => patchItem(item.tempId, { selected: e.target.checked })}
          className="mt-1 accent-emerald-600"
        />
        <div className="flex-1 min-w-0">

          {/* Name row + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={item.name}
              onChange={(e) => patchItem(item.tempId, { name: e.target.value })}
              className="font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none px-0.5 min-w-0"
            />

            {/* Barcode attachment button */}
            <input
              ref={barcodeInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleBarcodeCapture}
            />
            {bcState === "idle" && (
              <button
                title={item.upc ? `Barcode: ${item.upc} — retake` : "Attach barcode"}
                onClick={() => barcodeInputRef.current?.click()}
                className={`p-1 rounded-md shrink-0 ${
                  item.upc
                    ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Barcode className="w-4 h-4" />
              </button>
            )}
            {bcState === "scanning" && (
              <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading…
              </span>
            )}
            {bcState === "done" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 shrink-0">
                <Check className="w-3.5 h-3.5" /> {item.upc}
              </span>
            )}
            {bcState === "manual" && (
              <span className="flex items-center gap-1 shrink-0">
                <ScanLine className="w-3.5 h-3.5 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveManualBarcode()}
                  placeholder="Type barcode…"
                  className="text-xs border border-slate-300 rounded px-1.5 py-0.5 w-28 dark:bg-slate-800 dark:border-slate-600"
                />
                <button
                  onClick={saveManualBarcode}
                  className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700"
                >
                  Save
                </button>
              </span>
            )}

            {/* Single-unit badge */}
            {item.isSingleDerived && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">
                single unit
              </span>
            )}

            {/* Inventory match badges */}
            {item.matchedProduct && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
                item.matchConfidence === "high"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
              }`}>
                {item.matchConfidence === "high" ? "Matched" : "Possible match"} ({item.matchType})
              </span>
            )}
            {!item.matchedProduct && !item.isAmbiguous && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">New</span>
            )}

            {/* Cost change badge */}
            {item.costChanged && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1 shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Cost {item.costDelta && item.costDelta > 0 ? "↑" : "↓"} {symbol}{Math.abs(item.costDelta ?? 0).toFixed(2)}
              </span>
            )}

            {/* Ambiguous flag */}
            {item.isAmbiguous && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1 shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Review — may not be a product
              </span>
            )}
          </div>

          {/* Qty / Cost / SRP row */}
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
            <Field label="Qty">
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => patchItem(item.tempId, { quantity: Number(e.target.value) })}
                className="w-full px-2 py-1 border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700"
              />
            </Field>
            <Field label={`Cost ${symbol}`}>
              <input
                type="number" step="0.01"
                value={item.cost}
                onChange={(e) => patchItem(item.tempId, { cost: Number(e.target.value) })}
                className="w-full px-2 py-1 border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700"
              />
            </Field>
            <Field label={`SRP ${symbol} (auto)`}>
              <input
                type="number" step="0.01"
                value={item.srp ?? ""}
                placeholder="—"
                onChange={(e) => patchItem(item.tempId, { srp: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-2 py-1 border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700"
              />
            </Field>
          </div>

          {/* Price action panel */}
          {!item.isAmbiguous && (item.srp || item.suggestedPrice) && (
            <div className="mt-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-2 space-y-1.5">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {item.srp
                  ? `Auto SRP is ${symbol}${item.srp.toFixed(2)}.`
                  : `Cost change suggests new price ${symbol}${item.suggestedPrice?.toFixed(2)}.`}
                {item.currentPrice != null && (
                  <> Current: <strong>{symbol}{item.currentPrice.toFixed(2)}</strong>.</>
                )}
                {item.matchConfidence === "low" && (
                  <span className="ml-1 text-yellow-700 dark:text-yellow-400">(Confirm the match before updating price.)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {item.srp && (
                  <ActionChip active={item.priceAction === "update_to_srp"} onClick={() => patchItem(item.tempId, { priceAction: "update_to_srp" })}>
                    Match SRP {symbol}{item.srp.toFixed(2)}
                  </ActionChip>
                )}
                {item.suggestedPrice && (
                  <ActionChip active={item.priceAction === "update_to_suggested"} onClick={() => patchItem(item.tempId, { priceAction: "update_to_suggested" })}>
                    Auto-margin {symbol}{item.suggestedPrice.toFixed(2)}
                  </ActionChip>
                )}
                <ActionChip active={item.priceAction === "keep"} onClick={() => patchItem(item.tempId, { priceAction: "keep" })}>
                  Keep current
                </ActionChip>
                <ActionChip
                  active={item.priceAction === "custom"}
                  onClick={() => patchItem(item.tempId, { priceAction: "custom", customPrice: item.customPrice ?? item.currentPrice ?? item.srp ?? 0 })}
                >
                  <Edit3 className="w-3 h-3 inline mr-1" /> Custom
                </ActionChip>
                {item.priceAction === "custom" && (
                  <input
                    type="number" step="0.01" value={item.customPrice ?? 0}
                    onChange={(e) => patchItem(item.tempId, { customPrice: Number(e.target.value) })}
                    className="w-20 px-2 py-0.5 border border-slate-300 rounded dark:bg-slate-800"
                  />
                )}
              </div>
              {item.cost > 0 && finalPrice > 0 && (
                <p className={`text-xs ${color === "green" ? "text-emerald-700" : color === "yellow" ? "text-amber-700" : "text-red-700"}`}>
                  Final price {symbol}{finalPrice.toFixed(2)} → margin {margin.toFixed(1)}%
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function ActionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-full border ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white text-slate-700 border-slate-300 hover:border-emerald-400 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600"
      }`}
    >
      {children}
    </button>
  );
}
