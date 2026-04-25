import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  generateForecast,
  getCachedForecast,
  type CashFlowData,
  type WeeklyForecast,
} from "../services/cashFlowService";

const BALANCE_KEY = "storehub_cash_balance";

function getStoredBalance(): number {
  try {
    const raw = localStorage.getItem(BALANCE_KEY);
    return raw ? parseFloat(raw) : 0;
  } catch {
    return 0;
  }
}

function storeBalance(val: number): void {
  localStorage.setItem(BALANCE_KEY, String(val));
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function WeeklyBarChart({ weeks }: { weeks: WeeklyForecast[] }) {
  if (weeks.length === 0) return null;

  const maxVal = Math.max(...weeks.flatMap(w => [w.projectedIncome, w.projectedExpenses]), 1);

  return (
    <div className="mt-4 space-y-3">
      {weeks.map((w, i) => {
        const incomeW = (w.projectedIncome / maxVal) * 100;
        const expW = (w.projectedExpenses / maxVal) * 100;
        const label = `Wk ${i + 1}: ${w.weekStart.slice(5)}`;

        return (
          <div key={w.weekStart}>
            <div className="mb-1 flex justify-between text-xs text-stone-500">
              <span>{label}</span>
              <span className={w.netCash >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                Net: {w.netCash >= 0 ? "+" : ""}${w.netCash.toFixed(0)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-16 text-right text-xs text-stone-400">Income</span>
                <div className="flex-1 rounded-full bg-stone-100 h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${incomeW}%` }}
                  />
                </div>
                <span className="w-16 text-xs text-stone-600">${w.projectedIncome.toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-right text-xs text-stone-400">Expenses</span>
                <div className="flex-1 rounded-full bg-stone-100 h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-500"
                    style={{ width: `${expW}%` }}
                  />
                </div>
                <span className="w-16 text-xs text-stone-600">${w.projectedExpenses.toFixed(0)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Forecast Table ───────────────────────────────────────────────────────────

function ForecastTable({ weeks }: { weeks: WeeklyForecast[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="py-3 text-left text-xs font-semibold text-stone-500">Week</th>
            <th className="py-3 text-right text-xs font-semibold text-stone-500">Income</th>
            <th className="py-3 text-right text-xs font-semibold text-stone-500">Expenses</th>
            <th className="py-3 text-right text-xs font-semibold text-stone-500">Net</th>
            <th className="py-3 text-right text-xs font-semibold text-stone-500">Balance</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => {
            const rowClass = w.isNegative
              ? "bg-red-50"
              : w.runningBalance < 500
              ? "bg-amber-50"
              : "";

            return (
              <tr key={w.weekStart} className={`border-b border-stone-100 ${rowClass}`}>
                <td className="py-3">
                  <div className="font-medium text-stone-800">Week {i + 1}</div>
                  <div className="text-xs text-stone-400">
                    {w.weekStart.slice(5)} → {w.weekEnd.slice(5)}
                  </div>
                  {w.notes && (
                    <div className="mt-0.5 text-xs text-stone-500 italic">{w.notes}</div>
                  )}
                </td>
                <td className="py-3 text-right font-medium text-emerald-700">
                  +${w.projectedIncome.toFixed(2)}
                </td>
                <td className="py-3 text-right text-red-600">
                  -${w.projectedExpenses.toFixed(2)}
                </td>
                <td className={`py-3 text-right font-semibold ${w.netCash >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {w.netCash >= 0 ? "+" : ""}${w.netCash.toFixed(2)}
                </td>
                <td className={`py-3 text-right font-bold ${w.isNegative ? "text-red-700" : w.runningBalance < 500 ? "text-amber-700" : "text-stone-900"}`}>
                  ${w.runningBalance.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const [balance, setBalance] = useState<number>(getStoredBalance());
  const [balanceInput, setBalanceInput] = useState<string>(String(getStoredBalance() || ""));
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  // Load cached forecast on mount
  useEffect(() => {
    const cached = getCachedForecast();
    if (cached) {
      setData(cached);
      setGenerated(true);
    }
  }, []);

  function handleBalanceChange(val: string) {
    setBalanceInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      setBalance(parsed);
      storeBalance(parsed);
    }
  }

  async function handleGenerate(force = false) {
    setLoading(true);
    setError(null);
    try {
      const result = await generateForecast(force, balance);
      setData(result);
      setGenerated(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const hasAlerts = (data?.alerts ?? []).length > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Hero */}
      <section className="rounded-[30px] bg-stone-950 px-6 py-7 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
            <Wallet size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">5-Week Forecast</p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">Cash Flow Forecast</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/60">Know before you're short — AI-powered cash planning for the next 5 weeks.</p>
      </section>

      {/* Balance Input */}
      <section className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-700">Current Cash Balance</h2>
        <p className="mt-1 text-xs text-stone-500">Enter your current cash on hand or bank balance to start the forecast.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor="balance" className="block text-xs font-medium text-stone-500 mb-1">Balance ($)</label>
            <div className="flex items-center rounded-2xl border border-stone-200 bg-white px-3 py-2">
              <span className="mr-1 text-stone-400">$</span>
              <input
                id="balance"
                type="number"
                min="0"
                step="0.01"
                value={balanceInput}
                onChange={e => handleBalanceChange(e.target.value)}
                placeholder="e.g. 5000"
                className="flex-1 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-300"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleGenerate(!generated)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            {loading ? "Generating…" : generated ? "Regenerate Forecast" : "Generate Forecast"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            <strong>Error:</strong> {error}
            {error.includes("not configured") && (
              <p className="mt-1 text-xs text-red-500">Make sure ANTHROPIC_API_KEY is set in the API server's .env file.</p>
            )}
          </div>
        )}
      </section>

      {/* Cash Gap Alerts */}
      {generated && hasAlerts && data && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 rounded-[20px] bg-red-50 px-5 py-3 ring-1 ring-red-200">
            <AlertTriangle size={16} className="shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-800">
              Cash shortfall predicted in {data.alerts.length} week{data.alerts.length !== 1 ? "s" : ""} — here's how to prepare
            </p>
          </div>

          {data.alerts.map((alert, i) => (
            <div key={i} className="rounded-[24px] border border-red-100 bg-red-50/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500" />
                    <span className="text-sm font-semibold text-red-800">
                      Week of {alert.weekStart} — ${Math.abs(alert.gapAmount).toFixed(0)} shortfall
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-red-700">{alert.cause}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {alert.suggestions.map((sug, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-red-700">
                    <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                    {sug}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Forecast Table */}
      {generated && data && data.forecast.length > 0 && (
        <section className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">5-Week Forecast</h2>
              <p className="text-xs text-stone-500">
                Generated {new Date(data.generatedAt).toLocaleDateString()} · Starting balance: ${data.currentBalance.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-700">
                <TrendingUp size={12} />
                Healthy
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <TrendingDown size={12} />
                Tight
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle size={12} />
                Shortfall
              </span>
            </div>
          </div>

          <div className="mt-5">
            <ForecastTable weeks={data.forecast} />
          </div>
        </section>
      )}

      {/* Bar Chart */}
      {generated && data && data.forecast.length > 0 && (
        <section className="rounded-[30px] border border-white/60 bg-white/60 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-700">Weekly Income vs Expenses</h2>
          <WeeklyBarChart weeks={data.forecast} />
        </section>
      )}

      {/* Empty state */}
      {!generated && !loading && (
        <section className="rounded-[30px] border border-dashed border-stone-300 bg-stone-50/60 p-10 text-center">
          <Wallet size={32} className="mx-auto text-stone-300" />
          <h3 className="mt-4 text-base font-semibold text-stone-700">No forecast yet</h3>
          <p className="mt-2 text-sm text-stone-500">
            Enter your current cash balance above and click "Generate Forecast" to see your 5-week cash flow projection.
          </p>
        </section>
      )}
    </div>
  );
}
