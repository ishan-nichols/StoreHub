import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronRight, MessageCircle, RefreshCw,
  Sparkles, ThumbsUp, Trash2, Trophy, X,
} from "lucide-react";
import {
  type SmartTip,
  getCachedTips, generateTips, markTipDone, dismissTip,
  markTipProvenRight, tipsAge,
} from "../services/tipsService";
import TipChatModal from "./TipChatModal";

// ─── Urgency config ───────────────────────────────────────────────────────────

const URGENCY = {
  critical: { label: "Critical",  bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500"    },
  high:     { label: "High",      bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500"  },
  medium:   { label: "Medium",    bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500"   },
  low:      { label: "Low",       bg: "bg-stone-50",  border: "border-stone-200",  text: "text-stone-600",  dot: "bg-stone-400"  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmartTipsWidget() {
  const [tips, setTips]             = useState<SmartTip[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [chatTip, setChatTip]       = useState<SmartTip | null>(null);
  const [showAll, setShowAll]       = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const loadTips = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateTips(force);
      setTips(result);
      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
      // Fall back to cached if available
      const cached = getCachedTips();
      if (cached) setTips(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount — use cache first, then generate in background
  useEffect(() => {
    const cached = getCachedTips();
    if (cached) {
      setTips(cached);
      setLastRefreshed(tipsAge());
    } else {
      loadTips(false);
    }
  }, [loadTips]);

  function handleDone(tip: SmartTip) {
    markTipDone(tip.id);
    setTips(prev => prev?.map(t => t.id === tip.id ? { ...t, status: "done" } : t) ?? null);
  }

  function handleDismiss(tip: SmartTip) {
    dismissTip(tip.id);
    setTips(prev => prev?.map(t => t.id === tip.id ? { ...t, status: "dismissed" } : t) ?? null);
  }

  function handleProvenRight(tip: SmartTip) {
    markTipProvenRight(tip.id);
    setTips(prev => prev?.map(t => t.id === tip.id ? { ...t, provenRight: true } : t) ?? null);
  }

  const activeTips   = tips?.filter(t => t.status !== "dismissed") ?? [];
  const displayTips  = showAll ? activeTips : activeTips.slice(0, 3);
  const doneTips     = activeTips.filter(t => t.status === "done");
  const provenTips   = activeTips.filter(t => t.provenRight);

  if (loading && !tips) {
    return (
      <div className="glass-panel rounded-[28px] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-900">Smart Tips</h3>
            <p className="text-xs text-stone-400">Analyzing your store…</p>
          </div>
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="glass-panel rounded-[28px] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm shadow-violet-200">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Smart Tips</h3>
              {lastRefreshed && (
                <p className="text-xs text-stone-400">Updated {tipsAge() ?? "just now"}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {provenTips.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                <Trophy size={11} /> {provenTips.length} win{provenTips.length > 1 ? "s" : ""}
              </div>
            )}
            <button
              onClick={() => loadTips(true)}
              disabled={loading}
              title="Refresh tips"
              className="flex h-8 w-8 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && !tips && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Couldn't generate tips</p>
              <p className="text-xs mt-0.5 text-red-500">{error}</p>
            </div>
          </div>
        )}

        {/* Done count banner */}
        {doneTips.length > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 font-medium">
            <CheckCircle2 size={13} />
            {doneTips.length} tip{doneTips.length > 1 ? "s" : ""} completed today — great work!
          </div>
        )}

        {/* Tip cards */}
        <div className="space-y-3">
          {displayTips.map(tip => (
            <TipCard
              key={tip.id}
              tip={tip}
              onDone={() => handleDone(tip)}
              onDismiss={() => handleDismiss(tip)}
              onChat={() => setChatTip(tip)}
              onProvenRight={() => handleProvenRight(tip)}
            />
          ))}
        </div>

        {/* Show more / fewer */}
        {activeTips.length > 3 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors py-1"
          >
            {showAll ? "Show fewer" : `Show ${activeTips.length - 3} more`}
            <ChevronRight size={12} className={`transition-transform ${showAll ? "rotate-90" : ""}`} />
          </button>
        )}

        {/* Empty state */}
        {!loading && activeTips.length === 0 && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-sm font-semibold text-stone-700">You're all caught up!</p>
            <p className="text-xs text-stone-400 mt-1">Check back tomorrow for new tips.</p>
          </div>
        )}
      </div>

      {/* Chat modal */}
      {chatTip && (
        <TipChatModal tip={chatTip} onClose={() => setChatTip(null)} />
      )}
    </>
  );
}

// ─── TipCard ──────────────────────────────────────────────────────────────────

function TipCard({ tip, onDone, onDismiss, onChat, onProvenRight }: {
  tip: SmartTip;
  onDone: () => void;
  onDismiss: () => void;
  onChat: () => void;
  onProvenRight: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const u = URGENCY[tip.urgency] ?? URGENCY.medium;
  const isDone = tip.status === "done";

  return (
    <div className={`rounded-2xl border p-4 transition-all ${u.bg} ${u.border} ${isDone ? "opacity-60" : ""}`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">{tip.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-bold ${isDone ? "line-through text-stone-400" : "text-stone-900"}`}>
                {tip.title}
              </p>
              {tip.provenRight && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                  <Trophy size={9} /> Claude was right!
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60 ${u.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${u.dot}`} />
                {u.label}
              </span>
              <button onClick={onDismiss} className="p-1 rounded-full text-stone-300 hover:text-stone-500 transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Impact badge */}
          {tip.estimatedImpact && (
            <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/70 text-stone-600">
              {tip.estimatedImpact}
            </span>
          )}
        </div>
      </div>

      {/* Expandable explanation */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left mt-2.5"
      >
        <p className={`text-xs text-stone-600 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          {tip.explanation}
        </p>
        {!expanded && (
          <span className="text-[10px] text-stone-400 hover:text-stone-600">tap to read more</span>
        )}
      </button>

      {/* Action */}
      {expanded && (
        <div className="mt-2.5 p-2.5 rounded-xl bg-white/70 border border-white/80">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Action</p>
          <p className="text-xs font-semibold text-stone-800">{tip.action}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        {!isDone ? (
          <button
            onClick={onDone}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors"
          >
            <CheckCircle2 size={12} /> Done
          </button>
        ) : (
          <button
            onClick={onProvenRight}
            disabled={tip.provenRight}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <ThumbsUp size={12} /> {tip.provenRight ? "Proved right ✓" : "Claude was right!"}
          </button>
        )}
        <button
          onClick={onChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white border border-stone-200 text-stone-600 text-xs font-semibold transition-colors"
        >
          <MessageCircle size={12} /> Ask why
        </button>
        {isDone && (
          <button onClick={onDismiss} className="ml-auto p-1.5 rounded-xl text-stone-300 hover:text-stone-500 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
