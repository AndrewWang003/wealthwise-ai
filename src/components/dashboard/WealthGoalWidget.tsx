'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { AuraCard } from '@/components/ui/AuraCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useSettings } from '@/hooks/useSettings';
import { Pencil, Target, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils/format';

interface Milestone {
  label: string;
  icon: string;
  color: string;
}

export function WealthGoalWidget() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { totalNetWorth, displayCurrency, sortedCurrencies, getExchangeRate } = usePortfolio();
  const { settings } = useSettings();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [targetCurrency, setTargetCurrency] = useState<string>('USD');
  const [deadline, setDeadline] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch recent snapshots for AI projection
  const snapshotsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/daily_snapshots`),
      orderBy('date', 'desc'),
      limit(30)
    );
  }, [user, firestore]);

  const { data: snapshots } = useCollection(snapshotsQuery);

  const wealthGoal = settings?.wealthGoal;
  
  // 🌍 DYNAMIC CONVERSION: Convert Goal Value to Display Value
  // Goal: 100,000 USD → Display: ~150,000 AUD (if AUD is displayCurrency)
  const safeGoalCurrency = wealthGoal?.currency || 'USD';
  
  // Calculate the converted target for dashboard display
  const displayTarget = useMemo(() => {
    if (!wealthGoal?.targetNetWorth) return 0;
    
    // If the goal currency matches display currency, no conversion needed
    if (safeGoalCurrency === displayCurrency) return wealthGoal.targetNetWorth;
    
    // Get exchange rate
    const fxRate = getExchangeRate(safeGoalCurrency, displayCurrency);
    if (!fxRate) return wealthGoal.targetNetWorth; // Fallback to raw value
    
    return wealthGoal.targetNetWorth * fxRate;
  }, [wealthGoal, safeGoalCurrency, displayCurrency, getExchangeRate]);

  // Calculate progress using CONVERTED values
  const progress = useMemo(() => {
    if (displayTarget === 0 || totalNetWorth === 0) return 0;
    return Math.min((totalNetWorth / displayTarget) * 100, 100);
  }, [totalNetWorth, displayTarget]);

  // Determine milestone
  const milestone: Milestone = useMemo(() => {
    if (progress >= 100) return { label: 'Goal Achieved!', icon: '🏆', color: 'text-yellow-500' };
    if (progress >= 60) return { label: 'Harvest Stage', icon: '🌾', color: 'text-amber-600' };
    if (progress >= 30) return { label: 'Growth Stage', icon: '🚀', color: 'text-blue-500' };
    return { label: 'Seed Stage', icon: '🌱', color: 'text-green-500' };
  }, [progress]);

  // AI Projection (using converted target)
  const projection = useMemo(() => {
    if (!snapshots || snapshots.length < 2 || !displayTarget) {
      return null;
    }

    // Sort by date ascending
    const sortedSnapshots = [...snapshots].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate average daily growth over the period
    const firstSnapshot = sortedSnapshots[0];
    const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
    
    const firstValue = firstSnapshot.totalValue || 0;
    const lastValue = lastSnapshot.totalValue || 0;
    
    const daysDiff = Math.max(1, (new Date(lastSnapshot.date).getTime() - new Date(firstSnapshot.date).getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyGrowth = (lastValue - firstValue) / daysDiff;

    if (avgDailyGrowth <= 0) {
      return {
        message: 'Keep accumulating momentum. Stay patient! 💪',
        isPositive: false
      };
    }

    // Calculate days needed to reach goal
    const remaining = displayTarget - totalNetWorth;
    if (remaining <= 0) {
      return {
        message: 'Congratulations! You\'ve achieved your goal! 🎉',
        isPositive: true
      };
    }

    const daysNeeded = Math.ceil(remaining / avgDailyGrowth);
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + daysNeeded);

    const monthYear = projectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return {
      message: `At current pace, you'll reach your goal by ${monthYear}`,
      isPositive: true,
      date: projectedDate
    };
  }, [snapshots, displayTarget, totalNetWorth]);

  const openEditDialog = () => {
    if (wealthGoal) {
      setTargetAmount(wealthGoal.targetNetWorth.toString());
      setTargetCurrency(wealthGoal.currency || 'USD');
      setDeadline(wealthGoal.deadline || '');
    } else {
      setTargetAmount('');
      setTargetCurrency(displayCurrency); // Default to current view currency
      setDeadline('');
    }
    setIsEditOpen(true);
  };

  const saveGoal = async () => {
    if (!user) return;

    const target = parseFloat(targetAmount);
    if (isNaN(target) || target <= 0) {
      alert('Please enter a valid target amount');
      return;
    }

    setIsSaving(true);
    try {
      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, {
        'settings.wealthGoal': {
          targetNetWorth: target,
          currency: targetCurrency, // Save the selected currency
          deadline: deadline || null,
          createdAt: wealthGoal?.createdAt || new Date().toISOString()
        }
      });
      setIsEditOpen(false);
    } catch (error) {
      console.error('Error saving wealth goal:', error);
      alert('Failed to save goal. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // If no goal is set, show setup prompt
  if (!wealthGoal) {
    return (
      <>
        <Card className="border-dashed border-2 h-full">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Set Your Wealth Goal</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Define your target net worth and track your progress with AI-powered projections
            </p>
            <Button onClick={openEditDialog}>
              <Target className="mr-2 h-4 w-4" />
              Set Goal
            </Button>
          </CardContent>
        </Card>

        <GoalEditDialog
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          targetAmount={targetAmount}
          setTargetAmount={setTargetAmount}
          targetCurrency={targetCurrency}
          setTargetCurrency={setTargetCurrency}
          currencies={sortedCurrencies}
          deadline={deadline}
          setDeadline={setDeadline}
          onSave={saveGoal}
          isSaving={isSaving}
        />
      </>
    );
  }

  return (
    <>
      <AuraCard variant="indigo" className="h-full relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-violet-500/10 bg-violet-500/5 relative z-10">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-violet-400 flex items-center gap-2">
                <Target className="h-4 w-4" /> Wealth Goal
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={openEditDialog} className="cursor-pointer hover:bg-violet-500/10 text-violet-300 h-8 px-3 text-xs font-bold uppercase tracking-wider">
            Set My Goal
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Current vs Target */}
          <div className="flex justify-between items-baseline">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Current</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totalNetWorth, displayCurrency)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Target</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(displayTarget, displayCurrency)}</p>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Progress 
                value={progress}
                className="h-2 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-indigo-500 [&>div]:via-purple-500 [&>div]:to-pink-500"
              />
            </motion.div>
            <div className="flex justify-between items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                className={`flex items-center gap-2 text-sm font-bold ${milestone.color}`}
              >
                <span>{milestone.icon}</span>
                <span>{milestone.label}</span>
              </motion.div>
              <span className="text-xs font-bold text-violet-300">{progress.toFixed(1)}%</span>
            </div>
          </div>

          {/* AI Projection */}
          {projection && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/5 border border-violet-500/10"
            >
              <TrendingUp className={`h-4 w-4 mt-0.5 flex-shrink-0 ${projection.isPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
              <p className="text-xs text-zinc-300 leading-relaxed">
                <span className="font-bold text-violet-200 block mb-0.5">AI Projection</span> 
                {projection.message}
              </p>
            </motion.div>
          )}
        </div>
      </AuraCard>

      <GoalEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        targetAmount={targetAmount}
        setTargetAmount={setTargetAmount}
        targetCurrency={targetCurrency}
        setTargetCurrency={setTargetCurrency}
        currencies={sortedCurrencies}
        deadline={deadline}
        setDeadline={setDeadline}
        onSave={saveGoal}
        isSaving={isSaving}
      />
    </>
  );
}

// Separate component for the edit dialog
const MAJOR_CURRENCIES = [
  'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'SGD',
  'NZD', 'TWD', 'KRW', 'INR', 'MYR', 'THB', 'VND', 'PHP', 'IDR'
];

function GoalEditDialog({
  isOpen,
  onClose,
  targetAmount,
  setTargetAmount,
  targetCurrency,
  setTargetCurrency,
  currencies, // currencies from user's portfolio
  deadline,
  setDeadline,
  onSave,
  isSaving
}: {
  isOpen: boolean;
  onClose: () => void;
  targetAmount: string;
  setTargetAmount: (value: string) => void;
  targetCurrency: string;
  setTargetCurrency: (value: string) => void;
  currencies: string[];
  deadline: string;
  setDeadline: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  // Merge user's existing currencies with major currencies and unique-fy
  const availableCurrencies = Array.from(new Set([...currencies, ...MAJOR_CURRENCIES])).sort();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Wealth Goal</DialogTitle>
          <DialogDescription>
            Define your target net worth and optional deadline to track your progress
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="target">Target Net Worth</Label>
            <div className="flex gap-2">
                <div className="w-[110px] shrink-0">
                    <Select value={targetCurrency} onValueChange={setTargetCurrency}>
                        <SelectTrigger>
                            <SelectValue placeholder="USD" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-zinc-800 max-h-[300px]">
                            {availableCurrencies.map(c => (
                                <SelectItem key={c} value={c} className="text-zinc-200 focus:bg-zinc-900 focus:text-white cursor-pointer">
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="relative flex-1">
                    <Input
                        id="target"
                        type="number"
                        min="0"
                        step="1000"
                        placeholder="100000"
                        value={targetAmount}
                        onChange={(e) => setTargetAmount(e.target.value)}
                        className=""
                    />
                </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline (Optional)</Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
