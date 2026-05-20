import type { Sale, Refund, UserProfile } from "../schemas";
import type { CashShift, CashShiftReport } from "./cashDrawerService";
import { getShiftReport } from "./cashDrawerService";

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  total: number;
  percentage: number;
}

export interface DailySalesReport {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscounts: number;
  transactionCount: number;
  averageTransaction: number;
  paymentMethods: PaymentMethodBreakdown[];
}

export interface CashDrawerReport {
  shiftId: string;
  date: string;
  openingFloat: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  isBalanced: boolean;
  discrepancyNote?: string;
}

export interface RefundsReport {
  date: string;
  totalRefunds: number;
  refundCount: number;
  reasonBreakdown: Record<string, { count: number; amount: number }>;
}

export function generateDailySalesReport(
  sales: Sale[],
  date: string,
): DailySalesReport {
  const dateSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt).toISOString().split('T')[0];
    return saleDate === date;
  });

  const totalRevenue = dateSales.reduce((sum, s) => sum + s.total, 0);
  const totalTax = dateSales.reduce((sum, s) => sum + (s.tax || 0), 0);
  const totalDiscounts = dateSales.reduce((sum, s) => {
    const subtotal = s.items.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
    return sum + Math.max(0, subtotal - s.total + totalTax);
  }, 0);

  // Group by payment method
  const methodMap: Record<string, { count: number; total: number }> = {};
  for (const sale of dateSales) {
    const method = sale.paymentMethod || 'unknown';
    if (!methodMap[method]) {
      methodMap[method] = { count: 0, total: 0 };
    }
    methodMap[method].count += 1;
    methodMap[method].total += sale.total;
  }

  const paymentMethods: PaymentMethodBreakdown[] = Object.entries(methodMap).map(
    ([method, data]) => ({
      method,
      count: data.count,
      total: data.total,
      percentage: totalRevenue > 0 ? (data.total / totalRevenue) * 100 : 0,
    })
  );

  return {
    date,
    totalSales: dateSales.length,
    totalRevenue,
    totalTax,
    totalDiscounts,
    transactionCount: dateSales.length,
    averageTransaction: dateSales.length > 0 ? totalRevenue / dateSales.length : 0,
    paymentMethods,
  };
}

export function generateCashDrawerReport(
  shift: CashShift,
): CashDrawerReport {
  const report = getShiftReport(shift.id);
  if (!report) {
    return {
      shiftId: shift.id,
      date: shift.date,
      openingFloat: shift.openingFloat,
      cashIn: shift.cashIn,
      cashOut: shift.cashOut,
      expectedCash: shift.openingFloat + shift.cashIn - shift.cashOut,
      countedCash: shift.countedClose || 0,
      variance: 0,
      isBalanced: true,
    };
  }

  return {
    shiftId: shift.id,
    date: shift.date,
    openingFloat: report.shift.openingFloat,
    cashIn: report.shift.cashIn,
    cashOut: report.shift.cashOut,
    expectedCash: report.expectedCash,
    countedCash: report.actualCash,
    variance: report.variance,
    isBalanced: report.isBalanced,
    discrepancyNote: report.discrepancyNote,
  };
}

export function generateRefundsReport(
  refunds: Refund[],
  date: string,
): RefundsReport {
  const dateRefunds = refunds.filter(r => {
    const refundDate = new Date(r.createdAt).toISOString().split('T')[0];
    return refundDate === date;
  });

  const totalRefunds = dateRefunds.reduce((sum, r) => sum + r.amount, 0);

  const reasonBreakdown: Record<string, { count: number; amount: number }> = {};
  for (const refund of dateRefunds) {
    const reason = refund.reason || 'unknown';
    if (!reasonBreakdown[reason]) {
      reasonBreakdown[reason] = { count: 0, amount: 0 };
    }
    reasonBreakdown[reason].count += 1;
    reasonBreakdown[reason].amount += refund.amount;
  }

  return {
    date,
    totalRefunds,
    refundCount: dateRefunds.length,
    reasonBreakdown,
  };
}

export function generatePaymentMethodSummary(
  sales: Sale[],
  startDate: string,
  endDate: string,
): PaymentMethodBreakdown[] {
  const validSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt).toISOString().split('T')[0];
    return saleDate >= startDate && saleDate <= endDate;
  });

  const methodMap: Record<string, { count: number; total: number }> = {};
  let grandTotal = 0;

  for (const sale of validSales) {
    const method = sale.paymentMethod || 'unknown';
    if (!methodMap[method]) {
      methodMap[method] = { count: 0, total: 0 };
    }
    methodMap[method].count += 1;
    methodMap[method].total += sale.total;
    grandTotal += sale.total;
  }

  return Object.entries(methodMap).map(([method, data]) => ({
    method,
    count: data.count,
    total: data.total,
    percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
  }));
}

export function exportReportAsPDF(
  title: string,
  reportData: Record<string, any>,
  storeName: string,
): void {
  const content = generatePDFContent(title, reportData, storeName);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(content);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

function generatePDFContent(
  title: string,
  reportData: Record<string, any>,
  storeName: string,
): string {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .header p {
          margin: 5px 0;
          color: #666;
        }
        .section {
          margin: 20px 0;
          page-break-inside: avoid;
        }
        .section h2 {
          font-size: 16px;
          border-bottom: 1px solid #ddd;
          padding-bottom: 5px;
          margin-bottom: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        th {
          background-color: #f0f0f0;
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
          font-weight: bold;
        }
        td {
          border: 1px solid #ddd;
          padding: 8px;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .amount {
          text-align: right;
        }
        .number {
          text-align: center;
        }
        .total-row {
          background-color: #f0f0f0;
          font-weight: bold;
        }
        @media print {
          body { margin: 0; padding: 10px; }
          .section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
        <p>${storeName}</p>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>

      <div class="content">
        ${generateTableHTML(reportData)}
      </div>
    </body>
    </html>
  `;

  return html;
}

function generateTableHTML(data: Record<string, any>): string {
  let html = '';

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      html += `
        <div class="section">
          <h2>${formatKey(key)}</h2>
          <table>
            <thead>
              <tr>
                ${Object.keys(value[0] || {})
                  .map(k => `<th>${formatKey(k)}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${value
                .map(
                  row =>
                    `<tr>
                  ${Object.values(row)
                    .map((v: any) =>
                      typeof v === 'number' && v > 100
                        ? `<td class="amount">$${v.toFixed(2)}</td>`
                        : typeof v === 'number'
                        ? `<td class="number">${v}</td>`
                        : `<td>${v}</td>`
                    )
                    .join('')}
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (typeof value === 'object') {
      html += `
        <div class="section">
          <h2>${formatKey(key)}</h2>
          <table>
            <tbody>
              ${Object.entries(value)
                .map(
                  ([k, v]) =>
                    `<tr>
                <td><strong>${formatKey(k)}</strong></td>
                <td class="amount">${
                  typeof v === 'number' ? (v > 100 ? `$${v.toFixed(2)}` : v) : v
                }</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  return html;
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}
