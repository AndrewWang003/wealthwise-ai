'use client';

import { ArrowUpCircle, ArrowDownCircle, Wallet, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface CashFlowSummaryProps {
  income: number;
  expense: number;
  currencyCode?: string; // Changed from currencySymbol to currencyCode for Intl format
  className?: string;
}

export function CashFlowSummary({ 
  income, 
  expense, 
  currencyCode = 'AUD',
  className 
}: CashFlowSummaryProps) {
  
  // Debug: Verify props are received
  console.log('[CashFlowSummary] Received props:', {
    income,
    expense,
    currencyCode,
    netFlow: income - expense
  });
  
  // Calculate Net Flow
  const netFlow = income - expense;
  const isPositive = netFlow >= 0;
  
  // Progress Bar Logic
  // If no income, but expenses exist -> infinite burn (handling div by zero)
  // If income exists -> % of income
  const burnPercentage = useMemo(() => {
    if (income === 0) return expense > 0 ? 100 : 0;
    return Math.min((expense / income) * 100, 100);
  }, [income, expense]);

  const remainedPercentage = 100 - burnPercentage;

  const isOverBudget = expense > income;

  // Format helper
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode, // Dynamic Currency
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(val)); // Show ABS value, signs are handled by UI
  };

  return (
    <Card className={cn(
      "overflow-hidden w-full h-full relative border-0 shadow-lg",
      // Glass effect background
      "bg-zinc-950/40 backdrop-blur-xl border-white/5",
      className
    )}>
      {/* Glow Effect behind Net Flow */}
      <div className={cn(
        "absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-full opacity-10 blur-3xl pointer-events-none rounded-full",
        isPositive ? "bg-emerald-500" : "bg-rose-500"
      )} />

      <CardContent className="p-6 relative z-10 h-full flex flex-col justify-between gap-4">
        
        {/* TOP ROW: Key Metrics */}
        <div className="flex items-center justify-between">
          
          {/* INCOME (Left) */}
          <div className="flex flex-col items-start gap-1">
             <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                Income
             </div>
             <div className="text-2xl font-bold text-emerald-500 tabular-nums tracking-tight">
                +{formatMoney(income)}
             </div>
          </div>

          {/* NET FLOW (Center - Prominent) */}
          <div className="flex flex-col items-center">
             <div className="flex items-center gap-1.5 mb-1 opacity-70">
                <Wallet className="w-4 h-4 text-white/50" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-white/50">Net Flow</span>
             </div>
             <div className={cn(
                "text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tighter drop-shadow-2xl transition-colors duration-500",
                isPositive ? "text-white" : "text-rose-400"
             )}>
                {isPositive ? '+' : '-'}{formatMoney(netFlow)}
             </div>
             {isOverBudget && (
                <div className="flex items-center gap-1 text-rose-500 text-xs font-bold mt-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Over Budget</span>
                </div>
             )}
          </div>

          {/* EXPENSE (Right) */}
          <div className="flex flex-col items-end gap-1">
             <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400/80">
                Expense
                <ArrowDownCircle className="w-3.5 h-3.5" />
             </div>
             <div className="text-2xl font-bold text-rose-500 tabular-nums tracking-tight">
                -{formatMoney(expense)}
             </div>
          </div>
        </div>

        {/* BOTTOM ROW: The 'Flow Bar' */}
        <div className="relative pt-2">
            {/* Bar Container */}
            <div 
                style={{ opacity: 0.618 }}
                className={cn(
                "h-6 w-full rounded-full overflow-hidden relative transition-all duration-500",
                // SOLID METALLIC Style with EXACT TAILWIND COLORS
                // Bronze Border
                "border-[3px] border-amber-700/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]",
                // Gold Track - EXACT amber-500 (#F59E0B)
                "bg-[#F59E0B]",
                isOverBudget && "border-rose-900 shadow-[0_0_15px_rgba(225,29,72,0.5)]"
            )}>
                {/* Metallic Texture overlay (Static) */}
                <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.1),rgba(0,0,0,0.1)_2px,transparent_2px,transparent_4px)]" />

                {/* METALLIC SHIMMER EFFECT */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2.5s_infinite]" />

                {/* SHATTERED GLASS EFFECT OVERLAY (Only visible when over budget) */}
                {isOverBudget && (
                    <div className="absolute inset-0 z-20 pointer-events-none opacity-80 mix-blend-hard-light">
                        <svg width="100%" height="100%" preserveAspectRatio="none">
                            <defs>
                                <filter id="crack-noise">
                                    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
                                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
                                </filter>
                            </defs>
                            {/* Jagged Cracks - Thicker strokes for impact */}
                            <path d="M0,0 L30,50 L10,80 L50,40 L80,90 L100,10" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke"/>
                            <path d="M20,100 L40,60 L70,80 L60,20 L90,50" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke"/>
                        </svg>
                        <div className="absolute inset-0 bg-rose-900/40" />
                    </div>
                )}

                {/* Burn Progress Bar - Right Aligned (Consuming from Right to Left) */}
                <div 
                   className={cn(
                     "absolute right-0 top-0 h-full transition-all duration-1000 ease-out border-l border-rose-900/30",
                     isOverBudget 
                        ? "bg-rose-700" 
                        // EXACT rose-500 (#F43F5E)
                        : "bg-[#F43F5E] shadow-[-2px_0_5px_rgba(0,0,0,0.2)]"
                   )}
                   style={{ 
                       width: `${burnPercentage}%`,
                       // Sharp edge - NO MASK
                   }}
                >
                   {/* Static metallic sheen on Red bar */}
                   <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-50" />
                </div>
            </div>
            
            {/* Bottom Labels: X% Remained (left) | X% Burned (right) */}
            <div className="flex justify-between mt-2 text-[10px] items-center px-1">
                 {/* Left: Remained */}
                 <span className={cn(
                     "font-bold",
                     isPositive ? "text-emerald-500" : "text-rose-400"
                 )}>
                     {remainedPercentage.toFixed(0)}% Remained
                 </span>
                 
                 {/* Right: Burned */}
                 <span className={cn(
                     "font-bold",
                     isOverBudget ? "text-rose-400 animate-pulse" : "text-rose-500/80"
                 )}>
                     {burnPercentage.toFixed(0)}% Burned
                 </span>
            </div>
        </div>

      </CardContent>
    </Card>
  );
}
