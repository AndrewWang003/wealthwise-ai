'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCategoryStore } from '@/stores/useCategoryStore';

interface BudgetMonitorProps {
  data: Record<string, number>;
}

// Default budget limits (user can customize)
const DEFAULT_BUDGETS: Record<string, number> = {
  'Food & Dining': 500, // Reduced as Groceries is separate
  'Groceries': 800,
  'Housing': 2500,
  'Transportation': 400,
  'Entertainment': 300,
  'Shopping': 500,
  'Utilities': 200,
  'Healthcare': 150,
  'Personal Care': 100,
  'Education': 200,
  'Other': 300,
};

const STORAGE_KEY = 'wisecoin_category_budgets';

export function BudgetMonitor({ data: spendingData }: BudgetMonitorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  /* Safe Lazy Initialization */
  const [budgets, setBudgets] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return { ...DEFAULT_BUDGETS, ...JSON.parse(stored) };
      } catch (e) {
        console.error('Failed to load budgets from localStorage:', e);
      }
    }
    return DEFAULT_BUDGETS;
  });
  const [editBudgets, setEditBudgets] = useState<Record<string, number>>({});
  const { categories, getCategoryIcon, getCategoryColor } = useCategoryStore();


  // Load budgets from localStorage on mount
  // Load budgets from localStorage on mount - MOVED TO LAZY INIT TO PREVENT CASCADING RENDERS
  // Keeping this empty or removed as logic is now in useState initializer
  // preventing "setState synchronously within an effect" error



  // Initialize edit budgets when modal opens
  const handleOpenModal = () => {
    setEditBudgets({ ...budgets });
    setIsModalOpen(true);
  };

  const handleSaveBudgets = () => {
    setBudgets(editBudgets);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(editBudgets));
    } catch (e) {
      console.error('Failed to save budgets to localStorage:', e);
    }
    setIsModalOpen(false);
  };

  const handleBudgetChange = (category: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditBudgets(prev => ({ ...prev, [category]: numValue }));
  };



  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AUD' }).format(amount);

  // Prepare display items: filtered, sorted, and enriched with store data
  // Prepare display items: filtered, sorted, and enriched with store data
  const displayItems = useMemo(() => {
    return Object.entries(spendingData)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: 0 // Will need total expense to calculate logic if strictly needed, but internal logic mostly relies on direct amounts
      }))
      .filter(cat => cat.amount > 0) // Only show active spending
      .sort((a, b) => b.amount - a.amount) // Highest spend first
      .map(cat => {
        const budget = budgets[cat.category] || 0;
        return {
          ...cat,
          budget,
          // Use store helpers which now have smart fallback
          color: getCategoryColor(cat.category),
          icon: getCategoryIcon(cat.category),
        };
      });
  }, [spendingData, budgets, getCategoryColor, getCategoryIcon]);

  return (
    <Card className="lg:col-span-3 overflow-hidden bg-zinc-900/50 backdrop-blur-sm border-white/10">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-white">Budget Monitor</CardTitle>
          <CardDescription className="text-zinc-400">
            Track spending against your monthly limits
          </CardDescription>
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleOpenModal}
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit Budgets</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-950 border-white/10 max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">Monthly Category Budgets</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Set your spending limits for each category. Changes are saved locally.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              {categories
                .filter(cat => cat.type === 'expense')
                .sort((a, b) => {
                  if (a.isDefault && !b.isDefault) return -1;
                  if (!a.isDefault && b.isDefault) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 w-40">
                      <div className="relative flex-shrink-0">
                        <span className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5 text-base">
                          {cat.icon}
                        </span>
                        <div 
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950"
                          style={{ backgroundColor: cat.color }}
                        />
                      </div>
                      <Label className="text-sm text-zinc-300 truncate font-medium">{cat.name}</Label>
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="50"
                        placeholder="0"
                        value={editBudgets[cat.name] || ''}
                        onChange={(e) => handleBudgetChange(cat.name, e.target.value)}
                        className="pl-7 bg-zinc-900 border-white/10 text-white focus:border-violet-500/50 h-9"
                      />
                    </div>
                  </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-white hover:bg-white/5">
                Cancel
              </Button>
              <Button onClick={handleSaveBudgets} className="bg-violet-600 hover:bg-violet-700 text-white">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="overflow-hidden pt-2">
        <div className="flex flex-col min-h-[350px] space-y-5">
          {displayItems.length > 0 ? (
            displayItems.map((item, index) => {
              const spent = item.amount;
              const budget = item.budget;
              // Cap progress at 100% for visual, but allow calculation
              const progressValue = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
              const isOverBudget = budget > 0 && spent > budget;
              const percentage = (spent / budget) * 100;

              return (
                <div key={index} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-zinc-800/50 border border-white/5 text-lg">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-white truncate">{item.category}</p>
                        <span className={`text-sm font-bold tabular-nums ${isOverBudget ? 'text-rose-400' : 'text-white'}`}>
                          {formatCurrency(spent)}
                          {budget > 0 && (
                            <span className="text-zinc-500 font-normal"> / {formatCurrency(budget)}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-12">
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden relative">
                      <div 
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ 
                          width: `${progressValue || (item.percentage ? Math.min(item.percentage, 100) : 0)}%`, 
                          backgroundColor: item.color,
                          opacity: isOverBudget ? 1 : 0.8
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1.5 flex justify-between">
                      <span>
                        {budget > 0 ? (
                          isOverBudget 
                            ? `Over budget by ${formatCurrency(spent - budget)}`
                            : `${formatCurrency(budget - spent)} remaining`
                        ) : (
                          `${item.percentage.toFixed(1)}% of total expenses`
                        )}
                      </span>
                      {budget > 0 && (
                        <span className={isOverBudget ? 'text-rose-400/70' : 'text-emerald-400/70'}>
                          {Math.round(percentage)}%
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-zinc-500 text-sm">
              <p>No expense data for this month.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
