/**
 * @fileOverview Yahoo Finance 价格提供者 (Enhanced with Logging & Diagnostics)
 * 
 * 使用 yahoo-finance2 库批量获取股票价格
 * 增强功能：
 * - 请求日志持久化到 logs/api_requests.jsonl
 * - API 问题诊断（Crumb 校验、结果验证、User-Agent）
 * - HTTP 429/403 特殊标记和透传
 */

import YahooFinance from 'yahoo-finance2';
import type { PriceProvider, PriceInCents } from './types';
import fs from 'fs/promises';
import path from 'path';

// 📁 日志配置
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'api_requests.jsonl');

/**
 * 确保日志目录存在
 */
async function ensureLogDir(): Promise<void> {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
        // 目录已存在或无权限，忽略错误
        console.warn('[YahooFinance] 无法创建日志目录:', error);
    }
}

/**
 * 写入请求日志（JSON Lines 格式）
 * 
 * @param logEntry - 日志条目
 */
async function logRequest(logEntry: {
    timestamp: string;
    symbols: string[];
    status: 'success' | 'failed';
    latency: number;
    resultCount?: number;
    errorName?: string;
    errorMessage?: string;
    statusCode?: number;
}): Promise<void> {
    try {
        await ensureLogDir();
        const line = JSON.stringify(logEntry) + '\n';
        await fs.appendFile(LOG_FILE, line, 'utf8');
    } catch (error) {
        console.error('[YahooFinance] 写入日志失败:', error);
    }
}

// 实例化 YahooFinance (根据 v2.x 升级指南)
const yahooFinance = new YahooFinance();

/**
 * Yahoo Finance 价格提供者
 * 
 * 特点：
 * - 支持批量查询（一次请求多个 symbol）
 * - 免费，无需 API key
 * - 数据实时性较好
 * - 📊 持久化日志记录
 * - 🛡️ 增强错误诊断
 */
export class YahooFinanceProvider implements PriceProvider {
    name = 'yahoo' as const;
    private retryOnCrumbFailure = true; // Crumb 失败重试开关

    /**
     * 批量获取股票价格 + 元数据（升级版）
     * 
     * 🚀 性能优化：使用 quoteSummary 在单次请求中获取：
     * - 实时价格 (price)
     * - 基本面信息 (summaryProfile, summaryDetail)
     * - 分红数据 (calendarEvents, summaryDetail)
     * - 技术指标 (price, summaryDetail)
     * 
     * @param symbols - 股票代码数组（如 ['AAPL', 'GOOGL', 'MSFT']）
     * @returns 价格映射表（包含扩展元数据）
     */
    async batchGetPrices(symbols: string[]): Promise<Map<string, PriceInCents>> {
        const result = new Map<string, PriceInCents>();

        if (symbols.length === 0) {
            return result;
        }

        const startTime = Date.now();
        let attemptCount = 0;
        const maxAttempts = 2;

        while (attemptCount < maxAttempts) {
            attemptCount++;
            
            try {
                if (!yahooFinance) {
                    throw new Error('Yahoo Finance library not initialized correctly');
                }

                console.log(`[YahooFinance] 批量查询 ${symbols.length} 个标的 (尝试 ${attemptCount}/${maxAttempts}): ${symbols.join(', ')}`);

                // 🎯 批量调用 quoteSummary 获取完整数据
                const results = await Promise.allSettled(
                    symbols.map(async (symbol) => {
                        try {
                            // 请求多个模块以获取完整信息
                            const summary = await yahooFinance.quoteSummary(symbol, {
                                modules: [
                                    'price',              // 实时价格数据
                                    'summaryProfile',     // 公司概况（sector, industry）
                                    'summaryDetail',      // 详细摘要（dividendYield, 52周高低点）
                                    'calendarEvents',     // 日历事件（分红日期）
                                ]
                            });

                            return { symbol, summary };
                        } catch (err) {
                            console.warn(`[YahooFinance] ⚠️ Failed to fetch summary for ${symbol}:`, err);
                            return { symbol, summary: null };
                        }
                    })
                );

                // 处理结果
                for (const outcome of results) {
                    if (outcome.status === 'rejected') {
                        console.warn('[YahooFinance] Promise rejected:', outcome.reason);
                        continue;
                    }

                    const { symbol, summary } = outcome.value;
                    if (!summary || !summary.price) {
                        console.warn(`[YahooFinance] ⚠️ No price data for ${symbol}`);
                        continue;
                    }

                    const priceData = summary.price;
                    const profileData = summary.summaryProfile;
                    const detailData = summary.summaryDetail;
                    const calendarData = summary.calendarEvents;

                    // 获取当前价格（quoteSummary 返回直接的数值，不是 {raw, fmt} 对象）
                    const currentPrice = priceData.regularMarketPrice || 
                                       priceData.regularMarketPreviousClose;
                    
                    if (!currentPrice) {
                        console.warn(`[YahooFinance] ⚠️ No valid price for ${symbol}`);
                        continue;
                    }

                    // 🎯 FX Precision Logic
                    const isFX = symbol.endsWith('=X');
                    const multiplier = isFX ? 10000 : 100;
                    const priceInCents = Math.round(currentPrice * multiplier);

                    // 构造扩展的价格数据
                    const enhancedData: PriceInCents = {
                        symbol,
                        priceInCents,
                        lastUpdated: new Date(),
                        source: 'yahoo',
                    };

                    // 🔔 分红信息
                    if (calendarData?.dividendDate || detailData?.dividendYield) {
                        enhancedData.dividendInfo = {
                            exDividendDate: calendarData?.exDividendDate ? 
                                (typeof calendarData.exDividendDate === 'string' ? calendarData.exDividendDate : calendarData.exDividendDate.toISOString()) : undefined,
                            paymentDate: calendarData?.dividendDate ? 
                                (typeof calendarData.dividendDate === 'string' ? calendarData.dividendDate : calendarData.dividendDate.toISOString()) : undefined,
                            dividendAmount: detailData?.trailingAnnualDividendRate,
                            dividendYield: detailData?.dividendYield ? 
                                detailData.dividendYield * 100 : undefined,
                            currency: priceData.currency,
                        };
                    }

                    // 🌊 扩展元数据
                    enhancedData.metadata = {
                        longName: priceData.longName || undefined,
                        shortName: priceData.shortName || undefined,
                        sector: profileData?.sector,
                        industry: profileData?.industry,
                        
                        // Technical indicators  
                        fiftyTwoWeekHigh: detailData?.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: detailData?.fiftyTwoWeekLow,
                        fiftyDayAverage: detailData?.fiftyDayAverage,
                        twoHundredDayAverage: detailData?.twoHundredDayAverage,
                        
                        // Market data
                        marketCap: detailData?.marketCap,
                        volume: priceData.regularMarketVolume as number | undefined,
                        averageVolume: priceData.averageDailyVolume3Month as number | undefined,
                        
                        // Fundamental data
                        trailingPE: detailData?.trailingPE as number | undefined,
                        forwardPE: detailData?.forwardPE as number | undefined,
                        priceToBook: detailData?.priceToBook as number | undefined,
                    };

                    result.set(symbol, enhancedData);

                    console.log(`[YahooFinance] ✓ ${symbol}: ${currentPrice} (${priceInCents} units) + metadata`);
                }

                const latency = Date.now() - startTime;
                console.log(`[YahooFinance] 成功获取 ${result.size}/${symbols.length} 个价格 (耗时: ${latency}ms)`);

                // 📊 记录成功日志
                await logRequest({
                    timestamp: new Date().toISOString(),
                    symbols,
                    status: 'success',
                    latency,
                    resultCount: result.size,
                });

                // 成功，退出重试循环
                break;

            } catch (error: any) {
                const latency = Date.now() - startTime;
                const errorName = error.name || 'UnknownError';
                const errorMessage = error.message || 'No error message';
                const statusCode = error.statusCode || error.status || error.code;

                // 🚨 特殊错误标记
                const isCrumbError = errorMessage.toLowerCase().includes('crumb') || 
                                    errorMessage.toLowerCase().includes('cookie');
                const isRateLimited = statusCode === 429 || errorMessage.includes('Too Many Requests');
                const isForbidden = statusCode === 403 || errorMessage.includes('Forbidden');

                // 构建错误日志
                const logEntry = {
                    timestamp: new Date().toISOString(),
                    symbols,
                    status: 'failed' as const,
                    latency,
                    errorName,
                    errorMessage,
                    statusCode,
                };

                // 🔥 HTTP 429/403 特殊标记
                if (isRateLimited) {
                    console.error(`[YahooFinance] ⚠️ HTTP 429 - RATE LIMITED for symbols: ${symbols.join(', ')}`);
                    await logRequest({ ...logEntry, errorName: 'HTTP_429_RATE_LIMIT' });
                } else if (isForbidden) {
                    console.error(`[YahooFinance] ⚠️ HTTP 403 - FORBIDDEN for symbols: ${symbols.join(', ')}`);
                    await logRequest({ ...logEntry, errorName: 'HTTP_403_FORBIDDEN' });
                } else if (isCrumbError && attemptCount < maxAttempts && this.retryOnCrumbFailure) {
                    // 🔄 Crumb 错误重试逻辑
                    console.warn(`[YahooFinance] Crumb 校验失败，准备重试 (${attemptCount}/${maxAttempts})...`);
                    await logRequest({ ...logEntry, errorName: 'CRUMB_VALIDATION_RETRY' });
                    // 等待 1 秒后重试
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue; // 重试
                } else {
                    // 普通错误
                    console.error('[YahooFinance] 批量查询失败:', error);
                    await logRequest(logEntry);
                }

                // 如果是最后一次尝试或不应重试的错误，退出循环
                if (attemptCount >= maxAttempts || isRateLimited || isForbidden) {
                    break;
                }
            }
        }

        return result;
    }

    /**
     * 获取单个股票价格（向后兼容）
     * 
     * @param symbol - 股票代码
     * @returns 价格数据或 null
     */
    async getPrice(symbol: string): Promise<PriceInCents | null> {
        const result = await this.batchGetPrices([symbol]);
        return result.get(symbol) || null;
    }
}

export const yahooProvider = new YahooFinanceProvider();
