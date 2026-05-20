import jsPDF from 'jspdf';
import type { ShiftReport, DailyReport, WeeklyReport, MonthlyReport } from './reportService';
import { formatCurrency } from '../utils';

export async function generateShiftReportPDF(report: ShiftReport, storeName: string, logo?: string): Promise<Blob> {
  const pdf = new jsPDF();
  let y = 20;

  // Header
  pdf.setFontSize(20);
  pdf.text('SHIFT REPORT', 105, y, { align: 'center' });
  y += 10;
  pdf.setFontSize(12);
  pdf.text(storeName, 105, y, { align: 'center' });
  y += 20;

  // Shift details
  pdf.setFontSize(14);
  pdf.text(`Date: ${report.shiftDate}`, 20, y);
  y += 10;
  pdf.text(`Open: ${report.openTime} - Close: ${report.closeTime}`, 20, y);
  y += 10;
  pdf.text(`Duration: ${report.duration}`, 20, y);
  y += 20;

  // Financial summary
  pdf.setFontSize(12);
  pdf.text('Financial Summary', 20, y);
  y += 10;
  pdf.text(`Opening Float: ${formatCurrency(report.openingFloat)}`, 30, y);
  y += 8;
  pdf.text(`Cash Sales: ${formatCurrency(report.cashSales)}`, 30, y);
  y += 8;
  pdf.text(`Card Sales: ${formatCurrency(report.cardSales)}`, 30, y);
  y += 8;
  pdf.text(`Total Sales: ${formatCurrency(report.totalSales)}`, 30, y);
  y += 8;
  pdf.text(`Transactions: ${report.transactionCount}`, 30, y);
  y += 8;
  pdf.text(`Avg Transaction: ${formatCurrency(report.avgTransactionValue)}`, 30, y);
  y += 8;
  pdf.text(`Tax Collected: ${formatCurrency(report.taxCollected)}`, 30, y);
  y += 20;

  // Top products
  pdf.text('Top Products by Quantity', 20, y);
  y += 10;
  report.topProductsByQuantity.forEach(product => {
    pdf.text(`${product.name}: ${product.quantity} (${formatCurrency(product.revenue)})`, 30, y);
    y += 8;
  });
  y += 10;

  pdf.text('Top Products by Revenue', 20, y);
  y += 10;
  report.topProductsByRevenue.forEach(product => {
    pdf.text(`${product.name}: ${formatCurrency(product.revenue)} (${product.quantity})`, 30, y);
    y += 8;
  });
  y += 20;

  // Cash drawer
  pdf.text('Cash Drawer Summary', 20, y);
  y += 10;
  pdf.text(`Expected Cash: ${formatCurrency(report.cashDrawerSummary.expectedCash)}`, 30, y);
  y += 8;
  pdf.text(`Actual Cash: ${formatCurrency(report.cashDrawerSummary.actualCash)}`, 30, y);
  y += 8;
  pdf.text(`Difference: ${formatCurrency(report.cashDrawerSummary.difference)}`, 30, y);
  y += 20;

  // Refunds
  if (report.refunds.length > 0) {
    pdf.text('Refunds', 20, y);
    y += 10;
    report.refunds.forEach(refund => {
      pdf.text(`${refund.reason}: ${formatCurrency(refund.amount)}`, 30, y);
      y += 8;
    });
  }

  return pdf.output('blob');
}

export async function generateDailyReportPDF(report: DailyReport, storeName: string, logo?: string): Promise<Blob> {
  const pdf = new jsPDF();
  let y = 20;

  // Header
  pdf.setFontSize(20);
  pdf.text('DAILY REPORT', 105, y, { align: 'center' });
  y += 10;
  pdf.setFontSize(12);
  pdf.text(storeName, 105, y, { align: 'center' });
  y += 10;
  pdf.text(`Date: ${report.date}`, 105, y, { align: 'center' });
  y += 20;

  // Summary
  pdf.setFontSize(14);
  pdf.text('Summary', 20, y);
  y += 10;
  pdf.setFontSize(12);
  pdf.text(`Total Revenue: ${formatCurrency(report.totalRevenue)}`, 30, y);
  y += 8;
  pdf.text(`Transactions: ${report.transactionCount}`, 30, y);
  y += 8;
  pdf.text(`Avg Transaction: ${formatCurrency(report.avgTransactionValue)}`, 30, y);
  y += 8;
  pdf.text(`Gross Profit: ${formatCurrency(report.grossProfit)}`, 30, y);
  y += 8;
  pdf.text(`Tax Collected: ${formatCurrency(report.taxCollected)}`, 30, y);
  y += 20;

  // Payment methods
  pdf.text('Revenue by Payment Method', 20, y);
  y += 10;
  Object.entries(report.revenueByPaymentMethod).forEach(([method, amount]) => {
    pdf.text(`${method}: ${formatCurrency(amount)}`, 30, y);
    y += 8;
  });
  y += 10;

  // Top products
  pdf.text('Top Products by Revenue', 20, y);
  y += 10;
  report.topProductsByRevenue.forEach(product => {
    pdf.text(`${product.name}: ${formatCurrency(product.revenue)}`, 30, y);
    y += 8;
  });
  y += 10;

  pdf.text('Top Products by Quantity', 20, y);
  y += 10;
  report.topProductsByQuantity.forEach(product => {
    pdf.text(`${product.name}: ${product.quantity}`, 30, y);
    y += 8;
  });
  y += 10;

  // Comparisons
  pdf.text('Comparisons', 20, y);
  y += 10;
  pdf.text(`vs Yesterday: ${report.comparisonToYesterday.change.toFixed(1)}% ${report.comparisonToYesterday.isPositive ? '↑' : '↓'}`, 30, y);
  y += 8;
  pdf.text(`vs Last Week: ${report.comparisonToLastWeek.change.toFixed(1)}% ${report.comparisonToLastWeek.isPositive ? '↑' : '↓'}`, 30, y);

  return pdf.output('blob');
}

export async function generateWeeklyReportPDF(report: WeeklyReport, storeName: string, logo?: string): Promise<Blob> {
  const pdf = new jsPDF();
  let y = 20;

  // Header
  pdf.setFontSize(20);
  pdf.text('WEEKLY REPORT', 105, y, { align: 'center' });
  y += 10;
  pdf.setFontSize(12);
  pdf.text(storeName, 105, y, { align: 'center' });
  y += 10;
  pdf.text(`Week: ${report.weekDates}`, 105, y, { align: 'center' });
  y += 20;

  // Summary
  pdf.setFontSize(14);
  pdf.text('Summary', 20, y);
  y += 10;
  pdf.setFontSize(12);
  pdf.text(`Total Revenue: ${formatCurrency(report.totalRevenue)}`, 30, y);
  y += 8;
  pdf.text(`Total Profit: ${formatCurrency(report.totalProfit)}`, 30, y);
  y += 8;
  pdf.text(`vs Last Week: ${report.revenueVsLastWeek.change.toFixed(1)}% ${report.revenueVsLastWeek.isPositive ? '↑' : '↓'}`, 30, y);
  y += 8;
  pdf.text(`Best Day: ${report.bestDay.day} (${formatCurrency(report.bestDay.amount)})`, 30, y);
  y += 8;
  pdf.text(`Worst Day: ${report.worstDay.day} (${formatCurrency(report.worstDay.amount)})`, 30, y);
  y += 8;
  pdf.text(`Avg Daily Revenue: ${formatCurrency(report.avgDailyRevenue)}`, 30, y);
  y += 20;

  // Payment methods
  pdf.text('Payment Method Breakdown', 20, y);
  y += 10;
  Object.entries(report.paymentMethodBreakdown).forEach(([method, amount]) => {
    pdf.text(`${method}: ${formatCurrency(amount)}`, 30, y);
    y += 8;
  });
  y += 10;

  // Top products
  pdf.text('Top 10 Products by Revenue', 20, y);
  y += 10;
  report.topProductsByRevenue.slice(0, 10).forEach(product => {
    pdf.text(`${product.name}: ${formatCurrency(product.revenue)}`, 30, y);
    y += 8;
  });

  return pdf.output('blob');
}

export async function generateMonthlyReportPDF(report: MonthlyReport, storeName: string, logo?: string): Promise<Blob> {
  const pdf = new jsPDF();
  let y = 20;

  // Header
  pdf.setFontSize(20);
  pdf.text('MONTHLY REPORT', 105, y, { align: 'center' });
  y += 10;
  pdf.setFontSize(12);
  pdf.text(storeName, 105, y, { align: 'center' });
  y += 10;
  pdf.text(`${report.month} ${report.year}`, 105, y, { align: 'center' });
  y += 20;

  // Summary
  pdf.setFontSize(14);
  pdf.text('Summary', 20, y);
  y += 10;
  pdf.setFontSize(12);
  pdf.text(`Total Revenue: ${formatCurrency(report.totalRevenue)}`, 30, y);
  y += 8;
  pdf.text(`vs Last Month: ${report.revenueLastMonth.change.toFixed(1)}% ${report.revenueLastMonth.isPositive ? '↑' : '↓'}`, 30, y);
  y += 8;
  pdf.text(`vs Same Month Last Year: ${report.revenueSameMonthLastYear.change.toFixed(1)}% ${report.revenueSameMonthLastYear.isPositive ? '↑' : '↓'}`, 30, y);
  y += 8;
  pdf.text(`Net Profit: ${formatCurrency(report.totalRealProfit)}`, 30, y);
  y += 8;
  pdf.text(`Net Profit Margin: ${report.netProfitMargin.toFixed(1)}%`, 30, y);
  y += 20;

  // Revenue by category
  pdf.text('Revenue by Category', 20, y);
  y += 10;
  report.revenueByCategory.forEach(cat => {
    pdf.text(`${cat.category}: ${formatCurrency(cat.revenue)}`, 30, y);
    y += 8;
  });
  y += 10;

  // Top products
  pdf.text('Top 10 Products by Revenue', 20, y);
  y += 10;
  report.topProductsByRevenue.slice(0, 10).forEach(product => {
    pdf.text(`${product.name}: ${formatCurrency(product.revenue)}`, 30, y);
    y += 8;
  });

  return pdf.output('blob');
}