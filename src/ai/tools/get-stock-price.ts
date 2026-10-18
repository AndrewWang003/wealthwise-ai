
'use server';
/**
 * @fileOverview A Genkit tool to fetch the latest price of a stock symbol.
 *
 * 现在使用批量价格服务，支持：
 * - 智能缓存（10 分钟 TTL）
 * - 多数据源（Yahoo Finance 主，Alpha Vantage 备用）
 * - 批量查询优化
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getPrice } from '@/lib/pricing';

export const getStockPrice = ai.defineTool(
  {
    name: 'getStockPrice',
    description: 'Returns the current market price of a given stock symbol (with intelligent caching).',
    inputSchema: z.object({
      symbol: z.string().describe('The ticker symbol of the stock (e.g., "AAPL", "TSLA").'),
      userId: z.string().describe('The user ID for cache isolation.'),
    }),
    outputSchema: z.object({
      priceInCents: z.number().nullable().describe('The latest price in cents, or null if not found.'),
      source: z.enum(['yahoo', 'alphavantage', 'cache']).optional().describe('The data source.'),
    }),
  },
  async ({ symbol, userId }) => {
    try {
      const priceData = await getPrice(symbol, userId);

      if (!priceData) {
        console.warn(`[getStockPrice] 无法获取价格: ${symbol}`);
        return { priceInCents: null };
      }

      console.log(`[getStockPrice] ${symbol}: ${priceData.priceInCents}¢ (来源: ${priceData.source})`);

      return {
        priceInCents: priceData.priceInCents,
        source: priceData.source,
      };
    } catch (error) {
      console.error(`[getStockPrice] 错误 ${symbol}:`, error);
      return { priceInCents: null };
    }
  }
);
