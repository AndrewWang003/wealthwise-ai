/**
 * 🎯 RISK ANALYTICS HOOK (Virtual Backtesting)
 * 
 * 核心改进：
 * - 移除 30 天限制
 * - 直接获取 Yahoo 1 年历史数据
 * - 虚拟回测：当前持仓量 × 历史价格
 * - 缓存机制避免重复请求
 */

'use client';

import { useMemo, useState, useEffect } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import type { Currency } from '@/lib/types';
import {
  getRequiredFxPairs,
  alignHistoricalPricesToCurrency,
  calculateRiskMetrics,
  type RiskMetrics,
  type AlignedHistoricalData,
} from '@/lib/risk/risk-calculator';
import {
  performVirtualBacktest,
  identifyRequiredFxPairs,
  type PositionSnapshot,
  type HistoricalPrice,
} from '@/lib/risk/virtual-backtest';

export interface UseRiskAnalyticsResult {
  riskMetrics: RiskMetrics | null;
  isLoading: boolean;
  error: string | null;
  
  // AI 诊断
  volatilityDiagnosis: string;
  drawdownDiagnosis: string;
  sharpeDiagnosis: string;
}

// 🎯 内存缓存（避免重复请求）
const historicalDataCache = new Map<string, {
  data: Map<string, HistoricalPrice[]>;
  timestamp: number;
}>();

const CACHE_TTL = 1000 * 60 * 60; // 1 小时

/**
 * 🧠 AI 诊断生成器
 */
function getDiagnosisForMetric(
  metric: 'volatility' | 'drawdown' | 'sharpe',
  value: number
): string {
  const diagnostics = {
    volatility: [
      { range: [0, 0.1], diagnosis: '✅ 波动率极低，投资组合非常稳健' },
      { range: [0.1, 0.2], diagnosis: '✅ 波动率适中，符合长期投资预期' },
      { range: [0.2, 0.3], diagnosis: '⚠️ 波动率偏高，建议分散投资' },
      { range: [0.3, Infinity], diagnosis: '🚨 波动率过高，风险显著' },
    ],
    drawdown: [
      { range: [0, 0.1], diagnosis: '✅ 回撤控制良好' },
      { range: [0.1, 0.2], diagnosis: '⚠️ 中等回撤，需关注' },
      { range: [0.2, Infinity], diagnosis: '🚨 回撤过大，建议止损或调仓' },
    ],
    sharpe: [
      { range: [-Infinity, 0], diagnosis: '🚨 风险调整后收益为负' },
      { range: [0, 1], diagnosis: '⚠️ 夏普比率较低，性价比一般' },
      { range: [1, 2], diagnosis: '✅ 夏普比率良好' },
      { range: [2, Infinity], diagnosis: '✅ 夏普比率优秀，风险收益比卓越' },
    ],
  };

  const metricDiagnostics = diagnostics[metric];
  
  for (const { range, diagnosis } of metricDiagnostics) {
    if (value >= range[0] && value < range[1]) {
      return diagnosis;
    }
  }

  return '';
}

/**
 * 📥 获取历史价格数据（带缓存）
 */
async function fetchHistoricalPrices(
  symbols: string[],
  days: number = 365
): Promise<Map<string, HistoricalPrice[]>> {
  const cacheKey = `${symbols.sort().join(',')}_${days}`;
  
  // 检查缓存
  const cached = historicalDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // 🔍 验证缓存有效性：如果缓存是空的，忽略它
    if (cached.data.size > 0) {
      console.log('[Risk Analytics] Using cached historical data');
      return cached.data;
    } else {
      console.log('[Risk Analytics] ⚠️ Ignoring empty cache, will re-fetch');
      historicalDataCache.delete(cacheKey); // 清理无效缓存
    }
  }

  // 调用 API
  try {
    console.log('[Risk Analytics] 🌐 Calling API for symbols:', symbols);
    
    const response = await fetch('/api/historical-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, days }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Risk Analytics] API error:', response.status, errorText);
      throw new Error(`Failed to fetch historical prices: ${response.status}`);
    }

    const json = await response.json();
    console.log('[Risk Analytics] API response:', json);
    
    const dataMap = new Map<string, HistoricalPrice[]>();

    json.results.forEach((result: any) => {
      if (result.success && result.data && result.data.length > 0) {
        dataMap.set(result.symbol, result.data);
        console.log(`[Risk Analytics] ✅ ${result.symbol}: ${result.data.length} data points`);
      } else {
        console.warn(`[Risk Analytics] ⚠️ ${result.symbol}: No data or failed`, result.error);
      }
    });

    // 只缓存有效数据（非空）
    if (dataMap.size > 0) {
      historicalDataCache.set(cacheKey, {
        data: dataMap,
        timestamp: Date.now(),
      });
      console.log(`[Risk Analytics] ✅ Cached ${dataMap.size} symbols`);
    } else {
      console.warn('[Risk Analytics] ⚠️ Not caching empty response');
    }

    return dataMap;
  } catch (error) {
    console.error('[Risk Analytics] Fetch error:', error);
    return new Map();
  }
}

/**
 * 🎯 风险分析主 Hook（虚拟回测版）
 */
export function useRiskAnalytics(days: number = 365): UseRiskAnalyticsResult {
  const { positions, displayCurrency, isLoading: isPortfolioLoading } = usePortfolio();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<AlignedHistoricalData | null>(null);

  // 🔍 调试：打印持仓信息
  console.log('[Risk Analytics] 🔍 Portfolio state:', {
    positionsCount: positions.length,
    isPortfolioLoading,
    displayCurrency,
    positions: positions.map(p => ({ symbol: p.symbol, quantity: p.quantity, isCash: p.isCash })),
  });

  // 🎯 提取当前持仓快照
  const currentPositions = useMemo<PositionSnapshot[]>(() => {
    const filtered = positions
      .filter(p => !p.isCash && Math.abs(p.quantity) > 0.0001)
      .map(p => ({
        symbol: p.symbol,
        quantity: p.quantity,
        currency: p.nativeCurrency || p.currency,
      }));
    
    console.log('[Risk Analytics] 🎯 Current positions:', filtered);
    return filtered;
  }, [positions]);

  // 🎯 识别需要的标的和汇率对
  const { symbols, fxPairs } = useMemo(() => {
    const symbols = currentPositions.map(p => p.symbol);
    const fxPairs = identifyRequiredFxPairs(currentPositions, displayCurrency);
    
    console.log('[Risk Analytics] 📋 Extracted symbols:', { symbols, fxPairs });
    return { symbols, fxPairs };
  }, [currentPositions, displayCurrency]);

  // 🎯 获取历史数据并执行虚拟回测
  useEffect(() => {
    // 等待持仓数据加载完成
    if (isPortfolioLoading) {
      console.log('[Risk Analytics] ⏳ Waiting for portfolio to load...');
      return;
    }

    if (symbols.length === 0) {
      console.log('[Risk Analytics] ⚠️ No symbols to fetch (empty portfolio or all cash)');
      setHistoricalData(null);
      return;
    }

    let isCancelled = false;

    async function fetchAndBacktest() {
      console.log('[Risk Analytics] 🚀 Starting backtest with symbols:', symbols);
      setIsLoading(true);
      setError(null);

      try {
        // 1. 获取所有需要的历史数据（标的 + FX）
        const allSymbols = [...symbols, ...fxPairs];
        console.log('[Risk Analytics] 📥 Fetching historical data for:', allSymbols);
        
        const pricesMap = await fetchHistoricalPrices(allSymbols, days);

        if (isCancelled) return;

        console.log('[Risk Analytics] ✅ Received data for symbols:', Array.from(pricesMap.keys()));

        // 2. 分离资产价格和 FX 汇率
        const assetPrices = new Map<string, HistoricalPrice[]>();
        const fxRates = new Map<string, HistoricalPrice[]>();

        symbols.forEach(symbol => {
          const data = pricesMap.get(symbol);
          if (data) assetPrices.set(symbol, data);
        });

        fxPairs.forEach(pair => {
          const data = pricesMap.get(pair);
          if (data) fxRates.set(pair, data);
        });

        console.log('[Risk Analytics] 📊 Asset prices:', assetPrices.size, 'FX pairs:', fxRates.size);

        // 3. 执行虚拟回测
        const backtestResult = performVirtualBacktest(
          currentPositions,
          assetPrices,
          fxRates,
          displayCurrency
        );

        if (isCancelled) return;

        console.log('[Risk Analytics] ✅ Backtest complete:', {
          days: backtestResult.dates.length,
          firstValue: backtestResult.portfolioValues[0],
          lastValue: backtestResult.portfolioValues[backtestResult.portfolioValues.length - 1],
        });

        setHistoricalData({
          dates: backtestResult.dates,
          prices: backtestResult.portfolioValues,
        });
      } catch (err) {
        if (!isCancelled) {
          console.error('[Risk Analytics] ❌ Error:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch data');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchAndBacktest();

    return () => {
      isCancelled = true;
    };
  }, [symbols, fxPairs, currentPositions, displayCurrency, days, isPortfolioLoading]);

  // 🎯 计算风险指标
  const riskMetrics = useMemo<RiskMetrics | null>(() => {
    if (!historicalData || historicalData.prices.length < 30) return null;
    
    console.log('[Risk Analytics] 🎯 Calculating risk metrics');
    return calculateRiskMetrics(historicalData);
  }, [historicalData]);

  // 🎯 生成 AI 诊断
  const { volatilityDiagnosis, drawdownDiagnosis, sharpeDiagnosis } = useMemo(() => {
    if (!riskMetrics) {
      return {
        volatilityDiagnosis: '',
        drawdownDiagnosis: '',
        sharpeDiagnosis: '',
      };
    }

    return {
      volatilityDiagnosis: getDiagnosisForMetric('volatility', riskMetrics.volatility),
      drawdownDiagnosis: getDiagnosisForMetric('drawdown', riskMetrics.maxDrawdown.maxDrawdown),
      sharpeDiagnosis: getDiagnosisForMetric('sharpe', riskMetrics.sharpeRatio),
    };
  }, [riskMetrics]);

  return {
    riskMetrics,
    isLoading,
    error,
    volatilityDiagnosis,
    drawdownDiagnosis,
    sharpeDiagnosis,
  };
}

