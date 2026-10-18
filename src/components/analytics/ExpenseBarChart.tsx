'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Transaction } from '@/lib/types';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { format, subMonths, startOfMonth, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

type TimeRange = '3M' | '6M' | '1Y';

export function ExpenseBarChart({ transactions }: { transactions?: Transaction[] }) {
    const { expensesByMonth, displayCurrency, getExchangeRate } = usePortfolio();
    const [activeRange, setActiveRange] = useState<TimeRange>('6M');

    const chartData = useMemo(() => {
        // Create a Map for quick lookup of existing data
        const expenseMap = new Map<string, number>();
        
        if (transactions && transactions.length > 0) {
             // 🟢 Calculate from Raw Transactions
             transactions.forEach(tx => {
                // 1. Filter: Expense Only
                if (tx.transactionType !== 'expense') return;
                
                // 2. Normalize Date
                let date: Date;
                if (tx.transactionDate && typeof tx.transactionDate === 'object' && 'toDate' in tx.transactionDate) {
                    date = (tx.transactionDate as any).toDate();
                } else if (typeof tx.transactionDate === 'string') {
                    date = parseISO(tx.transactionDate);
                } else {
                    date = new Date();
                }
                
                const monthKey = format(date, 'yyyy-MM');
                
                // 3. Calculate Amount & Convert Currency
                const rawAmount = (tx.quantity || 0) * (tx.price || 1);
                let finalAmount = rawAmount;
                
                if (tx.currency && tx.currency !== displayCurrency) {
                    const rate = getExchangeRate(tx.currency, displayCurrency);
                    if (rate) finalAmount = rawAmount * rate;
                }
                
                expenseMap.set(monthKey, (expenseMap.get(monthKey) || 0) + finalAmount);
             });
        } else if (expensesByMonth && expensesByMonth.length > 0) {
            // 🟡 Fallback to Context Data
            expensesByMonth.forEach(item => {
                expenseMap.set(item.month, item.amount); // item.month is yyyy-MM
            });
        }

        // Determine number of months to show
        let monthCount: number;
        switch (activeRange) {
            case '3M': monthCount = 3; break;
            case '6M': monthCount = 6; break;
            case '1Y': monthCount = 12; break;
            default: monthCount = 6;
        }

        // Generate month sequence (from oldest to newest)
        const now = new Date();
        const months: { monthKey: string; month: string; monthShort: string; amount: number }[] = [];
        
        for (let i = monthCount - 1; i >= 0; i--) {
            const date = startOfMonth(subMonths(now, i));
            const monthKey = format(date, 'yyyy-MM');
            const monthLabel = format(date, 'MMM yyyy');
            const monthShort = format(date, 'MMM');
            
            // Lookup existing data or default to 0
            const amount = expenseMap.get(monthKey) || 0;
            
            months.push({
                monthKey,
                month: monthLabel,
                monthShort,
                amount
            });
        }

        return months;
    }, [expensesByMonth, activeRange, transactions, displayCurrency, getExchangeRate]);

    const formatYAxis = (value: number) => {
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value.toFixed(0)}`;
    };

    return (
        <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-md overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                        Monthly Spending Trend
                    </CardTitle>
                    <CardDescription>
                        Track your monthly expenses over time
                    </CardDescription>
                </div>
                
                {/* Time Range Selector */}
                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
                    {(['3M', '6M', '1Y'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setActiveRange(range)}
                            className={cn(
                                "px-3 py-1 text-xs font-medium rounded-md transition-all duration-200",
                                activeRange === range 
                                    ? "bg-violet-500/20 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.3)]" 
                                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                            )}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={chartData}
                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.9} />
                                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.5} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid 
                                    strokeDasharray="3 3" 
                                    vertical={false} 
                                    stroke="rgba(255,255,255,0.05)" 
                                />
                                <XAxis
                                    dataKey="monthShort"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                    tickFormatter={formatYAxis}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(167, 139, 250, 0.1)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 p-4 rounded-xl shadow-2xl">
                                                    <p className="text-sm font-bold text-white mb-2">
                                                        {data.month}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                                                        <span className="text-xs text-muted-foreground">Total Spent</span>
                                                    </div>
                                                    <div className="text-2xl font-bold text-violet-400 tabular-nums mt-1">
                                                        ${Number(data.amount).toLocaleString(undefined, { 
                                                            minimumFractionDigits: 2, 
                                                            maximumFractionDigits: 2 
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar
                                    dataKey="amount"
                                    fill="url(#colorExpense)"
                                    radius={[4, 4, 0, 0]}
                                    animationDuration={1000}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[300px] items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                        <div className="text-center space-y-2">
                            <p className="text-muted-foreground text-sm font-medium">No expense data yet</p>
                            <p className="text-xs text-muted-foreground/60">
                                Start tracking expenses to see your spending trends
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
