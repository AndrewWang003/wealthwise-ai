'use client';

import { useMemo, useState, useEffect } from 'react';
import { useUser, useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Transaction, Budget } from '@/lib/types';
import type { WithId } from '@/firebase';
import { AlertCircle, TrendingUp, Pencil, Loader2, Save, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface CategorySpending {
  category: string;
  spent: number;
  budget: number;
  percentage: number;
  isOverBudget: boolean;
}

import { usePortfolio } from '@/contexts/PortfolioContext';

// ... imports

export function BudgetOverview() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { displayCurrency, getExchangeRate, settings } = usePortfolio(); // Use Portfolio Context
  const [isEditOpen, setIsEditOpen] = useState(false);

  // --- Data Fetching ---

  // Fetch all expense transactions
  const transactionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/transactions`),
      where('transactionType', '==', 'expense')
    );
  }, [user, firestore]);

  const { data: transactions, isLoading: transactionsLoading } = useCollection<WithId<Transaction>>(transactionsQuery);

  // Fetch all budgets
  const budgetsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, `users/${user.uid}/budgets`));
  }, [user, firestore]);

  const { data: budgets, isLoading: budgetsLoading } = useCollection<WithId<Budget>>(budgetsQuery);

  // --- Calculations for Display ---

  // Calculate distinct categories (for editing)
  const categories = useMemo(() => {
    if (!transactions) return [];
    const categorySet = new Set<string>();
    transactions.forEach(tx => {
      if (tx.category && tx.category.trim()) {
        categorySet.add(tx.category);
      }
    });
    return Array.from(categorySet).sort();
  }, [transactions]);

  // Calculate spending by category for current month
  const { globalSpending, categorySpending } = useMemo(() => {
    if (!transactions || !budgets) return { globalSpending: null, categorySpending: [] };

    // Get current month boundaries
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const baseCurrency = 'AUD'; // Default to AUD as base currency for budgets

    // Filter transactions for current month AND Convert Amounts
    const currentMonthTransactions: { cat: string; amount: number }[] = [];
    
    transactions.forEach(tx => {
        // 1. Date Parsing
        let txDate: Date;
        if (tx.transactionDate && typeof tx.transactionDate === 'object' && 'toDate' in tx.transactionDate) {
            txDate = (tx.transactionDate as any).toDate();
        } else {
            txDate = new Date(tx.transactionDate);
        }
        
        if (txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
            return;
        }

        // 2. Currency Conversion (Tx -> Display) 
        const rawAmount = Math.abs((tx.quantity || 0) * (tx.price || 1));
        let finalAmount = rawAmount;
        
        if (tx.currency && tx.currency !== displayCurrency) {
             const rate = getExchangeRate(tx.currency, displayCurrency);
             if (rate) finalAmount = rawAmount * rate;
        }

        currentMonthTransactions.push({ 
            cat: tx.category || 'Uncategorized', 
            amount: finalAmount 
        });
    });

    // Calculate total spending (in Display Currency)
    const totalSpent = currentMonthTransactions.reduce((sum, item) => sum + item.amount, 0);

    // Calculate spending by category
    const spendingByCategory: Record<string, number> = {};
    currentMonthTransactions.forEach(item => {
      spendingByCategory[item.cat] = (spendingByCategory[item.cat] || 0) + item.amount;
    });
    
    // Helper: Convert Budget Limit (Base -> Display)
    const convertBudget = (limitCents: number) => {
        const limitBase = limitCents / 100;
        if (baseCurrency === displayCurrency) return limitBase;
        const rate = getExchangeRate(baseCurrency, displayCurrency);
        return rate ? limitBase * rate : limitBase;
    };

    // Find global budget
    const globalBudgetDoc = budgets.find(b => b.category === 'GLOBAL_TOTAL');
    const globalBudgetLimit = globalBudgetDoc ? convertBudget(globalBudgetDoc.limit) : 0;
    
    const globalSpending = globalBudgetDoc ? {
      category: 'Total Budget',
      spent: totalSpent,
      budget: globalBudgetLimit,
      percentage: globalBudgetLimit > 0 ? (totalSpent / globalBudgetLimit) * 100 : 0,
      isOverBudget: totalSpent > globalBudgetLimit
    } : null;

    // Calculate category budgets
    const categoryBudgets = budgets
      .filter(b => b.category !== 'GLOBAL_TOTAL')
      .map(b => {
        const spent = spendingByCategory[b.category] || 0;
        const budget = convertBudget(b.limit);
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;
        
        return {
          category: b.category,
          spent,
          budget,
          percentage,
          isOverBudget: spent > budget
        };
      })
      .sort((a, b) => b.percentage - a.percentage); // Sort by percentage

    return { globalSpending, categorySpending: categoryBudgets };
  }, [transactions, budgets, displayCurrency, getExchangeRate, settings]);

  // Editing logic...


  // --- Editing State & Logic ---

  const [budgetMode, setBudgetMode] = useState<'simple' | 'detailed'>('simple');
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [globalBudgetInput, setGlobalBudgetInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Initialize editing inputs when Dialog opens
  useEffect(() => {
    if (!isEditOpen || !budgets) return;
    
    const initialInputs: Record<string, string> = {};
    let hasGlobalBudget = false;
    
    budgets.forEach(budget => {
      if (budget.category === 'GLOBAL_TOTAL') {
        setGlobalBudgetInput((budget.limit / 100).toString());
        hasGlobalBudget = true;
      } else {
        initialInputs[budget.category] = (budget.limit / 100).toString();
      }
    });
    
    setBudgetInputs(initialInputs);
    setSaveStatus(null);
    
    // Auto-select mode
    if (hasGlobalBudget && Object.keys(initialInputs).length === 0) {
      setBudgetMode('simple');
    } else if (Object.keys(initialInputs).length > 0) {
      setBudgetMode('detailed');
    }
  }, [isEditOpen, budgets]);

  const handleInputChange = (category: string, value: string) => {
    setBudgetInputs(prev => ({ ...prev, [category]: value }));
  };

  const saveBudgets = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const batch = writeBatch(firestore);

      if (budgetMode === 'simple') {
        // Simple Mode: Save global, remove categories
        const globalLimit = parseFloat(globalBudgetInput) || 0;
        
        // Remove categories
        budgets?.forEach(budget => {
          if (budget.category !== 'GLOBAL_TOTAL') {
            batch.delete(doc(firestore, `users/${user.uid}/budgets`, budget.id));
          }
        });
        
        // Save/Delete Global
        const globalRef = doc(firestore, `users/${user.uid}/budgets`, 'GLOBAL_TOTAL');
        if (globalLimit > 0) {
          const existing = budgets?.find(b => b.category === 'GLOBAL_TOTAL');
          batch.set(globalRef, {
            category: 'GLOBAL_TOTAL',
            limit: Math.round(globalLimit * 100),
            period: 'MONTHLY',
            userId: user.uid,
            updatedAt: serverTimestamp(),
            createdAt: existing?.createdAt || serverTimestamp()
          }, { merge: true });
        } else {
          batch.delete(globalRef);
        }

      } else {
        // Detailed Mode: Save categories, remove global
        const existingGlobal = budgets?.find(b => b.category === 'GLOBAL_TOTAL');
        if (existingGlobal) {
          batch.delete(doc(firestore, `users/${user.uid}/budgets`, existingGlobal.id));
        }
        
        categories.forEach(category => {
          const limit = parseFloat(budgetInputs[category]);
          const budgetRef = doc(firestore, `users/${user.uid}/budgets`, category);
          
          if (!limit || limit <= 0) {
            const existing = budgets?.find(b => b.category === category);
            if (existing) batch.delete(budgetRef);
          } else {
            const existing = budgets?.find(b => b.category === category);
            batch.set(budgetRef, {
              category,
              limit: Math.round(limit * 100),
              period: 'MONTHLY',
              userId: user.uid,
              updatedAt: serverTimestamp(),
              createdAt: existing?.createdAt || serverTimestamp()
            }, { merge: true });
          }
        });
      }

      await batch.commit();
      setSaveStatus({ type: 'success', message: 'Budgets saved successfully!' });
      setTimeout(() => setIsEditOpen(false), 1500); // Close on success
    } catch (error) {
      console.error('Error saving budgets:', error);
      setSaveStatus({ type: 'error', message: 'Failed to save budgets.' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helpers ---

  const getProgressBarClass = (percentage: number): string => {
    if (percentage >= 100) return '[&>div]:bg-red-500';
    if (percentage >= 80) return '[&>div]:bg-yellow-500';
    return '[&>div]:bg-green-500';
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(amount);

  if (transactionsLoading || budgetsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Overview</CardTitle>
          <CardDescription>Track your spending against budget limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine if we should show empty state prompt (if no budgets set)
  const hasBudgets = budgets && budgets.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <CardTitle>Budget Overview</CardTitle>
            </div>
            <CardDescription>Current month spending vs. budget limits</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          
          {!hasBudgets && (
             <Alert>
               <AlertCircle className="h-4 w-4" />
               <AlertDescription>
                 No budgets configured. Click the pencil icon to set up your budgets.
               </AlertDescription>
               <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setIsEditOpen(true)}>
                 Set Budget
               </Button>
             </Alert>
          )}

          {/* Global Budget Progress */}
          {globalSpending && (
            <div className="space-y-3 p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Total Budget</h3>
                  <p className="text-sm text-muted-foreground">All categories combined</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {formatCurrency(globalSpending.spent)} / {formatCurrency(globalSpending.budget)}
                  </div>
                  {globalSpending.isOverBudget && (
                    <div className="text-sm font-medium text-red-500">
                      +{formatCurrency(globalSpending.spent - globalSpending.budget)} over
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Progress 
                  value={Math.min(globalSpending.percentage, 100)} 
                  className={`h-3 ${getProgressBarClass(globalSpending.percentage)}`}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {Math.round(globalSpending.percentage)}% used
                  </span>
                  <span className={`font-medium ${
                    globalSpending.percentage >= 100 ? 'text-red-500' :
                    globalSpending.percentage >= 80 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {globalSpending.percentage >= 100 ? 'Over budget' :
                     globalSpending.percentage >= 80 ? 'Approaching limit' : 'On track'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Category Budgets */}
          {categorySpending.length > 0 && (
            <div className="space-y-4">
              {!globalSpending && (
                <h3 className="font-semibold">Category Budgets</h3>
              )}
              {categorySpending.map((item) => (
                <div key={item.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{item.category}</h4>
                    </div>
                    <div className="text-sm font-semibold ml-4 whitespace-nowrap">
                      {formatCurrency(item.spent)} / {formatCurrency(item.budget)}
                      {item.isOverBudget && (
                        <span className="text-red-500 ml-2">
                          (+{formatCurrency(item.spent - item.budget)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress 
                      value={Math.min(item.percentage, 100)} 
                      className={`h-2 ${getProgressBarClass(item.percentage)}`}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{Math.round(item.percentage)}%</span>
                      {formatCurrency(item.budget - item.spent > 0 ? item.budget - item.spent : 0)} remaining
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Budget Settings</DialogTitle>
            <DialogDescription>
              Adjust your monthly spending limits.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={budgetMode} onValueChange={(v) => setBudgetMode(v as 'simple' | 'detailed')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="simple">Simple Mode</TabsTrigger>
              <TabsTrigger value="detailed">Detailed Mode</TabsTrigger>
            </TabsList>

            <div className="mt-4 px-1">
              {budgetMode === 'simple' ? (
                <div className="space-y-4">
                   <p className="text-sm text-muted-foreground">
                    Set a single global target for all your monthly spending.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="global-edit">Total Monthly Target</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="global-edit"
                        type="number"
                        className="pl-10 text-xl h-14"
                        placeholder="e.g. 5000"
                        value={globalBudgetInput}
                        onChange={(e) => setGlobalBudgetInput(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Set specific limits for each category found in your transactions.
                  </p>
                  {categories.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>No categories found yet.</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {categories.map(cat => (
                        <div key={cat} className="space-y-2">
                          <Label htmlFor={`edit-${cat}`} className="text-sm font-medium truncate block" title={cat}>
                             {cat}
                          </Label>
                          <div className="flex items-center gap-2">
                             <span className="text-muted-foreground">$</span>
                             <Input 
                               id={`edit-${cat}`}
                               type="number"
                               placeholder="No limit"
                               value={budgetInputs[cat] || ''}
                               onChange={(e) => handleInputChange(cat, e.target.value)}
                             />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Tabs>

          <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
             {saveStatus && (
                <div className={`text-sm flex items-center mr-auto ${saveStatus.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                  {saveStatus.message}
                </div>
             )}
             <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSaving}>Cancel</Button>
             <Button onClick={saveBudgets} disabled={isSaving}>
               {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               Save Changes
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

