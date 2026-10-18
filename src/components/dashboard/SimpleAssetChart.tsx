'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SimpleAssetChartProps {
  assetsValue: number;
  cashValue: number;
}

export function SimpleAssetChart({ assetsValue, cashValue }: SimpleAssetChartProps) {
  const data = [
    { name: 'Investments', value: assetsValue, color: 'hsl(var(--chart-1))' }, // Primary Color
    { name: 'Cash & Lifestyle', value: cashValue, color: '#22c55e' }, // Green for Cash
  ];

  const total = assetsValue + cashValue;
  if (total === 0) return null;

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardHeader className="pb-0">
        <CardTitle className="text-lg font-medium text-center">Asset Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="h-[200px] w-full max-w-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                contentStyle={{ borderRadius: '8px', border: 'none', background: 'rgba(0,0,0,0.8)', color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Custom Legend */}
        <div className="flex gap-8 mt-4">
          {data.map((item) => (
            <div key={item.name} className="flex flex-col items-center">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[color:var(--item-color)]" style={{ '--item-color': item.color } as React.CSSProperties} />
                <span className="text-xs text-muted-foreground">{item.name}</span>
              </div>
              <span className="text-sm font-bold">
                {((item.value / total) * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                ${item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
