/**
 * @fileOverview 价格服务的类型定义
 * 
 * 定义了价格提供者接口和相关数据结构，支持多种价格数据源（Yahoo Finance, Alpha Vantage 等）
 */

/**
 * 价格数据（以美分为单位）+ 扩展元数据
 * 
 * 🔔 Enhanced for Wealth Pulse System:
 * - 支持基本面数据（longName, sector）
 * - 支持分红信息（dividendDate, dividendYield）
 * - 支持技术面数据（52周高点/低点）
 */
export interface PriceInCents {
    symbol: string;
    priceInCents: number;
    lastUpdated: Date;
    source: 'yahoo' | 'alphavantage' | 'cache';
    
    // 🔔 SMART BRIEFING: Optional dividend information
    dividendInfo?: {
        exDividendDate?: string; // ISO date string
        dividendAmount?: number; // Per share dividend amount
        currency?: string;
        paymentDate?: string;
        dividendYield?: number; // Annual dividend yield (percentage)
    };
    
    // 🌊 WEALTH PULSE: Additional metadata for enhanced features
    metadata?: {
        longName?: string; // Full company name  
        shortName?: string; // Short company name
        sector?: string; // Business sector
        industry?: string; // Industry classification
        
        // Technical indicators
        fiftyTwoWeekHigh?: number; // 52-week high price
        fiftyTwoWeekLow?: number; // 52-week low price
        fiftyDayAverage?: number; // 50-day moving average
        twoHundredDayAverage?: number; // 200-day moving average
        
        // Market data
        marketCap?: number; // Market capitalization
        volume?: number; // Trading volume
        averageVolume?: number; // Average volume
        
        // Fundamental data
        trailingPE?: number; // Trailing P/E ratio
        forwardPE?: number; // Forward P/E ratio
        priceToBook?: number; // Price to book ratio
    };
}

/**
 * 批量价格查询结果
 */
export interface BatchPriceResult {
    /** 成功获取的价格 */
    prices: Map<string, PriceInCents>;
    /** 失败的 symbol 列表 */
    failed: string[];
    /** 从缓存获取的 symbol 列表 */
    fromCache: string[];
    /** 从 API 获取的 symbol 列表 */
    fromAPI: string[];
}

/**
 * 价格提供者接口
 * 
 * 所有价格数据源都需要实现此接口
 */
export interface PriceProvider {
    /** 提供者名称 */
    name: string;

    /**
     * 批量获取股票价格
     * @param symbols - 股票代码数组
     * @returns 价格映射表（symbol -> PriceInCents）
     */
    batchGetPrices(symbols: string[]): Promise<Map<string, PriceInCents>>;

    /**
     * 获取单个股票价格（可选，用于向后兼容）
     * @param symbol - 股票代码
     * @returns 价格数据或 null
     */
    getPrice?(symbol: string): Promise<PriceInCents | null>;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
    /** 缓存有效期（毫秒），默认 10 分钟 */
    ttlMs: number;
    /** 是否启用缓存 */
    enabled: boolean;
}

/**
 * 价格服务配置
 */
export interface PriceServiceConfig {
    /** 主要价格提供者 */
    primaryProvider: PriceProvider;
    /** 备用价格提供者（可选） */
    fallbackProvider?: PriceProvider;
    /** 缓存配置 */
    cache: CacheConfig;
    /** 是否启用频率限制 */
    enableRateLimit: boolean;
}
