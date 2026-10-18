'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react'; 
import { AuraCard } from '@/components/ui/AuraCard';
import { DashboardWidget } from './DashboardWidget';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils/format';

export function AssetAllocationWidget() {
  const { positions, isLoading, displayCurrency } = usePortfolio();

  const chartData = useMemo(() => {
    if (isLoading || !positions.length) return [];

    let positiveCash = 0;
    let negativeCash = 0; // Track margin/debt separately
    const investments: { symbol: string; value: number }[] = [];

    // 1. Segregate Data: Extract Cash separately from Investments
    positions.forEach(pos => {
      if (Math.abs(pos.marketValueDisplay) < 0.01) return; // Ignore dust

      if (pos.isCash || pos.symbol.includes('USD') || pos.symbol.includes('AUD')) {
        // Track positive and negative cash separately
        if (pos.marketValueDisplay > 0) {
          positiveCash += pos.marketValueDisplay;
        } else {
          negativeCash += pos.marketValueDisplay; // This will be negative
        }
      } else {
        // All non-cash holdings (Stocks, Crypto, etc.)
        investments.push({
          symbol: pos.symbol,
          value: pos.marketValueDisplay
        });
      }
    });

    // Calculate Grand Total for DISPLAY (includes negative cash as debt)
    const investmentsTotal = investments.reduce((sum, h) => sum + h.value, 0);
    const netCash = positiveCash + negativeCash; // Net cash position
    const grandTotal = investmentsTotal + netCash; // TRUE net worth
    
    // For PIE CHART percentages, we use only positive values
    const pieTotal = investmentsTotal + positiveCash;
    
    if (pieTotal <= 0) return []; // No positive assets to display in pie

    // 2. Sort investments and extract Top 3
    investments.sort((a, b) => b.value - a.value);
    const top3 = investments.slice(0, 3);
    
    // 3. Calculate Others (Investments only, excluding Cash)
    const top3Sum = top3.reduce((sum, h) => sum + h.value, 0);
    const remainingInvestments = investments.slice(3);
    const othersValue = remainingInvestments.reduce((sum, h) => sum + h.value, 0);

    const result: { name: string; value: number; color: string; type: string }[] = [];

    // 4. Color Assignment for Top 3 (Neon Palette)
    const HOLDING_COLORS = [
      '#a855f7', // Purple 500 (Neon)
      '#06b6d4', // Cyan 500
      '#f472b6', // Pink 400
    ];

    // Add Top 3 investments
    top3.forEach((h, index) => {
      result.push({
        name: h.symbol,
        value: h.value,
        color: HOLDING_COLORS[index],
        type: 'holding'
      });
    });

    // 5. Add Others (Investments only, always 4th position)
    if (othersValue > 1) {
      result.push({ 
        name: 'Others', 
        value: othersValue, 
        color: '#6b7280', 
        type: 'other' 
      });
    }

    // 6. Add Positive Cash only (for pie chart - negative cash can't be rendered)
    if (positiveCash > 1) {
      result.push({ 
        name: 'Cash', 
        value: positiveCash, 
        color: '#10b981', 
        type: 'cash' 
      });
    }

    // Final result: Top 3 + Others + Cash (percentages calculated against pieTotal)
    return result;

  }, [positions, isLoading]);

  // Calculate TRUE total (includes negative cash/margin)
  const { totalValue, hasMargin, marginAmount } = useMemo(() => {
    if (isLoading || !positions.length) return { totalValue: 0, hasMargin: false, marginAmount: 0 };
    
    let total = 0;
    let marginDebt = 0;
    
    positions.forEach(pos => {
      if (Math.abs(pos.marketValueDisplay) < 0.01) return;
      total += pos.marketValueDisplay; // Real sum including negatives
      
      if ((pos.isCash || pos.symbol.includes('USD') || pos.symbol.includes('AUD')) && pos.marketValueDisplay < 0) {
        marginDebt += pos.marketValueDisplay;
      }
    });
    
    return { 
      totalValue: total, 
      hasMargin: marginDebt < 0, 
      marginAmount: marginDebt 
    };
  }, [positions, isLoading]);

  // For pie chart display, only use positive values
  const pieChartData = chartData.filter(item => item.value > 0);
  const pieTotal = pieChartData.reduce((sum, item) => sum + item.value, 0);

  if (isLoading) {
    return (
      <DashboardWidget title="Asset Allocation" className="h-[300px]">
        <div className="flex items-center justify-center h-full">
           <Skeleton className="h-[200px] w-[200px] rounded-full" />
        </div>
      </DashboardWidget>
    );
  }

  // Handle empty state
  if (totalValue === 0) {
      return (
        <DashboardWidget title="Asset Allocation" className="h-[300px]">
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                <p>No assets found</p>
            </div>
        </DashboardWidget>
      );
  }

  return (
      <AuraCard variant="blue" className="h-full">
        {/* Header (Moved from page.tsx) */}
         <div className="flex items-center justify-between px-5 pt-5 mb-2 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" /> Asset Ring
            </h3>
        </div>

        <div className="flex flex-row items-center h-full w-full gap-6 px-5 pb-5">
        
        {/* Left: Donut Chart */}
        <div className="relative h-full aspect-square flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70} // Thin ring
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={5}
                >
                {pieChartData.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        stroke="none"
                        strokeWidth={0}
                        className="hover:opacity-80 transition-all duration-300 hover:scale-105 origin-center"
                        style={{ filter: `drop-shadow(0 0 8px ${entry.color}40)` }}
                    />
                ))}
                </Pie>
                <Tooltip 
                    formatter={(val: number) => formatCurrency(val, displayCurrency)}
                    wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
                    contentStyle={{
                        backgroundColor: '#09090b', // Zinc 950
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '0.75rem',
                        color: '#F3F4F6',
                        boxShadow: '0 0 20px rgba(139,92,246,0.15)'
                    }}
                    itemStyle={{ color: '#E5E7EB', fontWeight: 500 }}
                />
            </PieChart>
            </ResponsiveContainer>
            
            {/* Center Total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[9px] uppercase text-muted-foreground/60 font-bold tracking-[0.2em] mb-1">Total</span>
                <span className="text-lg font-bold text-white tracking-tight">
                    {formatCurrency(totalValue, displayCurrency, { maximumFractionDigits: 0 })}
                </span>
            </div>
        </div>

        {/* Right: Legend List - Vertically Centered */}
        <div className="flex-1 flex flex-col justify-center overflow-hidden max-h-full pr-2 space-y-2">
             {/* Neon Palette Overrides in HOLDING_COLORS defined above, ensuring match visually */}
             {pieChartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between group text-sm py-1">
                        <div className="flex items-center gap-3 min-w-0">
                        <div 
                            className="w-1.5 h-6 rounded-full flex-shrink-0 bg-[color:var(--item-c)] shadow-[0_0_10px_var(--item-c)]" 
                            style={{ '--item-c': item.color } as React.CSSProperties} 
                        />
                        <span className="font-semibold text-white/90 group-hover:text-cyan-400 transition-colors truncate">
                            {item.name}
                        </span>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 tabular-nums">
                        <span className="font-mono text-white/80">
                            {pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : 0}%
                        </span>
                    </div>
                </div>
            ))}
        </div>

      </div>
      </AuraCard>
  );
}
