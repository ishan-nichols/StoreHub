import { useState, useEffect } from "react";
import { DollarSign, Clock, CheckCircle, Download, Play } from "lucide-react";

interface PayrollRun {
  id:          string;
  periodStart: string;
  periodEnd:   string;
  status:      "draft" | "approved" | "paid";
  totalGross:  string;
  totalHours:  number;
  createdAt:   string;
}

interface LineItem {
  id:            string;
  employeeName:  string | null;
  payrollType:   string;
  regularHours:  number;
  overtimeHours: number;
  grossPay:      string;
  netPay:        string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:    { label: "Draft",    color: "bg-zinc-100 text-zinc-600" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
  paid:     { label: "Paid",     color: "bg-green-100 text-green-700" },
};

export default function PayrollPage() {
  const [runs,       setRuns]    = useState<PayrollRun[]>([]);
  const [selected,   setSelected] = useState<{ run: PayrollRun; lineItems: LineItem[] } | null>(null);
  const [loading,    setLoading]  = useState(true);
  const [showRun,    setShowRun]  = useState(false);
  const [runForm,    setRunForm]  = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [running,    setRunning]  = useState(false);

  async function loadRuns() {
    setLoading(true);
    try {
      const res = await fetch("/api/store/payroll/runs", { credentials: "include" });
      if (res.ok) setRuns(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/store/payroll/runs/${id}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setSelected({ run: data.run, lineItems: data.lineItems });
    }
  }

  useEffect(() => { loadRuns(); }, []);

  async function computePayroll(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    try {
      const res = await fetch("/api/store/payroll/run", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(runForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShowRun(false);
        setRunForm({ periodStart: "", periodEnd: "", notes: "" });
        loadRuns();
        setSelected({ run: data.run, lineItems: data.lineItems });
      }
    } finally {
      setRunning(false);
    }
  }

  async function approve(id: string) {
    await fetch(`/api/store/payroll/runs/${id}/approve`, { method: "POST", credentials: "include" });
    loadRuns();
    if (selected?.run.id === id) loadDetail(id);
  }

  async function markPaid(id: string) {
    await fetch(`/api/store/payroll/runs/${id}/mark-paid`, { method: "POST", credentials: "include" });
    loadRuns();
    if (selected?.run.id === id) loadDetail(id);
  }

  function exportCsv(id: string) {
    window.open(`/api/store/payroll/runs/${id}/export`, "_blank");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Payroll</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Compute, review, and approve payroll runs</p>
        </div>
        <button
          onClick={() => setShowRun(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Play className="w-4 h-4" />
          Run payroll
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-medium text-zinc-700 mb-2">Payroll runs</h2>
          {loading ? (
            <div className="text-sm text-zinc-400">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-zinc-400 bg-zinc-50 rounded-xl p-6 text-center">
              No payroll runs yet.<br />Click "Run payroll" to get started.
            </div>
          ) : runs.map((run) => {
            const s = STATUS_LABELS[run.status] ?? STATUS_LABELS.draft;
            return (
              <button
                key={run.id}
                onClick={() => loadDetail(run.id)}
                className={`w-full text-left p-4 border rounded-xl transition-all ${
                  selected?.run.id === run.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-zinc-900">
                    {run.periodStart} – {run.periodEnd}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${parseFloat(run.totalGross).toFixed(2)}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{run.totalHours.toFixed(1)}h</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-zinc-400 text-sm">
              Select a payroll run to view details
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-zinc-900">
                    {selected.run.periodStart} – {selected.run.periodEnd}
                  </h2>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {selected.lineItems.length} employees · ${parseFloat(selected.run.totalGross).toFixed(2)} gross
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportCsv(selected.run.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  {selected.run.status === "draft" && (
                    <button
                      onClick={() => approve(selected.run.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  )}
                  {selected.run.status === "approved" && (
                    <button
                      onClick={() => markPaid(selected.run.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Mark paid
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs text-zinc-400 uppercase">
                      <th className="text-left px-4 py-2.5">Employee</th>
                      <th className="text-left px-4 py-2.5">Type</th>
                      <th className="text-right px-4 py-2.5">Reg hrs</th>
                      <th className="text-right px-4 py-2.5">OT hrs</th>
                      <th className="text-right px-4 py-2.5">Gross</th>
                      <th className="text-right px-4 py-2.5">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lineItems.map((li) => (
                      <tr key={li.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium text-zinc-900">{li.employeeName ?? "—"}</td>
                        <td className="px-4 py-3 text-zinc-500 capitalize">{li.payrollType}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{li.regularHours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{li.overtimeHours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-medium">${parseFloat(li.grossPay).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">${parseFloat(li.netPay).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-200 font-semibold">
                      <td className="px-4 py-3" colSpan={4}>Total</td>
                      <td className="px-4 py-3 text-right">${parseFloat(selected.run.totalGross).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-green-600">
                        ${selected.lineItems.reduce((a, li) => a + parseFloat(li.netPay), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Run payroll modal */}
      {showRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">Compute Payroll</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Calculates pay for all employees with approved shifts in the selected date range.
            </p>
            <form onSubmit={computePayroll} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Period start</label>
                  <input
                    type="date"
                    value={runForm.periodStart}
                    onChange={(e) => setRunForm((f) => ({ ...f, periodStart: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Period end</label>
                  <input
                    type="date"
                    value={runForm.periodEnd}
                    onChange={(e) => setRunForm((f) => ({ ...f, periodEnd: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Notes (optional)</label>
                <textarea
                  value={runForm.notes}
                  onChange={(e) => setRunForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRun(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={running}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {running ? "Computing…" : "Compute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
