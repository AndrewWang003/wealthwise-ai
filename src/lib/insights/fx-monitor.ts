import type { Firestore } from 'firebase/firestore';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { createFxAlertInsight } from './index';

/**
 * 💱 FX MONITOR: Exchange Rate Volatility Detection
 * 
 * Monitors exchange rate changes and generates alerts when
 * volatility exceeds thresholds
 */

interface FxSnapshot {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: number;
}

/**
 * Record an FX rate snapshot for monitoring
 */
export async function recordFxSnapshot(
  firestore: Firestore,
  userId: string,
  snapshot: Omit<FxSnapshot, 'timestamp'>
): Promise<void> {
  const snapshotsRef = collection(firestore, `users/${userId}/fx_snapshots`);
  
  await addDoc(snapshotsRef, {
    ...snapshot,
    timestamp: Date.now(),
    createdAt: serverTimestamp(),
  });
}

/**
 * Check for FX volatility and create alerts if threshold exceeded
 * 
 * @param thresholdPercent - Alert if change exceeds this % (default: 2%)
 * @param windowMinutes - Time window to check (default: 10 minutes)
 */
export async function checkFxVolatility(
  firestore: Firestore,
  userId: string,
  currentRates: Array<{ fromCurrency: string; toCurrency: string; rate: number }>,
  options: {
    thresholdPercent?: number;
    windowMinutes?: number;
  } = {}
): Promise<number> {
  const { thresholdPercent = 2, windowMinutes = 10 } = options;
  const windowMs = windowMinutes * 60 * 1000;
  const cutoffTime = Date.now() - windowMs;

  let alertsCreated = 0;

  for (const current of currentRates) {
    const { fromCurrency, toCurrency, rate: currentRate } = current;

    // Query historical snapshots for this currency pair
    const snapshotsRef = collection(firestore, `users/${userId}/fx_snapshots`);
    const historicalQuery = query(
      snapshotsRef,
      where('fromCurrency', '==', fromCurrency),
      where('toCurrency', '==', toCurrency),
      where('timestamp', '>=', cutoffTime),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(historicalQuery);
    
    if (!snapshot.empty) {
      const oldData = snapshot.docs[0].data();
      const oldRate = oldData.rate;
      const changePercent = Math.abs(((currentRate - oldRate) / oldRate) * 100);

      if (changePercent >= thresholdPercent) {
        console.log(`💱 [FX Monitor] Volatility detected: ${fromCurrency}/${toCurrency} changed ${changePercent.toFixed(2)}%`);
        
        await createFxAlertInsight(firestore, userId, {
          fromCurrency,
          toCurrency,
          oldRate,
          newRate: currentRate,
        });
        
        alertsCreated++;
      }
    }

    // Record current rate as new snapshot
    await recordFxSnapshot(firestore, userId, {
      fromCurrency,
      toCurrency,
      rate: currentRate,
    });
  }

  if (alertsCreated > 0) {
    console.log(`💱 [FX Monitor] Created ${alertsCreated} FX alert(s)`);
  }

  return alertsCreated;
}
