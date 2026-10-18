'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Button } from '@/components/ui/button';
import { subMonths, startOfYear, isAfter, parseISO } from 'date-fns';

type TimeRange = '1M' | '6M' | 'YTD' | 'ALL';

export function PerformanceChart() {
    const { getPerformanceTrend, isLoading } = usePortfolio();
    const [range, setRange] = useState<TimeRange>('ALL');

    const rawTrendData = useMemo(() => {
        return getPerformanceTrend ? getPerformanceTrend() : [];
    }, [getPerformanceTrend]);

    const filteredData = useMemo(() => {
        if (!rawTrendData.length) return [];

        const now = new Date();
        let cutoff: Date | null = null;

        if (range === '1M') cutoff = subMonths(now, 1);
        else if (range === '6M') cutoff = subMonths(now, 6);
        else if (range === 'YTD') cutoff = startOfYear(now);

        if (!cutoff) return rawTrendData;

        return rawTrendData.filter(d => isAfter(parseISO(d.date), cutoff!));
    }, [rawTrendData, range]);

    if (isLoading) {
        return <Skeleton className="h-[400px] w-full shadow-lg rounded-xl" />;
    }

    return (
        <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-md overflow-hidden col-span-1 lg:col-span-7">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6">
                <div>
                    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        Performance Trend
                    </CardTitle>
                    <CardDescription>
                        Cumulative Net Worth and Portfolio Profitability
                    </CardDescription>
                </div>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                    {(['1M', '6M', 'YTD', 'ALL'] as TimeRange[]).map((r) => (
                        <Button
                            key={r}
                            variant={range === r ? 'secondary' : 'ghost'}
                            size="sm"
                            className={`h-7 px-3 text-[10px] font-bold transition-all ${range === r ? 'shadow-sm' : 'text-muted-foreground'}`}
                            onClick={() => setRange(r)}
                        >
                            {r}
                        </Button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {filteredData.length > 0 ? (
                    <div className="h-[350px] w-full pr-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                    dy={10}
                                    minTickGap={30}
                                />
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#22c55e', fontSize: 10 }}
                                    tickFormatter={(val) => `$${val.toLocaleString()}`}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-background/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl space-y-2">
                                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center justify-between gap-8">
                                                            <span className="text-xs text-muted-foreground">Net Worth</span>
                                                            <span className="text-sm font-mono font-bold">${(payload?.[0]?.value ?? 0).toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-8">
                                                            <span className="text-xs text-muted-foreground">Cumulative P/L</span>
                                                            <span className={`text-sm font-mono font-bold ${Number(payload?.[1]?.value) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {Number(payload?.[1]?.value) >= 0 ? '+' : ''}${(payload?.[1]?.value ?? 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <ReferenceLine y={0} yAxisId="right" stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                                <Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="netWorth"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorNetWorth)"
                                    animationDuration={1500}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="profit"
                                    stroke="#22c55e"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6, stroke: '#22c55e', strokeWidth: 2, fill: '#fff' }}
                                    animationDuration={1500}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[350px] items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                        <p className="text-muted-foreground text-sm font-medium">No performance data found for the selected range.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
