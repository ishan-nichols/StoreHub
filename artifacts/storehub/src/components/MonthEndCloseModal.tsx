import { CheckCircle2, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MonthCloseRecord } from "../schemas";
import type { MonthlyReport } from "../services/reportService";

interface Props {
  month: number;
  year: number;
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  onConfirmClose: () => void;
  monthlyReport: MonthlyReport | null;
  monthCloseRecord: MonthCloseRecord | null;
}

const STEP_LIST = [
  {
    title: "Reconcile cash drawer balances",
    description: "Count cash and compare your expected drawer total to the actual cash on hand.",
  },
  {
    title: "Verify supplier invoices",
    description: "Review deliveries and supplier expense records for the month.",
  },
  {
    title: "Confirm inventory shrinkage",
    description: "Check for missing stock, breakage, or receiving discrepancies.",
  },
  {
    title: "Review payroll and labor costs",
    description: "Confirm employee hours and payroll estimates for the period.",
  },
  {
    title: "Export the monthly report",
    description: "Generate the final PDF report and archive it for reference.",
  },
];

function formatMonthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

export default function MonthEndCloseModal({
  month,
  year,
  isOpen,
  isClosing,
  onClose,
  onConfirmClose,
  monthlyReport,
  monthCloseRecord,
}: Props) {
  const activeStoreId = typeof window !== "undefined" ? sessionStorage.getItem("sh_active_store_id") : null;
  const storageKey = useMemo(
    () => `storehub_month_close_checklist_${year}_${month}${activeStoreId ? `_${activeStoreId}` : ""}`,
    [month, year, activeStoreId],
  );
  const [checkedSteps, setCheckedSteps] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (monthCloseRecord) {
      setCheckedSteps(monthCloseRecord.completedSteps ?? STEP_LIST.map((step) => step.title));
      return;
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCheckedSteps(JSON.parse(saved));
      } else {
        setCheckedSteps([]);
      }
    } catch {
      setCheckedSteps([]);
    }
  }, [isOpen, monthCloseRecord, storageKey]);

  const toggleStep = (title: string) => {
    if (monthCloseRecord) return;
    setCheckedSteps((current) => {
      const next = current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const allStepsCompleted = STEP_LIST.every((step) => checkedSteps.includes(step.title));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl max-h-[calc(100vh-4rem)]">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500">Month-end close</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{formatMonthLabel(month, year)}</h2>
          </div>
          <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto px-6 py-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="rounded-3xl bg-slate-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className="mt-3 text-base leading-7 text-slate-700">
                  {monthCloseRecord
                    ? "This month has already been closed and locked. Review the finalized summary below."
                    : "Follow these steps to complete your month-end close, lock the books, and archive the monthly performance report."
                  }
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">Revenue</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{monthlyReport ? `$${monthlyReport.totalRevenue.toFixed(2)}` : "–"}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">Profit</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{monthlyReport ? `$${monthlyReport.totalRealProfit.toFixed(2)}` : "–"}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">Supplier spend</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{monthlyReport ? `$${monthlyReport.supplierSpending.toFixed(2)}` : "–"}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm text-slate-500">Shrinkage</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{monthlyReport ? `$${monthlyReport.shrinkage.toFixed(2)}` : "–"}</p>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-100 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Month-end checklist</p>
                <div className="mt-5 space-y-4">
                  {STEP_LIST.map((step) => {
                    const completed = checkedSteps.includes(step.title);
                    return (
                      <button
                        key={step.title}
                        type="button"
                        onClick={() => toggleStep(step.title)}
                        disabled={Boolean(monthCloseRecord)}
                        className={`w-full rounded-3xl border p-4 text-left transition ${completed ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${monthCloseRecord ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        aria-pressed={completed}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 flex h-9 w-9 items-center justify-center rounded-2xl ${completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {completed ? <CheckCircle2 className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold ${completed ? 'text-emerald-900' : 'text-slate-900'}`}>{step.title}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {monthCloseRecord ? (
                <div className="rounded-3xl bg-slate-900 p-6 text-white">
                  <p className="text-sm uppercase tracking-[0.2em] text-amber-300">Closed on</p>
                  <p className="mt-3 text-2xl font-semibold">{new Date(monthCloseRecord.closedAt).toLocaleDateString()}</p>
                  <div className="mt-6 space-y-3 text-slate-200">
                    <p>Revenue: <span className="font-semibold">${monthCloseRecord.revenue.toFixed(2)}</span></p>
                    <p>Expenses: <span className="font-semibold">${monthCloseRecord.expenses.toFixed(2)}</span></p>
                    <p>Profit: <span className="font-semibold">${monthCloseRecord.profit.toFixed(2)}</span></p>
                    <p>Cash variance: <span className="font-semibold">${monthCloseRecord.cashVariance.toFixed(2)}</span></p>
                  </div>
                  <div className="mt-6 rounded-3xl bg-slate-800 p-4">
                    <p className="text-sm font-semibold text-slate-300">Notes</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{monthCloseRecord.notes || "No notes were added."}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Ready to close</p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">Review the month summary and mark your checklist items. Confirm close at the end to lock the month.</p>
                  <div className="mt-6 space-y-2 text-slate-700">
                    <p className="text-sm font-semibold text-slate-900">Checklist progress</p>
                    <p>{checkedSteps.length} of {STEP_LIST.length} completed</p>
                  </div>
                </div>
              )}

              <div className="rounded-3xl bg-slate-50 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">What happens next</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  Once closed, the month is locked and the recorded summary is saved for future reference. You can still view the report, but the close status will remain permanent.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-6 mt-6">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Final confirmation</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">Confirm close only once all monthly tasks are complete to lock the books and save the final summary.</p>
              </div>
              <button
                type="button"
                onClick={onConfirmClose}
                disabled={isClosing || (!monthCloseRecord && !allStepsCompleted)}
                className="inline-flex w-full items-center justify-center rounded-full bg-amber-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
              >
                {monthCloseRecord ? 'Review locked close' : isClosing ? 'Closing month…' : 'Confirm close'}
              </button>
              {!monthCloseRecord && !allStepsCompleted && (
                <p className="text-sm text-rose-600">Please check off all items before confirming the close.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

