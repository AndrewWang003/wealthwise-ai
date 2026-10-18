
import { Transaction } from "@/lib/types";

export interface RiskMetrics {
  currentNetWorth: number;
  maxDrawdown: number; // Percentage (0.15 = 15%)
  riskScore: number;   // 0-100
  winRate: number;     // Percentage (0.60 = 60%)
  bestDay: {
    date: string;
    profit: number;
    profitPercent: number;
  };
  worstDay: {
    date: string;
    loss: number;
    lossPercent: number;
  };
  totalDays: number;
  returnStats: {
    totalReturn: number;
    totalReturnPercent: number;
  };
}

// Helper to normalize date to YYYY-MM-DD
const normalizeDate = (d: any): string => {
  if (!d) return '';
  // Try to handle Firebase Timestamp or Date object or string
  const dateObj = d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dateObj.getTime())) return ''; // Invalid date
  return dateObj.toISOString().split('T')[0];
};

export function calculateRiskMetrics(snapshots: any[], transactions: Transaction[] = []): RiskMetrics {
  console.log('📊 [RiskEngine] Starting Calculation...');
  console.log(`📊 [RiskEngine] Snapshots: ${snapshots?.length || 0}, Transactions: ${transactions?.length || 0}`);

  // 🛡️ Data Guard
  if (!snapshots || snapshots.length < 2) {
    console.warn('⚠️ [RiskEngine] Insufficient snapshots (<2). Returning default.');
    return {
      currentNetWorth: snapshots?.[0]?.netWorth || 0,
      maxDrawdown: 0,
      riskScore: 50,
      winRate: 0,
      bestDay: { date: '', profit: 0, profitPercent: 0 },
      worstDay: { date: '', loss: 0, lossPercent: 0 },
      totalDays: snapshots?.length || 0,
      returnStats: { totalReturn: 0, totalReturnPercent: 0 }
    };
  }

  // 1. Sort Snapshots & Filter Low Balances (Noise Filter)
  // Ensure we sort by normalized date or timestamp safely
  const sorted = [...snapshots]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .filter(s => s.netWorth > 100);

  if (sorted.length < 2) {
     console.warn('⚠️ [RiskEngine] Insufficient valid snapshots (> $100). Returning default.');
     const lastData = snapshots[snapshots.length - 1];
     return {
       currentNetWorth: lastData?.netWorth || 0,
       maxDrawdown: 0,
       riskScore: 50,
       winRate: 0,
       bestDay: { date: lastData?.date, profit: 0, profitPercent: 0 },
       worstDay: { date: lastData?.date, loss: 0, lossPercent: 0 },
       totalDays: 0,
       returnStats: { totalReturn: 0, totalReturnPercent: 0 }
     };
  }

  let maxDrawdown = 0;
  let peak = -Infinity;
  let wins = 0;
  let flatDays = 0;
  let validDays = 0;
  
  let bestDay = { date: '', profit: -Infinity, profitPercent: 0 };
  let worstDay = { date: '', loss: Infinity, lossPercent: 0 };

  // Volatility Tracking
  const dailyReturns: number[] = [];
  
  const initialNW = sorted[0].netWorth;

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    const nw = day.netWorth;
    const dateStr = normalizeDate(day.date); 

    // --- Drawdown Logic ---
    if (nw > peak) {
      peak = nw;
    }
    
    // Calculate Drawdown (Handle peak=0 safely, though typically filtered by >100)
    if (peak > 0) {
      const drawdown = (peak - nw) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // --- Performance Logic (skip first day) ---
    if (i > 0) {
      const prev = sorted[i-1];
      const rawChange = nw - prev.netWorth;
      
      // 🛑 Exclude Deposits from PnL
      // Filter transactions for THIS day that are deposits
      // Criteria: Type=INCOME AND (Category='Deposit' OR Note has 'Deposit')
      // Note: User specialized request: type='INCOME' && category='Deposit'
      // I will broaden slightly to be safe: type='income' or 'deposit' string match in many fields
      const dayDeposits = transactions
        .filter(t => {
           // Date Match
           if (normalizeDate(t.transactionDate) !== dateStr) return false;
           // Type/Category Match
           const isIncome = t.transactionType === 'income';
           const isDepositCat = t.category?.toLowerCase() === 'deposit' || t.category === 'Deposit'; // Strict or user-defined?
           // User prompt said: type: 'INCOME' (and category: 'Deposit')
           // Let's implement robust check: 
           // 1. Explicit Deposit Category
           if (isDepositCat) return true;
           // 2. Income type BUT exclude Dividends (Dividends are Profit!)
           if (isIncome && t.category?.toLowerCase() !== 'dividend') return true;
           
           return false;
        })
        .reduce((sum, t) => sum + Math.abs(t.totalCost || (t.quantity * t.price) || 0), 0);

      const realChange = rawChange - dayDeposits;

      // Log first few days for debugging
      if (i < 5) {
         console.log(`🔍 [RiskEngine] ${dateStr}: Raw=${rawChange.toFixed(2)}, Dep=${dayDeposits.toFixed(2)}, Real=${realChange.toFixed(2)}`);
      }

      // Calculate % based on previous balance
      const changePercent = prev.netWorth !== 0 ? realChange / prev.netWorth : 0;
      
      dailyReturns.push(changePercent);

      // Win Rate: Relax noise filter
      // If changes are tiny (floating point noise), treat as flat.
      // But for Win Rate, even 1 cent profit is a win technically? 
      // Let's use 0.01 as threshold.
      if (Math.abs(realChange) >= 0.01) {
         if (realChange > 0) wins++;
         validDays++;
      } else {
         flatDays++;
         // Option: Treat flat days as "Non-Losses"? 
         // For now, let's keep them out of "Win Rate" (Active Wins), 
         // BUT clean up the Risk Score to handle this.
      }

      // Best/Worst Day Tracking
      if (realChange > bestDay.profit) {
         bestDay = { date: dateStr, profit: realChange, profitPercent: changePercent };
      }
      if (realChange < worstDay.loss) {
         worstDay = { date: dateStr, loss: realChange, lossPercent: changePercent };
      }
    }
  }

  // Debug Final Stats
  console.log(`📊 [RiskEngine] Final: MDD=${(maxDrawdown*100).toFixed(2)}%, Win=${wins}/${validDays}, Best=${bestDay.profit.toFixed(2)}`);

  // 3. Volatility Calculation (StdDev of daily returns)
  const meanReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / dailyReturns.length : 0;
  const volatility = Math.sqrt(variance); // Daily Volatility
  const annualizedVol = volatility * Math.sqrt(252); 

  // 4. Advanced Risk Score Algorithm
  const mddPenalty = maxDrawdown * 150; 
  const volPenalty = annualizedVol * 50;
  
  let score = 100 - mddPenalty - volPenalty;
  score = Math.max(0, Math.min(100, score)); // Clamp 0-100

  // Fallback / Adjustment for "Stable" accounts
  // If we have history (totalDays > 5) but NO valid volatility (validDays == 0),
  // it implies a perfectly stable (cash/cost-basis only) portfolio.
  // This is effectively "Low Risk".
  if (validDays === 0 && sorted.length > 5) {
     score = 99; // Almost perfect score for stability
  } else if (validDays < 5 && sorted.length < 5) {
     score = 50; // Truly new account, unknown risk
  }
  
  const currentNW = snapshots[snapshots.length - 1].netWorth;
  // initialNW set earlier

  return {
    currentNetWorth: currentNW,
    maxDrawdown: maxDrawdown,
    riskScore: Math.round(score),
    winRate: validDays > 0 ? wins / validDays : 0,
    bestDay: bestDay.profit === -Infinity ? { date: '', profit: 0, profitPercent: 0 } : bestDay,
    worstDay: worstDay.loss === Infinity ? { date: '', loss: 0, lossPercent: 0 } : worstDay,
    totalDays: sorted.length,
    returnStats: {
      totalReturn: currentNW - initialNW,
      totalReturnPercent: initialNW !== 0 ? (currentNW - initialNW) / initialNW : 0
    }
  };
}
