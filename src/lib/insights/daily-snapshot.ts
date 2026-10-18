import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

/**
 * 💰 WEALTH PULSE: Daily Snapshot System
 * 
 * Records portfolio snapshots at midnight (user's local timezone)
 * to track daily wealth changes
 */

export interface DailySnapshot {
  userId: string;
  date: string; // YYYY-MM-DD in user's local timezone
  totalValue: number;
  currency: string;
  createdAt: any; // Firestore serverTimestamp
  positions?: {
    symbol: string;
    value: number;
  }[];
}

/**
 * Get today's date string in YYYY-MM-DD format (Strict Local Timezone)
 * Uses Intl.DateTimeFormat to ensure alignment with user's wall-clock time.
 */
export function getTodayDateString(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Format: "YYYY-MM-DD" in local time
    // en-CA is the best locale for ISO 8601 format (YYYY-MM-DD)
    return new Intl.DateTimeFormat('en-CA', { 
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (e) {
    // Fallback if Intl fails
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Check if a snapshot exists for today
 */
export async function getTodaySnapshot(
  firestore: Firestore,
  userId: string
): Promise<DailySnapshot | null> {
  const today = getTodayDateString();
  const snapshotRef = doc(firestore, `users/${userId}/daily_snapshots/${today}`);
  
  try {
    const snapshot = await getDoc(snapshotRef);
    if (snapshot.exists()) {
      return snapshot.data() as DailySnapshot;
    }
  } catch (error) {
    console.error('[Snapshot] Error fetching today snapshot:', error);
  }
  
  return null;
}

/**
 * Get yesterday's snapshot for comparison
 */
export async function getYesterdaySnapshot(
  firestore: Firestore,
  userId: string
): Promise<DailySnapshot | null> {
  let yesterdayStr: string;

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    yesterdayStr = new Intl.DateTimeFormat('en-CA', { 
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(yesterday);
  } catch (e) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1); // Fallback
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    yesterdayStr = `${year}-${month}-${day}`;
  }
  
  const snapshotRef = doc(firestore, `users/${userId}/daily_snapshots/${yesterdayStr}`);
  
  try {
    const snapshot = await getDoc(snapshotRef);
    if (snapshot.exists()) {
      return snapshot.data() as DailySnapshot;
    }
  } catch (error) {
    console.error('[Snapshot] Error fetching yesterday snapshot:', error);
  }
  
  return null;
}

/**
 * Create or update today's snapshot
 * 
 * @param firestore - Firestore instance
 * @param userId - User ID
 * @param totalValue - Current total portfolio value
 * @param currency - Display currency
 * @param positions - Optional position details
 */
export async function createDailySnapshot(
  firestore: Firestore,
  userId: string,
  totalValue: number,
  currency: string,
  positions?: { symbol: string; value: number }[]
): Promise<void> {
  const today = getTodayDateString();
  const snapshotRef = doc(firestore, `users/${userId}/daily_snapshots/${today}`);
  
  // Check if snapshot already exists
  const existing = await getDoc(snapshotRef);
  if (existing.exists()) {
    console.log(`[Snapshot] Snapshot for ${today} already exists, skipping`);
    return;
  }
  
  const snapshot: any = {
    userId,
    date: today,
    totalValue,
    currency,
    createdAt: serverTimestamp(),
  };

  if (positions) {
    snapshot.positions = positions;
  }
  
  try {
    await setDoc(snapshotRef, snapshot);
    console.log(`💰 [Snapshot] Created snapshot for ${today}: ${currency} ${totalValue.toFixed(2)}`);
  } catch (error) {
    console.error('[Snapshot] Error creating snapshot:', error);
    throw error;
  }
}

/**
 * Calculate daily change
 * 
 * @returns {amount, percent, hasSnapshot} or null if no yesterday snapshot
 */
export async function calculateDailyChange(
  firestore: Firestore,
  userId: string,
  currentValue: number
): Promise<{
  amount: number;
  percent: number;
  previousValue: number;
  hasSnapshot: boolean;
} | null> {
  const yesterdaySnapshot = await getYesterdaySnapshot(firestore, userId);
  
  if (!yesterdaySnapshot) {
    return null;
  }
  
  const amount = currentValue - yesterdaySnapshot.totalValue;
  const percent = yesterdaySnapshot.totalValue !== 0
    ? (amount / yesterdaySnapshot.totalValue) * 100
    : 0;
  
  return {
    amount,
    percent,
    previousValue: yesterdaySnapshot.totalValue,
    hasSnapshot: true,
  };
}
