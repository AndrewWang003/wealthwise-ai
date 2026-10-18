'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { toUnits } from '@/lib/currencyMath';

const COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
];

export function ConcentrationChart() {
    const { getAiReadySnapshot, isLoading } = usePortfolio();

    const concentrationData = useMemo(() => {
        if (!getAiReadySnapshot) return [];

        const snapshot = getAiReadySnapshot();

        // Filter out cash positions and get top 5 by weight
        const nonCashPositions = snapshot
            .filter(pos => !pos.c.includes('Cash'))
            .map(pos => ({
                symbol: pos.s,
                weight: parseFloat(pos.w.replace('%', '')),
                averagePrice: pos.p, // Already in units (2 decimal places)
                quantity: pos.q,
                assetClass: pos.c,
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5); // Top 5

        return nonCashPositions;
    }, [getAiReadySnapshot]);

    if (isLoading) {
        return <Skeleton className="h-[400px] w-full" />;
    }

    return (
        <Card className="border-none shadow-xl bg-card/50 backdrop-blur-md overflow-hidden">
            <CardHeader>
                <CardTitle className="text-xl font-bold">Top Holdings</CardTitle>
                <CardDescription>
                    Your 5 largest positions by portfolio weight
                </CardDescription>
            </CardHeader>
            <CardContent>
                {concentrationData.length > 0 ? (
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={concentrationData}
                                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                                layout="vertical"
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    horizontal={false}
                                    stroke="rgba(255,255,255,0.05)"
                                />
                                <XAxis
                                    type="number"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                                    tickFormatter={(val) => `${val.toFixed(1)}%`}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="symbol"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 }}
                                    width={80}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-background/90 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-2xl space-y-2">
                                                    <p className="font-bold text-sm">{data.symbol}</p>
                                                    <div className="space-y-1 text-xs">
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-muted-foreground">Weight:</span>
                                                            <span className="font-mono font-bold text-primary">
                                                                {data.weight.toFixed(2)}%
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-muted-foreground">Avg Price:</span>
                                                            <span className="font-mono font-bold">
                                                                ${data.averagePrice.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-muted-foreground">Quantity:</span>
                                                            <span className="font-mono">
                                                                {data.quantity.toFixed(4)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-muted-foreground">Class:</span>
                                                            <span className="text-xs">{data.assetClass}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar
                                    dataKey="weight"
                                    radius={[0, 8, 8, 0]}
                                    animationDuration={1000}
                                    animationEasing="ease-out"
                                >
                                    {concentrationData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                            className="transition-all duration-300 hover:opacity-80"
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[300px] items-center justify-center border-2 border-dashed border-white/5 rounded-xl">
                        <div className="text-center space-y-2">
                            <p className="text-muted-foreground text-sm font-medium">
                                No holdings data available
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Start by recording your first transaction
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
