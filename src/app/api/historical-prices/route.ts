/**
 * API Route: 获取多标的历史价格数据
 * 
 * 用于风险分析的虚拟回测
 */

import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// v3 必须先实例化（参考 yahoo-provider.ts 第57行）
// 抑制 historical() deprecated 警告（内部会自动映射到 chart()）
const yahooFinance = new YahooFinance({ 
  suppressNotices: ['ripHistorical'] 
});

interface HistoricalPriceRequest {
  symbols: string[];
  days?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: HistoricalPriceRequest = await request.json();
    const { symbols, days = 365 } = body;

    if (!symbols || symbols.length === 0) {
      return NextResponse.json(
        { error: 'Symbols are required' },
        { status: 400 }
      );
    }

    console.log(`[Historical Prices API] Fetching ${symbols.length} symbols for ${days} days`);

    // 使用 Date 对象（v3 标准）
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    console.log(`[Historical Prices API] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // 批量获取历史数据
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          console.log(`[Historical Prices API] Fetching ${symbol}...`);
          
          // v3 标准用法：使用 historical 方法，传入 Date 对象
          const data = await yahooFinance.historical(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d',
          });

          if (!data || !Array.isArray(data) || data.length === 0) {
            console.warn(`[Historical Prices API] No data for ${symbol}`);
            return {
              symbol,
              data: [],
              success: false,
              error: 'No data available',
            };
          }

          const formatted = data.map((point: any) => ({
            date: point.date instanceof Date 
              ? point.date.toISOString().split('T')[0]
              : new Date(point.date).toISOString().split('T')[0],
            close: point.close,
          }));

          console.log(`[Historical Prices API] ✅ ${symbol}: ${formatted.length} points`);

          return {
            symbol,
            data: formatted,
            success: true,
          };
        } catch (error) {
          console.error(`[Historical Prices API] ❌ ${symbol} fetch failed:`, error);
          return {
            symbol,
            data: [],
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return NextResponse.json({
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Historical Prices API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical prices' },
      { status: 500 }
    );
  }
}
