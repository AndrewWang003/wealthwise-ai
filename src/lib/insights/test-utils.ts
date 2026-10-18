/**
 * 🔔 SMART BRIEFING TEST UTILITIES
 * 
 * Helper functions to create test insights for UI development
 */

import { db } from '@/lib/firebase/clientApp';
import { createDividendInsight, createFxAlertInsight, createPriceAlertInsight } from './index';

/**
 * Create a test dividend insight
 */
export async function createTestDividendInsight(userId: string) {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  return await createDividendInsight(db, userId, {
    symbol: 'AAPL',
    exDividendDate: threeDaysFromNow.toISOString().split('T')[0],
    dividendAmount: 0.24,
    currency: 'USD',
  });
}

/**
 * Create a test FX alert insight
 */
export async function createTestFxAlert(userId: string) {
  return await createFxAlertInsight(db, userId, {
    fromCurrency: 'USD',
    toCurrency: 'AUD',
    oldRate: 1.4895,
    newRate: 1.5404,
  });
}

/**
 * Create a test price alert insight
 */
export async function createTestPriceAlert(userId: string) {
  return await createPriceAlertInsight(db, userId, {
    symbol: 'TSLA',
    previousPrice: 250.00,
    currentPrice: 275.50,
    currency: 'USD',
  });
}

/**
 * Create all test insights at once
 */
export async function createAllTestInsights(userId: string) {
  console.log('🔔 Creating test insights...');
  
  const results = await Promise.allSettled([
    createTestDividendInsight(userId),
    createTestFxAlert(userId),
    createTestPriceAlert(userId),
  ]);

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`✅ Created ${successful} test insights, ${failed} failed`);
  
  return { successful, failed };
}

/**
 * Usage example:
 * 
 * // In browser console or component:
 * import { createAllTestInsights } from '@/lib/insights/test-utils';
 * import { useUser } from '@/contexts/UserContext';
 * 
 * const { user } = useUser();
 * if (user) {
 *   createAllTestInsights(user.uid);
 * }
 */
