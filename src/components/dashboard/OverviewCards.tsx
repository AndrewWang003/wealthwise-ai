
'use client';

import { useMemo } from 'react';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { useFirestore } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, Shield, AlertCircle } from 'lucide-react';
import type { Holding, CashAccount } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import type { WithId } from '@/firebase';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';


import { usePortfolio } from '@/contexts/PortfolioContext';
import { AnimatePresence, motion } from 'framer-motion';

export function OverviewCards() {
  const { totalNetWorth, getPerformanceTrend, isLoading, positions, displayCurrency, hasConversionErrors, failedCurrencies } = usePortfolio();

  const metrics = useMemo(() => {
    const trend = getPerformanceTrend ? getPerformanceTrend() : [];
    const latest = trend.length > 0 ? trend[trend.length - 1] : { profit: 0 };

    // Average beta calculation (weighted by value)
    const totalValue = positions.reduce((acc, p) => acc + p.marketValueDisplay, 0);
    const avgBeta = totalValue > 0
      ? positions.reduce((acc, p) => acc + (p.beta * p.marketValueDisplay), 0) / totalValue
      : 0;

    // Sum up floating P/L in Display currency
    const totalProfitDisplay = positions.reduce((acc, p) => acc + (p.floatingPL_Display || 0), 0);

    return {
      totalProfit: totalProfitDisplay,
      beta: avgBeta
    };
  }, [getPerformanceTrend, positions]);

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  // 🚨 Generate error message for failed conversions
  const errorMessage = hasConversionErrors && failedCurrencies.size > 0
    ? `由于无法读取部分资产的最新汇率（${Array.from(failedCurrencies).join(', ')}），相关资产未计入总资产。请检查网络或稍后重试。`
    : '';

  return (
    <TooltipProvider>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-md overflow-hidden" style={{ containerType: 'inline-size' }}>
          <CardHeader className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Net Worth ({displayCurrency})
            </CardTitle>
            <div className="p-2 bg-primary/10 rounded-full">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="flex items-center gap-2">
              <motion.div
                key={totalNetWorth}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`font-bold whitespace-nowrap text-[clamp(1.25rem,12cqw,2rem)] ${hasConversionErrors ? 'text-red-500' : ''}`}
              >
                {formatCurrency(totalNetWorth, displayCurrency)}
              </motion.div>
              
              {/* 🚨 ERROR ICON with Tooltip */}
              {hasConversionErrors && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-500 animate-pulse" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs bg-red-950/90 border-red-500/50">
                    <p className="text-xs text-red-100">{errorMessage}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Current portfolio equity.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-md overflow-hidden" style={{ containerType: 'inline-size' }}>
          <CardHeader className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total P/L ({displayCurrency})</CardTitle>
            <div className={`p-2 rounded-full ${metrics.totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <TrendingUp className={`h-4 w-4 ${metrics.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`} />
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div 
              className={`font-bold whitespace-nowrap text-[clamp(1.25rem,12cqw,2rem)] ${metrics.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {metrics.totalProfit >= 0 ? '+' : ''}{formatCurrency(metrics.totalProfit, displayCurrency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Realized + Unrealized returns.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-card/50 backdrop-blur-md overflow-hidden" style={{ containerType: 'inline-size' }}>
          <CardHeader className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio Beta</CardTitle>
            <div className="p-2 bg-purple-500/10 rounded-full">
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div 
              className="font-bold whitespace-nowrap text-[clamp(1.25rem,12cqw,2rem)]"
            >
              {metrics.beta.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sensitivity to market (S&P 500).
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
