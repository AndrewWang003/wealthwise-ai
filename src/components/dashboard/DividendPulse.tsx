'use client';

import { useEffect, useState, useMemo } from 'react';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { AuraCard } from '@/components/ui/AuraCard';
import { Coins, TrendingUp } from 'lucide-react';
import type { Transaction } from '@/lib/types';

interface IncomeTransaction {
  id: string;
  source: string;
  amount: number;
  date: string;
  type: string;
  symbol?: string;
}

import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatCurrency } from '@/lib/utils/format';

export function DividendPulse() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { displayCurrency, getExchangeRate } = usePortfolio();
  const [isHovered, setIsHovered] = useState(false);
  
  // Date constants moved to useMemo to avoid dependency issues if calculated here.

  // Query income transactions (dividends, salary, interest, sold stock)
  // ... existing query logic matches

  const incomeQuery = useMemoFirebase(() => {
    if (!user) return null;
    
    return query(
      collection(firestore, `users/${user.uid}/transactions`),
      where('transactionType', 'in', ['dividend', 'income', 'interest', 'sell']),
      limit(50)
    );
  }, [user, firestore]);

  const { data: allIncome, isLoading } = useCollection(incomeQuery);

  // Process income transactions
  const { recentIncome, totalIncome } = useMemo(() => {
    if (!allIncome) return { recentIncome: [], totalIncome: 0 };

    const income: IncomeTransaction[] = [];

    // Calculate dates inside useMemo to ensure stability
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    allIncome.forEach((tx: Transaction, itemIndex: number) => {
      try {
        const dateValue = tx.transactionDate as any;
        let txDate: Date;
        
        if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          txDate = dateValue.toDate();
        } else {
          txDate = new Date(dateValue);
        }
        
        txDate.setHours(0, 0, 0, 0);

        // Only include last 7 days
        if (txDate <= today && txDate >= sevenDaysAgo) {
          const diffDays = Math.ceil((today.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
          
          let dateLabel = '';
          if (diffDays === 0) dateLabel = 'Today';
          else if (diffDays === 1) dateLabel = 'Yesterday';
          else dateLabel = `${diffDays} days ago`;

          // Determine source label based on type
          let sourceLabel = tx.symbol || 'Income';
          const txType = (tx.transactionType || '') as string;
          
          if (txType === 'dividend') {
            sourceLabel = `${tx.symbol || 'Stock'} Dividend`;
          } else if (txType === 'income' || txType === 'salary') {
            sourceLabel = tx.notes || 'Salary Deposit';
          } else if (txType === 'interest') {
            sourceLabel = tx.notes || 'Bank Interest';
          } else if (txType === 'sell') {
            sourceLabel = `Sold ${tx.symbol || 'Stock'}`;
          }

          // Calculate amount (for sell, use total value)
          let rawAmount = txType === 'sell' 
            ? Math.abs((tx.quantity || 0) * (tx.price || 0))
            : Math.abs(tx.quantity || 0);

          // 🌍 FX Conversion
          const nativeCurrency = tx.currency || 'USD';
          let convertedAmount = rawAmount;

          if (nativeCurrency !== displayCurrency) {
             const rate = getExchangeRate(nativeCurrency, displayCurrency);
             if (rate !== null) {
                 convertedAmount = rawAmount * rate;
             }
          }

          // Generate a stable-ish ID if missing
          const fallbackId = `${txType}-${tx.transactionDate?.toString() || ''}-${rawAmount}-${itemIndex}`;
          
          income.push({
            id: tx.id || fallbackId,
            source: sourceLabel,
            amount: convertedAmount,
            date: dateLabel,
            type: txType,
            symbol: tx.symbol
          });
        }
      } catch (error) {
        console.error('Error parsing income date:', error);
      }
    });

    // Sort by date (most recent first)
    income.sort((a, b) => {
      if (a.date === 'Today') return -1;
      if (b.date === 'Today') return 1;
      if (a.date === 'Yesterday') return -1;
      if (b.date === 'Yesterday') return 1;
      return 0;
    });

    const total = income.reduce((sum, item) => sum + item.amount, 0);

    return { 
      recentIncome: income.slice(0, 5), // Top 5 items 
      totalIncome: total 
    };
  }, [allIncome, displayCurrency, getExchangeRate]); // Added deps

  // Show placeholder if no income
  if (isLoading) {
    return (
      <AuraCard variant="gold" className="h-full">
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-amber-400/50">Loading...</div>
        </div>
      </AuraCard>
    );
  }

  return (
    <AuraCard
      variant="gold"
      className="h-full group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative h-full p-4 sm:p-6 overflow-hidden">
        
        {/* Layer 1: Default View - Total Amount */}
        <div className={`flex items-center gap-4 transition-opacity duration-300 ease-in-out ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <Coins className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400/70 mb-1">
              7-Day Income
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-amber-400">
                {totalIncome > 0 ? '+' : ''}{formatCurrency(totalIncome, displayCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {recentIncome.length > 0 && (
              <p className="text-xs text-amber-300/50 mt-1">
                {recentIncome.length} transaction{recentIncome.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Trend Icon */}
          {totalIncome > 0 && (
            <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          )}
        </div>

        {/* Layer 2: Hover View - Transaction List */}
        <div className={`absolute inset-0 p-4 sm:p-6 flex flex-col transition-opacity duration-300 ease-in-out ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400/70">
              Recent Income
            </span>
            <span className="text-xs text-amber-300/50">
              Last 7 days
            </span>
          </div>

          {/* Transaction List */}
          <div className="flex-1 flex flex-col justify-center space-y-2 overflow-hidden">
            {recentIncome.length > 0 ? (
              recentIncome.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between gap-3 py-2 border-b border-amber-500/10 last:border-0"
                >
                  <p 
                    className="flex-1 min-w-0 text-sm font-medium text-zinc-100 truncate"
                    title={item.source} 
                  >
                    {item.source}
                  </p>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] text-amber-300/50 uppercase tracking-wide whitespace-nowrap">
                      {item.date}
                    </span>
                    <span className="text-sm font-bold text-amber-400 tabular-nums whitespace-nowrap">
                      +{formatCurrency(item.amount, displayCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-amber-300/40 text-sm">
                No income in the last 7 days
              </div>
            )}
          </div>
        </div>
        
      </div>
    </AuraCard>
  );
}
