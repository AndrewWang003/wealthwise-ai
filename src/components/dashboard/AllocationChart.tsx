'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#22c55e', // Green
  '#eab308'  // Yellow
];

export function AllocationChart() {
  const { getAiReadySnapshot, settings, isLoading } = usePortfolio();
  const [view, setView] = useState<'asset' | 'sector'>('asset');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  const rawData = useMemo(() => {
    return getAiReadySnapshot ? getAiReadySnapshot() : [];
  }, [getAiReadySnapshot]);

  const allocationData = useMemo(() => {
    if (!rawData.length) return [];

    // Filter out cash if disabled
    const filtered = settings?.isCashTrackingEnabled
      ? rawData
      : rawData.filter(d => d.c !== 'AUD Cash' && d.c !== 'USD Cash');

    const grouped = filtered.reduce((acc, pos) => {
      const key = view === 'asset' ? (pos.c.includes('Cash') ? 'Cash' : pos.c) : pos.sc;
      // Convert weight string (e.g. "15.20%") back to number for calculation
      const weightNum = parseFloat(pos.w.replace('%', ''));
      acc[key] = (acc[key] || 0) + weightNum;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
      .map(([name, value]) => ({
        name,
        value: Number((value as number).toFixed(2)),
        isHidden: hiddenCategories.has(name)
      }))
      .filter(d => d.value > 0);
  }, [rawData, view, settings?.isCashTrackingEnabled, hiddenCategories]);

  const chartData = useMemo(() => {
    return allocationData.filter(d => !d.isHidden);
  }, [allocationData]);

  const toggleCategory = (category: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <Card className="border-none shadow-xl bg-card/50 backdrop-blur-md overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
        <div className="space-y-1">
          <CardTitle className="text-xl font-bold">Portfolio Allocation</CardTitle>
          <CardDescription>
            {view === 'asset' ? 'By Asset Class' : 'By Industry Sector'}
          </CardDescription>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-[200px]">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="asset">Asset</TabsTrigger>
            <TabsTrigger value="sector">Sector</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {allocationData.length > 0 ? (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}`}
                      fill={COLORS[index % COLORS.length]}
                      className="outline-none stroke-background stroke-2 transition-all duration-300 hover:opacity-80"
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background/90 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-2xl">
                          <p className="font-bold text-sm mb-1">{payload[0].name}</p>
                          <p className="text-primary text-xs font-mono">{payload[0].value}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  content={({ payload }) => (
                    <ul className="flex flex-wrap justify-center gap-4 mt-4 list-none p-0">
                      {allocationData.map((entry, index) => (
                        <li
                          key={`item-${index}`}
                          className={`flex items-center gap-2 cursor-pointer transition-all ${entry.isHidden ? 'opacity-30 grayscale-[0.8]' : 'opacity-100'}`}
                          onClick={() => toggleCategory(entry.name)}
                        >
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="text-xs font-medium text-muted-foreground">{entry.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[300px] items-center justify-center border-2 border-dashed border-white/5 rounded-xl">
            <p className="text-muted-foreground text-sm">No allocation data available.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
