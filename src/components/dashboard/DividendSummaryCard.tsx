/**
 * 💰 DIVIDEND SUMMARY CARD
 * 
 * Displays forward annual dividend and total YOC
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp } from 'lucide-react';

export function DividendSummaryCard() {
  // TODO: Integrate with usePortfolioAggregation dividend insights
  const forwardAnnualDividend = 0;
  const totalYieldOnCost = 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          分红透视
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">预计年分红</p>
            <p className="text-2xl font-bold text-green-600">
              ${forwardAnnualDividend.toFixed(2)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">总 YOC</p>
            <p className="text-2xl font-bold text-blue-600 flex items-center gap-1">
              <TrendingUp className="h-5 w-5" />
              {totalYieldOnCost.toFixed(2)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
