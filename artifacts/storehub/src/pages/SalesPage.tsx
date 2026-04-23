import { useEffect, useState } from "react";
import { Receipt, X } from "lucide-react";
import { useApp } from "../contexts/useApp";
import { PageHero, SectionTitle, SummaryTile, SurfaceCard } from "../components/page-shell";
import { getSales } from "../services/dataService";
import type { Sale } from "../schemas";
import { formatCurrency, formatDateTime } from "../utils";

export default function SalesPage() {
  const { t, currencySymbol, profile } = useApp();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  useEffect(() => {
    getSales().then((records) => {
      setSales(records);
      setLoading(false);
    });
  }, []);

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHero
        eyebrow="Sales"
        title="A clean history of every completed purchase."
        description="Review receipts quickly, keep totals visible, and open any sale without digging."
        stats={
          <>
            <SummaryTile label="Receipts" value={String(sales.length)} />
            <SummaryTile label="All-time revenue" value={formatCurrency(totalRevenue, currencySymbol)} />
          </>
        }
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-stone-400">Loading…</div>
      ) : sales.length === 0 ? (
        <SurfaceCard className="text-center">
          <div className="py-10 text-sm text-stone-500">{t.sales.noSales}</div>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="overflow-hidden p-0">
          <div className="px-6 py-5">
            <SectionTitle title="Receipt history" description="Newest sales appear first with quick receipt access." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-[#faf7f1]">
                  <th className="px-4 py-3 text-left font-semibold text-stone-500">Date</th>
                  <th className="hidden px-4 py-3 text-left font-semibold text-stone-500 sm:table-cell">Receipt #</th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-500">Items</th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-500">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sales.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-[#fcfbf8]">
                    <td className="px-4 py-3 text-stone-600">{formatDateTime(sale.createdAt)}</td>
                    <td className="hidden px-4 py-3 text-xs text-stone-400 sm:table-cell">{sale.receiptNumber}</td>
                    <td className="px-4 py-3 text-right text-stone-600">{sale.items.length}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(sale.total, currencySymbol)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewSale(sale)} className="rounded-2xl p-2 text-stone-400 transition hover:bg-amber-50 hover:text-amber-700">
                        <Receipt size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

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
    </div>
  );
}
