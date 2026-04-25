import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Volume2 } from "lucide-react";
import { getSales, getProducts, getLowStockProducts, API_BASE_URL } from "../services/dataService";

// ─── Speech Recognition Types ─────────────────────────────────────────────────

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: ISpeechRecognitionConstructor;
    webkitSpeechRecognition: ISpeechRecognitionConstructor;
  }
}

type VoiceState = "idle" | "listening" | "processing" | "speaking";

const SUGGESTED_QUESTIONS = [
  "How much today?",
  "Low stock alerts?",
  "Top sellers this week?",
  "My profit today?",
];

// ─── Store Data Collector ─────────────────────────────────────────────────────

async function collectVoiceStoreData() {
  try {
    const [sales, products, lowStock] = await Promise.all([
      getSales(),
      getProducts(),
      getLowStockProducts(),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySales = sales.filter(s => new Date(s.createdAt) >= today);
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);

    const last5Sales = sales.slice(0, 5).map(s => ({
      total: s.total,
      items: s.items.map(i => `${i.productName} x${i.quantity}`).join(", "),
      time: s.createdAt,
    }));

    // Weekly top sellers
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekSales = sales.filter(s => new Date(s.createdAt) >= weekAgo);
    const itemCounts: Record<string, number> = {};
    for (const sale of weekSales) {
      for (const item of sale.items) {
        itemCounts[item.productName] = (itemCounts[item.productName] ?? 0) + item.quantity;
      }
    }
    const topSellers = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    return {
      todayRevenue,
      todaySalesCount: todaySales.length,
      last5Sales,
      productCount: products.length,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.slice(0, 3).map(p => ({ name: p.name, quantity: p.quantity })),
      topSellersThisWeek: topSellers,
    };
  } catch {
    return { error: "Could not load store data" };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceButton() {
  const [state, setState] = useState<VoiceState>("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChips, setShowChips] = useState(false);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setSupported(false);
    }
  }, []);

  // Close popup on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowChips(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function sendQuestion(question: string) {
    setState("processing");
    setAnswer(null);
    setError(null);

    try {
      const storeData = await collectVoiceStoreData();
      const authToken = localStorage.getItem("storehub_auth_token") ?? sessionStorage.getItem("storehub_auth_token") ?? "";

      const response = await fetch(`${API_BASE_URL}/api/voice/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ question, storeData }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Server error" })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }

      const { answer: responseAnswer } = await response.json() as { answer: string };
      setAnswer(responseAnswer);
      setState("speaking");

      // Speak the answer
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(responseAnswer);
        utt.rate = 1.0;
        utt.pitch = 1.0;
        utt.onend = () => setState("idle");
        utt.onerror = () => setState("idle");
        synthRef.current = utt;
        window.speechSynthesis.speak(utt);
      } else {
        setTimeout(() => setState("idle"), 3000);
      }
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  function startListening() {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError("Voice not supported in this browser");
      return;
    }

    // Stop any ongoing speech
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    const recognition = new SpeechRec();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    setState("listening");
    setAnswer(null);
    setError(null);

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        void sendQuestion(transcript.trim());
      } else {
        setState("idle");
      }
    };

    recognition.onerror = () => {
      setError("Could not understand. Try again.");
      setState("idle");
    };

    recognition.onend = () => {
      if (state === "listening") setState("idle");
    };

    recognition.start();
  }

  function handleMicClick() {
    if (state === "listening") {
      recognitionRef.current?.stop();
      setState("idle");
      return;
    }
    if (state === "speaking") {
      window.speechSynthesis?.cancel();
      setState("idle");
      return;
    }
    if (state === "idle") {
      setShowChips(prev => !prev);
    }
  }

  function handleChipClick(q: string) {
    setShowChips(false);
    void sendQuestion(q);
  }

  if (!supported) {
    return (
      <div className="fixed bottom-24 right-6 z-50">
        <div className="rounded-2xl bg-stone-800 px-3 py-2 text-xs text-white/60 shadow-lg">
          Voice not supported
        </div>
      </div>
    );
  }

  // Button appearance
  const btnClass = state === "listening"
    ? "bg-red-500 shadow-red-200 animate-pulse"
    : state === "processing"
    ? "bg-stone-700"
    : state === "speaking"
    ? "bg-emerald-600"
    : "bg-stone-800 hover:bg-stone-700";

  const icon =
    state === "processing" ? (
      <Loader2 size={22} className="animate-spin text-white" />
    ) : state === "speaking" ? (
      <Volume2 size={22} className="text-white" />
    ) : (
      <Mic size={22} className="text-white" />
    );

  return (
    <div className="fixed bottom-24 right-6 z-50" ref={popupRef}>
      {/* Answer / error popup */}
      {(answer || error) && (
        <div className="mb-3 max-w-[260px] rounded-[20px] bg-stone-900 px-4 py-3 text-sm text-white shadow-xl">
          {error ? (
            <p className="text-red-300">{error}</p>
          ) : (
            <p className="leading-relaxed">{answer}</p>
          )}
          <button
            type="button"
            onClick={() => { setAnswer(null); setError(null); }}
            className="mt-2 text-xs text-white/40 hover:text-white/70 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Suggested question chips */}
      {showChips && state === "idle" && (
        <div className="mb-3 flex flex-col gap-1.5">
          {SUGGESTED_QUESTIONS.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => handleChipClick(q)}
              className="rounded-full bg-white px-4 py-2 text-xs font-medium text-stone-800 shadow-md ring-1 ring-stone-200 transition hover:bg-stone-50 hover:ring-stone-300 text-right"
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            onClick={startListening}
            className="mt-1 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white shadow-md transition hover:bg-stone-800 text-right"
          >
            Speak a question
          </button>
        </div>
      )}

      {/* Processing popup */}
      {state === "processing" && (
        <div className="mb-3 rounded-[16px] bg-stone-800 px-4 py-2.5 text-xs text-white/70 shadow-lg">
          Thinking…
        </div>
      )}

      {state === "listening" && (
        <div className="mb-3 rounded-[16px] bg-red-600 px-4 py-2.5 text-xs text-white shadow-lg">
          Listening… (tap to stop)
        </div>
      )}

      {/* Main mic button */}
      <button
        type="button"
        onClick={handleMicClick}
        title={
          state === "idle" ? "Ask a question"
          : state === "listening" ? "Stop listening"
          : state === "speaking" ? "Stop speaking"
          : "Processing…"
        }
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${btnClass}`}
      >
        {icon}
      </button>
    </div>
  );
}
