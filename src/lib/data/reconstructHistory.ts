
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  writeBatch, 
  doc, 
  Timestamp 
} from 'firebase/firestore';
import { Transaction } from '@/lib/types';

/**
 * Reconstructs daily snapshots by replaying all transactions from the beginning.
 * 
 * Logic:
 * 1. Fetch all transactions (sorted date asc).
 * 2. Identify start date.
 * 3. Iterate day by day:
 *    - Apply transactions for that day to rolling state (Cash, Asset Cost).
 *    - Save { date, netWorth, totalAssets, totalCash, ... } to snapshot.
 * 
 * Note: Asset Value is approximated by Cost Basis (Invested Capital) as we lack historical market prices.
 */
export async function reconstructHistory(userId: string, firestore: any): Promise<number> {
  // 1. Fetch ALL transactions
  console.log('开始获取用户交易记录...', userId);
  const txRef = collection(firestore, `users/${userId}/transactions`);
  const q = query(txRef, orderBy('transactionDate', 'asc')); // Oldest first
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log('获取到交易数量: 0');
    return 0;
  }

  const transactions = snapshot.docs.map(d => ({ 
    ...d.data(), 
    id: d.id,
    // Ensure accurate date object
    transactionDateObj: new Date(d.data().transactionDate)
  })) as (Transaction & { transactionDateObj: Date })[];

  console.log('获取到交易数量:', transactions.length);

  // 2. Setup state
  let currentCash = 0; // Total cash in base currency (assumed converted/normalized if multiple)
  let currentAssetCost = 0; // Total invested capital
  
  // Map transactions by date string (YYYY-MM-DD) for fast lookup
  const txByDate: Record<string, typeof transactions> = {};
  
  transactions.forEach(tx => {
    const dateStr = tx.transactionDateObj.toISOString().split('T')[0];
    if (!txByDate[dateStr]) txByDate[dateStr] = [];
    txByDate[dateStr].push(tx);
  });

  // 3. Determine Date Range
  const startDate = transactions[0].transactionDateObj;
  const endDate = new Date(); // Today
  
  // Normalize start date to midnight
  startDate.setHours(0,0,0,0);
  endDate.setHours(0,0,0,0);

  // 4. Batch Setup
  let batch = writeBatch(firestore);
  let opCount = 0;
  let totalSnapshots = 0;

  // 5. Replay Loop
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayTxs = txByDate[dateStr] || [];

    // Apply transactions for THIS day
    for (const tx of dayTxs) {
      // Amount handling (Naive assumption: everything is normalized to main currency or we just sum raw values if mixed. 
      // Ideally should handle currency conversion, but for "Reconstruct" debug tool, we assume 'totalCost' is the value to track).
      // We use 'totalCost' which usually represents the base currency value of the transaction.
      
      const amount = Math.abs(tx.totalCost ?? ((tx.quantity * tx.price) + tx.fee)); // Always positive magnitude

      // --- Cash Impact ---
      if (tx.impactsCash !== false) { // Default is true usually
         if (['income', 'sell', 'dividend'].includes(tx.transactionType)) {
             currentCash += amount;
         } else if (['expense', 'buy'].includes(tx.transactionType)) {
             currentCash -= amount;
         }
         // 'fx' ? If it's a swap, it depends. usually handled as separate out/in or just ignored in net worth if balanced.
         // Let's assume 'fx' keeps net worth same roughly, but might change cash balance. 
         // Implementation complexity: FX splits cash into buckets. Here we use 'Aggregate Cash Value'.
         // If I swap 100 USD to 150 AUD. Cash value (in AUD terms) changes from (100*Rate) to 150. 
         // If totalCost is expressed in display currency, it's fine.
      }

      // --- Asset Impact (Invested Capital) ---
      // We track "Cost Basis" as proxy for Asset Value
      if (tx.transactionType === 'buy') {
         currentAssetCost += amount;
      } else if (tx.transactionType === 'sell') {
         // Naively reduce asset cost. Ideally should reduce by specific cost basis of sold lot.
         // If unavailable, reduce by sales proceeds (which implicitly realizes gain/loss into Cash).
         // Example: Buy 100. Asset=100. Sell 120. Cash+=120. Asset-=120? Asset=-20? 
         // If we subtract 'amount' (sales value), we effectively move 'value' from Asset to Cash.
         // This preserves Net Worth (100 -> 120). 
         // But "Asset Cost" metric becomes distorted (negative). 
         // However, "Net Worth" = Cash + Asset. 
         // Before Sell: Cash 0, Asset 100. NW 100.
         // Sell 120: Cash 120. Asset (100 - 120 = -20). NW 100. 
         // Real Gain was 20. But it's hidden. 
         // User Prompt says: "Asset Cost: Accumulate BUY - SELL". So we do exactly that.
         currentAssetCost -= amount;
      }
    }

    // Snapshot Data
    const netWorth = currentCash + currentAssetCost;
    
    if (totalSnapshots % 30 === 0) {
      console.log('正在计算日期:', dateStr, '当日净值:', netWorth);
    }

    // Write to Firestore
    const snapRef = doc(firestore, `users/${userId}/daily_snapshots/${dateStr}`);
    batch.set(snapRef, {
       date: dateStr,
       netWorth: Number(netWorth.toFixed(2)),
       totalAssets: Number(currentAssetCost.toFixed(2)),
       totalCash: Number(currentCash.toFixed(2)), 
       assetCount: 0, // Placeholder
       updatedAt: Timestamp.now()
    });
    
    opCount++;
    totalSnapshots++;

    // Commit batch if limit reached (500)
    if (opCount >= 450) {
       console.log('提交Batch...');
       await batch.commit();
       batch = writeBatch(firestore);
       opCount = 0;
    }

    // Next Day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Final Commit
  if (opCount > 0) {
    console.log('提交最终Batch, 数量:', opCount);
    await batch.commit();
  }

  return totalSnapshots;
}
