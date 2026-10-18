'use client';

import { useMemo } from 'react';

import { useUser, useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { useCashFlow } from '@/hooks/useCashFlow';
import { Skeleton } from '@/components/ui/skeleton';



import { ExpenseBreakdownWidget } from '@/components/dashboard/widgets/ExpenseBreakdownWidget';
import { ExpenseBarChart } from '@/components/analytics/ExpenseBarChart';

import { BudgetOverview } from '@/components/analytics/BudgetOverview';


export default function CashFlowPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  // Fetch ALL transactions (the hook handles filtering)
  const transactionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/transactions`),
      orderBy('createdAt', 'desc')
    );
  }, [user, firestore]);

  const {
    data: transactions,
    isLoading,
    error,
  } = useCollection(transactionsQuery);

  // Debug: Log raw transaction data
  console.log('[CashFlowPage] Raw transactions:', {
    count: transactions?.length || 0,
    sample: transactions?.[0],
    allTypes: transactions?.map(t => t.transactionType).filter((v, i, a) => a.indexOf(v) === i)
  });

  const { monthlyIncome, monthlyExpense } = useCashFlow(transactions || []);

  // Debug: Log calculated values
  console.log('[CashFlowPage] Calculated values:', {
    monthlyIncome,
    monthlyExpense,
    netFlow: monthlyIncome - monthlyExpense
  });



  if (isLoading) {
    return (
      <div className="space-y-6 container max-w-6xl mx-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500">
        Error loading data: {error.message}
      </div>
    );
  }

  // Format currency helper
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AUD' }).format(amount);

  return (
    <div className="space-y-6 container max-w-6xl mx-auto p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cash & Flow</h1>
        <p className="text-muted-foreground mt-1">Track your lifestyle expenses and income.</p>
      </div>

      {/* 1. Summary Cards - Bento Box Layout (2+1) */}
      {/* 1. Summary Cards - Bypassed (Moved to Dashboard) */}



      {/* 4. Spending Allocation (Relocated from Dashboard) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: Spending Allocation & Trend */}
        <div className="space-y-6">
          {/* Spending Allocation */}
          <div className="h-[400px] w-full">
            <ExpenseBreakdownWidget transactions={transactions || []} />
          </div>
          
          {/* Monthly Spending Trend */}
          <div className="w-full">
             <ExpenseBarChart transactions={transactions || []} />
          </div>
        </div>

        {/* Right Column: Budget Overview */}
        <div className="h-full">
           <BudgetOverview />
        </div>
      </div>
    </div>
  );
}
