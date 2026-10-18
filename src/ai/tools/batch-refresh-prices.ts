
'use server';
/**
 * @fileOverview Genkit 工具：批量刷新股票价格
 *
 * 这个工具允许 AI 一次性刷新多个股票的价格，比逐个调用 getStockPrice 更高效
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { batchGetPrices } from '@/lib/pricing';

export const batchRefreshPrices = ai.defineTool(
    {
        name: 'batchRefreshPrices',
        description: 'Batch refresh prices for multiple stock symbols at once (more efficient than calling getStockPrice multiple times).',
        inputSchema: z.object({
            symbols: z.array(z.string()).describe('Array of ticker symbols (e.g., ["AAPL", "GOOGL", "MSFT"]).'),
            userId: z.string().describe('The user ID for cache isolation.'),
        }),
        outputSchema: z.object({
            success: z.record(z.string(), z.number()).describe('Successfully fetched prices (symbol -> priceInCents).'),
            failed: z.array(z.string()).describe('Symbols that failed to fetch.'),
            fromCache: z.array(z.string()).describe('Symbols fetched from cache.'),
            fromAPI: z.array(z.string()).describe('Symbols fetched from API.'),
        }),
    },
    async ({ symbols, userId }) => {
        try {
            console.log(`[batchRefreshPrices] 批量刷新 ${symbols.length} 个标的`);

            const result = await batchGetPrices(symbols, userId);

            // 转换为简单的对象格式
            const success: Record<string, number> = {};
            for (const [symbol, price] of result.prices) {
                success[symbol] = price.priceInCents;
            }

            console.log(`[batchRefreshPrices] 完成: ${Object.keys(success).length} 成功, ${result.failed.length} 失败`);

            return {
                success,
                failed: result.failed,
                fromCache: result.fromCache,
                fromAPI: result.fromAPI,
            };
        } catch (error) {
            console.error('[batchRefreshPrices] 错误:', error);
            return {
                success: {},
                failed: symbols,
                fromCache: [],
                fromAPI: [],
            };
        }
    }
);
