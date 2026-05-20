import React, { useState, useEffect } from 'react';
import { useApp } from '../contexts/useApp';
import { useAuth } from '../contexts/AuthContext';
import type { CashShift } from '../schemas';
import { getRecentShifts, getShiftsByDateRange } from '../services/cashDrawerService';
import {
  generateShiftReport,
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  getLatestShiftId,
  type ShiftReport,
  type DailyReport,
  type WeeklyReport,
  type MonthlyReport,
} from '../services/reportService';
import {
  generateShiftReportPDF,
  generateDailyReportPDF,
  generateWeeklyReportPDF,
  generateMonthlyReportPDF,
} from '../services/pdfService';
import { createMonthCloseRecord, getMonthCloseRecord, getMonthCloseRecords } from '../services/dataService';
import type { MonthCloseRecord } from '../schemas';
import MonthEndCloseModal from '../components/MonthEndCloseModal';
import { formatCurrency } from '../utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Download,
  Mail,
  Printer,
  Share,
  Calendar,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ReportsPage() {
  const { profile } = useApp();
  const { activeStoreId } = useAuth();

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<'shift' | 'daily' | 'weekly' | 'monthly'>(() => {
    if (typeof window === 'undefined') return 'daily';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab === 'shift' || tab === 'daily' || tab === 'weekly' || tab === 'monthly' ? tab : 'daily';
  });
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [monthCloseRecord, setMonthCloseRecord] = useState<MonthCloseRecord | null>(null);
  const [monthCloseLoading, setMonthCloseLoading] = useState(false);
  const [monthCloseMessage, setMonthCloseMessage] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentShifts, setRecentShifts] = useState<CashShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState(() => formatLocalDate(new Date()));
  const [weeklyStartDate, setWeeklyStartDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() - now.getDay());
    return formatLocalDate(now);
  });
  const [monthlyMonth, setMonthlyMonth] = useState(new Date().getMonth() + 1);
  const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadReport();
  }, [activeTab, selectedShiftId, dailyDate, weeklyStartDate, monthlyMonth, monthlyYear, activeStoreId]);

  useEffect(() => {
    if (activeTab === 'shift') {
      loadShiftHistory();
    }
  }, [activeTab, activeStoreId]);

  useEffect(() => {
    void (async () => {
      try {
        const record = await getMonthCloseRecord(monthlyMonth, monthlyYear);
        setMonthCloseRecord(record);
      } catch (error) {
        console.warn('Failed to load closed month record:', error);
      }
    })();
  }, [monthlyMonth, monthlyYear]);

  useEffect(() => {
    loadShiftHistory(); // Load shifts on mount and when store changes
  }, [activeStoreId]);

  const getWeekStart = (dateString: string) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() - date.getDay());
    return date.toISOString().split('T')[0];
  };

  const getWeekEnd = (startDate: string) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + 6);
    return date.toISOString().split('T')[0];
  };

  const addDays = (dateString: string, amount: number) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + amount);
    return date.toISOString().split('T')[0];
  };

  const changeMonth = (month: number, year: number, delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    return { month: date.getMonth() + 1, year: date.getFullYear() };
  };

  const loadShiftHistory = () => {
    const shifts = getRecentShifts(50);
    setRecentShifts(shifts);
    if (!selectedShiftId && shifts.length > 0) {
      setSelectedShiftId(shifts[0].id);
    }
  };

  const selectedShift = selectedShiftId ? recentShifts.find(s => s.id === selectedShiftId) : undefined;
  const selectedShiftIndex = selectedShift ? recentShifts.findIndex(s => s.id === selectedShiftId) : -1;
  const selectedShiftLabel = selectedShift
    ? `${new Date(selectedShift.openedAt).toLocaleDateString()} ${new Date(selectedShift.openedAt).toLocaleTimeString()}`
    : 'No shifts selected';

  const weeklyRangeLabel = `${weeklyStartDate} - ${getWeekEnd(weeklyStartDate)}`;
  const monthlyLabel = new Date(monthlyYear, monthlyMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const loadReport = async () => {
    setLoading(true);
    try {
      if (activeTab === 'shift') {
        const shiftId = selectedShiftId || recentShifts[0]?.id;
        if (shiftId) {
          const report = await generateShiftReport(shiftId);
          setShiftReport(report);
        } else {
          setShiftReport(null);
        }
      } else if (activeTab === 'daily') {
        const report = await generateDailyReport(dailyDate);
        setDailyReport(report);
      } else if (activeTab === 'weekly') {
        const report = await generateWeeklyReport(
          weeklyStartDate,
          getWeekEnd(weeklyStartDate)
        );
        setWeeklyReport(report);
      } else if (activeTab === 'monthly') {
        const report = await generateMonthlyReport(monthlyMonth, monthlyYear);
        setMonthlyReport(report);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthCashVariance = () => {
    const start = new Date(monthlyYear, monthlyMonth - 1, 1).toISOString().split('T')[0];
    const end = new Date(monthlyYear, monthlyMonth, 0).toISOString().split('T')[0];
    const shifts = getShiftsByDateRange(start, end);
    return shifts.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);
  };

  const handleCloseMonth = async () => {
    if (monthCloseRecord) {
      setMonthCloseMessage('This month is already closed. You can review the finalized close record below.');
      return;
    }

    if (activeTab !== 'monthly') {
      setActiveTab('monthly');
    }

    setMonthCloseLoading(true);
    setMonthCloseMessage(null);

    try {
      const report = await generateMonthlyReport(monthlyMonth, monthlyYear);
      const expenses = report.expensesByCategory.reduce((sum, item) => sum + item.amount, 0);
      const completedSteps = [
        'Reconcile cash drawer balances',
        'Verify supplier invoices and delivery costs',
        'Confirm inventory shrinkage and stock counts',
        'Review payroll and labor costs',
        'Export the monthly performance report',
      ];

      const record = await createMonthCloseRecord({
        month: monthlyMonth,
        year: monthlyYear,
        revenue: report.totalRevenue,
        expenses,
        profit: report.totalRealProfit,
        supplierSpending: report.supplierSpending,
        shrinkage: report.shrinkage,
        cashVariance: getMonthCashVariance(),
        notes: 'Closed through month-end workflow',
        completedSteps,
      });

      setMonthCloseRecord(record);
      setMonthCloseMessage('Month closed successfully. The close record is now saved and locked.');
    } catch (error) {
      console.error('Failed to close month:', error);
      setMonthCloseMessage('Could not complete month close. Please try again after refreshing the page.');
    } finally {
      setMonthCloseLoading(false);
    }
  };

  const storeName = profile?.storeName || 'My Store';

  const buildReportBlob = async (): Promise<Blob | null> => {
    if (activeTab === 'shift' && shiftReport) {
      return generateShiftReportPDF(shiftReport, storeName);
    }
    if (activeTab === 'daily' && dailyReport) {
      return generateDailyReportPDF(dailyReport, storeName);
    }
    if (activeTab === 'weekly' && weeklyReport) {
      return generateWeeklyReportPDF(weeklyReport, storeName);
    }
    if (activeTab === 'monthly' && monthlyReport) {
      return generateMonthlyReportPDF(monthlyReport, storeName);
    }
    return null;
  };

  const handleExportPDF = async () => {
    try {
      const blob = await buildReportBlob();
      if (!blob) {
        window.alert('No report loaded yet. Please wait for the report to finish loading, then try again.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('Export PDF failed:', err);
      window.alert('Could not generate PDF. Please try again.');
    }
  };

  const handleEmailReport = async () => {
    try {
      const blob = await buildReportBlob();
      if (!blob) {
        window.alert('No report loaded yet. Please wait for the report to finish loading, then try again.');
        return;
      }

      const file = new File([blob], `${activeTab}-report.pdf`, { type: 'application/pdf' });
      const subject = `${storeName} ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report`;
      const text = `Please find the ${activeTab} report attached.`;

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: subject, text, files: [file] });
          return;
        } catch (shareErr) {
          console.warn('Share API failed, falling back to mailto:', shareErr);
        }
      }

      const body = `${text}\n\nDownload the report from the app and attach it to this email.`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (err) {
      console.error('Email report failed:', err);
      window.alert('Could not prepare report for email. Please try exporting the PDF and attaching it manually.');
    }
  };

  const handlePrintReport = async () => {
    try {
      const blob = await buildReportBlob();
      if (!blob) {
        window.alert('No report loaded yet. Please wait for the report to finish loading, then try again.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');

      if (!win) {
        // Popup blocked — download instead so the user can print from their PDF viewer
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeTab}-report.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        window.alert('Pop-ups are blocked. The PDF was downloaded — open it and use Ctrl+P / Cmd+P to print.');
        return;
      }

      // Give the PDF time to render in the new tab, then trigger print
      setTimeout(() => {
        try { win.print(); } catch { /* User can use Ctrl+P in the tab */ }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }, 1200);
    } catch (err) {
      console.error('Print failed:', err);
      window.alert('Could not open the print dialog. Try exporting the PDF and printing from your PDF viewer.');
    }
  };

  const handleShareReport = async () => {
    try {
      const blob = await buildReportBlob();
      if (!blob) {
        window.alert('No report loaded yet. Please wait for the report to finish loading, then try again.');
        return;
      }

      const file = new File([blob], `${activeTab}-report.pdf`, { type: 'application/pdf' });
      const title = `${storeName} ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report`;
      const text = `Sharing the ${activeTab} report from ${storeName}.`;

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title, text, files: [file] });
          return;
        } catch (shareErr) {
          console.warn('Share API failed:', shareErr);
        }
      }

      try {
        await navigator.clipboard.writeText(`${title}\n${text}`);
        window.alert('Report details copied to clipboard. Paste it into your preferred app to share.');
      } catch {
        window.alert('Sharing is not supported in this browser. Please use Export PDF to save the report.');
      }
    } catch (err) {
      console.error('Share failed:', err);
      window.alert('Could not share the report. Please try exporting the PDF instead.');
    }
  };

  const reportCardClass = 'bg-white/95 border border-slate-200 shadow-sm rounded-3xl p-6';
  const reportLabelClass = 'text-sm font-semibold uppercase tracking-[0.2em] text-slate-500';
  const reportValueClass = 'text-3xl font-semibold tracking-tight text-slate-900';

  const renderSummaryWidget = () => {
    if (loading) return null;

    const summaryCardClass = 'bg-white/95 border border-slate-200 shadow-sm rounded-3xl p-6';

    if (activeTab === 'shift' && shiftReport) {
      return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Total sales</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(shiftReport.totalSales)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Transactions</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{shiftReport.transactionCount}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Cash variance</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(shiftReport.cashDrawerSummary.difference)}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'daily' && dailyReport) {
      return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Total revenue</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(dailyReport.totalRevenue)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Transactions</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{dailyReport.transactionCount}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Avg ticket</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(dailyReport.avgTransactionValue)}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'weekly' && weeklyReport) {
      return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Total revenue</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(weeklyReport.totalRevenue)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Total profit</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(weeklyReport.totalProfit)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Avg daily</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(weeklyReport.avgDailyRevenue)}</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'monthly' && monthlyReport) {
      return (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Total revenue</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(monthlyReport.totalRevenue)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Net profit</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(monthlyReport.totalRealProfit)}</p>
          </div>
          <div className={summaryCardClass}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Profit margin</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{monthlyReport.netProfitMargin.toFixed(1)}%</p>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderShiftReport = () => {
    if (!shiftReport) return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/90 p-12 text-center text-slate-600 shadow-sm">
        <p className="text-xl font-semibold text-slate-900 mb-2">No shift report yet</p>
        <p className="max-w-xl mx-auto text-sm leading-7">
          Start or close a shift to generate the first report. Once the shift is recorded, the overview and charts will appear here.
        </p>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={reportCardClass}>
            <p className={reportLabelClass}>Shift</p>
            <p className={reportValueClass}>{shiftReport.shiftDate}</p>
            <div className="mt-6 space-y-3 text-slate-600">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Open</p>
                <p className="font-semibold text-slate-900">{shiftReport.openTime}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Close</p>
                <p className="font-semibold text-slate-900">{shiftReport.closeTime}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Duration</p>
                <p className="font-semibold text-slate-900">{shiftReport.duration}</p>
              </div>
            </div>
          </div>

          <div className={reportCardClass}>
            <p className={reportLabelClass}>Sales summary</p>
            <p className={reportValueClass}>{formatCurrency(shiftReport.totalSales)}</p>
            <div className="mt-6 grid gap-3">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Cash sales</p>
                <p className="font-semibold text-slate-900">{formatCurrency(shiftReport.cashSales)}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Card sales</p>
                <p className="font-semibold text-slate-900">{formatCurrency(shiftReport.cardSales)}</p>
              </div>
            </div>
          </div>

          <div className={reportCardClass}>
            <p className={reportLabelClass}>Cash drawer</p>
            <p className={reportValueClass}>{formatCurrency(shiftReport.cashDrawerSummary.actualCash)}</p>
            <div className="mt-6 space-y-3 text-slate-600">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Expected cash</p>
                <p className="font-semibold text-slate-900">{formatCurrency(shiftReport.cashDrawerSummary.expectedCash)}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Variance</p>
                <p className="font-semibold text-slate-900">{formatCurrency(shiftReport.cashDrawerSummary.difference)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={reportCardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Top products by quantity</p>
              <p className="text-sm text-slate-500 mt-1">Highlighting the most popular items from this shift.</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {shiftReport.transactionCount} transactions
            </span>
          </div>
          <div className="mt-6 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftReport.topProductsByQuantity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value) => value} />
                <Bar dataKey="quantity" fill="#2563eb" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderDailyReport = () => {
    if (!dailyReport) return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/90 p-12 text-center text-slate-600 shadow-sm">
        <p className="text-xl font-semibold text-slate-900 mb-2">No daily data available</p>
        <p className="max-w-xl mx-auto text-sm leading-7">Check back after sales have been recorded today to see your daily revenue and trends.</p>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className={reportCardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Hourly sales</p>
              <p className="text-sm text-slate-500 mt-1">Performance hour by hour.</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {dailyReport.hourlySales.length} data points
            </span>
          </div>
          <div className="mt-6 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyReport.hourlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={reportCardClass}>
            <p className={reportLabelClass}>Daily gross profit</p>
            <p className={reportValueClass}>{formatCurrency(dailyReport.grossProfit)}</p>
            <p className="mt-4 text-sm text-slate-500">Revenue minus cost of goods sold for the day.</p>
          </div>
          <div className={reportCardClass}>
            <p className="text-lg font-semibold text-slate-900">Comparisons</p>
            <div className="mt-4 space-y-3 text-slate-700">
              <p>vs Yesterday: <span className="font-semibold">{dailyReport.comparisonToYesterday.change.toFixed(1)}%</span> {dailyReport.comparisonToYesterday.isPositive ? <TrendingUp className="inline ml-2 text-emerald-500" /> : <TrendingDown className="inline ml-2 text-rose-500" />}</p>
              <p>vs Last Week: <span className="font-semibold">{dailyReport.comparisonToLastWeek.change.toFixed(1)}%</span> {dailyReport.comparisonToLastWeek.isPositive ? <TrendingUp className="inline ml-2 text-emerald-500" /> : <TrendingDown className="inline ml-2 text-rose-500" />}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWeeklyReport = () => {
    if (!weeklyReport) return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/90 p-12 text-center text-slate-600 shadow-sm">
        <p className="text-xl font-semibold text-slate-900 mb-2">No weekly data available</p>
        <p className="max-w-xl mx-auto text-sm leading-7">Complete more shifts this week to unlock the full weekly summary and trend insights.</p>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className={reportCardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Daily revenue trend</p>
              <p className="text-sm text-slate-500 mt-1">Your week at a glance.</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {weeklyReport.dailyRevenue.length} days
            </span>
          </div>
          <div className="mt-6 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyReport.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={reportCardClass}>
            <p className="text-lg font-semibold text-slate-900">Top products by revenue</p>
            <ul className="mt-4 space-y-2 text-slate-700">
              {weeklyReport.topProductsByRevenue.slice(0, 10).map((product, index) => (
                <li key={index} className="rounded-3xl bg-slate-50 p-3">{product.name}: {formatCurrency(product.revenue)}</li>
              ))}
            </ul>
          </div>
          <div className={reportCardClass}>
            <p className="text-lg font-semibold text-slate-900">Payment methods</p>
            <div className="mt-6 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(weeklyReport.paymentMethodBreakdown).map(([name, value]) => ({ name, value }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {Object.entries(weeklyReport.paymentMethodBreakdown).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyReport = () => {
    if (!monthlyReport) return (
      <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/90 p-12 text-center text-slate-600 shadow-sm">
        <p className="text-xl font-semibold text-slate-900 mb-2">No monthly data available</p>
        <p className="max-w-xl mx-auto text-sm leading-7">Finish more sales this month to fill in your full financial summary.</p>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className={reportCardClass}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Daily revenue trend</p>
              <p className="text-sm text-slate-500 mt-1">How revenue moved across the month.</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {monthlyReport.dailyRevenue.length} days
            </span>
          </div>
          <div className="mt-6 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyReport.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className={reportCardClass}>
            <p className="text-lg font-semibold text-slate-900">Revenue by category</p>
            <div className="mt-6 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyReport.revenueByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={reportCardClass}>
            <p className="text-lg font-semibold text-slate-900">Top products by revenue</p>
            <ul className="mt-4 space-y-2 text-slate-700">
              {monthlyReport.topProductsByRevenue.slice(0, 10).map((product, index) => (
                <li key={index} className="rounded-3xl bg-slate-50 p-3">{product.name}: {formatCurrency(product.revenue)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100/80 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200/30 backdrop-blur-xl mb-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Reports</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Insights for {profile?.storeName}</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">Beautiful, easy-to-scan performance dashboards for shifts, daily sales, weekly momentum, and monthly growth.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={handleExportPDF} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                <Download size={16} /> Export PDF
              </button>
              <button onClick={handleEmailReport} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">
                <Mail size={16} /> Email
              </button>
              <button onClick={handlePrintReport} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">
                <Printer size={16} /> Print
              </button>
              <button onClick={handleShareReport} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200">
                <Share size={16} /> Share
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-3">
            {(['shift', 'daily', 'weekly', 'monthly'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  activeTab === tab ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button
              onClick={() => loadReport()}
              className="rounded-full px-5 py-2 text-sm font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {activeTab === 'shift' && (
              <>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Shift</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedShiftLabel}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Navigation</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        if (selectedShiftIndex < recentShifts.length - 1) {
                          setSelectedShiftId(recentShifts[selectedShiftIndex + 1]?.id ?? null);
                        }
                      }}
                      disabled={selectedShiftIndex < 0 || selectedShiftIndex >= recentShifts.length - 1}
                      className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        if (selectedShiftIndex > 0) {
                          setSelectedShiftId(recentShifts[selectedShiftIndex - 1]?.id ?? null);
                        }
                      }}
                      disabled={selectedShiftIndex <= 0}
                      className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2 rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Recent shifts</p>
                  <select
                    value={selectedShiftId ?? ''}
                    onChange={(event) => setSelectedShiftId(event.target.value)}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
                  >
                    {recentShifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {new Date(shift.openedAt).toLocaleDateString()} {new Date(shift.openedAt).toLocaleTimeString()} {shift.closedAt ? '(closed)' : '(open)'}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {activeTab === 'daily' && (
              <div className="rounded-3xl bg-slate-50 p-4 sm:col-span-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-sm text-slate-500">Day</p>
                    <input
                      type="date"
                      value={dailyDate}
                      onChange={(event) => setDailyDate(event.target.value)}
                      className="mt-2 rounded-3xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <button
                    onClick={() => setDailyDate(addDays(dailyDate, -1))}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Previous day
                  </button>
                  <button
                    onClick={() => setDailyDate(addDays(dailyDate, 1))}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Next day
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'weekly' && (
              <div className="rounded-3xl bg-slate-50 p-4 sm:col-span-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-sm text-slate-500">Week range</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{weeklyRangeLabel}</p>
                  </div>
                  <button
                    onClick={() => setWeeklyStartDate(addDays(weeklyStartDate, -7))}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Previous week
                  </button>
                  <button
                    onClick={() => setWeeklyStartDate(addDays(weeklyStartDate, 7))}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Next week
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'monthly' && (
              <div className="rounded-3xl bg-slate-50 p-4 sm:col-span-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-sm text-slate-500">Month / Year</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{monthlyLabel}</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = changeMonth(monthlyMonth, monthlyYear, -1);
                      setMonthlyMonth(next.month);
                      setMonthlyYear(next.year);
                    }}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Previous month
                  </button>
                  <button
                    onClick={() => {
                      const next = changeMonth(monthlyMonth, monthlyYear, 1);
                      setMonthlyMonth(next.month);
                      setMonthlyYear(next.year);
                    }}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Next month
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={monthlyMonth}
                      onChange={(event) => setMonthlyMonth(Number(event.target.value))}
                      className="rounded-3xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {[...Array(12)].map((_, index) => (
                        <option key={index} value={index + 1}>
                          {new Date(0, index).toLocaleString('default', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                    <select
                      value={monthlyYear}
                      onChange={(event) => setMonthlyYear(Number(event.target.value))}
                      className="rounded-3xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {Array.from({ length: 6 }, (_, index) => {
                        const year = new Date().getFullYear() - 2 + index;
                        return (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'monthly' && (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 mb-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">Month-end close</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Finalize this month and lock the books</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Complete a guided month-end close to reconcile cash, expenses, payroll, shrinkage, and supplier spending before filing your final monthly report.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowCloseModal(true)}
                  disabled={monthCloseLoading}
                  className="rounded-full bg-amber-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
                >
                  {monthCloseRecord ? 'Month closed' : monthCloseLoading ? 'Loading…' : 'Close month'}
                </button>
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-200 hover:bg-slate-100 transition"
                >
                  Review close checklist
                </button>
                <button
                  onClick={handleExportPDF}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-200 hover:bg-slate-100 transition"
                >
                  Export final report
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Cash close', text: 'Count cash and reconcile drawer totals.' },
                { label: 'Supplier expenses', text: 'Verify deliveries, invoices, and supplier spending.' },
                { label: 'Inventory shrinkage', text: 'Confirm stock counts and shrinkage adjustments.' },
                { label: 'Payroll review', text: 'Review hours and labor expense estimates.' },
                { label: 'Report export', text: 'Generate the monthly PDF and archive it.' },
              ].map((step) => (
                <div key={step.label} className="rounded-3xl bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                  <p className="mt-2 text-sm text-slate-600">{step.text}</p>
                </div>
              ))}
            </div>

            {monthCloseMessage && (
              <div className="mt-6 rounded-3xl bg-white p-4 text-sm text-slate-700 shadow-sm">
                {monthCloseMessage}
              </div>
            )}

            {monthCloseRecord && (
              <div className="mt-6 rounded-3xl bg-slate-900 p-5 text-white shadow-sm">
                <p className="text-sm uppercase tracking-[0.24em] text-amber-300">Closed on {new Date(monthCloseRecord.closedAt).toLocaleDateString()}</p>
                <p className="mt-2 text-lg font-semibold">{new Date(monthlyYear, monthlyMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })} is locked</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Revenue</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(monthCloseRecord.revenue)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Profit</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(monthCloseRecord.profit)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Supplier spend</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(monthCloseRecord.supplierSpending)}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-800 p-4">
                    <p className="text-sm text-slate-400">Cash variance</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(monthCloseRecord.cashVariance)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <MonthEndCloseModal
          month={monthlyMonth}
          year={monthlyYear}
          isOpen={showCloseModal}
          isClosing={monthCloseLoading}
          onClose={() => setShowCloseModal(false)}
          onConfirmClose={() => {
            setShowCloseModal(false);
            void handleCloseMonth();
          }}
          monthlyReport={monthlyReport}
          monthCloseRecord={monthCloseRecord}
        />

        <div>
          {loading ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-12 text-center text-slate-600 shadow-sm">Loading report...</div>
          ) : (
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
              {renderSummaryWidget()}
              {activeTab === 'shift' && renderShiftReport()}
              {activeTab === 'daily' && renderDailyReport()}
              {activeTab === 'weekly' && renderWeeklyReport()}
              {activeTab === 'monthly' && renderMonthlyReport()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
