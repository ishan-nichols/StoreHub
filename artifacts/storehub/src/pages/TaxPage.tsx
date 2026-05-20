import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, BookOpen, Calculator, CheckCircle2, ChevronRight,
  Clock, DollarSign, Download, FileText, MessageCircle,
  Receipt, Send, Settings, Sparkles, Users, Zap,
} from "lucide-react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import {
  type TaxProfile, type SalesTaxSummary, type IncomeTaxSummary,
  type PayrollTaxSummary, type TaxDashboard,
  loadTaxProfile, calculateSalesTax, calculateIncomeTax,
  calculatePayrollTax, buildTaxDashboard, getTaxAlerts,
  getCurrentMonthDates, getCurrentQuarterDates,
  QUARTERLY_DEADLINES_2024, CA_QUARTERLY_DEADLINES, MX_MONTHLY_DEADLINES,
  IRS_EXPENSE_CATEGORIES,
  formatUSD, formatTaxRate,
  getQuarterlyDeadlines,
} from "../services/taxService";
import { getSales, getExpenses, getEmployees } from "../services/dataService";
import TaxSetupModal from "../components/TaxSetupModal";

type Tab = "overview" | "sales" | "income" | "payroll" | "advisor";

const CATEGORY_ICON: Record<string, string> = {
  overview: "🏛️", sales: "🧾", income: "📊", payroll: "👥", advisor: "🤖",
};

// ─── Country-aware label helpers ──────────────────────────────────────────────

type Country = "US" | "CA" | "MX";

function getSalesTabLabel(country: Country): string {
  return country === "CA" ? "GST/HST" : "Sales Tax";
}

function getCurrencyLabel(country: Country): string {
  return country === "CA" ? "CAD" : country === "MX" ? "MXN" : "USD";
}

function getAgencyLabel(country: Country): string {
  return country === "CA" ? "CRA" : country === "MX" ? "SAT" : "IRS";
}

function getSalesTaxBreakdownRows(taxProfile: TaxProfile): { label: string; rate: number }[] {
  const country: Country = taxProfile.country ?? "US";
  if (country === "CA") {
    const isHST = Math.abs(taxProfile.salesTaxRate - taxProfile.stateTaxRate) < 0.001 && taxProfile.stateTaxRate > 0;
    if (taxProfile.stateTaxRate === 0) {
      return [{ label: "GST (federal)", rate: 0.05 }];
    }
    if (isHST) {
      return [{ label: `HST (${taxProfile.stateCode}) — includes federal + provincial`, rate: taxProfile.stateTaxRate }];
    }
    return [
      { label: "GST (federal)", rate: 0.05 },
      { label: `Provincial (${taxProfile.stateCode === "QC" ? "QST" : "PST"})`, rate: taxProfile.stateTaxRate },
    ];
  }
  if (country === "MX") {
    return [{ label: "IVA (federal)", rate: taxProfile.salesTaxRate }];
  }
  return [
    { label: "State tax",  rate: taxProfile.stateTaxRate },
    { label: "County avg", rate: taxProfile.countyTaxRate },
    { label: "City avg",   rate: taxProfile.cityTaxRate },
  ];
}

function getIncomeRows(incomeTax: IncomeTaxSummary, country: Country) {
  if (country === "CA") {
    return [
      { label: "Gross Revenue",               value: incomeTax.grossRevenue,         sign: "" },
      { label: "Business Deductions",          value: -incomeTax.totalDeductions,      sign: "−" },
      { label: "Net Income",                   value: incomeTax.netIncome,             sign: "=", bold: true },
      { label: "CPP Self-Employment (11.9%)",  value: -incomeTax.selfEmploymentTax,    sign: "−" },
      { label: "CPP Deduction (50%)",          value: -incomeTax.seTaxDeduction,       sign: "−" },
      { label: "Basic Personal Amount",        value: -incomeTax.standardDeduction,    sign: "−" },
      { label: "Taxable Income",               value: incomeTax.taxableIncome,         sign: "=", bold: true },
      { label: "Est. Federal Tax (CRA)",       value: incomeTax.estimatedFederalTax,   sign: "" },
      { label: "CPP Self-Employment",          value: incomeTax.selfEmploymentTax,     sign: "+" },
    ];
  }
  if (country === "MX") {
    return [
      { label: "Ingresos Brutos (Gross Revenue)", value: incomeTax.grossRevenue,       sign: "" },
      { label: "Deducciones Autorizadas",          value: -incomeTax.totalDeductions,  sign: "−" },
      { label: "Base Gravable",                    value: incomeTax.netIncome,         sign: "=", bold: true },
      { label: "ISR Federal (estimado)",           value: incomeTax.estimatedFederalTax, sign: "" },
    ];
  }
  return [
    { label: "Gross Revenue",          value: incomeTax.grossRevenue,          sign: "" },
    { label: "Business Deductions",    value: -incomeTax.totalDeductions,       sign: "−" },
    { label: "Net Income",             value: incomeTax.netIncome,              sign: "=", bold: true },
    { label: "Self-Employment Tax",    value: -incomeTax.selfEmploymentTax,     sign: "−" },
    { label: "SE Tax Deduction (50%)", value: -incomeTax.seTaxDeduction,        sign: "−" },
    { label: "Standard Deduction",     value: -incomeTax.standardDeduction,     sign: "−" },
    { label: "Taxable Income",         value: incomeTax.taxableIncome,          sign: "=", bold: true },
    { label: "Est. Federal Income Tax",value: incomeTax.estimatedFederalTax,    sign: "" },
    { label: "Self-Employment Tax",    value: incomeTax.selfEmploymentTax,      sign: "+" },
  ];
}

function getPayrollBreakdownRows(payrollTax: PayrollTaxSummary, stateCode: string) {
  const country: Country = payrollTax.country ?? "US";
  if (country === "CA") {
    return [
      { label: "CPP Employee (5.95%)",   value: payrollTax.employeeSSHeld },
      { label: "CPP Employer (5.95%)",   value: payrollTax.employerSSMatch },
      { label: "EI Employee (1.66%)",    value: payrollTax.employeeMedicareHeld },
      { label: "EI Employer (2.324%)",   value: payrollTax.employerMedicareMatch },
    ];
  }
  if (country === "MX") {
    return [
      { label: "IMSS Employee (~1.25%)",  value: payrollTax.employeeSSHeld },
      { label: "IMSS Employer (~17.15%)", value: payrollTax.employerSSMatch },
      { label: "INFONAVIT Employer (5%)", value: payrollTax.sutaTax },
    ];
  }
  return [
    { label: "Social Security (employee 6.2%)", value: payrollTax.employeeSSHeld },
    { label: "Social Security (employer 6.2%)", value: payrollTax.employerSSMatch },
    { label: "Medicare (employee 1.45%)",        value: payrollTax.employeeMedicareHeld },
    { label: "Medicare (employer 1.45%)",        value: payrollTax.employerMedicareMatch },
    { label: "FUTA (0.6% up to $7,000/emp)",     value: payrollTax.futaTax },
    { label: `SUTA (${stateCode})`,              value: payrollTax.sutaTax },
  ];
}

function getPayrollDepositLabel(country: Country): string {
  return country === "CA" ? "CRA remittance due" : country === "MX" ? "IMSS/SAT deposit due" : "IRS deposit due";
}

function getPayrollTotalLabel(country: Country): string {
  return country === "CA" ? "Total remittance to CRA" : country === "MX" ? "Total depósito IMSS/SAT" : "Total deposit to IRS";
}

function getWithholdingLabel(country: Country): string {
  return country === "CA" ? "CPP + EI" : country === "MX" ? "IMSS employee" : "SS + Medicare";
}

function getEmployerLiabilityLabel(country: Country): string {
  return country === "CA" ? "CPP match + EI" : country === "MX" ? "IMSS + INFONAVIT" : "Match + FUTA + SUTA";
}

function getQuarterlyCalendarTitle(country: Country): string {
  if (country === "CA") return "2024 GST/HST Filing Calendar";
  if (country === "MX") return "2024 IVA Monthly Filing Calendar";
  return "2025 Quarterly Estimated Tax Calendar";
}

function getQuarterlyCardLabel(q: { quarter: string; period: string; dueDate: string; label: string }, country: Country): string {
  if (country === "MX") return q.period;
  return q.quarter;
}

// ─── Claude Tax Advisor ───────────────────────────────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string }

function TaxAdvisorChat({ taxData, country }: { taxData: Record<string, unknown>; country: Country }) {
  const [msgs, setMsgs]       = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: country === "CA"
        ? "Hi! I'm your Canadian tax advisor. Ask me anything about GST/HST, CPP/EI, CRA filings, or provincial taxes — I'll use your actual numbers to give you specific answers.\n\n**Disclaimer**: I'm not a licensed CPA. Always consult a tax professional before filing."
        : country === "MX"
        ? "¡Hola! Soy tu asesor fiscal para México. Pregúntame sobre IVA, ISR, IMSS, declaraciones SAT o deducciones — usaré tus datos reales.\n\n**Aviso**: No soy contador certificado. Consulta a un profesionista antes de declarar."
        : "Hi! I'm your tax advisor. Ask me anything about your business taxes — I'll use your actual numbers to give you specific answers.\n\n**Disclaimer**: I'm not a licensed CPA. Always consult a tax professional before filing.",
    },
  ]);
  const [input, setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const SUGGESTIONS = country === "CA"
    ? [
        "Am I required to register for GST/HST?",
        "What's the difference between HST and GST+PST?",
        "How do I calculate CPP deductions?",
        "What business expenses can I deduct in Canada?",
        "When are my CRA instalment payments due?",
      ]
    : country === "MX"
    ? [
        "¿Cuándo debo presentar mi declaración de IVA?",
        "¿Qué deducciones puedo aplicar para ISR?",
        "¿Cómo calculo el IMSS de mis empleados?",
        "¿Qué es el RESICO y me conviene?",
        "¿Cuándo vence mi declaración anual?",
      ]
    : [
        "Am I paying too much in taxes?",
        "What expenses can I deduct?",
        "How much should I set aside for Q3?",
        "Do I need to collect sales tax on all products?",
        "What's the difference between a sole prop and LLC for taxes?",
      ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || streaming) return;
    setInput("");
    setMsgs(prev => [...prev, { role: "user", content: q }]);
    setStreaming(true);
    setMsgs(prev => [...prev, { role: "assistant", content: "" }]);

    const countryContext = country === "CA"
      ? "This business is based in CANADA. Use Canadian tax rules (CRA, GST/HST, CPP, EI, provincial taxes). Reference CAD amounts."
      : country === "MX"
      ? "This business is based in MEXICO. Use Mexican tax rules (SAT, IVA, ISR, IMSS, INFONAVIT). Reference MXN amounts."
      : "This business is based in the UNITED STATES. Use US tax rules (IRS, sales tax, SS/Medicare, FUTA/SUTA).";

    try {
      const res = await fetch("/api/tips/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: {
            title: "Tax Question",
            explanation: "Owner is asking a tax question",
            action: "Provide accurate tax guidance",
            category: "compliance",
          },
          question: `${countryContext}\n\nAs my tax advisor with access to my business data, please answer: ${q}\n\nAlways be specific to my actual numbers and the tax rules for my country. End with a note to consult a tax professional for final decisions.`,
          storeData: taxData,
        }),
        credentials: "include",
      });

      if (!res.ok || !res.body) throw new Error("Failed");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMsgs(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: updated[updated.length - 1].content + data.content };
                return updated;
              });
            }
            if (data.done) { setStreaming(false); return; }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMsgs(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, I couldn't connect right now. Please try again." };
        return updated;
      });
    }
    setStreaming(false);
  }

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-[28px] border border-stone-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100 bg-gradient-to-r from-violet-50 to-purple-50 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <Sparkles size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-stone-900">
            {country === "CA" ? "Claude Canadian Tax Advisor" : country === "MX" ? "Claude Asesor Fiscal México" : "Claude Tax Advisor"}
          </p>
          <p className="text-xs text-stone-400">Powered by your actual business data · {getAgencyLabel(country)} rules</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {msgs.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shrink-0 mt-0.5 mr-2">
                <Sparkles size={12} />
              </div>
            )}
            <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-stone-900 text-white rounded-br-md"
                : "bg-stone-50 border border-stone-100 text-stone-800 rounded-bl-md"
            }`}>
              {msg.content || (
                <span className="flex gap-1 items-center">
                  {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {msgs.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap shrink-0">
          {SUGGESTIONS.map(q => (
            <button key={q} onClick={() => send(q)}
              className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-xs text-violet-700 hover:bg-violet-100 transition-colors font-medium">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-stone-100 shrink-0">
        <div className="flex items-center gap-2 bg-stone-50 rounded-2xl px-4 py-2.5 border border-stone-200 focus-within:border-violet-300 transition-colors">
          <MessageCircle size={14} className="text-stone-400 shrink-0" />
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder={country === "MX" ? "Haz una pregunta fiscal…" : "Ask any tax question…"}
            disabled={streaming}
            className="flex-1 bg-transparent text-sm text-stone-800 placeholder-stone-400 outline-none"
          />
          <button onClick={() => send()} disabled={!input.trim() || streaming}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500 text-white disabled:opacity-30 hover:bg-violet-600 transition-colors">
            <Send size={13} />
          </button>
        </div>
        <p className="text-[10px] text-stone-300 text-center mt-1.5">
          {country === "MX"
            ? "No soy contador certificado — consulta a un profesionista para decisiones finales."
            : "Not a licensed CPA — consult a tax professional for final filing decisions."}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TaxPage() {
  const { profile, currencySymbol } = useApp();
  const { activeStoreId } = useAuth();
  const [tab, setTab]               = useState<Tab>("overview");
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  const [showSetup, setShowSetup]   = useState(false);
  const [loading, setLoading]       = useState(true);

  const [salesTaxMTD, setSalesTaxMTD]   = useState<SalesTaxSummary | null>(null);
  const [salesTaxQTD, setSalesTaxQTD]   = useState<SalesTaxSummary | null>(null);
  const [incomeTax, setIncomeTax]       = useState<IncomeTaxSummary | null>(null);
  const [payrollTax, setPayrollTax]     = useState<PayrollTaxSummary | null>(null);
  const [dashboard, setDashboard]       = useState<TaxDashboard | null>(null);
  const [taxData, setTaxData]           = useState<Record<string, unknown>>({});

  useEffect(() => {
    const tp = loadTaxProfile();
    setTaxProfile(tp);
    if (tp?.setupComplete) loadTaxData(tp);
    else setLoading(false);
  }, [activeStoreId]);

  async function loadTaxData(tp: TaxProfile) {
    setLoading(true);
    try {
      const [sales, expenses, employees] = await Promise.all([
        getSales(), getExpenses(), getEmployees(),
      ]);

      const { start: mStart, end: mEnd } = getCurrentMonthDates();
      const { start: qStart, end: qEnd } = getCurrentQuarterDates();

      const mtd    = calculateSalesTax(sales, tp, mStart, mEnd);
      const qtd    = calculateSalesTax(sales, tp, qStart, qEnd);
      const income = calculateIncomeTax(sales, expenses, tp);
      const country: Country = tp.country ?? "US";

      let payroll: PayrollTaxSummary | null = null;
      if (tp.hasEmployees && employees.length > 0) {
        const hoursMap: Record<string, number> = {};
        employees.forEach((e: any) => { hoursMap[e.id] = 160; });
        payroll = calculatePayrollTax(employees as any, hoursMap, tp.stateCode, {}, country);
      }

      const dash = buildTaxDashboard(mtd, qtd, income, payroll, country);
      const txd = {
        taxProfile: tp, country, salesTaxMTD: mtd, salesTaxQTD: qtd,
        incomeTax: income, payrollTax: payroll, dashboard: dash,
        storeProfile: profile,
      };

      setSalesTaxMTD(mtd);
      setSalesTaxQTD(qtd);
      setIncomeTax(income);
      setPayrollTax(payroll);
      setDashboard(dash);
      setTaxData(txd as any);
    } finally {
      setLoading(false);
    }
  }

  function handleSetupSave(tp: TaxProfile) {
    setTaxProfile(tp);
    setShowSetup(false);
    loadTaxData(tp);
  }

  // ── Setup screen ──
  if (!taxProfile?.setupComplete) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="text-6xl mb-4">🏛️</div>
        <h1 className="text-3xl font-bold text-stone-900 mb-2">Tax Center</h1>
        <p className="text-stone-500 mb-8">Set up your tax profile and we'll track every obligation automatically — sales tax, income tax, payroll, and more.</p>
        <button
          onClick={() => setShowSetup(true)}
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-stone-900 text-white font-bold rounded-2xl hover:bg-stone-800 transition-colors"
        >
          <Settings size={18} /> Set Up My Taxes
        </button>
        {showSetup && (
          <TaxSetupModal
            existing={taxProfile}
            onSave={handleSetupSave}
            onClose={() => setShowSetup(false)}
          />
        )}
      </div>
    );
  }

  const country: Country = taxProfile.country ?? "US";
  const alerts = dashboard ? getTaxAlerts(dashboard) : [];
  const deadlineList = getQuarterlyDeadlines(country);

  // Dynamic tab labels
  const TAB_LABELS: Record<Tab, string> = {
    overview: "Overview",
    sales:    getSalesTabLabel(country),
    income:   "Income",
    payroll:  "Payroll",
    advisor:  "Advisor",
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Tax Center</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            {taxProfile.businessStructure.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())} · {taxProfile.stateName}
            {country !== "US" && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 text-xs font-semibold">{country}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSetup(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-stone-200 bg-white text-sm text-stone-600 hover:bg-stone-50 transition-colors">
            <Settings size={14} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
              a.level === "critical" ? "bg-red-50 border border-red-200 text-red-800" :
              a.level === "warning"  ? "bg-amber-50 border border-amber-200 text-amber-800" :
                                      "bg-blue-50 border border-blue-200 text-blue-800"
            }`}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-100 rounded-2xl p-1 overflow-x-auto">
        {(["overview", "sales", "income", "payroll", "advisor"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              tab === t ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <span>{CATEGORY_ICON[t]}</span>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 rounded-[28px] bg-stone-100 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* ── Overview Tab ── */}
          {tab === "overview" && dashboard && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TaxCard
                  icon={<Receipt size={16} />}
                  label={`${getSalesTabLabel(country)} Collected (MTD)`}
                  value={formatUSD(dashboard.salesTaxCollectedMTD)}
                  sub={`Due ${dashboard.salesTaxDaysUntilDue}d`}
                  color="emerald"
                />
                <TaxCard icon={<Calculator size={16} />} label={`Est. ${getAgencyLabel(country)} Tax (YTD)`} value={formatUSD(dashboard.estimatedIncomeTaxOwed)} sub="Year-to-date" color="blue" />
                <TaxCard
                  icon={<DollarSign size={16} />}
                  label={country === "CA" ? "Next CRA Instalment" : country === "MX" ? "Próximo Pago ISR" : "Next Quarterly Payment"}
                  value={formatUSD(dashboard.quarterlyTaxDue)}
                  sub={dashboard.nextQuarterlyDeadline.label}
                  color="amber"
                />
                <TaxCard icon={<Zap size={16} />} label="Total Tax Liability" value={formatUSD(dashboard.totalTaxLiability)} sub="All obligations" color="violet" urgent={dashboard.totalTaxLiability > 2000} />
              </div>

              {/* Upcoming deadlines */}
              <div className="glass-panel rounded-[28px] p-5">
                <h3 className="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" /> Upcoming Deadlines
                </h3>
                <div className="space-y-3">
                  {dashboard.upcomingDeadlines.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{d.name}</p>
                        <p className="text-xs text-stone-400">{d.date}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {d.amount !== null && <p className="text-sm font-bold text-stone-900">{formatUSD(d.amount)}</p>}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          d.daysAway <= 7  ? "bg-red-100 text-red-700" :
                          d.daysAway <= 14 ? "bg-amber-100 text-amber-700" :
                                             "bg-stone-100 text-stone-600"
                        }`}>
                          {d.daysAway}d away
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quarterly / filing calendar */}
              <div className="glass-panel rounded-[28px] p-5">
                <h3 className="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
                  <BookOpen size={16} className="text-blue-500" /> {getQuarterlyCalendarTitle(country)}
                </h3>
                <div className={`grid gap-3 ${country === "MX" ? "grid-cols-3 md:grid-cols-4" : "grid-cols-2 md:grid-cols-4"}`}>
                  {deadlineList.map(q => {
                    const isPast = new Date(q.dueDate) < new Date();
                    const isNext = !isPast && dashboard.nextQuarterlyDeadline.quarter === q.quarter;
                    return (
                      <div key={q.quarter} className={`rounded-2xl p-3 border ${
                        isPast ? "bg-stone-50 border-stone-100 opacity-60" :
                        isNext ? "bg-amber-50 border-amber-200" : "bg-white border-stone-100"
                      }`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                          {getQuarterlyCardLabel(q, country)}
                        </p>
                        <p className="text-sm font-bold text-stone-900 mt-1">{q.label}</p>
                        <p className="text-xs text-stone-400 mt-0.5">{q.period}</p>
                        {isPast && <span className="text-[10px] text-emerald-600 font-semibold">Past</span>}
                        {isNext && <span className="text-[10px] text-amber-700 font-bold">▶ Next due</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Sales Tax Tab ── */}
          {tab === "sales" && salesTaxMTD && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TaxCard
                  icon={<Receipt size={16} />}
                  label={country === "CA" ? "GST/HST Rate" : country === "MX" ? "IVA Rate" : "Tax Rate"}
                  value={formatTaxRate(taxProfile.salesTaxRate)}
                  sub={country === "CA" ? taxProfile.stateName : country === "MX" ? taxProfile.stateName : `${taxProfile.stateName} + local`}
                  color="stone"
                />
                <TaxCard
                  icon={<DollarSign size={16} />}
                  label={`${getSalesTabLabel(country)} Collected (MTD)`}
                  value={formatUSD(salesTaxMTD.taxCollected)}
                  sub={salesTaxMTD.period}
                  color="emerald"
                />
                <TaxCard icon={<FileText size={16} />} label="Taxable Sales (MTD)" value={formatUSD(salesTaxMTD.taxableSales)} sub={`Exempt: ${formatUSD(salesTaxMTD.exemptSales)}`} color="blue" />
                <TaxCard icon={<Clock size={16} />} label="Due Date" value={`${salesTaxMTD.daysUntilDeadline}d`} sub={salesTaxMTD.filingDeadline} color="amber" urgent={salesTaxMTD.daysUntilDeadline <= 7} />
              </div>

              {/* Tax breakdown */}
              <div className="glass-panel rounded-[28px] p-5">
                <h3 className="text-sm font-bold text-stone-900 mb-4">
                  {country === "CA" ? "GST/HST" : country === "MX" ? "IVA" : "Sales Tax"} Breakdown — {salesTaxMTD.period}
                </h3>
                <div className="space-y-2 text-sm">
                  {getSalesTaxBreakdownRows(taxProfile).map(row => (
                    <div key={row.label} className="flex justify-between items-center py-2 border-b border-stone-50">
                      <span className="text-stone-600">{row.label}</span>
                      <span className="font-semibold tabular-nums">{formatTaxRate(row.rate)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2 font-bold text-stone-900">
                    <span>{country === "CA" ? "Combined rate" : country === "MX" ? "Tasa total" : "Combined rate"}</span>
                    <span className="tabular-nums">{formatTaxRate(taxProfile.salesTaxRate)}</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <div className="flex justify-between items-center text-lg font-bold text-stone-900">
                      <span>{country === "MX" ? "Monto a remitir" : "Amount to remit"}</span>
                      <span className="text-emerald-700">{formatUSD(salesTaxMTD.remitAmount)}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1">
                      Due {salesTaxMTD.filingDeadline} · {taxProfile.filingFrequency} filer
                    </p>
                  </div>
                </div>
              </div>

              {/* Canada-specific note */}
              {country === "CA" && (
                <div className="glass-panel rounded-[28px] p-4 text-sm bg-blue-50 border border-blue-100">
                  <p className="font-semibold text-blue-800 mb-1">GST/HST Registration Reminder</p>
                  <p className="text-blue-700 text-xs">You must register for GST/HST with the CRA if your total revenue exceeds $30,000 CAD in any single calendar quarter or over four consecutive quarters. File at canada.ca/taxes.</p>
                </div>
              )}

              {/* Mexico-specific note */}
              {country === "MX" && (
                <div className="glass-panel rounded-[28px] p-4 text-sm bg-red-50 border border-red-100">
                  <p className="font-semibold text-red-800 mb-1">Nota IVA</p>
                  <p className="text-red-700 text-xs">El IVA se declara mensualmente ante el SAT a más tardar el día 17 del mes siguiente. Conserva todos los CFDIs de ingresos y egresos para tu declaración.</p>
                </div>
              )}

              {/* QTD comparison */}
              {salesTaxQTD && (
                <div className="glass-panel rounded-[28px] p-5">
                  <h3 className="text-sm font-bold text-stone-900 mb-3">Quarter-to-Date</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: "Gross Sales", value: formatUSD(salesTaxQTD.grossSales) },
                      { label: "Taxable Sales", value: formatUSD(salesTaxQTD.taxableSales) },
                      { label: country === "CA" ? "GST/HST Collected" : country === "MX" ? "IVA Cobrado" : "Tax Collected", value: formatUSD(salesTaxQTD.taxCollected) },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs text-stone-400">{item.label}</p>
                        <p className="text-base font-bold text-stone-900 mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors">
                  <Download size={14} /> Export Report
                </button>
              </div>
            </div>
          )}

          {/* ── Income Tax Tab ── */}
          {tab === "income" && incomeTax && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <TaxCard icon={<DollarSign size={16} />} label="Gross Revenue (YTD)" value={formatUSD(incomeTax.grossRevenue)} sub="Year-to-date" color="emerald" />
                <TaxCard icon={<Receipt size={16} />} label="Total Deductions" value={formatUSD(incomeTax.totalDeductions)} sub="Deductible expenses" color="blue" />
                <TaxCard
                  icon={<Calculator size={16} />}
                  label={`Est. ${getAgencyLabel(country)} Tax`}
                  value={formatUSD(incomeTax.estimatedFederalTax + incomeTax.selfEmploymentTax)}
                  sub={country === "CA" ? "Inc. CPP self-employed" : country === "MX" ? "ISR estimado" : "Inc. self-employment"}
                  color="amber"
                />
                <TaxCard
                  icon={<Zap size={16} />}
                  label={country === "MX" ? "Pago Mensual ISR" : country === "CA" ? "Next CRA Instalment" : "Next Quarterly Due"}
                  value={formatUSD(incomeTax.quarterlyPaymentDue)}
                  sub="Est. payment"
                  color="violet"
                  urgent
                />
              </div>

              {/* Calculation — Step by Step */}
              <div className="glass-panel rounded-[28px] p-5">
                <h3 className="text-sm font-bold text-stone-900 mb-4">
                  {country === "CA" ? "Income Tax Calculation (CRA) — Step by Step" :
                   country === "MX" ? "Cálculo ISR — Paso a Paso" :
                   "Income Tax Calculation — Step by Step"}
                </h3>
                <div className="space-y-2 text-sm">
                  {getIncomeRows(incomeTax, country).map((row, i) => (
                    <div key={i} className={`flex justify-between items-center py-2 ${row.bold ? "border-t border-b border-stone-100 font-bold text-stone-900" : "border-b border-stone-50 text-stone-600"}`}>
                      <span>{row.label}</span>
                      <span className={`tabular-nums ${row.bold ? "" : row.sign === "−" ? "text-red-600" : ""}`}>
                        {row.sign === "−" ? "−" : ""}{formatUSD(Math.abs(row.value))}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-3 text-base font-bold text-stone-900">
                    <span>
                      {country === "CA" ? "Total Tax Owed to CRA (estimated)" :
                       country === "MX" ? "Total ISR Estimado" :
                       "Total Tax Owed (estimated)"}
                    </span>
                    <span className="text-amber-700">{formatUSD(incomeTax.estimatedFederalTax + incomeTax.selfEmploymentTax)}</span>
                  </div>
                  <p className="text-xs text-stone-400 pt-1">Effective rate: {(incomeTax.effectiveTaxRate * 100).toFixed(1)}% of gross revenue</p>
                </div>
              </div>

              {/* Country-specific note */}
              {country === "CA" && (
                <div className="glass-panel rounded-[28px] p-4 text-xs bg-blue-50 border border-blue-100 text-blue-800">
                  <strong>Canada note:</strong> Federal brackets shown include an estimate of provincial income tax for {taxProfile.stateName || "your province"}. CPP self-employment rate is 11.9% (both employee + employer halves). Basic Personal Amount for 2024 is $15,705 CAD. Instalments are due Mar 15, Jun 15, Sep 15, Dec 15.
                </div>
              )}
              {country === "MX" && (
                <div className="glass-panel rounded-[28px] p-4 text-xs bg-red-50 border border-red-100 text-red-800">
                  <strong>Nota México:</strong> El ISR se calcula según las tablas del SAT para personas físicas con actividad empresarial. Los pagos provisionales mensuales se presentan a más tardar el día 17 del mes siguiente. Declaración anual: 30 de abril para personas físicas.
                </div>
              )}

              {/* Expense deductions */}
              <div className="glass-panel rounded-[28px] p-5">
                <h3 className="text-sm font-bold text-stone-900 mb-4">
                  {country === "CA" ? "Deductible Expenses by CRA Category" :
                   country === "MX" ? "Deducciones Autorizadas por Categoría" :
                   "Deductible Expenses by IRS Category"}
                </h3>
                <div className="space-y-2">
                  {Object.entries(incomeTax.deductionsByCategory).map(([cat, d]) => (
                    <div key={cat} className="flex items-center justify-between py-2 border-b border-stone-50 text-sm">
                      <div>
                        <p className="font-medium text-stone-900">{cat}</p>
                        <p className="text-xs text-stone-400">{d.irsCategory}{!d.fullyDeductible ? " · 50% deductible" : ""}</p>
                      </div>
                      <span className="font-semibold tabular-nums text-stone-900">{formatUSD(d.amount)}</span>
                    </div>
                  ))}
                  {Object.keys(incomeTax.deductionsByCategory).length === 0 && (
                    <p className="text-sm text-stone-400 text-center py-4">No expenses logged yet. Add expenses to track deductions.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors">
                  <Download size={14} /> {country === "MX" ? "Exportar para Contador" : "Export P&L for Accountant"}
                </button>
              </div>
            </div>
          )}

          {/* ── Payroll Tax Tab ── */}
          {tab === "payroll" && (
            <div className="space-y-4">
              {!taxProfile.hasEmployees ? (
                <div className="glass-panel rounded-[28px] p-8 text-center">
                  <Users size={40} className="mx-auto text-stone-200 mb-3" />
                  <p className="text-sm font-semibold text-stone-600">No employees in your tax profile.</p>
                  <p className="text-xs text-stone-400 mt-1">Update your tax profile if you have employees to enable payroll tax tracking.</p>
                  <button onClick={() => setShowSetup(true)} className="mt-4 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors">
                    Update Profile
                  </button>
                </div>
              ) : payrollTax ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <TaxCard icon={<Users size={16} />} label="Total Wages" value={formatUSD(payrollTax.totalWages)} sub={`${payrollTax.employeeCount} employees`} color="stone" />
                    <TaxCard
                      icon={<DollarSign size={16} />}
                      label="Employee Withholding"
                      value={formatUSD(payrollTax.totalEmployeeWithholding)}
                      sub={getWithholdingLabel(country)}
                      color="blue"
                    />
                    <TaxCard
                      icon={<Calculator size={16} />}
                      label="Employer Liability"
                      value={formatUSD(payrollTax.totalEmployerLiability)}
                      sub={getEmployerLiabilityLabel(country)}
                      color="amber"
                    />
                    <TaxCard
                      icon={<Clock size={16} />}
                      label="Deposit Deadline"
                      value={payrollTax.depositDeadline}
                      sub={getPayrollDepositLabel(country)}
                      color="red"
                      urgent
                    />
                  </div>

                  <div className="glass-panel rounded-[28px] p-5">
                    <h3 className="text-sm font-bold text-stone-900 mb-4">
                      {country === "CA" ? "CPP & EI Breakdown" : country === "MX" ? "Desglose IMSS / INFONAVIT" : "Payroll Tax Breakdown"}
                    </h3>
                    <div className="space-y-2 text-sm">
                      {getPayrollBreakdownRows(payrollTax, taxProfile.stateCode).map(row => (
                        <div key={row.label} className="flex justify-between items-center py-2 border-b border-stone-50 text-stone-600">
                          <span>{row.label}</span>
                          <span className="font-semibold tabular-nums">{formatUSD(row.value)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-3 font-bold text-stone-900 text-base">
                        <span>{getPayrollTotalLabel(country)}</span>
                        <span>{formatUSD(payrollTax.totalEmployerLiability + payrollTax.totalEmployeeWithholding)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Canada CPP/EI info panel */}
                  {country === "CA" && (
                    <div className="glass-panel rounded-[28px] p-4 text-xs bg-blue-50 border border-blue-100 text-blue-800">
                      <strong>CPP 2024:</strong> Employee & Employer each contribute 5.95% on earnings between $3,500–$68,500. Max annual CPP contribution per employee: $3,867.50 (each side).<br />
                      <strong>EI 2024:</strong> Employee 1.66%, Employer 2.324% (1.4× employee rate) on insurable earnings up to $63,200. Max annual EI per employee: $1,049.12 (employee).
                    </div>
                  )}

                  {/* Mexico IMSS info panel */}
                  {country === "MX" && (
                    <div className="glass-panel rounded-[28px] p-4 text-xs bg-red-50 border border-red-100 text-red-800">
                      <strong>IMSS 2024:</strong> La cuota patronal es ~17.15% del salario integrado. La cuota obrera es ~1.25%. El INFONAVIT patronal es 5%. Las aportaciones se calculan por salario diario integrado (SDI) y se pagan bimestralmente al IMSS.
                    </div>
                  )}

                  <div className="glass-panel rounded-[28px] p-5">
                    <h3 className="text-sm font-bold text-stone-900 mb-4">Per-Employee Breakdown</h3>
                    <div className="space-y-2">
                      {payrollTax.perEmployee.map((emp, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-stone-50 text-sm">
                          <p className="font-medium text-stone-900">{emp.name}</p>
                          <div className="text-right">
                            <p className="font-semibold text-stone-900">{formatUSD(emp.wages)} gross</p>
                            <p className="text-xs text-stone-400">
                              Net: {formatUSD(emp.netPay)} ·{" "}
                              {country === "CA" ? `CPP+EI: ${formatUSD(emp.ssHeld + emp.medicareHeld)}` :
                               country === "MX" ? `IMSS: ${formatUSD(emp.ssHeld)}` :
                               `SS+Med: ${formatUSD(emp.ssHeld + emp.medicareHeld)}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-panel rounded-[28px] p-8 text-center">
                  <p className="text-sm text-stone-400">Add employees in the Employees section to calculate payroll taxes.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tax Advisor Tab ── */}
          {tab === "advisor" && <TaxAdvisorChat taxData={taxData} country={country} />}
        </>
      )}

      {/* Setup modal */}
      {showSetup && (
        <TaxSetupModal
          existing={taxProfile}
          onSave={handleSetupSave}
          onClose={() => setShowSetup(false)}
        />
      )}
    </div>
  );
}

// ─── TaxCard ──────────────────────────────────────────────────────────────────

function TaxCard({ icon, label, value, sub, color, urgent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  color: "stone" | "emerald" | "blue" | "amber" | "violet" | "red"; urgent?: boolean;
}) {
  const colors = {
    stone:   "bg-stone-50  border-stone-200  text-stone-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    blue:    "bg-blue-50   border-blue-200   text-blue-700",
    amber:   "bg-amber-50  border-amber-200  text-amber-700",
    violet:  "bg-violet-50 border-violet-200 text-violet-700",
    red:     "bg-red-50    border-red-200    text-red-700",
  };
  return (
    <div className={`rounded-[24px] border p-4 ${colors[color]} ${urgent ? "ring-2 ring-offset-1 ring-red-400" : ""}`}>
      <div className="flex items-center gap-2 mb-2 opacity-70">{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-70">{sub}</p>}
      {urgent && <span className="text-[10px] font-bold text-red-600">Action needed</span>}
    </div>
  );
}
