/**
 * 🎯 RISK METRICS CARD
 * 
 * 风险诊断卡片，包含：
 * - 波动率、最大回撤、夏普比率
 * - AI 医生诊断
 * - 基准对比按钮（预留）
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingDown, Award, BarChart3 } from 'lucide-react';
import { useRiskAnalytics } from '@/hooks/useRiskAnalytics';
import { Skeleton } from '@/components/ui/skeleton';

export function RiskMetricsCard() {
  const {
    riskMetrics,
    isLoading,
    volatilityDiagnosis,
    drawdownDiagnosis,
    sharpeDiagnosis,
  } = useRiskAnalytics();

  // 基准对比功能（预留）
  const handleCompareBenchmark = () => {
    // TODO: 实现基准对比
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>风险诊断</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // 空状态
  if (!riskMetrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>风险诊断</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BarChart3 className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-sm">正在获取历史数据...</p>
            <p className="text-xs mt-2">首次加载约需 10-15 秒</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className=" flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          风险诊断
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleCompareBenchmark}
          className="text-xs"
        >
          对比基准 (S&P 500)
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 波动率 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-600" />
              <span className="font-medium">年化波动率</span>
            </div>
            <span className="text-2xl font-bold text-blue-600">
              {riskMetrics.volatilityPercent}
            </span>
          </div>
          <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
            {volatilityDiagnosis}
          </div>
        </div>

        {/* 最大回撤 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="font-medium">最大回撤</span>
            </div>
            <span className="text-2xl font-bold text-red-600">
              {riskMetrics.maxDrawdown.maxDrawdownPercent}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            <div>峰值: {riskMetrics.maxDrawdown.peakDate}</div>
            <div>谷底: {riskMetrics.maxDrawdown.troughDate}</div>
            {riskMetrics.maxDrawdown.recoveryDate && (
              <div>恢复: {riskMetrics.maxDrawdown.recoveryDate}</div>
            )}
            <div>持续: {riskMetrics.maxDrawdown.durationDays} 天</div>
          </div>
          <div className="text-sm text-muted-foreground bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
            {drawdownDiagnosis}
          </div>
        </div>

        {/* 夏普比率 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-green-600" />
              <span className="font-medium">夏普比率</span>
            </div>
            <span className="text-2xl font-bold text-green-600">
              {riskMetrics.sharpeRatio.toFixed(2)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            无风险利率: 4% | 年化基准
          </div>
          <div className="text-sm text-muted-foreground bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
            {sharpeDiagnosis}
          </div>
        </div>

        {/* 计算时间 */}
        <div className="text-xs text-muted-foreground text-center pt-4 border-t">
          最后更新: {new Date(riskMetrics.calculatedAt).toLocaleString('zh-CN')}
        </div>
      </CardContent>
    </Card>
  );
}
