/**
 * 🎯 RISK CALCULATOR - 核心风险计算引擎
 * 
 * 工业级风险指标计算，包含：
 * - 多币种历史数据对齐
 * - 波动率（年化对数收益率标准差）
 * - 最大回撤（含时间段）
 * - 夏普比率（Rf = 4%）
 * 
 * 注意：历史数据抓取应在服务端进行，本文件仅包含纯计算逻辑
 */

import type { Currency } from '@/lib/types';

// ==================== 类型定义 ====================

export interface HistoricalDataPoint {
  date: string;
  close: number;
}

export interface AlignedHistoricalData {
  dates: string[];
  prices: number[];  // 已对齐到基准币种
}

export interface DrawdownResult {
  maxDrawdown: number;
  maxDrawdownPercent: string;
  peakDate: string;
  troughDate: string;
  recoveryDate?: string;
  durationDays: number;
}

export interface RiskMetrics {
  volatility: number;
  volatilityPercent: string;
  maxDrawdown: DrawdownResult;
  sharpeRatio: number;
  calculatedAt: string;
}

// ==================== 工具函数 ====================

function mean(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function standardDeviation(arr: number[]): number {
  const avg = mean(arr);
  const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
  const variance = mean(squareDiffs);
  return Math.sqrt(variance);
}

// ==================== 多币种对齐核心算法 ====================

/**
 * 🌍 识别需要的 FX 汇率对
 * 
 * @example
 * positions = [{ symbol: 'AAPL', currency: 'USD' }, { symbol: 'CBA.AX', currency: 'AUD' }]
 * baseCurrency = 'AUD'
 * 返回: ['USDAUD=X']
 */
export function getRequiredFxPairs(
  currencies: Currency[],
  baseCurrency: Currency
): string[] {
  const uniqueCurrencies = new Set(currencies);
  const fxPairs: string[] = [];

  for (const currency of uniqueCurrencies) {
    if (currency !== baseCurrency) {
      // Yahoo Finance FX pair 格式：USD to AUD = USDAUD=X
      fxPairs.push(`${currency}${baseCurrency}=X`);
    }
  }

  return fxPairs;
}

/**
 * 📊 批量抓取历史数据（资产 + FX 汇率）
 * 
 * 注意：此函数应在服务端 API 路由中调用，不应在客户端使用
 * 
 * @deprecated 使用服务端 API 路由替代
 */
/*
export async function fetchHistoricalDataBatch(
  symbols: string[],
  fxPairs: string[],
  days: number = 252
): Promise<Map<string, HistoricalDataPoint[]>> {
  // 此函数需要在服务端实现
  // 客户端应调用 API 路由获取数据
  throw new Error('fetchHistoricalDataBatch should only be called on server side');
}
*/

/**
 * 🔄 多币种历史价格对齐算法
 * 
 * 核心逻辑：
 * 1. 对于基准币种资产，直接使用历史价格
 * 2. 对于非基准币种资产，逐日乘以当日汇率
 * 3. 处理数据不对齐：使用最近可用汇率（forward fill）
 * 
 * @returns 对齐后的日期和价格数组（统一币种）
 */
export function alignHistoricalPricesToCurrency(
  assetData: HistoricalDataPoint[],
  assetCurrency: Currency,
  baseCurrency: Currency,
  fxData: Map<string, HistoricalDataPoint[]>
): AlignedHistoricalData {
  // 情况1：资产本身就是基准币种
  if (assetCurrency === baseCurrency) {
    return {
      dates: assetData.map(d => d.date),
      prices: assetData.map(d => d.close),
    };
  }

  // 情况2：需要汇率转换
  const fxPair = `${assetCurrency}${baseCurrency}=X`;
  const fxHistory = fxData.get(fxPair);

  if (!fxHistory || fxHistory.length === 0) {
    console.warn(`[Risk Calculator] ⚠️ FX rate not available for ${fxPair}, using fallback rate 1.0`);
    return {
      dates: assetData.map(d => d.date),
      prices: assetData.map(d => d.close),
    };
  }

  // 创建 FX 汇率查找表（日期 -> 汇率）
  const fxRateMap = new Map<string, number>();
  fxHistory.forEach(d => fxRateMap.set(d.date, d.close));

  // 对齐价格
  const alignedDates: string[] = [];
  const alignedPrices: number[] = [];
  let lastKnownFxRate = 1.0;

  assetData.forEach(point => {
    const fxRate = fxRateMap.get(point.date) || lastKnownFxRate; // Forward fill
    
    if (fxRateMap.has(point.date)) {
      lastKnownFxRate = fxRate;
    }

    const alignedPrice = point.close * fxRate;
    
    alignedDates.push(point.date);
    alignedPrices.push(alignedPrice);
  });

  console.log(`[Risk Calculator] 🔄 Aligned ${assetData.length} prices from ${assetCurrency} to ${baseCurrency}`);

  return {
    dates: alignedDates,
    prices: alignedPrices,
  };
}

// ==================== 风险指标计算 ====================

/**
 * 📈 波动率计算（年化对数收益率标准差）
 * 
 * 公式：σ = √252 × Stdev(ln(P_t / P_{t-1}))
 */
export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const logReturns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      const logReturn = Math.log(prices[i] / prices[i - 1]);
      logReturns.push(logReturn);
    }
  }

  if (logReturns.length === 0) return 0;

  const stdDev = standardDeviation(logReturns);
  const annualizedVol = stdDev * Math.sqrt(252); // 252 个交易日

  return annualizedVol;
}

/**
 * 📉 最大回撤计算（含时间段）
 * 
 * 返回峰值到谷底的时间段和恢复日期（如已恢复）
 */
export function calculateMaxDrawdown(
  prices: number[],
  dates: string[]
): DrawdownResult {
  if (prices.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPercent: '0.00%',
      peakDate: '',
      troughDate: '',
      durationDays: 0,
    };
  }

  let peak = prices[0];
  let peakIndex = 0;
  let maxDD = 0;
  let maxDDPeakIndex = 0;
  let maxDDTroughIndex = 0;

  for (let i = 0; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIndex = i;
    }

    const drawdown = (peak - prices[i]) / peak;

    if (drawdown > maxDD) {
      maxDD = drawdown;
      maxDDPeakIndex = peakIndex;
      maxDDTroughIndex = i;
    }
  }

  // 寻找恢复日期
  let recoveryIndex = -1;
  const peakValue = prices[maxDDPeakIndex];
  
  for (let i = maxDDTroughIndex + 1; i < prices.length; i++) {
    if (prices[i] >= peakValue) {
      recoveryIndex = i;
      break;
    }
  }

  const durationDays = maxDDTroughIndex - maxDDPeakIndex;

  return {
    maxDrawdown: maxDD,
    maxDrawdownPercent: `${(maxDD * 100).toFixed(2)}%`,
    peakDate: dates[maxDDPeakIndex] || '',
    troughDate: dates[maxDDTroughIndex] || '',
    recoveryDate: recoveryIndex >= 0 ? dates[recoveryIndex] : undefined,
    durationDays,
  };
}

/**
 * 📊 夏普比率计算
 * 
 * 公式：Sharpe = (R_p - R_f) / σ_p
 * 假设：R_f = 0.04 (4% 无风险利率)
 */
export function calculateSharpeRatio(
  prices: number[],
  riskFreeRate: number = 0.04
): number {
  if (prices.length < 2) return 0;

  const returns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
      returns.push(dailyReturn);
    }
  }

  if (returns.length === 0) return 0;

  const avgReturn = mean(returns);
  const stdDev = standardDeviation(returns);

  // 年化
  const annualizedReturn = avgReturn * 252;
  const annualizedStdDev = stdDev * Math.sqrt(252);

  if (annualizedStdDev === 0) return 0;

  const sharpe = (annualizedReturn - riskFreeRate) / annualizedStdDev;

  return sharpe;
}

/**
 * 🎯 完整风险指标计算
 */
export function calculateRiskMetrics(
  alignedData: AlignedHistoricalData
): RiskMetrics {
  const { dates, prices } = alignedData;

  return {
    volatility: calculateVolatility(prices),
    volatilityPercent: `${(calculateVolatility(prices) * 100).toFixed(2)}%`,
    maxDrawdown: calculateMaxDrawdown(prices, dates),
    sharpeRatio: calculateSharpeRatio(prices),
    calculatedAt: new Date().toISOString(),
  };
}
