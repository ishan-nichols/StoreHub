import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import { getSales } from "../services/dataService";
import type { Sale } from "../schemas";
import { formatCurrency, formatDateTime } from "../utils";
import { Receipt, X } from "lucide-react";

export default function SalesPage() {
  const { t, currencySymbol, profile } = useApp();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  useEffect(() => {
    getSales().then((s) => { setSales(s); setLoading(false); });
  }, []);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t.sales.title}</h1>
        {sales.length > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-400">All time</div>
            <div className="text-lg font-bold text-emerald-600">{formatCurrency(totalRevenue, currencySymbol)}</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading...</div>
      ) : sales.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{t.sales.noSales}</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Receipt #</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Items</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateTime(sale.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{sale.receiptNumber}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{sale.items.length}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(sale.total, currencySymbol)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewSale(sale)}
                        className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <Receipt size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Receipt Modal */}
      {viewSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">Receipt {viewSale.receiptNumber}</h2>
              <button onClick={() => setViewSale(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-xs text-gray-400 text-center">{formatDateTime(viewSale.createdAt)}</div>
              <div className="text-center font-bold text-gray-700 dark:text-gray-200">{profile?.storeName}</div>
              <div className="border-t border-dashed border-gray-200 dark:border-gray-600 my-2" />
              {viewSale.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-700 dark:text-gray-200">
                  <span>{item.productName} × {item.quantity}</span>
                  <span className="font-semibold">{formatCurrency(item.price * item.quantity, currencySymbol)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-gray-800 dark:text-gray-100">
                <span>Total</span>
                <span className="text-emerald-600">{formatCurrency(viewSale.total, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Paid</span>
                <span>{formatCurrency(viewSale.amountPaid, currencySymbol)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
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
