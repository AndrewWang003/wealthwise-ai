/**
 * 🎯 虚拟回测引擎 (Virtual Backtesting Engine)
 * 
 * 核心功能：
 * - 利用当前持仓量 × 历史价格模拟过去组合价值
 * - 移除 30 天数据限制
 * - 支持多币种对齐
 */

import type { Currency } from '@/lib/types';

export interface HistoricalPrice {
  date: string;
  close: number;
}

export interface PositionSnapshot {
  symbol: string;
  quantity: number;
  currency: Currency;
}

export interface VirtualBacktestResult {
  dates: string[];
  portfolioValues: number[];  // 每日组合总价值（已对齐到基准币种）
}

/**
 * 🔄 虚拟回测核心算法
 * 
 * 逻辑：
 * 1. 对于每个日期，计算所有持仓的市值
 * 2. 持仓市值 = 持仓量 × 该日收盘价 × 汇率
 * 3. 汇总得到该日组合总价值
 */
export function performVirtualBacktest(
  positions: PositionSnapshot[],
  historicalPrices: Map<string, HistoricalPrice[]>,
  fxRates: Map<string, HistoricalPrice[]>,  // FX pair -> 历史汇率
  baseCurrency: Currency
): VirtualBacktestResult {
  // 1. 找出所有可用的日期（取交集）
  const allDates = new Set<string>();
  
  historicalPrices.forEach(prices => {
    prices.forEach(p => allDates.add(p.date));
  });

  const sortedDates = Array.from(allDates).sort();

  // 2. 为每个日期计算组合总价值
  const portfolioValues: number[] = [];

  sortedDates.forEach(date => {
    let dailyTotal = 0;

    positions.forEach(position => {
      const priceHistory = historicalPrices.get(position.symbol);
      if (!priceHistory) return;

      const priceOnDate = priceHistory.find(p => p.date === date);
      if (!priceOnDate) return;

      // 获取汇率
      let fxRate = 1;
      if (position.currency !== baseCurrency) {
        const fxPair = `${position.currency}${baseCurrency}=X`;
        const fxHistory = fxRates.get(fxPair);
        if (fxHistory) {
          const fxOnDate = fxHistory.find(f => f.date === date);
          if (fxOnDate) {
            fxRate = fxOnDate.close;
          }
        }
      }

      // 计算该持仓在该日的市值
      const marketValue = position.quantity * priceOnDate.close * fxRate;
      dailyTotal += marketValue;
    });

    portfolioValues.push(dailyTotal);
  });

  console.log(`[Virtual Backtest] Generated ${sortedDates.length} days of portfolio history`);

  return {
    dates: sortedDates,
    portfolioValues,
  };
}

/**
 * 🌍 识别需要的 FX 汇率对
 */
export function identifyRequiredFxPairs(
  positions: PositionSnapshot[],
  baseCurrency: Currency
): string[] {
  const currencies = new Set(positions.map(p => p.currency));
  const fxPairs: string[] = [];

  currencies.forEach(currency => {
    if (currency !== baseCurrency) {
      fxPairs.push(`${currency}${baseCurrency}=X`);
    }
  });

  return fxPairs;
}
