import { useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface SnapshotData {
  netWorth: number;
  totalAssets: number;
  totalCash: number;
  currency: string;
}

export function useDailySnapshot(data: SnapshotData | null) {
  const { user } = useUser();
  const firestore = useFirestore();

  // Destructure to use primitives in dependency array
  const netWorth = data?.netWorth;
  const totalAssets = data?.totalAssets;
  const totalCash = data?.totalCash;
  const currency = data?.currency;

  useEffect(() => {
    async function checkAndCreateSnapshot() {
      if (!user || !netWorth) return; // Basic check

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const snapshotRef = doc(firestore, `users/${user.uid}/daily_snapshots/${today}`);

      try {
        const snapshotSnap = await getDoc(snapshotRef);

        if (!snapshotSnap.exists()) {
          console.log(`📸 Creating daily snapshot for ${today}...`);
          await setDoc(snapshotRef, {
            date: today,
            netWorth: netWorth,
            totalAssets: totalAssets || 0,
            totalCash: totalCash || 0,
            currency: currency || 'USD',
            createdAt: serverTimestamp(),
          });
          console.log(`✅ Daily snapshot created for ${today}`);
        } else {
          // Optional: Update if needed, or just ignore
          console.log(`📸 Snapshot for ${today} already exists.`);
        }
      } catch (err) {
        console.error("❌ Failed to create daily snapshot:", err);
      }
    }

    checkAndCreateSnapshot();
  }, [user, firestore, netWorth, totalAssets, totalCash, currency]);
}
