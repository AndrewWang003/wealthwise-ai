/**
 * @fileOverview Alpha Vantage 价格提供者
 * 
 * 保留原有的 Alpha Vantage 实现，作为备用数据源
 */

import type { PriceProvider, PriceInCents } from './types';

/**
 * Alpha Vantage 价格提供者
 * 
 * 特点：
 * - 需要 API key
 * - 有免费额度限制（每分钟 5 次请求）
 * - 数据质量高
 * 
 * 注意：Alpha Vantage 不支持真正的批量查询，
 * 这里的 batchGetPrices 是顺序调用多次单个查询
 */
export class AlphaVantageProvider implements PriceProvider {
    name = 'alphavantage' as const;
    private apiKey: string;
    private lastFailureTime = 0;
    private COOL_DOWN_MS = 60 * 1000; // 1 分钟冷却

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY || '';
        if (!this.apiKey) {
            console.warn('[AlphaVantage] API key 未设置，该提供者将无法工作');
        }
    }

    /**
     * 批量获取股票价格
     * 
     * 注意：Alpha Vantage 不支持真正的批量查询，
     * 这里是顺序调用，会比较慢且容易触发频率限制
     * 
     * @param symbols - 股票代码数组
     * @returns 价格映射表
     */
    async batchGetPrices(symbols: string[]): Promise<Map<string, PriceInCents>> {
        const result = new Map<string, PriceInCents>();

        // 冷却检查
        if (Date.now() - this.lastFailureTime < this.COOL_DOWN_MS) {
            console.warn('[AlphaVantage] 处于冷却期，跳过批量请求');
            return result;
        }

        if (!this.apiKey) {
            console.error('[AlphaVantage] 无法批量查询：API key 未设置');
            return result;
        }

        console.log(`[AlphaVantage] 开始顺序查询 ${symbols.length} 个标的（注意：这会很慢）`);

        // 顺序查询每个 symbol（避免并发触发频率限制）
        for (const symbol of symbols) {
            const price = await this.getPrice(symbol);
            if (price) {
                result.set(symbol, price);
            }

            // 添加延迟以避免触发频率限制（免费版每分钟 5 次）
            if (symbols.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 12000)); // 12 秒间隔
            }
        }

        console.log(`[AlphaVantage] 完成查询 ${result.size}/${symbols.length} 个价格`);
        return result;
    }

    /**
     * 获取单个股票价格
     * 
     * @param symbol - 股票代码
     * @returns 价格数据或 null
     */
    async getPrice(symbol: string): Promise<PriceInCents | null> {
        // 冷却检查
        if (Date.now() - this.lastFailureTime < this.COOL_DOWN_MS) {
            console.warn(`[AlphaVantage] 处于冷却期，跳过 ${symbol}`);
            return null;
        }

        if (!this.apiKey) {
            console.error('[AlphaVantage] 无法查询：API key 未设置');
            return null;
        }

        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`[AlphaVantage] API 请求失败: ${response.status}`);
                this.lastFailureTime = Date.now(); // 触发冷却
                return null;
            }

            const data = await response.json();

            if (!data || !data['Global Quote']) {
                console.warn(`[AlphaVantage] 无数据返回（可能触发频率限制）: ${symbol}`);
                if (data && data['Note']) {
                    console.warn(`[AlphaVantage] 频率限制提示: ${data['Note']}`);
                    this.lastFailureTime = Date.now(); // 触发冷却
                }
                return null;
            }

            const priceStr = data['Global Quote']?.['05. price'];

            if (priceStr && typeof priceStr === 'string') {
                const price = parseFloat(priceStr);
                const priceInCents = Math.round(price * 100);

                console.log(`[AlphaVantage] ✓ ${symbol}: $${price} (${priceInCents}¢)`);

                return {
                    symbol,
                    priceInCents,
                    lastUpdated: new Date(),
                    source: 'alphavantage',
                };
            } else {
                console.warn(`[AlphaVantage] 价格格式异常: ${symbol}`, data);
                return null;
            }
        } catch (error) {
            console.error(`[AlphaVantage] 查询失败 ${symbol}:`, error);
            // 网络错误也触发冷却
            this.lastFailureTime = Date.now();
            return null;
        }
    }
}
