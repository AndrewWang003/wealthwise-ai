/**
 * @fileOverview 价格服务统一入口
 * 
 * 导出所有价格相关的类型、提供者和服务实例
 */

export * from './types';
export * from './yahoo-provider';
export * from './alphavantage-provider';
export * from './batch-price-service';

import { YahooFinanceProvider } from './yahoo-provider';
import { AlphaVantageProvider } from './alphavantage-provider';
import { BatchPriceService } from './batch-price-service';

/**
 * 默认价格服务实例
 * 
 * 配置：
 * - 主提供者：Yahoo Finance（免费、快速、支持批量）
 * - 备用提供者：Alpha Vantage（需要 API key）
 * - 缓存：10 分钟 TTL
 */
export const priceService = new BatchPriceService(
    new YahooFinanceProvider(),
    new AlphaVantageProvider(), // 备用
    {
        ttlMs: 60 * 60 * 1000, // 1 小时 (was 10 mins)
        enabled: true,
    }
);

/**
 * 便捷函数：批量获取价格
 * 
 * @param symbols - 股票代码数组
 * @param userId - 用户 ID
 * @returns 批量价格结果
 * 
 * @example
 * ```ts
 * const result = await batchGetPrices(['AAPL', 'GOOGL'], userId);
 * const applePrice = result.prices.get('AAPL');
 * ```
 */
export async function batchGetPrices(symbols: string[], userId: string) {
    return priceService.batchGetPrices(symbols, userId);
}

/**
 * 便捷函数：获取单个价格
 * 
 * @param symbol - 股票代码
 * @param userId - 用户 ID
 * @returns 价格数据或 null
 * 
 * @example
 * ```ts
 * const price = await getPrice('AAPL', userId);
 * if (price) {
 *   console.log(`AAPL: ${price.priceInCents}¢`);
 * }
 * ```
 */
export async function getPrice(symbol: string, userId: string) {
    return priceService.getPrice(symbol, userId);
}
