/**
 * @fileOverview 批量价格服务
 * 
 * 核心功能：
 * 1. 批量按需获取（Batch On-Demand）
 * 2. 智能缓存对比（只请求过期的数据）
 * 3. Firestore 缓存集成
 * 4. 频率限制保护
 */

import { db } from '@/lib/firebase/clientApp';
import { collection, query, where, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import type { PriceProvider, PriceInCents, BatchPriceResult, CacheConfig } from './types';
import { createDividendInsight } from '@/lib/insights';

/**
 * 批量价格服务
 * 
 * 使用示例：
 * ```ts
 * const service = new BatchPriceService(yahooProvider);
 * const result = await service.batchGetPrices(['AAPL', 'GOOGL', 'MSFT']);
 * ```
 */
export class BatchPriceService {
    private provider: PriceProvider;
    private fallbackProvider?: PriceProvider;
    private cacheConfig: CacheConfig;
    private isRequestInProgress = false; // 频率限制标志

    constructor(
        provider: PriceProvider,
        fallbackProvider?: PriceProvider,
        cacheConfig?: Partial<CacheConfig>
    ) {
        this.provider = provider;
        this.fallbackProvider = fallbackProvider;
        this.cacheConfig = {
            ttlMs: cacheConfig?.ttlMs || 10 * 60 * 1000, // 默认 10 分钟
            enabled: cacheConfig?.enabled ?? true,
        };
    }

    /**
     * 批量获取股票价格（核心方法）
     * 
     * 流程：
     * 1. 从 Firestore 读取缓存
     * 2. 计算哪些需要刷新（超过 10 分钟或不存在）
     * 3. 批量调用 API 获取新数据
     * 4. 更新 Firestore 缓存
     * 5. 返回合并结果
     * 
     * @param symbols - 股票代码数组
     * @param userId - 用户 ID（用于缓存隔离）
     * @returns 批量价格结果
     */
    async batchGetPrices(symbols: string[], userId: string): Promise<BatchPriceResult> {
        // 频率限制：同一时间只允许一个批量请求
        if (this.isRequestInProgress) {
            console.warn('[BatchPriceService] 已有请求在进行中，跳过本次请求');
            return {
                prices: new Map(),
                failed: symbols,
                fromCache: [],
                fromAPI: [],
            };
        }

        this.isRequestInProgress = true;

        try {
            const result: BatchPriceResult = {
                prices: new Map(),
                failed: [],
                fromCache: [],
                fromAPI: [],
            };

            if (symbols.length === 0) {
                return result;
            }

            console.log(`[BatchPriceService] 开始批量获取 ${symbols.length} 个价格`);

            // Step 1: 从 Firestore 读取缓存
            const cachedPrices = await this.getCachedPrices(symbols, userId);

            // Step 2: 计算新鲜度，过滤出需要刷新的 symbol
            const now = Date.now();
            const symbolsToFetch: string[] = [];

            for (const symbol of symbols) {
                const cached = cachedPrices.get(symbol);

                if (!cached) {
                    // 缓存中不存在
                    symbolsToFetch.push(symbol);
                    console.log(`[BatchPriceService] ${symbol}: 缓存不存在，需要获取`);
                } else {
                    const age = now - cached.lastUpdated.getTime();
                    const isFresh = age < this.cacheConfig.ttlMs;

                    if (isFresh) {
                        // 缓存新鲜，直接使用
                        result.prices.set(symbol, { ...cached, source: 'cache' });
                        result.fromCache.push(symbol);
                        console.log(`[BatchPriceService] ${symbol}: 缓存新鲜 (${Math.round(age / 1000)}s ago)`);
                    } else {
                        // 缓存过期，需要刷新
                        symbolsToFetch.push(symbol);
                        console.log(`[BatchPriceService] ${symbol}: 缓存过期 (${Math.round(age / 1000)}s ago)，需要刷新`);
                    }
                }
            }

            // Step 3: 批量调用 API 获取新数据
            if (symbolsToFetch.length > 0) {
                console.log(`[BatchPriceService] 需要从 API 获取 ${symbolsToFetch.length} 个价格: ${symbolsToFetch.join(', ')}`);

                let fetchedPrices = await this.provider.batchGetPrices(symbolsToFetch);

                // 如果主提供者失败且有备用提供者，尝试备用
                if (fetchedPrices.size === 0 && this.fallbackProvider && symbolsToFetch.length > 0) {
                    console.log(`[BatchPriceService] 主提供者失败，尝试备用提供者: ${this.fallbackProvider.name}`);
                    fetchedPrices = await this.fallbackProvider.batchGetPrices(symbolsToFetch);
                }

                // 合并到结果
                for (const [symbol, price] of fetchedPrices) {
                    result.prices.set(symbol, price);
                    result.fromAPI.push(symbol);
                }

                // 记录失败的 symbol
                for (const symbol of symbolsToFetch) {
                    if (!fetchedPrices.has(symbol)) {
                        result.failed.push(symbol);
                        console.warn(`[BatchPriceService] ${symbol}: 获取失败`);
                    }
                }

                // Step 4: 🔥 强制更新 Firestore 缓存（即使价格未变化）
                // 用户要求：只要 API 返回了数据，必须更新 lastUpdated 时间戳
                const pricesToUpdate = Array.from(fetchedPrices.values());
                if (pricesToUpdate.length > 0) {
                    console.log(`[BatchPriceService] 强制写入 Firestore: ${pricesToUpdate.length} 个价格`);
                    await this.updateCache(pricesToUpdate, userId);
                } else if (symbolsToFetch.length > 0) {
                    // 即使所有请求都失败了，也记录日志
                    console.warn(`[BatchPriceService] ⚠️  API 返回 0 个价格，跳过 Firestore 写入`);
                }
            } else {
                console.log(`[BatchPriceService] 所有价格来自缓存，无需调用 API`);
            }

            console.log(`[BatchPriceService] 完成: ${result.prices.size} 成功, ${result.failed.length} 失败 (缓存: ${result.fromCache.length}, API: ${result.fromAPI.length})`);

            return result;

        } finally {
            this.isRequestInProgress = false;
        }
    }

    /**
     * 从 Firestore 批量读取缓存
     * 
     * @param symbols - 股票代码数组
     * @param userId - 用户 ID
     * @returns 缓存的价格映射表
     */
    private async getCachedPrices(symbols: string[], userId: string): Promise<Map<string, PriceInCents>> {
        const result = new Map<string, PriceInCents>();

        if (!this.cacheConfig.enabled || symbols.length === 0) {
            return result;
        }

        try {
            // 使用 where('symbol', 'in', symbols) 批量查询
            // 注意：Firestore 的 'in' 查询最多支持 30 个值，需要分批
            const batches = this.chunkArray(symbols, 30);

            for (const batch of batches) {
                const q = query(
                    collection(db, 'asset_prices'),
                    where('userId', '==', userId),
                    where('symbol', 'in', batch)
                );

                const snapshot = await getDocs(q);

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    result.set(data.symbol, {
                        symbol: data.symbol,
                        priceInCents: data.priceInCents,
                        lastUpdated: data.lastUpdated.toDate(),
                        source: data.source || 'cache',
                    });
                });
            }

            console.log(`[BatchPriceService] 从缓存读取 ${result.size}/${symbols.length} 个价格`);

        } catch (error) {
            console.error('[BatchPriceService] 读取缓存失败:', error);
        }

        return result;
    }

    /**
     * 批量更新 Firestore 缓存
     * 
     * @param prices - 价格数组
     * @param userId - 用户 ID
     */
     private async updateCache(prices: PriceInCents[], userId: string): Promise<number> {
        if (!this.cacheConfig.enabled) {
            console.log('[BatchPriceService] 缓存已禁用，跳过写入');
            return 0;
        }
        
        if (prices.length === 0) {
            console.log('[BatchPriceService] 没有价格需要写入');
            return 0;
        }

        try {
            // 使用 writeBatch 原子性写入
            const batch = writeBatch(db);
            let writeCount = 0;

            for (const price of prices) {
                const docRef = doc(db, 'asset_prices', `${userId}_${price.symbol}`);
                batch.set(docRef, {
                    userId,
                    symbol: price.symbol,
                    priceInCents: price.priceInCents,
                    lastUpdated: Timestamp.fromDate(price.lastUpdated),
                    source: price.source,
                }, { merge: true });
                writeCount++;
                console.log(`[BatchPriceService] ✍️  准备写入: ${price.symbol} = ${price.priceInCents} cents`);
            }

            await batch.commit();
            console.log(`[BatchPriceService] ✅ Firestore 写入成功: ${writeCount} 个价格`);
            return writeCount;

        } catch (error) {
            console.error('[BatchPriceService] ❌ 更新缓存失败:', error);
            return 0;
        }
    }

    /**
     * 将数组分块（用于 Firestore 'in' 查询限制）
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * 获取单个股票价格（向后兼容）
     */
    async getPrice(symbol: string, userId: string): Promise<PriceInCents | null> {
        const result = await this.batchGetPrices([symbol], userId);
        return result.prices.get(symbol) || null;
    }

    /**
     * 🔔 SMART BRIEFING: Check for upcoming dividends and create insights
     * 
     * @param prices - Array of price data with potential dividend info
     * @param userId - User ID for creating insights
     * @param daysThreshold - Alert if ex-dividend date is within this many days (default: 7)
     */
    async checkDividends(
        prices: PriceInCents[],
        userId: string,
        daysThreshold: number = 7
    ): Promise<number> {
        if (!userId) {
            console.warn('[BatchPriceService] checkDividends: userId not provided');
            return 0;
        }

        let insightsCreated = 0;
        const now = Date.now();
        const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;

        for (const price of prices) {
            if (!price.dividendInfo?.exDividendDate) continue;

            try {
                const exDate = new Date(price.dividendInfo.exDividendDate);
                const timeUntilEx = exDate.getTime() - now;

                // Only alert if ex-dividend date is upcoming (within threshold)
                if (timeUntilEx > 0 && timeUntilEx <= thresholdMs) {
                    console.log(`💰 [Dividend] ${price.symbol} ex-dividend in ${Math.ceil(timeUntilEx / (24 * 60 * 60 * 1000))} days`);
                    
                    await createDividendInsight(db, userId, {
                        symbol: price.symbol,
                        exDividendDate: price.dividendInfo.exDividendDate,
                        dividendAmount: price.dividendInfo.dividendAmount,
                        currency: price.dividendInfo.currency,
                    });

                    insightsCreated++;
                }
            } catch (error) {
                console.error(`[BatchPriceService] Error checking dividend for ${price.symbol}:`, error);
            }
        }

        if (insightsCreated > 0) {
            console.log(`💰 [Dividend] Created ${insightsCreated} dividend insight(s)`);
        }

        return insightsCreated;
    }
}
