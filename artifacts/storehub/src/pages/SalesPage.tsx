import { useEffect, useState } from "react";
import { Receipt, X, RotateCcw } from "lucide-react";
import { useApp } from "../contexts/useApp";
import { useAuth } from "../contexts/AuthContext";
import { PageHero, SectionTitle, SummaryTile, SurfaceCard } from "../components/page-shell";
import { getSales, getRefunds } from "../services/dataService";
import type { Sale, Refund } from "../schemas";
import { formatCurrency, formatDateTime } from "../utils";

type TxSale   = { kind: "sale";   data: Sale };
type TxRefund = { kind: "refund"; data: Refund };
type Transaction = TxSale | TxRefund;

const REASON_LABEL: Record<string, string> = {
  damaged:               "Damaged",
  wrong_item:            "Wrong item",
  customer_changed_mind: "Customer changed mind",
  other:                 "Other",
};

export default function SalesPage() {
  const { t, currencySymbol, profile } = useApp();
  const { activeStoreId } = useAuth();

  const [sales,   setSales]   = useState<Sale[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewSale,   setViewSale]   = useState<Sale | null>(null);
  const [viewRefund, setViewRefund] = useState<Refund | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getSales(), getRefunds()]).then(([s, r]) => {
      setSales(s);
      setRefunds(r);
      setLoading(false);
    });
  }, [activeStoreId]);

  // Merge and sort newest-first
  const transactions: Transaction[] = [
    ...sales.map((s): TxSale => ({ kind: "sale", data: s })),
    ...refunds.map((r): TxRefund => ({ kind: "refund", data: r })),
  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());

  const totalRevenue  = sales.reduce((s, x) => s + x.total, 0);
  const totalRefunded = refunds.reduce((s, x) => s + x.amount, 0);
  const netRevenue    = totalRevenue - totalRefunded;

  // Find the original sale for a refund (for receipt number display)
  const saleMap = new Map(sales.map((s) => [s.id, s]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHero
        eyebrow="Sales"
        title="A clean history of every completed purchase."
        description="Review receipts quickly, keep totals visible, and open any sale without digging."
        stats={
          <>
            <SummaryTile label="Receipts"       value={String(sales.length)} />
            <SummaryTile label="Refunds"         value={String(refunds.length)} />
            <SummaryTile label="Net revenue"     value={formatCurrency(netRevenue, currencySymbol)} />
          </>
        }
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-stone-400">Loading…</div>
      ) : transactions.length === 0 ? (
        <SurfaceCard className="text-center">
          <div className="py-10 text-sm text-stone-500">{t.sales.noSales}</div>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="overflow-hidden p-0">
          <div className="px-6 py-5">
            <SectionTitle
              title="Transaction history"
              description="Sales and refunds combined — newest first."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-[#faf7f1]">
                  <th className="px-4 py-3 text-left font-semibold text-stone-500">Date</th>
                  <th className="hidden px-4 py-3 text-left font-semibold text-stone-500 sm:table-cell">Reference</th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-500">Type</th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-500">Items</th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-500">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {transactions.map((tx) => {
                  if (tx.kind === "sale") {
                    const sale = tx.data;
                    return (
                      <tr key={`sale-${sale.id}`} className="transition-colors hover:bg-[#fcfbf8]">
                        <td className="px-4 py-3 text-stone-600">{formatDateTime(sale.createdAt)}</td>
                        <td className="hidden px-4 py-3 text-xs text-stone-400 sm:table-cell">{sale.receiptNumber}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            <Receipt size={10} /> Sale
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">{sale.items.length}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">
                          +{formatCurrency(sale.total, currencySymbol)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setViewSale(sale)}
                            className="rounded-2xl p-2 text-stone-400 transition hover:bg-amber-50 hover:text-amber-700"
                          >
                            <Receipt size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  } else {
                    const refund = tx.data;
                    const origSale = saleMap.get(refund.saleId);
                    return (
                      <tr key={`refund-${refund.id}`} className="bg-red-50/40 transition-colors hover:bg-red-50">
                        <td className="px-4 py-3 text-stone-600">{formatDateTime(refund.createdAt)}</td>
                        <td className="hidden px-4 py-3 text-xs text-stone-400 sm:table-cell">
                          {origSale ? `Refund of ${origSale.receiptNumber}` : "Refund"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <RotateCcw size={10} /> Refund
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">{refund.items.length}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">
                          -{formatCurrency(refund.amount, currencySymbol)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setViewRefund(refund)}
                            className="rounded-2xl p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-700"
                          >
                            <RotateCcw size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
          </div>

          {/* Net revenue footer */}
          {refunds.length > 0 && (
            <div className="border-t border-stone-200 bg-[#faf7f1] px-6 py-3 flex flex-wrap items-center justify-end gap-6 text-sm">
              <span className="text-stone-500">Gross: <span className="font-semibold text-emerald-700">{formatCurrency(totalRevenue, currencySymbol)}</span></span>
              <span className="text-stone-500">Refunded: <span className="font-semibold text-red-600">-{formatCurrency(totalRefunded, currencySymbol)}</span></span>
              <span className="text-stone-700 font-bold">Net: {formatCurrency(netRevenue, currencySymbol)}</span>
            </div>
          )}
        </SurfaceCard>
      )}

      {/* Sale receipt modal */}
      {viewSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[32px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="font-bold text-stone-900">Receipt {viewSale.receiptNumber}</h2>
              <button onClick={() => setViewSale(null)} className="rounded-2xl p-1 text-stone-400 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-6">
              <div className="text-center text-xs text-stone-400">{formatDateTime(viewSale.createdAt)}</div>
              <div className="text-center font-bold text-stone-700">{profile?.storeName}</div>
              <div className="my-2 border-t border-dashed border-stone-200" />
              {viewSale.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm text-stone-700">
                  <span>{item.productName} × {item.quantity}</span>
                  <span className="font-semibold">{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-200 pt-2 font-bold text-stone-900">
                <span>Total</span>
                <span className="text-emerald-600">{formatCurrency(viewSale.total, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-sm text-stone-500">
                <span>Paid</span>
                <span>{formatCurrency(viewSale.amountPaid, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-sm text-stone-500">
                <span>Change</span>
                <span>{formatCurrency(viewSale.change, currencySymbol)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund detail modal */}
      {viewRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[32px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="font-bold text-stone-900 flex items-center gap-2">
                <RotateCcw size={16} className="text-red-500" /> Refund Detail
              </h2>
              <button onClick={() => setViewRefund(null)} className="rounded-2xl p-1 text-stone-400 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-6">
              <div className="text-center text-xs text-stone-400">{formatDateTime(viewRefund.createdAt)}</div>
              {saleMap.get(viewRefund.saleId) && (
                <div className="text-center text-xs text-stone-500">
                  For receipt: <span className="font-semibold">{saleMap.get(viewRefund.saleId)!.receiptNumber}</span>
                </div>
              )}
              <div className="my-2 border-t border-dashed border-stone-200" />
              {viewRefund.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm text-stone-700">
                  <span>{item.productName} × {item.quantity}</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-stone-200 pt-2 font-bold text-stone-900">
                <span>Refund total</span>
                <span className="text-red-600">-{formatCurrency(viewRefund.amount, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-sm text-stone-500">
                <span>Reason</span>
                <span>{REASON_LABEL[viewRefund.reason] ?? viewRefund.reason}</span>
              </div>
              {viewRefund.reasonNote && (
                <div className="flex justify-between text-sm text-stone-500">
                  <span>Note</span>
                  <span className="text-right max-w-[60%]">{viewRefund.reasonNote}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-stone-500">
                <span>Payment method</span>
                <span className="capitalize">{viewRefund.paymentMethod}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
