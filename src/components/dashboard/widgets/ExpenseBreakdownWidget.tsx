'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { AuraCard } from '@/components/ui/AuraCard';
import { DashboardWidget } from './DashboardWidget';
import { formatCurrency } from '@/lib/utils/format';
import { getCategoryEmoji } from '@/lib/utils/category-emoji';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { format } from 'date-fns';
import { useCategoryStore } from '@/stores/useCategoryStore';

const OTHER_COLOR = '#6b7280'; // Gray for "Others" category

export function ExpenseBreakdownWidget({ transactions }: { transactions: any[] }) {
  const { displayCurrency } = usePortfolio();
  const { getCategoryColor, getCategoryIcon } = useCategoryStore();


  const { chartData, targetDate } = useMemo(() => {
    if (!transactions || transactions.length === 0) return { chartData: [], targetDate: new Date() };

    // 1. Pre-process dates and filter expenses
    const allExpenses = transactions
      .filter(t => {
          const type = t.type || t.transactionType;
          return type?.toUpperCase() === 'EXPENSE';
      })
      .map(t => {
        let date: Date;
        if (t.transactionDate?.toDate) {
          date = t.transactionDate.toDate();
        } else if (t.transactionDate instanceof Date) {
           date = t.transactionDate;
        } else if (typeof t.transactionDate === 'string' || typeof t.transactionDate === 'number') {
          date = new Date(t.transactionDate);
        } else {
          date = new Date(); // Fallback
        }
        return { ...t, parsedDate: date };
      });

    if (allExpenses.length === 0) return { chartData: [], targetDate: new Date() };

    // 2. Find Latest Expense Date (Target Month)
    // Sort descending by date
    allExpenses.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
    
    // Default to strict 'now', but if we have recent expenses, use them.
    // Logic: Use the month of the most recent expense.
    const latestExpense = allExpenses[0];
    const targetDate = latestExpense.parsedDate;

    // 3. Filter for Target Month
    const targetExpenses = allExpenses.filter(t => 
      t.parsedDate.getMonth() === targetDate.getMonth() &&
      t.parsedDate.getFullYear() === targetDate.getFullYear()
    );

    // 4. Group by Category (with Fallbacks)
    const categoryMap = new Map<string, number>();
    targetExpenses.forEach(t => {
      // 🛡️ Hierarchy: Category > Symbol > Description > 'General'
      let cat = t.category?.trim();
      if (!cat && t.symbol) cat = t.symbol.trim();
      if (!cat && t.description) cat = t.description.trim();
      if (!cat) cat = 'General';

      // 💰 Robust Amount Calculation: amount OR (quantity * price)
      let val = 0;
      if (t.amount !== undefined && t.amount !== null) {
          val = Number(t.amount);
      } else if (t.quantity !== undefined && t.price !== undefined) {
          val = Number(t.quantity) * Number(t.price);
      }
      
      const amount = Math.abs(val); 
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + amount);
    });

    // 5. Sort
    const sortedCategories = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 6. Top 4 + Others
    const topCategories = sortedCategories.slice(0, 4);
    const otherCategories = sortedCategories.slice(4);
    const otherValue = otherCategories.reduce((sum, c) => sum + c.value, 0);

    // Use store colors for known categories, with fallback
    const result = topCategories.map((c) => ({
      name: c.name,
      value: c.value,
      color: getCategoryColor(c.name),
      emoji: getCategoryIcon(c.name) || getCategoryEmoji(c.name)
    }));

    if (otherValue > 0) {
      result.push({
        name: 'Others',
        value: otherValue,
        color: OTHER_COLOR,
        emoji: '📦'
      });
    }

    return { chartData: result, targetDate };
  }, [transactions, getCategoryColor, getCategoryIcon]);

  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);
  const title = `Spending in ${format(targetDate, 'MMM yyyy')}`;

  if (totalValue === 0) {
     return (
        <div className="flex h-full items-center justify-center text-muted-foreground opacity-50 flex-col gap-2">
           <span className="text-2xl">💸</span>
           <p className="text-sm">No expenses found</p>
        </div>
     );
  }

  return (
    <AuraCard variant="rose" className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 mb-2 shrink-0">
        <h3 className="text-xs font-bold uppercase tracking-widest text-rose-400 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" /> Spending Allocation
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 items-center flex-1 w-full px-2 pb-2">
        
        {/* Left: Donut Chart */}
        <div className="relative flex justify-center items-center h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={4}
                >
                {chartData.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        stroke="none"
                        strokeWidth={0}
                        className="hover:opacity-80 transition-opacity duration-300"
                    />
                ))}
                </Pie>
                <Tooltip 
                    formatter={(val: number) => formatCurrency(val, displayCurrency)}
                    wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
                    contentStyle={{
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        borderColor: 'rgba(55, 65, 81, 0.5)',
                        borderRadius: '0.75rem',
                        color: '#F3F4F6',
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                    }}
                    itemStyle={{ color: '#E5E7EB', fontWeight: 500 }}
                />
            </PieChart>
            </ResponsiveContainer>
            
            {/* Center Total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Total</span>
                <span className="text-sm font-bold text-white shadow-neon">
                    {formatCurrency(totalValue, displayCurrency, { maximumFractionDigits: 0 })}
                </span>
            </div>
        </div>

        {/* Right: Legend List */}
        <div className="flex flex-col gap-3 justify-center h-full overflow-y-auto pr-1 custom-scrollbar">
            {chartData.map((item) => (
                <div key={item.name} className="flex items-center justify-between w-full group text-xs sm:text-sm">
                    {/* Category Name Wrapper */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        <div 
                            className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm bg-[color:var(--item-color)]" 
                            style={{ '--item-color': item.color } as React.CSSProperties} 
                        />
                        <span className="font-medium truncate text-white/90 group-hover:text-primary transition-colors block" title={item.name}>
                            {item.emoji} {item.name}
                        </span>
                    </div>
                    
                    {/* Percent Only */}
                    <span className="flex-shrink-0 tabular-nums text-white/70 text-xs font-medium">
                         {Math.round((item.value / totalValue) * 100)}%
                    </span>
                </div>
            ))}
        </div>

      </div>
    </AuraCard>
  );
}
