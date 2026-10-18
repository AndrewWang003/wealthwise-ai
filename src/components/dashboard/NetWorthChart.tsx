'use client';

import { useState, useMemo } from 'react';
import {
    ComposedChart,
    AreaChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useUser, useFirestore } from '@/firebase';
import { format, parseISO, subMonths, startOfYear, isAfter } from 'date-fns';


import { TrendingUp, TrendingDown, ChevronDown, Calendar as CalendarIcon, Info } from 'lucide-react';
import { AuraCard } from '@/components/ui/AuraCard';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import type { DateRange } from 'react-day-picker';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/skeleton';

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'ALL' | 'CUSTOM';

const RANGE_LABELS: Record<TimeRange, string> = {
    '1M': '1 Month',
    '3M': '3 Months',
    '6M': '6 Months',
    'YTD': 'YTD',
    'ALL': 'All Time',
    'CUSTOM': 'Custom',
};

// Interface for merged data point
// Interface for merged data point
interface ValuationPoint {
    date: string;       // YYYY-MM-DD
    timestamp: number;
    cash: number;       // From Snapshot (or History fallback)
    invested: number;   // Market Value from Snapshot (or History fallback)
    costBasis: number;  // From History (Invested Capital)
    total: number;      // cash + invested
    principal: number;  // cash + costBasis (Pre-calculated for Line chart)
    
    // Split Fields for Area Chart Visuals
    investedBase: number;   // Min(Market, Cost)
    investedProfit: number; // Max(0, Market - Cost)
    investedLoss: number;   // Max(0, Cost - Market)
    profitOutline?: number; // Total value ONLY when profit > 0 (for conditional border)
    
    // 🌟 PASSIVE METRICS
    passiveSourceValue: number;        // Cumulative Realized Gains + Dividends + Interest
    // savings: number;     // DEPRECATED: Replaced by split active metrics
    
    // 🌟 4-LAYER STACK SPLIT
    activeCash: number;     // Cash - (Proportional Passive)
    activeInvested: number; // CostBasis - (Proportional Passive)
}

export function NetWorthChart() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { 
        history: costBasisHistory, 
        totalNetWorth: currentNetWorth, 
        displayCurrency,
        positions, // Need positions for live cost basis
        totalCashValue, // Live Cash
        totalMarketValue // Live Market Value
    } = usePortfolio();

    // State for time range filtering
    const [timeRange, setTimeRange] = useState<TimeRange>('YTD');
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    
    // 2. Data Source: Trust the "Time Machine" (Reconstructed History) explicitly.
    const mergedData = useMemo(() => {
        if (!costBasisHistory || costBasisHistory.length === 0) return [];

        const mergedArray: ValuationPoint[] = costBasisHistory.map(historyItem => {
            const currentCostBasis = historyItem.invested; 
            const investedMktVal = historyItem.marketValue || historyItem.invested; 
            const cashVal = historyItem.cash;

            // NEW LOGIC: SINGLE STACK "PRINCIPAL EROSION" MODEL
            // Layer 1: Cash
            // Layer 2: Investment Base (The "Solid" part = Min(Market, Cost))
            // Layer 3: Profit (Green = Market - Cost, if Market > Cost)
            // Layer 4: Loss (Red = Cost - Market, if Cost > Market)
            
            // Result:
            // Profit Case: Cash + Cost + Profit = Total Market Value
            // Loss Case: Cash + Market + Loss = Total Cost Basis (Red "fills" the hole)

            const investedBase = Math.min(investedMktVal, currentCostBasis);
            const investedProfit = Math.max(0, investedMktVal - currentCostBasis);
            const investedLoss = Math.max(0, currentCostBasis - investedMktVal);
            
            // 🌟 PASSIVE CALCULATION (Proportional Split)
            const passiveVal = historyItem.passiveSourceValue || 0;
            const realizedTotal = cashVal + currentCostBasis; // The "Hard" value available
            
            // Calculate Net Active Principal (The money the user actually put in)
            // If passive gains > total value (rare, highly profitable trading), clamp principal to 0.
            const netActivePrincipal = Math.max(0, realizedTotal - passiveVal);
            
            // Ratio to split the Active Principal back into Cash vs Invested buckets
            // If realizedTotal is 0, avoid NaN
            const activeRatio = realizedTotal > 0 ? (netActivePrincipal / realizedTotal) : 0;
            
            const activeCash = cashVal * activeRatio;
            const activeInvested = currentCostBasis * activeRatio;

            return {
                date: historyItem.date,
                timestamp: parseISO(historyItem.date).getTime(),
                cash: cashVal,
                invested: investedMktVal,
                costBasis: currentCostBasis,
                total: cashVal + investedMktVal,
                principal: cashVal + currentCostBasis,
                investedBase,
                investedProfit,
                investedLoss,
                profitOutline: investedProfit > 0 ? (cashVal + investedMktVal) : undefined,
                
                passiveSourceValue: passiveVal,
                activeCash,
                activeInvested
            };
        });

        // Sort by timestamp
        const sorted = mergedArray.sort((a, b) => a.timestamp - b.timestamp);

        // 3. INJECT LIVE DATA FROM CONTEXT
        const today = new Date();
        const todayStr = format(today, 'yyyy-MM-dd');
        
        const liveTotal = currentNetWorth; 
        const lastPoint = sorted[sorted.length - 1];
        const isTodayAlreadyIn = lastPoint && lastPoint.date === todayStr;

        if (sorted.length > 0 && liveTotal !== 0) {
            
            // Re-calculate for today's live point using REAL-TIME data from context (Positions)
            // This ensures alignment with Position Table's P/L
            const liveCash = totalCashValue;
            
            // Calculate live Cost Basis from positions (same logic as PositionsTable)
            const liveCost = positions.reduce((acc, pos) => {
                if (pos.isCash) return acc;
                return acc + (Math.abs(pos.quantity) * pos.averageCost * pos.fxRate);
            }, 0);

            // Live Invested = Market Value of holdings (excluding cash)
            const liveInvested = totalMarketValue; 
            
            // Re-sum total to match exactly cash + invested
            // (Note: currentNetWorth usually equals this, but safe to sum explicitly)
            const safeTotal = liveCash + liveInvested;

            const liveBase = Math.min(liveInvested, liveCost);
            const liveProfit = Math.max(0, liveInvested - liveCost);
            const liveLoss = Math.max(0, liveCost - liveInvested);
            
            // 🌟 PASSIVE CALCULATION FOR TODAY
            // We use the LAST KNOWN passive value from history
            const lastPassive = lastPoint ? lastPoint.passiveSourceValue : 0; 
            const realizedTotalLive = liveCash + liveCost;
            
            const netActivePrincipalLive = Math.max(0, realizedTotalLive - lastPassive);
            const activeRatioLive = realizedTotalLive > 0 ? (netActivePrincipalLive / realizedTotalLive) : 0;
            
            const activeCashLive = liveCash * activeRatioLive;
            const activeInvestedLive = liveCost * activeRatioLive;

            const newPoint: ValuationPoint = {
                date: todayStr,
                timestamp: today.getTime(),
                cash: liveCash,
                invested: liveInvested,
                costBasis: liveCost, 
                total: safeTotal,
                principal: liveCash + liveCost,
                investedBase: liveBase,
                investedProfit: liveProfit,
                investedLoss: liveLoss,
                profitOutline: liveProfit > 0 ? safeTotal : undefined,
                
                passiveSourceValue: lastPassive,
                activeCash: activeCashLive,
                activeInvested: activeInvestedLive
            };

            if (!isTodayAlreadyIn) {
                sorted.push(newPoint);
            } else {
                // Update in place
                Object.assign(lastPoint, newPoint);
            }
        }

        return sorted;
    }, [costBasisHistory, currentNetWorth]);

    // 3. Filter Data based on Range
    const filteredData = useMemo(() => {
        if (mergedData.length === 0) return [];
        
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

        const filtered = mergedData.filter(item => {
            const itemDate = new Date(item.timestamp);
            if (timeRange === 'CUSTOM' && customDateRange?.to) {
                return isAfter(itemDate, cutoffDate) && itemDate <= customDateRange.to;
            }
            return isAfter(itemDate, cutoffDate) || itemDate.getTime() === cutoffDate.getTime();
        });

        // Downsample for performance if needed
        const maxPoints = 120;
        if (filtered.length > maxPoints) {
            const step = Math.ceil(filtered.length / maxPoints);
            return filtered.filter((_, i) => i % step === 0);
        }
        return filtered;
    }, [mergedData, timeRange, customDateRange]);

    // 4. Calculate PnL / Returns for Display
    const { returnAmt, returnPct, isPositive, currentInvestedPnL, currentInvestedPnLPct } = useMemo(() => {
        if (filteredData.length < 2) return { returnAmt: 0, returnPct: 0, isPositive: true, currentInvestedPnL: 0, currentInvestedPnLPct: 0 };
        
        const start = filteredData[0];
        const end = filteredData[filteredData.length - 1];
        
        const change = end.total - start.total;
        // Prevent division by zero
        const pct = start.total !== 0 ? (change / Math.abs(start.total)) * 100 : 0;

        // Current Invested PnL (for Badge)
        const invPnL = end.invested - end.costBasis;
        const invPnLPct = end.costBasis !== 0 ? (invPnL / end.costBasis) * 100 : 0;
        
        return { 
            returnAmt: change, 
            returnPct: pct, 
            isPositive: change >= 0,
            currentInvestedPnL: invPnL,
            currentInvestedPnLPct: invPnLPct
        };
    }, [filteredData]);

    // 🔧 Calculate correct Y-Axis domain to show both Area (Net Worth) and Line (Principal)
    const yAxisDomain = useMemo(() => {
        if (!filteredData.length) return ['auto', 'auto'] as [number | 'auto', 'auto'];
        
        let min = Infinity;
        let max = -Infinity;

        filteredData.forEach(d => {
            const netWorth = d.total;
            const principal = d.principal || 0;
            
            // Find global min/max across both datasets
            min = Math.min(min, netWorth, principal);
            max = Math.max(max, netWorth, principal);
        });

        // Add 5% padding to top/bottom
        // Ensure min doesn't go below 0 unless data is actually negative
        const minPadding = min < 0 ? min * 1.05 : min * 0.95; 
        const maxPadding = max * 1.05;
        
        // Return computed domain to force chart to "zoom out" enough
        // Using 'dataMin'/'dataMax' sometimes fails in stacked charts
        return [min >= 0 ? 0 : 'auto', 'auto'] as [number | 'auto', 'auto']; 
    }, [filteredData]);

    // Formatters
    const formatXAxis = (dateStr: string) => format(parseISO(dateStr), 'MMM dd');
    const formatYAxis = (val: number) => {
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
        return `$${val}`;
    };

    const handleRangeSelect = (range: TimeRange) => {
        setTimeRange(range);
        if (range === 'CUSTOM') setIsCalendarOpen(true);
    };

    const TrendIcon = isPositive ? TrendingUp : TrendingDown;
    const trendColor = isPositive ? 'emerald' : 'rose';

    if (!filteredData.length) {
        return <Skeleton className="h-full w-full rounded-xl bg-zinc-900/50" />;
    }

    return (
        <AuraCard variant="indigo" className="h-full flex flex-col overflow-visible">
            {/* --- HEADER --- */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-white/5 relative z-20">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" /> Total Valuation
                    </h3>
                    <div className="flex items-baseline gap-3">
                        <div className="text-3xl font-bold text-white tracking-tight tabular-nums">
                            {/* Use Time Machine's calculated total (Cash + Assets) as source of truth */}
                            {formatCurrency(filteredData.length > 0 ? filteredData[filteredData.length - 1].total : 0, displayCurrency)}
                        </div>
                        <div className={`flex items-center text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(returnAmt, displayCurrency, { maximumFractionDigits: 0 })}
                            <span className="ml-1 opacity-70">
                                ({isPositive ? '+' : ''}{returnPct.toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Time Range Selector */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs font-medium border-white/10 bg-white/5 hover:bg-white/10">
                            {RANGE_LABELS[timeRange]} <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10">
                        {(['1M', '3M', '6M', 'YTD', 'ALL'] as TimeRange[]).map(r => (
                            <DropdownMenuItem 
                                key={r} 
                                onClick={() => handleRangeSelect(r)}
                                className={timeRange === r ? 'text-violet-400 font-medium' : ''}
                            >
                                {RANGE_LABELS[r]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* --- CHART --- */}
            <div className="flex-1 w-full min-h-0 relative -mt-4">
                {filteredData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={filteredData}
                            margin={{ top: 20, right: 10, left: 10, bottom: 0 }}
                        >
                            <defs>
                                {/* Layer 1: Cash Gradient (Slate - Professional) */}
                                <linearGradient id="fillCash" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.5} /> 
                                    <stop offset="95%" stopColor="#64748b" stopOpacity={0.1} />
                                </linearGradient>
                                {/* Layer 2: Cost Basis Gradient (Violet/Purple) */}
                                <linearGradient id="fillCostBasis" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.15} />
                                </linearGradient>
                                {/* Layer 3a: Profit Gradient (Emerald Green) */}
                                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                                </linearGradient>
                                {/* Layer 3b: Loss Pattern (Hatched Red) */}
                                <pattern id="patternLoss" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
                                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="2" strokeOpacity={0.5} />
                                </pattern>
                                {/* Layer 2: Passive Gradient (Gold) */}
                                <linearGradient id="fillPassive" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} /> 
                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.2} />
                                </linearGradient>
                            </defs>
                            
                            <CartesianGrid 
                                vertical={false} 
                                stroke="rgba(255,255,255,0.05)" 
                                strokeDasharray="3 3" 
                            />
                            
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={formatXAxis}
                                stroke="rgba(255,255,255,0.2)"
                                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={40}
                            />
                            
                            <YAxis 
                                domain={yAxisDomain} 
                                tickFormatter={formatYAxis}
                                stroke="rgba(255,255,255,0.2)"
                                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                width={45}
                            />

                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const pt = payload[0].payload as ValuationPoint;
                                        // PnL Calculation: (Invested Market Value) - (Cost Basis)
                                        const investedPnL = pt.invested - pt.costBasis;
                                        const isProfit = investedPnL >= 0;

                                        return (
                                            <div className="bg-zinc-950/95 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl text-xs min-w-[180px]">
                                                <div className="text-zinc-400 mb-2 font-medium">{formatXAxis(label)}</div>
                                                
                                                {/* Total */}
                                                <div className="flex justify-between items-end mb-3 pb-2 border-b border-white/5">
                                                    <span className="text-zinc-300">Net Worth</span>
                                                    <span className="text-base font-bold text-white">{formatCurrency(pt.total, displayCurrency)}</span>
                                                </div>

                                                {/* Breakdown */}
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between">
                                                        <span className="flex items-center gap-1.5 text-violet-300"><div className="w-1.5 h-1.5 rounded-full bg-violet-500"/> Invested</span>
                                                        <span className="font-mono text-white">{formatCurrency(pt.invested, displayCurrency)}</span>
                                                    </div>
                                                    <div className="flex justify-between pl-3 text-[10px] text-zinc-500">
                                                        <span>Principal (Cost Basis)</span>
                                                        <span className="font-mono">{formatCurrency(pt.costBasis, displayCurrency)}</span>
                                                    </div>
                                                    <div className="flex justify-between pl-3 text-[10px]">
                                                        <span>Unrealized P&L</span>
                                                        <span className={`font-mono font-medium ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {/* Explicitly show negative sign for loss */}
                                                            {formatCurrency(investedPnL, displayCurrency)}
                                                        </span>
                                                    </div>

                                                    <div className="flex justify-between pt-1 border-t border-white/5 mt-1">
                                                        <span className="flex items-center gap-1.5 text-amber-300"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"/> Passive</span>
                                                        <span className="font-mono text-white">{formatCurrency(pt.passive, displayCurrency)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />

                            {/* LAYER 1: Active Cash (Bottom - Slate) */}
                            <Area
                                type="monotone"
                                dataKey="activeCash"
                                stackId="wealth"
                                stroke="#64748b"
                                strokeWidth={1}
                                fill="url(#fillCash)"
                                fillOpacity={1}
                                animationDuration={800}
                                name="Cash (Principal)"
                            />

                            {/* LAYER 2: Passive Wealth (Gold - Stacks on Cash) */}
                            <Area
                                type="monotone"
                                dataKey="passiveSourceValue"
                                stackId="wealth"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                fill="url(#fillPassive)"
                                fillOpacity={1}
                                animationDuration={800}
                                name="Passive Wealth"
                            />
                            
                            {/* LAYER 3: Active Invested (Violet - Stacks on Passive) */}
                            <Area
                                type="monotone"
                                dataKey="activeInvested"
                                stackId="wealth"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                fill="url(#fillCostBasis)"
                                fillOpacity={1}
                                animationDuration={800}
                                name="Invested (Principal)"
                            />

                            {/* LAYER 3a: Profit (Emerald - Stacks on Base) */}
                            <Area
                                type="monotone"
                                dataKey="investedProfit"
                                stackId="wealth"
                                stroke="none"
                                strokeWidth={0}
                                fill="url(#fillProfit)"
                                fillOpacity={1}
                                animationDuration={1000}
                                name="Unrealized Profit"
                            />

                            {/* Profit Outline (Only visible when profit > 0) */}
                            <Line
                                type="monotone"
                                dataKey="profitOutline"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={false}
                                activeDot={false}
                                animationDuration={1000}
                                name="Profit Outline"
                                connectNulls={false} // Don't bridge gaps across zero-profit days
                            />

                            {/* LAYER 3b: Loss (Red Pattern - Stacks on Base to restore Principal height) */}
                            <Area
                                type="monotone"
                                dataKey="investedLoss"
                                stackId="wealth"
                                stroke="none" 
                                strokeWidth={0} // No stroke contour
                                fill="url(#patternLoss)" // Hatched fill
                                fillOpacity={1}
                                animationDuration={1000}
                                name="Unrealized Loss"
                            />

                            {/* Reference: Book Value Line */}
                            {/* This is the Bold Purple Line requested by user */}
                            <Line
                                type="monotone"
                                dataKey="principal"
                                stroke="#8b5cf6"
                                strokeWidth={2.5}
                                strokeDasharray="0" // Solid line as requested ("bold purple line")
                                dot={false}
                                name="Book Value"
                                animationDuration={1000}
                                style={{ opacity: 0.8 }}
                            />

                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-xs tracking-widest uppercase">
                        No History Data
                    </div>
                )}
            </div>

            {/* --- LEGEND (Footer) --- */}
            <div className="flex items-center justify-center gap-6 pb-5 px-6 pt-2 border-t border-white/5 bg-zinc-900/20">
                {/* Cash Metric */}
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-[10px] mobile:text-xs font-bold uppercase tracking-wider text-slate-400">Cash</span>
                    </div>
                     {filteredData.length > 0 && (
                        <div className="text-sm font-bold text-white tabular-nums">
                            {formatCurrency(filteredData[filteredData.length-1].cash, displayCurrency)}
                        </div>
                    )}
                </div>

                {/* Passive Metric */}
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b]" />
                        <span className="text-[10px] mobile:text-xs font-bold uppercase tracking-wider text-amber-300">Passive</span>
                    </div>
                     {filteredData.length > 0 && (
                        <div className="text-sm font-bold text-white tabular-nums">
                            {formatCurrency(filteredData[filteredData.length-1].passiveSourceValue, displayCurrency)}
                        </div>
                    )}
                </div>

                {/* Invested Metric (Active Input) */}
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6]" />
                        <span className="text-[10px] mobile:text-xs font-bold uppercase tracking-wider text-violet-300">Invested</span>
                    </div>
                    {filteredData.length > 0 && (
                        <div className="text-sm font-bold text-white tabular-nums">
                            {/* Display Full Cost Basis in text for clarity, even if chart shows split */}
                            {formatCurrency(filteredData[filteredData.length-1].costBasis, displayCurrency)}
                        </div>
                    )}
                </div>

                {/* Unrealized P/L Metric */}
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className={`w-2 h-2 rounded-full ${currentInvestedPnL >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="text-[10px] mobile:text-xs font-bold uppercase tracking-wider text-zinc-400">Gains</span>
                    </div>
                    {filteredData.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold tabular-nums ${currentInvestedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {currentInvestedPnL >= 0 ? '+' : ''}{formatCurrency(currentInvestedPnL, displayCurrency)}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </AuraCard>
    );
}
