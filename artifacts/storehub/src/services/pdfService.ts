import jsPDF from 'jspdf';
import type { ShiftReport, DailyReport, WeeklyReport, MonthlyReport } from './reportService';
import { formatCurrency } from '../utils';

// ─── Color palette ───────────────────────────────────────────────────────────
const C = {
  primary:    [30,  64,  175] as [number, number, number],   // blue-800
  primaryMid: [59,  130, 246] as [number, number, number],   // blue-500
  accent:     [16,  185, 129] as [number, number, number],   // emerald-500
  danger:     [239, 68,  68]  as [number, number, number],   // red-500
  heading:    [15,  23,  42]  as [number, number, number],   // slate-900
  body:       [51,  65,  85]  as [number, number, number],   // slate-700
  muted:      [100, 116, 139] as [number, number, number],   // slate-500
  border:     [226, 232, 240] as [number, number, number],   // slate-200
  rowEven:    [248, 250, 252] as [number, number, number],   // slate-50
  rowOdd:     [255, 255, 255] as [number, number, number],   // white
  headerBg:   [239, 246, 255] as [number, number, number],   // blue-50
  white:      [255, 255, 255] as [number, number, number],
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rgb(pdf: jsPDF, color: [number, number, number]) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function fill(pdf: jsPDF, color: [number, number, number]) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function stroke(pdf: jsPDF, color: [number, number, number]) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function pageHeader(pdf: jsPDF, title: string, subtitle: string, storeName: string): number {
  // Navy banner
  fill(pdf, C.primary);
  pdf.rect(0, 0, PAGE_W, 36, 'F');

  // Title
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  rgb(pdf, C.white);
  pdf.text(title, MARGIN, 15);

  // Subtitle (date range / shift label)
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  rgb(pdf, [147, 197, 253]); // blue-300
  pdf.text(subtitle, MARGIN, 23);

  // Store name right-aligned
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  rgb(pdf, C.white);
  pdf.text(storeName, PAGE_W - MARGIN, 15, { align: 'right' });

  // Generated label
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  rgb(pdf, [147, 197, 253]);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_W - MARGIN, 23, { align: 'right' });

  // Thin accent line below banner
  fill(pdf, C.primaryMid);
  pdf.rect(0, 36, PAGE_W, 1.5, 'F');

  return 46; // y after header
}

function sectionTitle(pdf: jsPDF, label: string, y: number): number {
  fill(pdf, C.headerBg);
  stroke(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(MARGIN, y, CONTENT_W, 10, 1, 1, 'FD');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  rgb(pdf, C.primary);
  pdf.text(label.toUpperCase(), MARGIN + 4, y + 6.8);

  return y + 14;
}

function kpiRow(
  pdf: jsPDF,
  items: Array<{ label: string; value: string; highlight?: boolean }>,
  y: number,
): number {
  const colW = CONTENT_W / items.length;
  items.forEach((item, i) => {
    const x = MARGIN + i * colW;
    fill(pdf, item.highlight ? C.headerBg : C.rowOdd);
    stroke(pdf, C.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x + 1, y, colW - 2, 20, 1.5, 1.5, 'FD');

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    rgb(pdf, C.muted);
    pdf.text(item.label, x + 4, y + 7);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    rgb(pdf, item.highlight ? C.primary : C.heading);
    pdf.text(item.value, x + 4, y + 16);
  });
  return y + 24;
}

function tableHeader(pdf: jsPDF, cols: Array<{ label: string; x: number; w: number; align?: 'left' | 'right' }>, y: number): number {
  fill(pdf, C.primary);
  pdf.rect(MARGIN, y, CONTENT_W, 8, 'F');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  rgb(pdf, C.white);
  cols.forEach(col => {
    const tx = col.align === 'right' ? col.x + col.w - 2 : col.x + 2;
    pdf.text(col.label, tx, y + 5.5, { align: col.align ?? 'left' });
  });
  return y + 8;
}

function tableRow(
  pdf: jsPDF,
  cols: Array<{ value: string; x: number; w: number; align?: 'left' | 'right'; color?: [number, number, number] }>,
  y: number,
  isEven: boolean,
): number {
  fill(pdf, isEven ? C.rowEven : C.rowOdd);
  stroke(pdf, C.border);
  pdf.setLineWidth(0.2);
  pdf.rect(MARGIN, y, CONTENT_W, 7, 'FD');
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  cols.forEach(col => {
    rgb(pdf, col.color ?? C.body);
    const tx = col.align === 'right' ? col.x + col.w - 2 : col.x + 2;
    pdf.text(col.value, tx, y + 4.8, { align: col.align ?? 'left' });
  });
  return y + 7;
}

function pageFooter(pdf: jsPDF) {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    fill(pdf, C.primary);
    pdf.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    rgb(pdf, [147, 197, 253]);
    pdf.text('CONFIDENTIAL — Internal Use Only', MARGIN, PAGE_H - 3.5);
    pdf.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 3.5, { align: 'right' });
  }
}

function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 18) {
    pdf.addPage();
    return 18;
  }
  return y;
}

// ─── Shift Report PDF ─────────────────────────────────────────────────────────

export async function generateShiftReportPDF(report: ShiftReport, storeName: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = pageHeader(pdf, 'SHIFT REPORT', `${report.shiftDate}  ·  ${report.openTime} → ${report.closeTime}`, storeName);

  // ── Shift overview KPIs ──
  y = sectionTitle(pdf, 'Shift Overview', y);
  y = kpiRow(pdf, [
    { label: 'Opened', value: report.openTime },
    { label: 'Closed', value: report.closeTime },
    { label: 'Duration', value: report.duration },
  ], y);

  // ── Financial summary KPIs ──
  y = ensureSpace(pdf, y + 4, 28);
  y = sectionTitle(pdf, 'Financial Summary', y + 4);
  y = kpiRow(pdf, [
    { label: 'Total Sales', value: formatCurrency(report.totalSales), highlight: true },
    { label: 'Cash Sales', value: formatCurrency(report.cashSales) },
    { label: 'Card Sales', value: formatCurrency(report.cardSales) },
  ], y);
  y = kpiRow(pdf, [
    { label: 'Transactions', value: String(report.transactionCount) },
    { label: 'Avg Transaction', value: formatCurrency(report.avgTransactionValue) },
    { label: 'Tax Collected', value: formatCurrency(report.taxCollected) },
  ], y);

  // ── Cash drawer ──
  y = ensureSpace(pdf, y + 4, 40);
  y = sectionTitle(pdf, 'Cash Drawer Reconciliation', y + 4);
  const diff = report.cashDrawerSummary.difference;
  y = kpiRow(pdf, [
    { label: 'Opening Float', value: formatCurrency(report.openingFloat) },
    { label: 'Expected Cash', value: formatCurrency(report.cashDrawerSummary.expectedCash) },
    { label: 'Actual Cash', value: formatCurrency(report.cashDrawerSummary.actualCash) },
  ], y);

  // Variance row with color
  fill(pdf, diff < 0 ? [254, 242, 242] : diff > 0 ? [240, 253, 244] : C.rowEven);
  stroke(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(MARGIN, y, CONTENT_W, 12, 1.5, 1.5, 'FD');
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  rgb(pdf, C.muted);
  pdf.text('Variance', MARGIN + 4, y + 5);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  rgb(pdf, diff < 0 ? C.danger : diff > 0 ? C.accent : C.body);
  const sign = diff > 0 ? '+' : '';
  pdf.text(`${sign}${formatCurrency(diff)}  ${diff < 0 ? 'SHORTAGE' : diff > 0 ? 'OVERAGE' : 'BALANCED'}`, MARGIN + 4, y + 10.5);
  y += 16;

  // ── Top products ──
  if (report.topProductsByQuantity.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.topProductsByQuantity.length * 7);
    y = sectionTitle(pdf, 'Top Products by Quantity', y + 4);
    const cols = [
      { label: '#',       x: MARGIN,      w: 10 },
      { label: 'Product', x: MARGIN + 10, w: 110 },
      { label: 'Qty',     x: MARGIN + 120, w: 20, align: 'right' as const },
      { label: 'Revenue', x: MARGIN + 140, w: 38, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.topProductsByQuantity.forEach((p, i) => {
      y = tableRow(pdf, [
        { value: String(i + 1), x: MARGIN,      w: 10 },
        { value: p.name,        x: MARGIN + 10, w: 110 },
        { value: String(p.quantity), x: MARGIN + 120, w: 20, align: 'right' },
        { value: formatCurrency(p.revenue), x: MARGIN + 140, w: 38, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Refunds ──
  if (report.refunds.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.refunds.length * 7);
    y = sectionTitle(pdf, 'Refunds', y + 4);
    const cols = [
      { label: 'Reason',  x: MARGIN,      w: 120 },
      { label: 'Amount',  x: MARGIN + 120, w: 58, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.refunds.forEach((r, i) => {
      y = tableRow(pdf, [
        { value: r.reason,               x: MARGIN,      w: 120 },
        { value: formatCurrency(r.amount), x: MARGIN + 120, w: 58, align: 'right', color: C.danger },
      ], y, i % 2 === 0);
    });
  }

  pageFooter(pdf);
  return pdf.output('blob');
}

// ─── Daily Report PDF ─────────────────────────────────────────────────────────

export async function generateDailyReportPDF(report: DailyReport, storeName: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = pageHeader(pdf, 'DAILY REPORT', report.date, storeName);

  // ── Summary KPIs ──
  y = sectionTitle(pdf, 'Sales Summary', y);
  y = kpiRow(pdf, [
    { label: 'Total Revenue',   value: formatCurrency(report.totalRevenue), highlight: true },
    { label: 'Transactions',    value: String(report.transactionCount) },
    { label: 'Avg Transaction', value: formatCurrency(report.avgTransactionValue) },
  ], y);
  y = kpiRow(pdf, [
    { label: 'Gross Profit',  value: formatCurrency(report.grossProfit) },
    { label: 'Tax Collected', value: formatCurrency(report.taxCollected) },
    { label: 'Total Refunds', value: formatCurrency(report.totalRefunds), highlight: report.totalRefunds > 0 },
  ], y);

  // ── Comparisons ──
  y = ensureSpace(pdf, y + 4, 28);
  y = sectionTitle(pdf, 'Performance vs Prior Periods', y + 4);
  y = kpiRow(pdf, [
    {
      label: 'vs Yesterday',
      value: `${report.comparisonToYesterday.change.toFixed(1)}%  ${report.comparisonToYesterday.isPositive ? '↑' : '↓'}`,
      highlight: report.comparisonToYesterday.isPositive,
    },
    {
      label: 'vs Last Week',
      value: `${report.comparisonToLastWeek.change.toFixed(1)}%  ${report.comparisonToLastWeek.isPositive ? '↑' : '↓'}`,
      highlight: report.comparisonToLastWeek.isPositive,
    },
  ], y);

  // ── Payment methods ──
  const pmEntries = Object.entries(report.revenueByPaymentMethod);
  if (pmEntries.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + pmEntries.length * 7);
    y = sectionTitle(pdf, 'Revenue by Payment Method', y + 4);
    const cols = [
      { label: 'Method',  x: MARGIN,      w: 120 },
      { label: 'Amount',  x: MARGIN + 120, w: 58, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    pmEntries.forEach(([method, amount], i) => {
      y = tableRow(pdf, [
        { value: method,                  x: MARGIN,      w: 120 },
        { value: formatCurrency(amount),  x: MARGIN + 120, w: 58, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Top products by revenue ──
  if (report.topProductsByRevenue.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.topProductsByRevenue.length * 7);
    y = sectionTitle(pdf, 'Top Products by Revenue', y + 4);
    const cols = [
      { label: '#',       x: MARGIN,      w: 10 },
      { label: 'Product', x: MARGIN + 10, w: 148 },
      { label: 'Revenue', x: MARGIN + 158, w: 20, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.topProductsByRevenue.forEach((p, i) => {
      y = tableRow(pdf, [
        { value: String(i + 1),          x: MARGIN,      w: 10 },
        { value: p.name,                 x: MARGIN + 10, w: 148 },
        { value: formatCurrency(p.revenue), x: MARGIN + 158, w: 20, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  pageFooter(pdf);
  return pdf.output('blob');
}

// ─── Weekly Report PDF ────────────────────────────────────────────────────────

export async function generateWeeklyReportPDF(report: WeeklyReport, storeName: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = pageHeader(pdf, 'WEEKLY REPORT', report.weekDates, storeName);

  // ── Summary KPIs ──
  y = sectionTitle(pdf, 'Weekly Summary', y);
  y = kpiRow(pdf, [
    { label: 'Total Revenue',    value: formatCurrency(report.totalRevenue), highlight: true },
    { label: 'Total Profit',     value: formatCurrency(report.totalProfit) },
    { label: 'Avg Daily Revenue', value: formatCurrency(report.avgDailyRevenue) },
  ], y);
  y = kpiRow(pdf, [
    { label: 'Transactions',  value: String(report.totalTransactions) },
    { label: 'vs Last Week',  value: `${report.revenueVsLastWeek.change.toFixed(1)}%`, highlight: report.revenueVsLastWeek.isPositive },
    { label: 'Net Cash Flow', value: formatCurrency(report.netCashFlow) },
  ], y);

  // ── Best & worst day ──
  y = ensureSpace(pdf, y + 4, 28);
  y = sectionTitle(pdf, 'Day Highlights', y + 4);
  y = kpiRow(pdf, [
    { label: 'Best Day',  value: `${report.bestDay.day}  ${formatCurrency(report.bestDay.amount)}`,  highlight: true },
    { label: 'Worst Day', value: `${report.worstDay.day}  ${formatCurrency(report.worstDay.amount)}` },
  ], y);

  // ── Daily revenue table ──
  if (report.dailyRevenue.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.dailyRevenue.length * 7);
    y = sectionTitle(pdf, 'Daily Revenue Breakdown', y + 4);
    const cols = [
      { label: 'Day',     x: MARGIN,      w: 100 },
      { label: 'Revenue', x: MARGIN + 100, w: 78, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.dailyRevenue.forEach((d, i) => {
      y = tableRow(pdf, [
        { value: d.day,                   x: MARGIN,      w: 100 },
        { value: formatCurrency(d.revenue), x: MARGIN + 100, w: 78, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Payment methods ──
  const pmEntries = Object.entries(report.paymentMethodBreakdown);
  if (pmEntries.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + pmEntries.length * 7);
    y = sectionTitle(pdf, 'Payment Method Breakdown', y + 4);
    const cols = [
      { label: 'Method',  x: MARGIN,      w: 120 },
      { label: 'Amount',  x: MARGIN + 120, w: 58, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    pmEntries.forEach(([method, amount], i) => {
      y = tableRow(pdf, [
        { value: method,                 x: MARGIN,      w: 120 },
        { value: formatCurrency(amount), x: MARGIN + 120, w: 58, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Top products ──
  if (report.topProductsByRevenue.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + Math.min(report.topProductsByRevenue.length, 10) * 7);
    y = sectionTitle(pdf, 'Top Products by Revenue', y + 4);
    const cols = [
      { label: '#',       x: MARGIN,      w: 10 },
      { label: 'Product', x: MARGIN + 10, w: 148 },
      { label: 'Revenue', x: MARGIN + 158, w: 20, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.topProductsByRevenue.slice(0, 10).forEach((p, i) => {
      y = tableRow(pdf, [
        { value: String(i + 1),          x: MARGIN,      w: 10 },
        { value: p.name,                 x: MARGIN + 10, w: 148 },
        { value: formatCurrency(p.revenue), x: MARGIN + 158, w: 20, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  pageFooter(pdf);
  return pdf.output('blob');
}

// ─── Monthly Report PDF ───────────────────────────────────────────────────────

export async function generateMonthlyReportPDF(report: MonthlyReport, storeName: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = pageHeader(pdf, 'MONTHLY REPORT', `${report.month} ${report.year}`, storeName);

  // ── Summary KPIs ──
  y = sectionTitle(pdf, 'Monthly Summary', y);
  y = kpiRow(pdf, [
    { label: 'Total Revenue',  value: formatCurrency(report.totalRevenue), highlight: true },
    { label: 'Net Profit',     value: formatCurrency(report.totalRealProfit) },
    { label: 'Profit Margin',  value: `${report.netProfitMargin.toFixed(1)}%` },
  ], y);
  y = kpiRow(pdf, [
    { label: 'Transactions',   value: String(report.totalTransactions) },
    { label: 'Avg Daily Rev',  value: formatCurrency(report.avgDailyRevenue) },
    { label: 'Supplier Spend', value: formatCurrency(report.supplierSpending) },
  ], y);

  // ── vs Prior periods ──
  y = ensureSpace(pdf, y + 4, 28);
  y = sectionTitle(pdf, 'Comparisons', y + 4);
  y = kpiRow(pdf, [
    {
      label: 'vs Last Month',
      value: `${report.revenueLastMonth.change.toFixed(1)}%  ${report.revenueLastMonth.isPositive ? '↑' : '↓'}`,
      highlight: report.revenueLastMonth.isPositive,
    },
    {
      label: 'vs Same Month Last Year',
      value: `${report.revenueSameMonthLastYear.change.toFixed(1)}%  ${report.revenueSameMonthLastYear.isPositive ? '↑' : '↓'}`,
      highlight: report.revenueSameMonthLastYear.isPositive,
    },
  ], y);

  // ── Revenue by category ──
  if (report.revenueByCategory.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.revenueByCategory.length * 7);
    y = sectionTitle(pdf, 'Revenue by Category', y + 4);
    const cols = [
      { label: 'Category', x: MARGIN,      w: 120 },
      { label: 'Revenue',  x: MARGIN + 120, w: 58, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.revenueByCategory.forEach((cat, i) => {
      y = tableRow(pdf, [
        { value: cat.category,            x: MARGIN,      w: 120 },
        { value: formatCurrency(cat.revenue), x: MARGIN + 120, w: 58, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Top products ──
  if (report.topProductsByRevenue.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + Math.min(report.topProductsByRevenue.length, 10) * 7);
    y = sectionTitle(pdf, 'Top Products by Revenue', y + 4);
    const cols = [
      { label: '#',       x: MARGIN,      w: 10 },
      { label: 'Product', x: MARGIN + 10, w: 148 },
      { label: 'Revenue', x: MARGIN + 158, w: 20, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.topProductsByRevenue.slice(0, 10).forEach((p, i) => {
      y = tableRow(pdf, [
        { value: String(i + 1),          x: MARGIN,      w: 10 },
        { value: p.name,                 x: MARGIN + 10, w: 148 },
        { value: formatCurrency(p.revenue), x: MARGIN + 158, w: 20, align: 'right' },
      ], y, i % 2 === 0);
    });
  }

  // ── Expenses by category ──
  if (report.expensesByCategory.length > 0) {
    y = ensureSpace(pdf, y + 4, 20 + report.expensesByCategory.length * 7);
    y = sectionTitle(pdf, 'Expenses by Category', y + 4);
    const cols = [
      { label: 'Category', x: MARGIN,      w: 120 },
      { label: 'Amount',   x: MARGIN + 120, w: 58, align: 'right' as const },
    ];
    y = tableHeader(pdf, cols, y);
    report.expensesByCategory.forEach((exp, i) => {
      y = tableRow(pdf, [
        { value: exp.category,            x: MARGIN,      w: 120 },
        { value: formatCurrency(exp.amount), x: MARGIN + 120, w: 58, align: 'right', color: C.danger },
      ], y, i % 2 === 0);
    });
  }

  pageFooter(pdf);
  return pdf.output('blob');
}
