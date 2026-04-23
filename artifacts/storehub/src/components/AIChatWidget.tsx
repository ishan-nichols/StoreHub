import { useState, useRef, useEffect } from "react";
import {
  MessageCircle, X, Send, Minimize2, Bot, Trash2,
  Clock, ChevronLeft, Plus, Loader2
} from "lucide-react";
import { useApp } from "../contexts/useApp";
import { API_BASE_URL, getProducts, getDashboardSummary } from "../services/dataService";

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

interface ConvSummary {
  id: number;
  title: string;
  createdAt: string;
}

let localConvId: number | null = null;

function generateMsgId() {
  return Math.random().toString(36).slice(2);
}

const QUICK_CHIPS = [
  { label: "Tax Tips", prompt: "Give me a practical tax tip for my type of store." },
  { label: "Low Stock?", prompt: "What products are running low and what should I reorder?" },
  { label: "Boost Sales", prompt: "What can I do today to increase sales in my store?" },
  { label: "How to add product", prompt: "How do I add a new product to my inventory?" },
];

export default function AIChatWidget() {
  const { profile } = useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [historyList, setHistoryList] = useState<ConvSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [storeStats, setStoreStats] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!profile) return;
    getProducts().then((products) => {
      getDashboardSummary(profile).then((summary) => {
        const lowItems = products.filter((p) => p.quantity <= p.lowStockThreshold);
        const lowStr = lowItems.slice(0, 5).map((p) => `${p.name} (${p.quantity} ${p.unit} left)`).join(", ");
        const stats = [
          `Total products in inventory: ${products.length}`,
          lowItems.length > 0 ? `Low stock alerts (${lowItems.length}): ${lowStr}` : "No low stock alerts",
          `Today's revenue: ${profile.currencySymbol}${summary.todayRevenue.toFixed(2)} (${summary.todaySalesCount} sales)`,
          `Today's expenses: ${profile.currencySymbol}${summary.todayExpenses.toFixed(2)}`,
          `Today's profit: ${profile.currencySymbol}${summary.todayProfit.toFixed(2)}`,
        ].join(". ");
        setStoreStats(stats);
      });
    });
  }, [profile]);

  useEffect(() => {
    if (open && messages.length === 0) {
      const name = profile?.ownerName?.split(" ")[0] ?? "there";
      setMessages([
        {
          role: "assistant",
          content: `Hi ${name}! I'm your StoreHub AI assistant. I can help with inventory, sales, employees, tax tips, and any feature in the app. What can I help you with today?`,
          id: generateMsgId(),
        },
      ]);
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/openai/conversations`);
      if (res.ok) {
        const data = (await res.json()) as ConvSummary[];
        setHistoryList(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistory() {
    setView("history");
    await loadHistory();
  }

  async function loadConversation(id: number) {
    setView("chat");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/openai/conversations/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: { id: number; role: string; content: string }[] };
        const loaded: Message[] = data.messages.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        setMessages(loaded);
        setConvId(id);
        localConvId = id;
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setConvId(null);
    localConvId = null;
    setView("chat");
    const name = profile?.ownerName?.split(" ")[0] ?? "there";
    setMessages([
      {
        role: "assistant",
        content: `Hi ${name}! Starting a fresh conversation. What can I help you with?`,
        id: generateMsgId(),
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function ensureConversation(): Promise<number> {
    if (convId) return convId;
    if (localConvId) {
      setConvId(localConvId);
      return localConvId;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/openai/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${profile?.storeName ?? "Store"} — ${new Date().toLocaleDateString()}` }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { id: number };
      localConvId = data.id;
      setConvId(data.id);
      return data.id;
    } catch {
      return -1;
    }
  }

  function buildSystemContext(): string {
    if (!profile) return "";
    const businessTypeGuide: Record<string, string> = {
      grocery: "grocery or general food store. Important: food tax exemptions may apply in your state; keep records of taxable vs non-taxable food items.",
      butcher: "butcher shop. Track meat inventory carefully for freshness. COGS (cost of goods sold) is a major deduction.",
      bakery: "bakery. Track ingredient costs (flour, butter, eggs) as COGS. Spoilage is deductible.",
      clothing: "clothing store. Track seasonal inventory. Unsold inventory can be written off.",
      restaurant: "restaurant. Tip reporting is required. Track food costs as a percentage of revenue (ideal: 28-35%).",
      pharmacy: "pharmacy. Prescription vs OTC sales may have different tax treatments.",
      general: "general merchandise store. Keep detailed records of all inventory purchases for COGS.",
      other: "retail store. Keep thorough records for all business expenses.",
    };
    const btGuide = businessTypeGuide[profile.businessType] ?? "retail store.";

    return `You are StoreHub AI, an expert assistant for ${profile.storeName} — a ${profile.businessType} store owned by ${profile.ownerName}. Store uses ${profile.currency} (${profile.currencySymbol}), tax rate: ${profile.taxRate ?? 0}%, language: ${profile.language === "es" ? "Spanish" : "English"}.

REAL-TIME STORE DATA (as of right now):
${storeStats || "Store data loading..."}

STORE TYPE CONTEXT: This is a ${btGuide}

STOREHUB FEATURES — give step-by-step instructions when explaining these:
• Dashboard: KPIs (revenue, expenses, profit), low-stock alerts, smart tips, AI reports
• Inventory: Add/edit/delete products (name, SKU, category, price, quantity, low-stock threshold, supplier)
  - To add: Inventory → Add Product button → fill in fields → Save
  - To scan supplier receipt: Inventory → Scan Receipt button → upload photo → review and confirm
• POS (Point of Sale): Tap products to add to cart → Checkout → enter amount paid → generates receipt
• Sales History: View all past transactions with receipt details
• Expense Tracker: Log business expenses by category (Expenses → Add Expense)
• Suppliers: Manage supplier contacts (Suppliers → Add Supplier)
• Employees: Add team members with roles, hourly wage, 4-digit PIN
• Clock In/Out: Employees page → Clock In/Out buttons. Live timer shows shift duration.
• Employee Portal: Separate page at /employee — staff select name → enter PIN → see their hours/pay
• Settings: Store name, currency, language, tax rate, dark mode, printer, store city for weather, integrations
• AI Reports: Dashboard shows auto-generated business report every 4 hours (weather + suggestions + tax tips)

ACCURACY RULES — YOU MUST FOLLOW THESE:
1. Only state facts from the real-time store data above. Never invent sales numbers, inventory counts, or financial figures.
2. If you don't have a piece of information, clearly say "I don't have that data available."
3. For tax advice: always note that the user should consult a CPA for their specific situation.
4. Do not confuse StoreHub features with features it doesn't have.

TAX KNOWLEDGE for ${profile.businessType} stores:
- Keep all receipts and invoices for COGS deductions
- Quarterly estimated taxes are due: April 15, June 15, Sept 15, Jan 15
- Self-employment tax is 15.3% on net profit
- You can deduct: cost of goods, employee wages, utilities, rent, equipment
- Vehicle mileage for business: track miles driven for purchases/deliveries
- Home office: if you do admin work at home, the space may be deductible

Respond in ${profile.language === "es" ? "Spanish" : "English"}. Be concise, friendly, and specific. Always give step-by-step instructions for how-to questions.`;
  }

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text, id: generateMsgId() };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = generateMsgId();
    setMessages((prev) => [...prev, { role: "assistant", content: "", id: assistantId }]);
    setLoading(true);

    const cid = await ensureConversation();
    const systemContext = buildSystemContext();

    if (cid === -1) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "I'm having trouble connecting to the AI right now. Please make sure the API server is running and try again." }
            : m
        )
      );
      setLoading(false);
      return;
    }

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const response = await fetch(`${API_BASE_URL}/api/openai/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, systemContext }),
        signal: ctrl.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
              if (parsed.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + parsed.content } : m
                  )
                );
              }
              if (parsed.done) break;
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, something went wrong. Please try again." }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setConvId(null);
    localConvId = null;
    setView("chat");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const showChips = messages.length <= 1 && view === "chat";

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          title="Ask StoreHub AI"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[370px] max-h-[620px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white flex-shrink-0">
            {view === "history" && (
              <button onClick={() => setView("chat")} className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors">
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{view === "history" ? "Saved Conversations" : "StoreHub AI"}</div>
              <div className="text-xs text-amber-100 flex items-center gap-1">
                {view === "chat" ? (
                  <><span className="w-1.5 h-1.5 bg-green-300 rounded-full" /> Online &amp; up to date</>
                ) : (
                  `${historyList.length} conversations saved`
                )}
              </div>
            </div>
            {view === "chat" && (
              <>
                <button onClick={startNewChat} className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors" title="New chat">
                  <Plus size={15} />
                </button>
                <button onClick={openHistory} className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors" title="Chat history">
                  <Clock size={15} />
                </button>
                <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors" title="Clear & close">
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors">
              <Minimize2 size={15} />
            </button>
          </div>

          {/* History View */}
          {view === "history" && (
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
                >
                  <Plus size={15} /> New Conversation
                </button>
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">No saved conversations yet</div>
              ) : (
                <ul className="p-2 space-y-1">
                  {historyList.map((conv) => (
                    <li key={conv.id}>
                      <button
                        onClick={() => loadConversation(conv.id)}
                        className={`w-full text-left px-3 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-gray-800 transition-colors ${convId === conv.id ? "bg-amber-50 dark:bg-gray-800" : ""}`}
                      >
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{conv.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(conv.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Chat View */}
          {view === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                        <Bot size={13} className="text-amber-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        msg.role === "user"
                          ? "bg-amber-500 text-white rounded-br-sm"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm"
                      }`}
                    >
                      {msg.role === "assistant" && msg.content
                        ? msg.content
                            .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, "$1")
                            .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1")
                            .replace(/`([^`\n]+?)`/g, "$1")
                            .replace(/^#{1,6}\s+/gm, "")
                            .replace(/^[ \t]*[-*]\s+/gm, "• ")
                        : msg.content || (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {showChips && (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => handleSend(chip.prompt)}
                      disabled={loading}
                      className="text-xs px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your store..."
                  disabled={loading}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 flex items-center justify-center bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
