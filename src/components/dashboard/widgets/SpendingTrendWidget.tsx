'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { subMonths, isValid } from 'date-fns';
import { TrendingDown, ListFilter, ChevronDown } from 'lucide-react';
import { AuraCard } from '@/components/ui/AuraCard';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";


interface Transaction {
  transactionDate?: any;
  transactionType?: string;
  type?: string;
  quantity?: number;
  price?: number;
  scope?: string;
}

interface SpendingTrendWidgetProps {
  transactions: Transaction[];
}

type CompareMode = 'MoM' | '6M_AVG' | '1Y_AVG';

const COMPARE_LABELS: Record<CompareMode, string> = {
    'MoM': 'vs Last Month',
    '6M_AVG': 'vs 6M Avg',
    '1Y_AVG': 'vs 1Y Avg',
};

import { formatCurrency } from '@/lib/utils/format';
import { usePortfolio } from '@/contexts/PortfolioContext';

// ... (imports)

export function SpendingTrendWidget({ transactions }: SpendingTrendWidgetProps) {
  const { displayCurrency, getExchangeRate } = usePortfolio();
  
  // Toggles for chart series
  const [visibleSeries, setVisibleSeries] = useState({
    lastMonth: true,
    avg3m: false,
    avg6m: false,
    avg1y: false
  });

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
        const saved = localStorage.getItem('dashboard-spending-trend-prefs');
        if (saved) {
            setVisibleSeries(JSON.parse(saved));
        }
    } catch (e) {
        console.error('Failed to load spending trend preferences', e);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    try {
        localStorage.setItem('dashboard-spending-trend-prefs', JSON.stringify(visibleSeries));
    } catch (e) {
        console.error('Failed to save spending trend preferences', e);
    }
  }, [visibleSeries]);

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Parse transaction helper
  const parseTransactionDate = useCallback((t: Transaction): Date | null => {
    try {
      const txDate = t.transactionDate?.toDate ? t.transactionDate.toDate() : new Date(t.transactionDate);
      return isValid(txDate) ? txDate : null;
    } catch {
      return null;
    }
  }, []);

  const isExpense = useCallback((t: Transaction): boolean => {
    // Only count expenses in LIFESTYLE scope
    const txType = t.type || t.transactionType;
    return txType?.toUpperCase() === 'EXPENSE' && t.scope === 'LIFESTYLE';
  }, []);

  const getTransactionAmount = useCallback((t: Transaction): number => {
    const rawVal = Math.abs((t.quantity || 0) * (t.price || 1));
    const nativeCurrency = (t as any).currency || 'USD';
    
    if (nativeCurrency === displayCurrency) return rawVal;
    
    const rate = getExchangeRate(nativeCurrency, displayCurrency);
    if (rate !== null) return rawVal * rate;
    
    return rawVal; 
  }, [displayCurrency, getExchangeRate]);

  // --- CUMULATIVE SPENDING LOGIC ---
  const { chartData, currentTotal, changePct, isSaving } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const todayDate = now.getDate();
    const maxDays = 31;

    // --- Helper: Get normalized daily cumulative for a specific month ---
    const getMonthCumulative = (targetDate: Date) => {
      const targetMonth = targetDate.getMonth();
      const targetYear = targetDate.getFullYear();
      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      
      const dailyMap: Record<number, number> = {};
      
      transactions.forEach(t => {
        if (!isExpense(t)) return;
        const date = parseTransactionDate(t);
        if (!date) return;
        
        if (date.getMonth() === targetMonth && date.getFullYear() === targetYear) {
           const d = date.getDate();
           dailyMap[d] = (dailyMap[d] || 0) + getTransactionAmount(t);
        }
      });

      const series = [];
      let running = 0;
      for (let day = 1; day <= maxDays; day++) {
        // If day exists in month, add it.
        // If day > daysInTargetMonth (e.g. Feb 30), use last known value (flat line)
        const dayToFetch = Math.min(day, daysInTargetMonth);
        
        // Add specific day amount if we haven't passed end of month logic for summing
        if (day <= daysInTargetMonth) {
           running += (dailyMap[day] || 0);
        }
        series.push(running);
      }
      return series;
    };

    // --- Helper: Calculate Average Series ---
    const calculateAverageSeries = (monthsBack: number) => {
      const accumulatedPeriod: number[] = new Array(maxDays).fill(0);
      let validMonths = 0;

      for (let i = 1; i <= monthsBack; i++) {
        const targetDate = subMonths(now, i);
        const monthSeries = getMonthCumulative(targetDate);
        
        // Add to accumulator
        for (let d = 0; d < maxDays; d++) {
           accumulatedPeriod[d] += monthSeries[d];
        }
        validMonths++;
      }

      return accumulatedPeriod.map(val => val / (validMonths || 1));
    };

    // 1. Calculate Series
    const lastMonthSeries = getMonthCumulative(subMonths(now, 1));
    const avg3mSeries = calculateAverageSeries(3);
    const avg6mSeries = calculateAverageSeries(6);
    const avg1ySeries = calculateAverageSeries(12);

    // 2. Current Month Logic
    const currentMonthMap: Record<number, number> = {};
    transactions.forEach(t => {
       if (!isExpense(t)) return;
       const date = parseTransactionDate(t);
       if (!date) return;
       if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
           const d = date.getDate();
           currentMonthMap[d] = (currentMonthMap[d] || 0) + getTransactionAmount(t);
       }
    });

    // 3. Combine Data
    const dataPoints = [];
    let runningCurrent = 0;
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= maxDays; day++) {
        let currentVal: number | undefined = undefined;
        if (day <= daysInCurrentMonth && day <= todayDate) {
            runningCurrent += (currentMonthMap[day] || 0);
            currentVal = runningCurrent;
        }

        dataPoints.push({
            day,
            currentMonth: currentVal,
            lastMonth: lastMonthSeries[day - 1],
            avg3m: avg3mSeries[day - 1],
            avg6m: avg6mSeries[day - 1],
            avg1y: avg1ySeries[day - 1],
        });
    }

    // 4. Metrics
    // Comparison: Compare Current Total-to-Date vs Last Month Total-to-Date
    const lastMonthToDate = lastMonthSeries[Math.min(todayDate, 31) - 1] || 0;
    const diff = runningCurrent - lastMonthToDate;
    const pct = lastMonthToDate > 0 ? (diff / lastMonthToDate) * 100 : 0;
    const isSaving = diff < 0;

    return {
        chartData: dataPoints,
        currentTotal: runningCurrent,
        changePct: Math.abs(pct),
        isSaving
    };

  }, [transactions, getTransactionAmount, isExpense, parseTransactionDate]);

  return (
    <AuraCard variant="indigo" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-violet-500/10 bg-violet-500/5 gap-4">
        <div>
           <h3 className="text-xs font-bold uppercase tracking-widest text-violet-300/70 mb-1 flex items-center gap-2">
             <TrendingDown className="w-3.5 h-3.5" />
             Monthly Burn
           </h3>
           <div className="flex items-baseline gap-3">
             <span className="text-3xl font-bold text-white tracking-tight">
                {formatCurrency(currentTotal, displayCurrency)}
             </span>
             <span className={`text-sm font-medium ${isSaving ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isSaving ? '-' : '+'}{changePct.toFixed(1)}% vs last month
             </span>
           </div>
        </div>

        {/* Compare Menu */}
        <div className="flex justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-medium border-white/10 bg-white/5 hover:bg-white/10">
                        Compare <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 min-w-[220px]">
                    <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Benchmarks</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    
                    {/* Last Month */}
                    <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => toggleSeries('lastMonth')}
                        className="flex items-center justify-between py-2 cursor-pointer"
                    >
                        <span className="text-xs font-medium">Last Month</span>
                        <Switch checked={visibleSeries.lastMonth} onCheckedChange={() => {}} className="scale-75 data-[state=checked]:bg-zinc-400" />
                    </DropdownMenuItem>

                    {/* 3M Avg */}
                    <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => toggleSeries('avg3m')}
                        className="flex items-center justify-between py-2 cursor-pointer"
                    >
                        <span className="text-xs font-medium text-amber-500">3 Months Average</span>
                        <Switch checked={visibleSeries.avg3m} onCheckedChange={() => {}} className="scale-75 data-[state=checked]:bg-amber-500" />
                    </DropdownMenuItem>

                    {/* 6M Avg */}
                    <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => toggleSeries('avg6m')}
                        className="flex items-center justify-between py-2 cursor-pointer"
                    >
                        <span className="text-xs font-medium text-blue-500">6 Months Average</span>
                        <Switch checked={visibleSeries.avg6m} onCheckedChange={() => {}} className="scale-75 data-[state=checked]:bg-blue-500" />
                    </DropdownMenuItem>
                    
                    {/* 1Y Avg */}
                    <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => toggleSeries('avg1y')}
                        className="flex items-center justify-between py-2 cursor-pointer"
                    >
                        <span className="text-xs font-medium text-purple-500">1 Year Average</span>
                        <Switch checked={visibleSeries.avg1y} onCheckedChange={() => {}} className="scale-75 data-[state=checked]:bg-purple-500" />
                    </DropdownMenuItem>

                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full relative min-h-0 px-2 pt-4 pb-2">
         {/* LEGEND - Shows active series */}
         <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-[10px] font-medium">
            {/* Current Month - Always visible */}
            <div className="flex items-center gap-1.5">
               <div className="w-3 h-0.5 bg-violet-500 rounded-full" />
               <span className="text-violet-400">This Month</span>
            </div>
            {visibleSeries.lastMonth && (
               <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-zinc-400 rounded-full border-dashed" style={{ borderTop: '2px dashed #9ca3af', backgroundColor: 'transparent' }} />
                  <span className="text-zinc-400">Last Month</span>
               </div>
            )}
            {visibleSeries.avg3m && (
               <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-amber-500 rounded-full" />
                  <span className="text-amber-500">3M Avg</span>
               </div>
            )}
            {visibleSeries.avg6m && (
               <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-blue-500 rounded-full" />
                  <span className="text-blue-500">6M Avg</span>
               </div>
            )}
            {visibleSeries.avg1y && (
               <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-purple-500 rounded-full" />
                  <span className="text-purple-500">1Y Avg</span>
               </div>
            )}
         </div>
         
         <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
               <XAxis 
                 dataKey="day" 
                 axisLine={false} 
                 tickLine={false} 
                 tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                 interval={4}
               />
               <YAxis 
                 hide 
                 domain={['dataMin', 'auto']} 
               />
               <Tooltip
                  content={({ active, payload, label }) => {
                     if (active && payload && payload.length) {
                        return (
                           <div className="bg-zinc-950/90 backdrop-blur border border-white/10 p-3 rounded-lg shadow-xl text-xs z-50">
                              <div className="text-zinc-400 mb-2 font-medium">Day {label}</div>
                              {payload.map((entry: any) => (
                                 <div key={entry.name} className="flex items-center justify-between gap-4 mb-1">
                                    <span className="flex items-center gap-1.5" style={{ color: entry.stroke }}>
                                       <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.stroke }}/>
                                       {entry.name}
                                    </span>
                                    <span className="font-mono text-white">
                                       {formatCurrency(entry.value, displayCurrency)}
                                    </span>
                                 </div>
                              ))}
                           </div>
                        )
                     }
                     return null;
                  }}
               />
               
               {/* 1Y Avg - Purple */}
               {visibleSeries.avg1y && (
                 <Line 
                    type="monotone" 
                    dataKey="avg1y" 
                    name="1 Year Avg"
                    stroke="#a855f7" 
                    strokeWidth={1.5} 
                    dot={false}
                    activeDot={{ r: 4, fill: '#a855f7' }}
                    strokeOpacity={0.7}
                 />
               )}

               {/* 6M Avg - Blue */}
               {visibleSeries.avg6m && (
                 <Line 
                    type="monotone" 
                    dataKey="avg6m" 
                    name="6 Months Avg"
                    stroke="#3b82f6" 
                    strokeWidth={1.5} 
                    dot={false}
                    activeDot={{ r: 4, fill: '#3b82f6' }}
                    strokeOpacity={0.7}
                 />
               )}

               {/* 3M Avg - Amber */}
               {visibleSeries.avg3m && (
                 <Line 
                    type="monotone" 
                    dataKey="avg3m" 
                    name="3 Months Avg"
                    stroke="#f59e0b" 
                    strokeWidth={1.5} 
                    dot={false}
                    activeDot={{ r: 4, fill: '#f59e0b' }}
                    strokeOpacity={0.8}
                 />
               )}

               {/* Last Month Benchmark - Dashed Grey */}
               {visibleSeries.lastMonth && (
                 <Line 
                    type="monotone" 
                    dataKey="lastMonth" 
                    name="Last Month"
                    stroke="#9ca3af" 
                    strokeWidth={2} 
                    strokeDasharray="4 4" 
                    dot={false}
                    activeDot={{ r: 4, fill: '#9ca3af' }}
                 />
               )}

               {/* Current Month Actual - Solid Primary */}
               <Line 
                  type="monotone" 
                  dataKey="currentMonth" 
                  name="This Month"
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  dot={false}
                  activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                  connectNulls={false} 
               />
            </LineChart>
         </ResponsiveContainer>
      </div>
    </AuraCard>
  );
}
