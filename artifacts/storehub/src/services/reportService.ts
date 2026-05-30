import type { Sale, Expense, Product, Refund, CashShift } from "../schemas";
import { getSales, getExpenses, getProducts, getRefunds } from "./dataService";
import { getShift as getCashShift, getRecentShifts, getCurrentShift } from "./cashDrawerService";
import { formatCurrency } from "../utils";

export interface ShiftReport {
  shiftDate: string;
  openTime: string;
  closeTime: string;
  duration: string;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  totalSales: number;
  transactionCount: number;
  avgTransactionValue: number;
  topProductsByQuantity: Array<{ name: string; quantity: number; revenue: number }>;
  topProductsByRevenue: Array<{ name: string; quantity: number; revenue: number }>;
  cashDrawerSummary: {
    expectedCash: number;
    actualCash: number;
    difference: number;
  };
  refunds: Refund[];
  taxCollected: number;
}

export interface DailyReport {
  date: string;
  totalRevenue: number;
  transactionCount: number;
  avgTransactionValue: number;
  grossProfit: number;
  revenueByPaymentMethod: Record<string, number>;
  topProductsByRevenue: Array<{ name: string; revenue: number }>;
  topProductsByQuantity: Array<{ name: string; quantity: number }>;
  bottomProductsBySales: Array<{ name: string; sales: number }>;
  totalRefunds: number;
  refundReasons: Record<string, number>;
  taxCollected: number;
  comparisonToYesterday: { change: number; isPositive: boolean };
  comparisonToLastWeek: { change: number; isPositive: boolean };
  hourlySales: Array<{ hour: number; revenue: number }>;
}

export interface WeeklyReport {
  weekDates: string;
  totalRevenue: number;
  totalProfit: number;
  revenueVsLastWeek: { change: number; isPositive: boolean };
  bestDay: { day: string; amount: number };
  worstDay: { day: string; amount: number };
  dailyRevenue: Array<{ day: string; revenue: number }>;
  topProductsByRevenue: Array<{ name: string; revenue: number }>;
  topProductsByQuantity: Array<{ name: string; quantity: number }>;
  bottomProducts: Array<{ name: string; sales: number }>;
  totalTransactions: number;
  avgDailyRevenue: number;
  paymentMethodBreakdown: Record<string, number>;
  totalRefunds: number;
  totalTaxCollected: number;
  totalExpenses: number;
  netCashFlow: number;
}

export interface MonthlyReport {
  month: string;
  year: number;
  totalRevenue: number;
  revenueLastMonth: { amount: number; change: number; isPositive: boolean };
  revenueSameMonthLastYear: { amount: number; change: number; isPositive: boolean };
  totalRealProfit: number;
  revenueByCategory: Array<{ category: string; revenue: number }>;
  topProductsByRevenue: Array<{ name: string; revenue: number }>;
  topProductsByProfitMargin: Array<{ name: string; margin: number }>;
  bottomProducts: Array<{ name: string; sales: number }>;
  totalTransactions: number;
  avgDailyRevenue: number;
  busiestDay: { day: number; amount: number };
  slowestDay: { day: number; amount: number };
  dailyRevenue: Array<{ day: number; revenue: number }>;
  taxCollectedByType: Record<string, number>;
  expensesByCategory: Array<{ category: string; amount: number }>;
  totalRefunds: number;
  refundReasons: Record<string, number>;
  shrinkage: number;
  supplierSpending: number;
  netProfitMargin: number;
}

export async function getLatestShiftId(): Promise<string | null> {
  const cashShifts = getRecentShifts(1);
  if (cashShifts.length > 0) {
    return cashShifts[0].id;
  }

  const currentShift = getCurrentShift();
  return currentShift ? currentShift.id : null;
}

function buildShiftReportFromCashShift(
  shift: CashShift,
  sales: Sale[],
  refunds: Refund[],
  products: Product[]
): ShiftReport {
  const start = new Date(shift.openedAt);
  const end = shift.closedAt ? new Date(shift.closedAt) : new Date();

  const shiftSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= start && saleDate <= end;
  });

  const shiftRefunds = refunds.filter(r => {
    const refundDate = new Date(r.createdAt);
    return refundDate >= start && refundDate <= end;
  });

  const cashSales = shiftSales
    .filter(s => s.paymentMethod?.toLowerCase() === 'cash')
    .reduce((sum, s) => sum + s.total, 0);
  const cardSales = shiftSales
    .filter(s => {
      const m = s.paymentMethod?.toLowerCase() ?? '';
      return m === 'card' || m === 'card_reader' || m === 'credit_card' || m === 'debit_card';
    })
    .reduce((sum, s) => sum + s.total, 0);
  const totalSales = shiftSales.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = shiftSales.length;
  const avgTransactionValue = transactionCount > 0 ? totalSales / transactionCount : 0;

  const productSales: Record<string, { quantity: number; revenue: number }> = {};
  shiftSales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { quantity: 0, revenue: 0 };
      }
      productSales[item.productId].quantity += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    });
  });

  const topProductsByQuantity = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', quantity: data.quantity, revenue: data.revenue };
    })
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const topProductsByRevenue = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', quantity: data.quantity, revenue: data.revenue };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const cashIn = shiftSales
    .filter(s => s.paymentMethod?.toLowerCase() === 'cash')
    .reduce((sum, s) => sum + s.total, 0);
  const expectedCash = shift.openingFloat + cashIn - shift.cashOut;
  const actualCash = shift.countedClose ?? expectedCash;
  const difference = actualCash - expectedCash;
  const taxCollected = shiftSales.reduce((sum, s) => sum + s.tax, 0);

  return {
    shiftDate: new Date(shift.openedAt).toLocaleDateString(),
    openTime: new Date(shift.openedAt).toLocaleString(),
    closeTime: shift.closedAt ? new Date(shift.closedAt).toLocaleString() : 'Ongoing',
    duration: shift.closedAt ? `${Math.round((new Date(shift.closedAt).getTime() - start.getTime()) / 3600000 * 10) / 10} hours` : 'Ongoing',
    openingFloat: shift.openingFloat,
    cashSales,
    cardSales,
    totalSales,
    transactionCount,
    avgTransactionValue,
    topProductsByQuantity,
    topProductsByRevenue,
    cashDrawerSummary: { expectedCash, actualCash, difference },
    refunds: shiftRefunds,
    taxCollected,
  };
}

export async function generateShiftReport(shiftId: string): Promise<ShiftReport | null> {
  const cashShift = getCashShift(shiftId);
  if (!cashShift) return null;

  const sales = await getSales();
  const refunds = await getRefunds();
  const products = await getProducts();

  return buildShiftReportFromCashShift(cashShift, sales, refunds, products);
}

const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getSaleCogs = (sale: Sale, products: Product[]) => {
  return sale.items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    const costPrice = product?.costPrice ?? 0;
    return sum + costPrice * item.quantity;
  }, 0);
};

export async function generateDailyReport(date: string): Promise<DailyReport> {
  const sales = await getSales();
  const refunds = await getRefunds();
  const products = await getProducts();
  const expenses = await getExpenses();

  const targetDate = parseLocalDate(date);
  const yesterday = new Date(targetDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(targetDate);
  lastWeek.setDate(lastWeek.getDate() - 7);

  // Filter sales for the day
  const daySales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate.getFullYear() === targetDate.getFullYear() &&
           saleDate.getMonth() === targetDate.getMonth() &&
           saleDate.getDate() === targetDate.getDate();
  });

  const dayRefunds = refunds.filter(r => {
    const refundDate = new Date(r.createdAt);
    return refundDate.getFullYear() === targetDate.getFullYear() &&
           refundDate.getMonth() === targetDate.getMonth() &&
           refundDate.getDate() === targetDate.getDate();
  });

  const yesterdaySales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate.getFullYear() === yesterday.getFullYear() &&
           saleDate.getMonth() === yesterday.getMonth() &&
           saleDate.getDate() === yesterday.getDate();
  });

  const lastWeekSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate.getFullYear() === lastWeek.getFullYear() &&
           saleDate.getMonth() === lastWeek.getMonth() &&
           saleDate.getDate() === lastWeek.getDate();
  });

  // Calculate totals
  const totalRevenue = daySales.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = daySales.length;
  const avgTransactionValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  // Gross profit (revenue minus COGS)
  const cogs = daySales.reduce((sum, s) => sum + getSaleCogs(s, products), 0);
  const grossProfit = totalRevenue - cogs;

  // Revenue by payment method
  const revenueByPaymentMethod: Record<string, number> = {};
  daySales.forEach(s => {
    revenueByPaymentMethod[s.paymentMethod] = (revenueByPaymentMethod[s.paymentMethod] || 0) + s.total;
  });

  // Top/bottom products
  const productSales: Record<string, { quantity: number; revenue: number }> = {};
  daySales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { quantity: 0, revenue: 0 };
      }
      productSales[item.productId].quantity += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    });
  });

  const topProductsByRevenue = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', revenue: data.revenue };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topProductsByQuantity = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', quantity: data.quantity };
    })
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const bottomProductsBySales = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', sales: data.revenue };
    })
    .sort((a, b) => a.sales - b.sales)
    .slice(0, 5);

  // Refunds
  const totalRefunds = dayRefunds.reduce((sum, r) => sum + r.amount, 0);
  const refundReasons: Record<string, number> = {};
  dayRefunds.forEach(r => {
    refundReasons[r.reason] = (refundReasons[r.reason] || 0) + 1;
  });

  // Tax collected
  const taxCollected = daySales.reduce((sum, s) => sum + s.tax, 0);

  // Comparisons
  const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
  const lastWeekRevenue = lastWeekSales.reduce((sum, s) => sum + s.total, 0);
  const comparisonToYesterday = {
    change: yesterdayRevenue > 0 ? ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0,
    isPositive: totalRevenue >= yesterdayRevenue,
  };
  const comparisonToLastWeek = {
    change: lastWeekRevenue > 0 ? ((totalRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : 0,
    isPositive: totalRevenue >= lastWeekRevenue,
  };

  // Hourly sales
  const hourlySales: Array<{ hour: number; revenue: number }> = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourSales = daySales.filter(s => new Date(s.createdAt).getHours() === hour);
    const revenue = hourSales.reduce((sum, s) => sum + s.total, 0);
    hourlySales.push({ hour, revenue });
  }

  return {
    date,
    totalRevenue,
    transactionCount,
    avgTransactionValue,
    grossProfit,
    revenueByPaymentMethod,
    topProductsByRevenue,
    topProductsByQuantity,
    bottomProductsBySales,
    totalRefunds,
    refundReasons,
    taxCollected,
    comparisonToYesterday,
    comparisonToLastWeek,
    hourlySales,
  };
}

export async function generateWeeklyReport(startDate: string, endDate: string): Promise<WeeklyReport> {
  const sales = await getSales();
  const expenses = await getExpenses();
  const products = await getProducts();
  const refunds = await getRefunds();

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const lastWeekStart = new Date(start);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(end);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  // Filter sales
  const weekSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= start && saleDate <= end;
  });

  const lastWeekSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= lastWeekStart && saleDate <= lastWeekEnd;
  });

  const weekExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    return expenseDate >= start && expenseDate <= end;
  });

  const weekRefunds = refunds.filter(r => {
    const refundDate = new Date(r.createdAt);
    return refundDate >= start && refundDate <= end;
  });

  // Calculate totals
  const totalRevenue = weekSales.reduce((sum, s) => sum + s.total, 0);
  const cogs = weekSales.reduce((sum, s) => sum + getSaleCogs(s, products), 0);
  const totalProfit = totalRevenue - cogs;
  const lastWeekRevenue = lastWeekSales.reduce((sum, s) => sum + s.total, 0);
  const revenueVsLastWeek = {
    change: lastWeekRevenue > 0 ? ((totalRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : 0,
    isPositive: totalRevenue >= lastWeekRevenue,
  };

  // Daily revenue
  const dailyRevenue: Array<{ day: string; revenue: number }> = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const daySales = weekSales.filter(s => new Date(s.createdAt).toDateString() === d.toDateString());
    const revenue = daySales.reduce((sum, s) => sum + s.total, 0);
    dailyRevenue.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), revenue });
  }

  const bestDay = dailyRevenue.reduce((best, day) => day.revenue > best.amount ? { day: day.day, amount: day.revenue } : best, { day: '', amount: 0 });
  const worstDay = dailyRevenue.reduce((worst, day) => day.revenue < worst.amount || worst.amount === 0 ? { day: day.day, amount: day.revenue } : worst, { day: '', amount: 0 });

  // Top/bottom products
  const productSales: Record<string, { quantity: number; revenue: number }> = {};
  weekSales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { quantity: 0, revenue: 0 };
      }
      productSales[item.productId].quantity += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    });
  });

  const topProductsByRevenue = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', revenue: data.revenue };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProductsByQuantity = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', quantity: data.quantity };
    })
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const bottomProducts = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', sales: data.revenue };
    })
    .sort((a, b) => a.sales - b.sales)
    .slice(0, 5);

  // Other metrics
  const totalTransactions = weekSales.length;
  const avgDailyRevenue = totalRevenue / 7;
  const paymentMethodBreakdown: Record<string, number> = {};
  weekSales.forEach(s => {
    paymentMethodBreakdown[s.paymentMethod] = (paymentMethodBreakdown[s.paymentMethod] || 0) + s.total;
  });
  const totalRefunds = weekRefunds.reduce((sum, r) => sum + r.amount, 0);
  const totalTaxCollected = weekSales.reduce((sum, s) => sum + s.tax, 0);
  const totalExpenses = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netCashFlow = totalRevenue - totalExpenses;

  return {
    weekDates: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
    totalRevenue,
    totalProfit,
    revenueVsLastWeek,
    bestDay,
    worstDay,
    dailyRevenue,
    topProductsByRevenue,
    topProductsByQuantity,
    bottomProducts,
    totalTransactions,
    avgDailyRevenue,
    paymentMethodBreakdown,
    totalRefunds,
    totalTaxCollected,
    totalExpenses,
    netCashFlow,
  };
}

export async function generateMonthlyReport(month: number, year: number): Promise<MonthlyReport> {
  const sales = await getSales();
  const expenses = await getExpenses();
  const products = await getProducts();
  const refunds = await getRefunds();

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const lastMonthStart = new Date(year, month - 2, 1);
  const lastMonthEnd = new Date(year, month - 1, 0);
  const sameMonthLastYearStart = new Date(year - 1, month - 1, 1);
  const sameMonthLastYearEnd = new Date(year - 1, month, 0);

  // Filter data
  const monthSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= startDate && saleDate <= endDate;
  });

  const lastMonthSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= lastMonthStart && saleDate <= lastMonthEnd;
  });

  const sameMonthLastYearSales = sales.filter(s => {
    const saleDate = new Date(s.createdAt);
    return saleDate >= sameMonthLastYearStart && saleDate <= sameMonthLastYearEnd;
  });

  const monthExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    return expenseDate >= startDate && expenseDate <= endDate;
  });

  const monthRefunds = refunds.filter(r => {
    const refundDate = new Date(r.createdAt);
    return refundDate >= startDate && refundDate <= endDate;
  });

  // Calculate totals
  const totalRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);
  const lastMonthRevenue = lastMonthSales.reduce((sum, s) => sum + s.total, 0);
  const sameMonthLastYearRevenue = sameMonthLastYearSales.reduce((sum, s) => sum + s.total, 0);

  const revenueLastMonth = {
    amount: lastMonthRevenue,
    change: lastMonthRevenue > 0 ? ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0,
    isPositive: totalRevenue >= lastMonthRevenue,
  };

  const revenueSameMonthLastYear = {
    amount: sameMonthLastYearRevenue,
    change: sameMonthLastYearRevenue > 0 ? ((totalRevenue - sameMonthLastYearRevenue) / sameMonthLastYearRevenue) * 100 : 0,
    isPositive: totalRevenue >= sameMonthLastYearRevenue,
  };

  // Real profit
  const cogs = monthSales.reduce((sum, s) => sum + getSaleCogs(s, products), 0);
  const taxCollected = monthSales.reduce((sum, s) => sum + s.tax, 0);
  const totalExpensesAmount = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRealProfit = totalRevenue - cogs - totalExpensesAmount - taxCollected;

  // Revenue by category
  const revenueByCategory: Record<string, number> = {};
  monthSales.forEach(sale => {
    sale.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const category = product?.category || 'Unknown';
      revenueByCategory[category] = (revenueByCategory[category] || 0) + item.price * item.quantity;
    });
  });

  const revenueByCategoryArray = Object.entries(revenueByCategory).map(([category, revenue]) => ({ category, revenue }));

  // Top/bottom products
  const productSales: Record<string, { quantity: number; revenue: number; cost: number }> = {};
  monthSales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.productId]) {
        productSales[item.productId] = { quantity: 0, revenue: 0, cost: 0 };
      }
      productSales[item.productId].quantity += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
      productSales[item.productId].cost += (item.cost || 0) * item.quantity;
    });
  });

  const topProductsByRevenue = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', revenue: data.revenue };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProductsByProfitMargin = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      const margin = data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0;
      return { name: product?.name || 'Unknown', margin };
    })
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);

  const bottomProducts = Object.entries(productSales)
    .map(([id, data]) => {
      const product = products.find(p => p.id === id);
      return { name: product?.name || 'Unknown', sales: data.revenue };
    })
    .sort((a, b) => a.sales - b.sales)
    .slice(0, 10);

  // Other metrics
  const totalTransactions = monthSales.length;
  const avgDailyRevenue = totalRevenue / endDate.getDate();
  const dailyRevenue: Array<{ day: number; revenue: number }> = [];
  for (let day = 1; day <= endDate.getDate(); day++) {
    const daySales = monthSales.filter(s => new Date(s.createdAt).getDate() === day);
    const revenue = daySales.reduce((sum, s) => sum + s.total, 0);
    dailyRevenue.push({ day, revenue });
  }

  const busiestDay = dailyRevenue.reduce((best, d) => d.revenue > best.amount ? { day: d.day, amount: d.revenue } : best, { day: 0, amount: 0 });
  const slowestDay = dailyRevenue.reduce((worst, d) => d.revenue < worst.amount || worst.amount === 0 ? { day: d.day, amount: d.revenue } : worst, { day: 0, amount: 0 });

  const taxCollectedByType: Record<string, number> = { sales: taxCollected };
  const expensesByCategory = monthExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const expensesByCategoryArray = Object.entries(expensesByCategory).map(([category, amount]) => ({ category, amount }));

  const totalRefunds = monthRefunds.reduce((sum, r) => sum + r.amount, 0);
  const refundReasons: Record<string, number> = {};
  monthRefunds.forEach(r => {
    refundReasons[r.reason] = (refundReasons[r.reason] || 0) + 1;
  });

  const shrinkage = 0; // Placeholder
  const supplierSpending = monthExpenses.filter(e => e.category === 'Supplies').reduce((sum, e) => sum + e.amount, 0);
  const netProfitMargin = totalRevenue > 0 ? (totalRealProfit / totalRevenue) * 100 : 0;

  return {
    month: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
    year,
    totalRevenue,
    revenueLastMonth,
    revenueSameMonthLastYear,
    totalRealProfit,
    revenueByCategory: revenueByCategoryArray,
    topProductsByRevenue,
    topProductsByProfitMargin,
    bottomProducts,
    totalTransactions,
    avgDailyRevenue,
    busiestDay,
    slowestDay,
    dailyRevenue,
    taxCollectedByType,
    expensesByCategory: expensesByCategoryArray,
    totalRefunds,
    refundReasons,
    shrinkage,
    supplierSpending,
    netProfitMargin,
  };
}