'use client';

import { useMemo } from 'react';
import {
    ComposedChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { format, parseISO, subMonths, startOfYear, isAfter } from 'date-fns';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Info, Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DateRange } from 'react-day-picker';
import { useState } from 'react';

interface DayBucket {
    date: string;       // YYYY-MM-DD
    timestamp: number;

    // The 3 Wealth Output Layers (Stacked Positive)
    // The 4 Wealth Output Layers (Stacked Positive)
    activeCash: number; // Cash portion derived from Active sources
    passive: number;    // Passive Wealth (Dividends + Gains)
    activeInvested: number; // Invested portion derived from Active sources
    marketGains: number;   // Unrealized Gains

    // The Consumption Layer (Negative Reflection)
    consumption: number;
    
    // Raw for Tooltip
    gainsPosRange: [number, number];
    gainsNegRange: [number, number];
    // Raw for Tooltip
    cashPlusInvested: number; // For Line layering
    gainsPosRange: [number, number];
    gainsNegRange: [number, number];
    rawExpense: number;
    totalNetWorth: number; // 🌟 Added missing property
}

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'ALL' | 'CUSTOM';

const RANGE_LABELS: Record<TimeRange, string> = {
    '1M': '1 Month',
    '3M': '3 Months',
    '6M': '6 Months',
    'YTD': 'YTD',
    'ALL': 'All Time',
    'CUSTOM': 'Custom',
};

export function WealthSourcesChart() {
    const { transactions, history: costBasisHistory, displayCurrency, totalCashValue, totalMarketValue, positions } = usePortfolio();
    
    // State for Time Range
    const [timeRange, setTimeRange] = useState<TimeRange>('YTD');
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();

    // --- DATA PROCESSING: Wealth vs Consumption Model ---
    const chartData = useMemo(() => {
        if (!transactions || transactions.length === 0 || !costBasisHistory || costBasisHistory.length === 0) {
            return [];
        }

        // ============================================================
        // STEP A: Calculate Cumulative Expenses
        // ============================================================
        
        // 1. Group Transactions by Day for Expenses
        const dailyExpenseMap = new Map<string, number>();
        const getOrSetExpense = (date: string) => {
            if (!dailyExpenseMap.has(date)) dailyExpenseMap.set(date, 0);
            return dailyExpenseMap.get(date)!;
        };

        transactions.forEach(tx => {
            let dateStr = '';
            // @ts-ignore
            if (tx.transactionDate?.toDate) dateStr = format(tx.transactionDate.toDate(), 'yyyy-MM-dd');
            // @ts-ignore
            else if (tx.transactionDate instanceof Date) dateStr = format(tx.transactionDate, 'yyyy-MM-dd');
            else if (typeof tx.transactionDate === 'string') dateStr = tx.transactionDate.slice(0, 10);
            else return;

            const type = (tx.transactionType || '').toLowerCase();
            const amount = Math.abs(tx.totalCost || (tx.price * tx.quantity) || 0);

            if (type === 'expense') {
                const current = getOrSetExpense(dateStr);
                dailyExpenseMap.set(dateStr, current + amount);
            }
        });

        // 2. Sort History by Date
        const sortedHistory = [...costBasisHistory].sort((a, b) => a.date.localeCompare(b.date));

        // 3. Merge History with Running Expenses
        let runningExpense = 0;
        const processedPoints: DayBucket[] = [];

        // Track the last processed date to fill in gaps if necessary
        let lastProcessedDate = '';

        for (const historyItem of sortedHistory) {
            const date = historyItem.date;
            lastProcessedDate = date;
            
            // Add today's expense to running total
            const dayExpense = dailyExpenseMap.get(date) || 0;
            runningExpense += dayExpense;

            // Wealth Layers from History Snapshot
            const cash = historyItem.cash || 0;
            const invested = historyItem.invested || 0; // Cost Basis
            const marketValue = historyItem.marketValue || historyItem.invested || 0;
            const passiveVal = historyItem.passiveSourceValue || 0;
            
            const unrealizedPL = marketValue - invested;
            
            // 🌟 PROPORTIONAL SPLIT LOGIC (Same as NetWorthChart)
            // Goal: ActiveCash + Passive + ActiveInvested = (Cash + Invested)
            const realizedTotal = cash + invested;
            const netActivePrincipal = Math.max(0, realizedTotal - passiveVal);
            const activeRatio = realizedTotal > 0 ? (netActivePrincipal / realizedTotal) : 0;
            
            const activeCash = cash * activeRatio;
            const activeInvested = invested * activeRatio;
            
            processedPoints.push({
                date,
                timestamp: parseISO(date).getTime(),
                
                
                // Stack Layers (Proportional)
                activeCash: (isNaN(activeCash) ? 0 : activeCash),
                passive: passiveVal,
                activeInvested: (isNaN(activeInvested) ? 0 : activeInvested),
                marketGains: (isNaN(unrealizedPL) ? 0 : unrealizedPL),
                
                // Mirror Layer
                consumption: (isNaN(runningExpense) ? 0 : -runningExpense),

                // Helper for Stacking
                cashPlusInvested: realizedTotal,
                
                
                // Raw for Tooltip
                gainsPosRange: [
                    (cash||0) + (invested||0),
                    (unrealizedPL > 0) ? ((cash||0) + (invested||0) + unrealizedPL) : ((cash||0) + (invested||0)) 
                ],
                gainsNegRange: [
                    (unrealizedPL < 0) ? ((cash||0) + (invested||0) + unrealizedPL) : ((cash||0) + (invested||0)),
                    (cash||0) + (invested||0)
                ],
                rawExpense: (isNaN(runningExpense) ? 0 : runningExpense),
                totalNetWorth: (cash || 0) + (invested || 0) + (unrealizedPL || 0) // 🌟 Populate with history data
            });
        }

        // ============================================================
        // STEP B: Inject LIVE Data (The "Now" Point)
        // ============================================================
        // History snapshots might be stale (e.g. yesterday). We want the chart to match the Dashboard URL.
        
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const lastPoint = processedPoints[processedPoints.length - 1];
        
        // Calculate Live Metrics
        const liveCostBasis = positions.reduce((acc, pos) => {
            if (pos.isCash) return acc;
            // Use absolute quantity for cost basis (magnitude of investment)
            const val = acc + (Math.abs(pos.quantity || 0) * (pos.averageCost || 0) * (pos.fxRate || 1));
            return isNaN(val) ? acc : val;
        }, 0);
        
        const liveMarketGains = totalMarketValue - liveCostBasis;
        
        // 🌟 LIVE POINT SPLIT LOGIC
        // Use last known passive value (since we don't calculate live passive from transactions in real-time easily yet)
        const lastPassive = lastPoint ? lastPoint.passive : 0;
        const liveRealizedTotal = totalCashValue + liveCostBasis;
        const liveNetActivePrincipal = Math.max(0, liveRealizedTotal - lastPassive);
        const liveActiveRatio = liveRealizedTotal > 0 ? (liveNetActivePrincipal / liveRealizedTotal) : 0;
        
        const liveActiveCash = totalCashValue * liveActiveRatio;
        const liveActiveInvested = liveCostBasis * liveActiveRatio;

        // Gap Fill Logic...
        // If history stopped yesterday, we need to add today's expenses (and any gap days).
        // A simple way is to re-sum everything from transactions, but that's O(N).
        // Since we already have dailyExpenseMap, we can iterate from lastProcessedDate + 1 day -> Today.
        
        // Actually, simpler: The loop above only added expenses for dates IN history.
        // Expenses on days NOT in history were missed.
        // We should probably iterate ALL dates between first history and today to be correct?
        // Or simpler: Just calculate total lifetime expenses from transactions accurately right now 
        // and force the last point to use that?
        // No, the graph needs to be cumulative.
        
        // Let's perform a "Gap Fill" for expenses if the last point is not today.
        if (lastProcessedDate && lastProcessedDate !== todayStr) {
             // Find all expenses in dailyExpenseMap that are > lastProcessedDate
             dailyExpenseMap.forEach((amount, date) => {
                 if (date > lastProcessedDate && date <= todayStr) {
                     runningExpense += amount;
                 }
             });
        }

        const livePoint: DayBucket = {
            date: todayStr,
            timestamp: new Date().getTime(),
            activeCash: (isNaN(liveActiveCash) ? 0 : liveActiveCash),
            passive: lastPassive,
            activeInvested: (isNaN(liveActiveInvested) ? 0 : liveActiveInvested),
            marketGains: (isNaN(liveMarketGains) ? 0 : liveMarketGains),
            consumption: (isNaN(runningExpense) ? 0 : -runningExpense),
            consumption: (isNaN(runningExpense) ? 0 : -runningExpense),
            totalNetWorth: (totalCashValue || 0) + (totalMarketValue || 0),
            cashPlusInvested: (totalCashValue || 0) + (liveCostBasis || 0),
            gainsPosRange: [
                (totalCashValue||0) + (liveCostBasis||0), 
                (liveMarketGains > 0) ? ((totalCashValue||0) + (liveCostBasis||0) + liveMarketGains) : ((totalCashValue||0) + (liveCostBasis||0))
            ],
            gainsNegRange: [
                (liveMarketGains < 0) ? ((totalCashValue||0) + (liveCostBasis||0) + liveMarketGains) : ((totalCashValue||0) + (liveCostBasis||0)),
                (totalCashValue||0) + (liveCostBasis||0)
            ],
            
            rawExpense: (isNaN(runningExpense) ? 0 : runningExpense)
        };

        if (lastPoint && lastPoint.date === todayStr) {
            // Overwrite existing today point with LIVE data
            processedPoints[processedPoints.length - 1] = livePoint;
        } else {
            // Append new today point
            processedPoints.push(livePoint);
        }

        if (lastPoint) {
            // Debug gap removed
        }

        return processedPoints;
    }, [transactions, costBasisHistory, totalCashValue, totalMarketValue, positions]);

    // --- FILTER & RELATIVE CALCULATION ---
    const filteredData = useMemo(() => {
        if (chartData.length === 0) return [];

        const now = new Date();
        let cutoffDate: Date;

        switch (timeRange) {
            case '1M': cutoffDate = subMonths(now, 1); break;
            case '3M': cutoffDate = subMonths(now, 3); break;
            case '6M': cutoffDate = subMonths(now, 6); break;
            case 'YTD': cutoffDate = startOfYear(now); break;
            case 'ALL': cutoffDate = new Date(0); break;
            case 'CUSTOM': 
                cutoffDate = customDateRange?.from || startOfYear(now);
                break;
            default: cutoffDate = startOfYear(now);
        }

        // 1. Filter by Date
        const filtered = chartData.filter(item => {
            const itemDate = new Date(item.timestamp);
            if (timeRange === 'CUSTOM' && customDateRange?.to) {
                return isAfter(itemDate, cutoffDate) && itemDate <= customDateRange.to;
            }
            return isAfter(itemDate, cutoffDate) || itemDate.getTime() === cutoffDate.getTime();
        });

        if (filtered.length === 0) return [];

        // 2. RELATIVE CALCULATION (Reset to 0 at start)
        // If ALL, we keep absolute values.
        // If Period, we reset Consumption sum and Market P&L to 0.
        
        if (timeRange === 'ALL') return filtered;

        const startPoint = filtered[0];
        const startExpense = startPoint.rawExpense;
        // const startGains = startPoint.marketGains; // 🌟 Revert: Keep Gains Absolute

        return filtered.map(pt => {
            // Reset Consumption Sum (Keep this Relative as requested)
            // New Consumption = -(CurrentCumulative - StartCumulative)
            const relativeConsumption = -(pt.rawExpense - startExpense);

            // 🌟 Revert to Absolute Market Gains ("All Time Style")
            // The user wants to see the full wealth stack, even in 1M view.
            const absoluteGains = pt.marketGains;
            const absoluteNetWorth = pt.totalNetWorth;

            return {
                ...pt,
                consumption: relativeConsumption,
                marketGains: absoluteGains,
                lineRedEnvelope: undefined, 
                lineGreenEnvelope: undefined,
                
                // Recalculate Ranges using ABSOLUTE values
                gainsPosRange: [
                    pt.cashPlusInvested,
                    (absoluteGains > 0) ? (pt.cashPlusInvested + absoluteGains) : pt.cashPlusInvested
                ] as [number, number],

                gainsNegRange: [
                    (absoluteGains < 0) ? (pt.cashPlusInvested + absoluteGains) : pt.cashPlusInvested,
                    pt.cashPlusInvested
                ] as [number, number],
                
                totalNetWorth: absoluteNetWorth
            };
        });

    }, [chartData, timeRange, customDateRange]);

    const handleRangeSelect = (range: TimeRange) => {
        setTimeRange(range);
        // If Custom, logic to open calendar would go here (simplified)
    };

    return (
        <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        Wealth Sources
                        <Info className="w-4 h-4 text-muted-foreground" />
                    </CardTitle>
                    <CardDescription>
                         Attribution: Cash + Invested Capital + Market Gains vs. Consumption (Red)
                    </CardDescription>
                </div>
                
                 {/* Time Range Selector */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-medium border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400">
                            {RANGE_LABELS[timeRange]} <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10">
                        {(['1M', '3M', '6M', 'YTD', 'ALL'] as TimeRange[]).map(r => (
                            <DropdownMenuItem 
                                key={r} 
                                onClick={() => handleRangeSelect(r)}
                                className={timeRange === r ? 'text-violet-400 font-medium' : 'text-zinc-400'}
                            >
                                {RANGE_LABELS[r]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent>
                <div className="h-[400px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={filteredData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                {/* Expense Mirror Gradient (Red fade from axis down) */}
                                {/* 🌟 REFLECTION EFFECT: Top (0%) = Semi-Opaque, Bottom (100%) = Faint */}
                                <linearGradient id="colorConsumption" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                                </linearGradient>
                                
                                {/* 🌟 SOLID ASSETS: Higher Opacity for Top Layers */}
                                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.8} /> {/* Fade UP to solid */}
                                </linearGradient>
                                <linearGradient id="colorPassive" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
                                </linearGradient>
                                <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                </linearGradient>
                                <linearGradient id="colorGains" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} /> 
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                                </linearGradient>
                                {/* 🌟 RED HATCHING PATTERN for LOSSES */}
                                <pattern id="lossHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                                    <rect width="8" height="8" fill="#f43f5e" fillOpacity={1} />
                                    <path d="M 0 0 L 0 8" stroke="#ef4444" strokeWidth="2" />
                                </pattern>
                                <linearGradient id="colorConsumption" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.3} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid 
                                strokeDasharray="3 3" 
                                vertical={false} 
                                stroke="#334155" 
                                opacity={0.2}
                            />
                            
                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(unixTime) => format(new Date(unixTime), 'MMM yyyy')}
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={12}
                                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                tickLine={false}
                                axisLine={false}
                            />

                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-gray-900/95 border border-white/10 p-3 rounded-lg shadow-xl backdrop-blur-md">
                                                <p className="text-gray-400 text-xs mb-2 border-b border-white/10 pb-1">
                                                    {format(new Date(data.date), 'MMM dd, yyyy')}
                                                </p>
                                                
                                                <div className="space-y-1.5">
                                                    {/* Cash */}
                                                    <div className="flex items-center justify-between gap-4 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                            <span className="text-gray-300">Cash</span>
                                                        </div>
                                                        <span className="text-gray-200 font-mono">
                                                            {/* Show Total Raw Cash for clarity in Tooltip */}
                                                            {formatCurrency(totalCashValue || ((data.activeCash / (data.activeCash+data.activeInvested+0.001)) * (data.activeCash + data.activeInvested + data.passive)), displayCurrency)}
                                                        </span>
                                                    </div>

                                                    {/* Invested */}
                                                    <div className="flex items-center justify-between gap-4 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-2 h-2 rounded-full bg-violet-500" />
                                                            <span className="text-gray-300">Invested Capital</span>
                                                        </div>
                                                        <span className="text-gray-200 font-mono">
                                                             {/* Show Total Raw Invested for clarity in Tooltip */}
                                                            {/* Approximating back from split if needed, or if data obj has raw? It doesn't. */}
                                                            {/* Let's just show Active + Proportion if we want, OR just show the Split values? */}
                                                            {/* User usually expects "Total Cash" here. Let's try to reconstruct roughly or just show Active Portion? */}
                                                            {/* Actually, let's show the STACKED value which means Active Cash. User might be confused if numbers don't sum up. */}
                                                            {/* BUT, "Cash" usually means Bank Balance. */}
                                                            {/* Let's show Active Cash with label 'Active Cash' to be precise? */}
                                                            {/* Or simpler: Recalculate raw values for tooltip if we want correctness. */}
                                                            {formatCurrency(data.activeCash, displayCurrency)} 
                                                            <span className="text-xs text-gray-500 ml-1">(Active)</span>
                                                        </span>
                                                    </div>

                                                    {/* Passive Wealth */}
                                                    <div className="flex items-center justify-between gap-4 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                            <span className="text-gray-300">Passive Wealth</span>
                                                        </div>
                                                        <span className="text-gray-200 font-mono">
                                                            {formatCurrency(data.passive, displayCurrency)}
                                                        </span>
                                                    </div>

                                                    {/* Market Gains / Loss */}
                                                    <div className="flex items-center justify-between gap-4 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={`w-2 h-2 rounded-full ${data.marketGains >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                            <span className="text-gray-300">
                                                                {data.marketGains >= 0 ? 'Market Gains' : 'Market Loss'}
                                                            </span>
                                                        </div>
                                                        <span className={`font-mono ${data.marketGains >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                                                            {data.marketGains >= 0 ? '+' : ''}{formatCurrency(data.marketGains, displayCurrency)}
                                                        </span>
                                                    </div>

                                                    <div className="h-px bg-white/10 my-1" />

                                                    {/* Net Worth */}
                                                    <div className="flex items-center justify-between gap-4 text-xs font-semibold">
                                                        <span className="text-gray-100">Net Worth</span>
                                                        <span className="text-emerald-400 font-mono">
                                                            {formatCurrency(data.totalNetWorth, displayCurrency)}
                                                        </span>
                                                    </div>

                                                    {/* Consumption */}
                                                    <div className="flex items-center justify-between gap-4 text-xs mt-2 pt-2 border-t border-dashed border-white/10">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                            <span className="text-gray-400">Consumption</span>
                                                        </div>
                                                        <span className="text-rose-400 font-mono">
                                                            {formatCurrency(Math.abs(data.consumption), displayCurrency)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />

                            {/* 🌟 SOLID HORIZON LINE */}
                            <ReferenceLine 
                                y={0} 
                                stroke="#e2e8f0" 
                                strokeOpacity={0.6}
                                strokeWidth={2}
                            />

                            <Area
                                type="monotone"
                                dataKey="activeCash"
                                name="Cash"
                                stackId="1" // Stack positive values together
                                stroke="none"
                                fill="url(#colorCash)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="passive"
                                name="Passive"
                                stackId="1" // Stack on Cash
                                stroke="#f59e0b" // 🌟 ADDED STROKE as requested
                                fill="url(#colorPassive)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="activeInvested"
                                name="Invested"
                                stackId="1" 
                                stroke="#8b5cf6" // 🌟 ADDED STROKE as requested
                                fill="url(#colorInvested)"
                                strokeWidth={2}
                            />
                            
                            {/* Market Gains: Positive (Green Gradient) */}
                            <Area
                                type="monotone"
                                dataKey="gainsPosRange"
                                name="Market Gains"
                                stroke="none"
                                fill="url(#colorGains)"
                                strokeWidth={2}
                            />

                            {/* Market Gains: Negative (Red X Pattern) */}
                            <Area
                                type="monotone"
                                dataKey="gainsNegRange"
                                name="Market Gains (Loss)"
                                stroke="none" // No stroke for the area itself
                                fill="url(#lossHatch)"
                                strokeWidth={2}
                            />
                            
                            {/* --- LINES (Strokes) LAYERED BY PRIORITY --- */}
                            
                            {/* Lowest Priority: Market Gains (Top of Stack) */}
                            <Area
                                type="monotone"
                                dataKey="totalNetWorth"
                                stroke="#10b981"
                                fill="none"
                                strokeWidth={2}
                                isAnimationActive={false}
                                tooltipType="none"
                                activeDot={false}
                                legendType="none"
                            />

                            {/* Medium Priority: Invested (Middle of Stack) */}
                            <Area
                                type="monotone"
                                dataKey="cashPlusInvested"
                                stroke="#8b5cf6"
                                fill="none"
                                strokeWidth={2}
                                isAnimationActive={false}
                                tooltipType="none"
                                activeDot={false}
                                legendType="none"
                                strokeOpacity={1} // Opaque to hide the coincident envelope lines
                            />
                             {/* Highest Priority: Cash (Bottom of Stack) */}
                             <Area
                                type="monotone"
                                dataKey="activeCash"
                                stroke="#3b82f6"
                                fill="none"
                                strokeWidth={2}
                                isAnimationActive={false}
                                tooltipType="none" 
                                activeDot={false}
                                legendType="none"
                            />

                            
                            {/* NEGATIVE SIDE: Cumulative Expenses (Mirror Reflection) */}
                            <Area
                                type="monotone"
                                dataKey="consumption"
                                name="Consumption"
                                stackId="2" // Separate stack for consumption (negative)
                                stroke="#ef4444"
                                strokeOpacity={0.33} // 🌟 Reduced opacity as requested
                                fill="url(#colorConsumption)"
                                strokeWidth={1.5} // Thinner stroke for reflection
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* --- LEGEND (Custom Footer) --- */}
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 pt-4 border-t border-white/5">
                    {/* Cash */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/20" />
                        <span className="text-xs font-medium text-blue-300 uppercase tracking-wide">Cash</span>
                    </div>

                    {/* Passive */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                        <span className="text-xs font-medium text-amber-300 uppercase tracking-wide">Passive</span>
                    </div>

                    {/* Invested */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-violet-500 ring-2 ring-violet-500/20" />
                        <span className="text-xs font-medium text-violet-300 uppercase tracking-wide">Invested Capital</span>
                    </div>

                    {/* Gains */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                        <span className="text-xs font-medium text-emerald-300 uppercase tracking-wide">Market Gains</span>
                    </div>

                    {/* Loss */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/20" />
                        <span className="text-xs font-medium text-rose-300 uppercase tracking-wide">Market Loss</span>
                    </div>

                    {/* Consumption */}
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 ring-2 ring-red-500/20" />
                        <span className="text-xs font-medium text-red-300 uppercase tracking-wide">Consumption</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
