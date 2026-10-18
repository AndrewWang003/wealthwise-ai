import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Insight, InsightType, InsightPriority } from '@/lib/types';

/**
 * 🔔 SMART BRIEFING: Insight Management
 * 
 * Utilities for creating and managing intelligent insights/notifications
 */

interface CreateInsightParams {
  userId: string;
  type: InsightType;
  title: string;
  content: string;
  priority?: InsightPriority;
  metadata?: Insight['metadata'];
}

/**
 * Create a new insight in Firestore
 */
export async function createInsight(
  firestore: Firestore,
  params: CreateInsightParams
): Promise<string> {
  const { userId, type, title, content, priority = 'medium', metadata } = params;

  // Check for duplicate insights in the last 24 hours
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  const insightsRef = collection(firestore, `users/${userId}/insights`);
  const duplicateQuery = query(
    insightsRef,
    where('type', '==', type),
    where('title', '==', title),
    where('status', '==', 'unread')
  );

  const existingInsights = await getDocs(duplicateQuery);
  
  // Don't create duplicate if one exists
  if (!existingInsights.empty) {
    console.log(`🔔 [Insight] Duplicate detected, skipping: ${title}`);
    return existingInsights.docs[0].id;
  }

  // Create new insight
  const insight: Omit<Insight, 'id'> = {
    userId,
    type,
    title,
    content,
    status: 'unread',
    priority,
    createdAt: serverTimestamp(),
    metadata,
  };

  const docRef = await addDoc(insightsRef, insight);
  console.log(`🔔 [Insight] Created: ${type} - ${title} (ID: ${docRef.id})`);
  
  return docRef.id;
}

/**
 * 💰 DIVIDEND ALERT: Create insight for upcoming ex-dividend date
 */
export async function createDividendInsight(
  firestore: Firestore,
  userId: string,
  params: {
    symbol: string;
    exDividendDate: string;
    dividendAmount?: number;
    currency?: string;
  }
): Promise<string> {
  const { symbol, exDividendDate, dividendAmount, currency } = params;
  
  const exDate = new Date(exDividendDate);
  const daysUntil = Math.ceil((exDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  let priority: InsightPriority = 'low';
  if (daysUntil <= 1) priority = 'high';
  else if (daysUntil <= 3) priority = 'medium';

  const dividendInfo = dividendAmount 
    ? ` (${currency || 'USD'} ${dividendAmount.toFixed(2)})`
    : '';

  return createInsight(firestore, {
    userId,
    type: 'dividend',
    title: `📊 ${symbol} Ex-Dividend Date Approaching`,
    content: `${symbol} will go ex-dividend in ${daysUntil} day(s) on ${exDate.toLocaleDateString()}${dividendInfo}. ` +
             `To receive the dividend, you must hold shares before the ex-dividend date.`,
    priority,
    metadata: {
      symbol,
      exDividendDate,
      dividendAmount,
      currency,
      actionUrl: '/positions',
      actionLabel: 'View Holdings',
    },
  });
}

/**
 * 💱 FX ALERT: Create insight for significant exchange rate changes
 */
export async function createFxAlertInsight(
  firestore: Firestore,
  userId: string,
  params: {
    fromCurrency: string;
    toCurrency: string;
    oldRate: number;
    newRate: number;
  }
): Promise<string> {
  const { fromCurrency, toCurrency, oldRate, newRate } = params;
  
  const changePercent = ((newRate - oldRate) / oldRate) * 100;
  const direction = changePercent > 0 ? 'increased' : 'decreased';
  const absChange = Math.abs(changePercent);

  let priority: InsightPriority = 'medium';
  if (absChange >= 5) priority = 'critical';
  else if (absChange >= 3) priority = 'high';

  return createInsight(firestore, {
    userId,
    type: 'fx_alert',
    title: `⚠️ Significant FX Movement: ${fromCurrency}/${toCurrency}`,
    content: `The exchange rate for ${fromCurrency} to ${toCurrency} has ${direction} by ${absChange.toFixed(2)}% ` +
             `(from ${oldRate.toFixed(4)} to ${newRate.toFixed(4)}). ` +
             `This may impact your portfolio value if you hold assets in ${fromCurrency}.`,
    priority,
    metadata: {
      fromCurrency,
      toCurrency,
      oldRate,
      newRate,
      changePercent,
      actionUrl: '/positions',
      actionLabel: 'Review Positions',
    },
  });
}

/**
 * 📊 PRICE ALERT: Create insight for significant price changes
 */
export async function createPriceAlertInsight(
  firestore: Firestore,
  userId: string,
  params: {
    symbol: string;
    previousPrice: number;
    currentPrice: number;
    currency?: string;
  }
): Promise<string> {
  const { symbol, previousPrice, currentPrice, currency = 'USD' } = params;
  
  const changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
  const direction = changePercent > 0 ? '📈 up' : '📉 down';
  const absChange = Math.abs(changePercent);

  let priority: InsightPriority = 'low';
  if (absChange >= 10) priority = 'high';
  else if (absChange >= 5) priority = 'medium';

  return createInsight(firestore, {
    userId,
    type: 'price_alert',
    title: `${symbol} moved ${direction} ${absChange.toFixed(1)}%`,
    content: `${symbol} changed from ${currency} ${previousPrice.toFixed(2)} to ${currency} ${currentPrice.toFixed(2)} ` +
             `(${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%).`,
    priority,
    metadata: {
      symbol,
      previousPrice,
      currentPrice,
      currency,
      actionUrl: '/positions',
      actionLabel: 'View Position',
    },
  });
}
