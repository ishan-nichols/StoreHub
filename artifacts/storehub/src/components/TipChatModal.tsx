import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import type { SmartTip } from "../services/tipsService";
import { streamTipChat } from "../services/tipsService";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Why do you think this?",
  "How do I fix this?",
  "How much money could this save me?",
  "Is this urgent?",
  "What happens if I ignore this?",
];

export default function TipChatModal({ tip, onClose }: { tip: SmartTip; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `Hi! I'm here to help you understand this tip about **${tip.title}**. What would you like to know?` },
  ]);
  const [input, setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || streaming) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    await streamTipChat(
      tip,
      q,
      (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      },
      () => setStreaming(false),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-stone-100 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-0.5">Claude says</div>
            <p className="text-sm font-bold text-stone-900 leading-tight">{tip.title}</p>
            <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{tip.action}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shrink-0 mt-0.5 mr-2">
                  <Sparkles size={12} />
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-stone-900 text-white rounded-br-md"
                  : "bg-stone-50 border border-stone-100 text-stone-800 rounded-bl-md"
              }`}>
                {msg.content || (
                  <span className="flex gap-1 items-center text-stone-400">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Suggested questions */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap shrink-0">
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => send(q)}
                className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-xs text-violet-700 hover:bg-violet-100 transition-colors font-medium"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-stone-100 shrink-0">
          <div className="flex items-center gap-2 bg-stone-50 rounded-2xl px-4 py-2.5 border border-stone-200 focus-within:border-violet-300 transition-colors">
            <MessageCircle size={15} className="text-stone-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask anything about this tip…"
              disabled={streaming}
              className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 outline-none"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || streaming}
              className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500 text-white disabled:opacity-30 hover:bg-violet-600 transition-colors"
            >
              <Send size={13} />
            </button>
          </div>
          <p className="text-[10px] text-stone-300 text-center mt-2">
            Claude uses your actual store data. Not a licensed advisor — consult a professional for major decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
