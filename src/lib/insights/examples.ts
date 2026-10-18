/**
 * 🔔 SMART BRIEFING EXAMPLE
 * 
 * This file demonstrates how to integrate Smart Briefing into existing components
 */

import { BatchPriceService } from '@/lib/pricing/batch-price-service';
import { yahooProvider } from '@/lib/pricing/yahoo-provider';
import { checkFxVolatility } from '@/lib/insights/fx-monitor';
import { createPriceAlertInsight } from '@/lib/insights';
import { db } from '@/lib/firebase/clientApp';

/**
 * Example 1: Check dividends when refreshing prices
 * 
 * Integration point: PositionsTable.tsx or any price refresh logic
 */
export async function exampleDividendCheck(userId: string) {
  const batchService = new BatchPriceService(yahooProvider);
  
  // Get latest prices for holdings
  const symbols = ['AAPL', 'MSFT', 'QQQ'];
  const result = await batchService.batchGetPrices(symbols, userId);
  
  // 🔔 SMART BRIEFING: Check for upcoming dividends
  if (result.prices.size > 0) {
    const insightsCreated = await batchService.checkDividends(
      Array.from(result.prices.values()),
      userId,
      7 // Alert if ex-dividend date is within 7 days
    );
    
    console.log(`Created ${insightsCreated} dividend insights`);
  }
}

/**
 * Example 2: Monitor FX volatility
 * 
 * Integration point: PortfolioContext.tsx when exchange rates update
 */
export async function exampleFxMonitor(userId: string, exchangeRates: any[]) {
  // Transform exchange rates to the expected format
  const currentRates = exchangeRates.map(rate => ({
    fromCurrency: rate.fromCurrency,
    toCurrency: rate.toCurrency,
    rate: rate.rate,
  }));
  
  // 🔔 SMART BRIEFING: Check for significant FX movements
  const alertsCreated = await checkFxVolatility(
    db,
    userId,
    currentRates,
    {
      thresholdPercent: 2,  // Alert if change > 2%
      windowMinutes: 10     // Compare with rates from 10 min ago
    }
  );
  
  console.log(`Created ${alertsCreated} FX alerts`);
}

/**
 * Example 3: Create price alert manually
 * 
 * Integration point: When detecting significant price changes
 */
export async function examplePriceAlert(userId: string) {
  await createPriceAlertInsight(db, userId, {
    symbol: 'TSLA',
    previousPrice: 250.00,
    currentPrice: 275.50,
    currency: 'USD',
  });
  
  console.log('Price alert created for TSLA');
}

/**
 * Example 4: Simulating dividend data from Yahoo Finance
 * 
 * Note: In real implementation, this data would come from
 * the Yahoo Finance API response
 */
export function simulateDividendData() {
  return {
    symbol: 'AAPL',
    priceInCents: 26236, // $262.36
    lastUpdated: new Date(),
    source: 'yahoo' as const,
    dividendInfo: {
      exDividendDate: '2026-01-15', // 7 days from now
      dividendAmount: 0.24,
      currency: 'USD',
      paymentDate: '2026-01-22',
    },
  };
}
