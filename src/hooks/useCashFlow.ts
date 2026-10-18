import { useMemo } from 'react';
import { Transaction } from '@/lib/types';
import { getCategoryEmoji } from '@/lib/utils/category-emoji';

export interface CategoryStat {
  category: string;
  amount: number;
  emoji: string;
  percentage: number;
  transactionCount: number;
}

export interface CashFlowMetrics {
  monthlyIncome: number;
  monthlyExpense: number;
  netCashFlow: number;
  topCategories: CategoryStat[];
  recentActivity: Transaction[];
}

import { Currency } from '@/lib/types';

export function useCashFlow(
  transactions: Transaction[] = [],
  targetCurrency: Currency = 'AUD',
  getExchangeRate?: (from: Currency, to: Currency) => number | null
): CashFlowMetrics {
  return useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 1. Filter for Lifestyle Scope & Current Month
    const lifestyleTxs = transactions.filter(tx => {
      // Include income/expense transactions regardless of scope (they're lifestyle by default)
      const isLifestyleType = tx.transactionType === 'income' || tx.transactionType === 'expense';
      
      // For other transaction types, require explicit LIFESTYLE scope
      if (!isLifestyleType && tx.scope !== 'LIFESTYLE') return false;
      
      // For income/expense, exclude only if explicitly marked as non-LIFESTYLE
      if (isLifestyleType && tx.scope && tx.scope !== 'LIFESTYLE') return false;

      // Filter for current month
      // CRITICAL FIX: Handle Firestore Timestamp objects
      let txDate: Date;
      if (tx.transactionDate && typeof tx.transactionDate === 'object' && 'toDate' in tx.transactionDate) {
        // Firestore Timestamp object
        txDate = (tx.transactionDate as any).toDate();
      } else if (typeof tx.transactionDate === 'string') {
        // ISO string
        txDate = new Date(tx.transactionDate);
      } else {
        // Already a Date object or invalid
        txDate = (tx.transactionDate as any) instanceof Date ? (tx.transactionDate as any) : new Date();
      }
      
      return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
    });

    // Debug logging (remove after verification)
    // console.log('[useCashFlow] Filtered...', { count: lifestyleTxs.length });

    // 2. Aggregate Income & Expense
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    const categoryMap = new Map<string, number>();
    const categoryCountMap = new Map<string, number>();

    lifestyleTxs.forEach(tx => {
      let amount = tx.quantity * (tx.price || 1); // Raw Amount

      // 💱 Currency Conversion
      if (getExchangeRate && tx.currency && tx.currency !== targetCurrency) {
          const rate = getExchangeRate(tx.currency, targetCurrency) ?? 1;
          amount = amount * rate;
      }

      if (tx.transactionType === 'income') {
        monthlyIncome += amount;
      } else if (tx.transactionType === 'expense') {
        monthlyExpense += amount;

        // Track category stats for Expenses Only
        const cat = tx.category || 'General';
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + amount);
        categoryCountMap.set(cat, (categoryCountMap.get(cat) || 0) + 1);
      }
    });

    // 3. Process Categories
    const topCategories: CategoryStat[] = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        emoji: getCategoryEmoji(category),
        percentage: monthlyExpense > 0 ? (amount / monthlyExpense) * 100 : 0,
        transactionCount: categoryCountMap.get(category) || 0
      }))
      .sort((a, b) => b.amount - a.amount) // Sort by amount desc
      .slice(0, 3); // Top 3

    // 4. Recent Activity (All time or just this month? User said "Recent Activity", 
    // usually implies latest transactions regardless of month, but specifically "Lifestyle".
    // Let's use the FULL transaction list for this, not just this month's, 
    // but limited to 5 items.)
    const recentActivity = transactions
      .filter(tx => tx.scope === 'LIFESTYLE')
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
      .slice(0, 5);

    return {
      monthlyIncome,
      monthlyExpense,
      netCashFlow: monthlyIncome - monthlyExpense,
      topCategories,
      recentActivity
    };
  }, [transactions, targetCurrency, getExchangeRate]);
}
