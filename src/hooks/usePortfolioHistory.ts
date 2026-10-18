import { useMemo } from 'react';
import { Transaction, Currency, Account } from '@/lib/types';
import { toCents, toUnits, addCents, subtractCents, calculateCostBasis } from '@/lib/currencyMath';
import { startOfDay, format, eachDayOfInterval, parseISO, isAfter, isBefore, isSameDay } from 'date-fns';

export interface PortfolioSnapshot {
  date: string;       // YYYY-MM-DD
  cash: number;       // Current cash balance in units
  invested: number;   // Invested capital (cost basis) in units
  marketValue?: number; // Estimated Market Value (Holdings * LastPrice)
  netWorth: number;   // Total net worth in units
  passiveSourceValue: number;    // 🌟 NEW: Cumulative Realized Gains + Dividends + Interest (Passive Wealth Source)
}

export interface MonthlyExpense {
  month: string;      // YYYY-MM
  amount: number;     // Total expense amount in units
}

/**
 * Helper: Safely convert transaction date to ISO string
 * Handles both ISO string and Firestore Timestamp objects
 */
function toISOString(date: any): string {
  if (typeof date === 'string') return date;
  if (date?.toDate) return date.toDate().toISOString(); // Firestore Timestamp
  if (date instanceof Date) return date.toISOString();
  return new Date().toISOString(); // Fallback
}

/**
 * usePortfolioHistory hook
 * 
 * Implements "Event Sourcing" logic to replay transactions and generate historical data.
 * 
 * @param transactions - List of transactions from PortfolioContext
 * @returns { history: PortfolioSnapshot[], expensesByMonth: MonthlyExpense[] }
 */
export function usePortfolioHistory(
  transactions: Transaction[],
  accounts: Account[],
  displayCurrency: Currency,
  getExchangeRate: (from: Currency, to: Currency) => number
) {
  return useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return { history: [], expensesByMonth: [] };
    }

    // 1. Group transactions by date
    const txByDate: Record<string, Transaction[]> = {};
    let earliestDate = new Date();

    transactions.forEach(tx => {
      const isoDate = toISOString(tx.transactionDate);
      const dateStr = isoDate.split('T')[0];
      if (!txByDate[dateStr]) txByDate[dateStr] = [];
      txByDate[dateStr].push(tx);

      const txDate = parseISO(isoDate);
      if (isBefore(txDate, earliestDate)) {
        earliestDate = txDate;
      }
    });

    // 2. Generate timeline
    const today = new Date();
    const timeline = eachDayOfInterval({
      start: startOfDay(earliestDate),
      end: startOfDay(today),
    });

    // 3. Replay Loop with Multi-Currency Support
    const snapshots: PortfolioSnapshot[] = [];
    
    // State Tracking
    const cashBalances: Record<string, number> = {}; // Currency -> Cents
    const passiveBalances: Record<string, number> = {}; // 🌟 NEW: Currency -> Cumulative Passive Income Cents
    const portfolioHoldings: Record<string, number> = {}; // Symbol -> Quantity
    const symbolCurrency: Record<string, Currency> = {}; // Symbol -> Currency
    const lastKnownPrices: Record<string, number> = {};   // Symbol -> Price (in Native Currency Cents)
    const symbolCostBasis: Record<string, { quantity: number; totalCostCents: number }> = {};

    timeline.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dailyTxs = txByDate[dateStr] || [];

      dailyTxs.forEach(tx => {
        const shouldImpactCash = tx.impactsCash !== false;
        const txCurrency = tx.currency || 'USD';
        
        // Initialize cash bucket if needed
        if (cashBalances[txCurrency] === undefined) cashBalances[txCurrency] = 0;

        const priceInCents = tx.priceInCents ?? toCents(tx.price || 0);
        const feeInCents = tx.feeInCents ?? toCents(tx.fee || 0);
        const totalCostInCents = tx.costBasisInCents ?? calculateCostBasis(priceInCents, tx.quantity, feeInCents);

        // Update Metadata
        if (tx.symbol) {
            symbolCurrency[tx.symbol] = txCurrency as Currency;
            if (priceInCents > 0) {
                lastKnownPrices[tx.symbol] = priceInCents;
            }
        }

        switch (tx.transactionType) {
          case 'income':
          case 'dividend':
          case 'adjustment':        // Generic adjustment supported
          case 'equity_adjustment': // Treated as cash injection
            if (shouldImpactCash) {
              cashBalances[txCurrency] = addCents(cashBalances[txCurrency], toCents(tx.quantity));
              
              // 🌟 PASSIVE WEALTH: Dividends & Interest
              // Logic: If type is 'dividend', always add. 
              // If type is 'income' and category is 'Interest' (case-insensitive), add.
              const isInterest = tx.transactionType === 'income' && tx.category?.trim().toLowerCase() === 'interest';
              
              if (tx.transactionType === 'dividend' || isInterest) {
                   if (passiveBalances[txCurrency] === undefined) passiveBalances[txCurrency] = 0;
                   passiveBalances[txCurrency] = addCents(passiveBalances[txCurrency], toCents(tx.quantity));
              }
            }
            break;

          case 'expense':
            if (shouldImpactCash) {
              cashBalances[txCurrency] = subtractCents(cashBalances[txCurrency], toCents(tx.quantity));
            }
            break;

          case 'buy':
            if (shouldImpactCash) {
              cashBalances[txCurrency] = subtractCents(cashBalances[txCurrency], totalCostInCents);
            }
            
            if (tx.symbol) {
                portfolioHoldings[tx.symbol] = (portfolioHoldings[tx.symbol] || 0) + tx.quantity;
                
                if (!symbolCostBasis[tx.symbol]) symbolCostBasis[tx.symbol] = { quantity: 0, totalCostCents: 0 };
                symbolCostBasis[tx.symbol].quantity += tx.quantity;
                symbolCostBasis[tx.symbol].totalCostCents += totalCostInCents;
            }
            break;

          case 'sell':
             let realizedCostBasisCents = 0; // Capture cost basis of sold shares

             if (tx.symbol && portfolioHoldings[tx.symbol]) {
                 // Cost Basis Reduction
                 const currentQty = portfolioHoldings[tx.symbol];
                 if (currentQty > 0 && symbolCostBasis[tx.symbol]) {
                     const soldRatio = tx.quantity / symbolCostBasis[tx.symbol].quantity;
                     const originalCostOfSoldShares = Math.round(symbolCostBasis[tx.symbol].totalCostCents * soldRatio);
                     
                     realizedCostBasisCents = originalCostOfSoldShares; // Store for Passive Calculation

                     symbolCostBasis[tx.symbol].totalCostCents -= originalCostOfSoldShares;
                     symbolCostBasis[tx.symbol].quantity -= tx.quantity;
                     if (symbolCostBasis[tx.symbol].quantity <= 0) delete symbolCostBasis[tx.symbol];
                 }
                 
                 portfolioHoldings[tx.symbol] -= tx.quantity;
                 if (portfolioHoldings[tx.symbol] <= 0) delete portfolioHoldings[tx.symbol];
             }

             if (shouldImpactCash) {
               const revenue = Math.round(priceInCents * tx.quantity);
               const proceedsInCents = subtractCents(revenue, feeInCents);
               cashBalances[txCurrency] = addCents(cashBalances[txCurrency], proceedsInCents);

               // 🌟 PASSIVE WEALTH: Realized Gains
               // Only calculate if we successfully identified a cost basis
               if (realizedCostBasisCents > 0) {
                   const realizedPnL = subtractCents(proceedsInCents, realizedCostBasisCents);
                   // Accumulate Passive Income (Realized Gains)
                   if (passiveBalances[txCurrency] === undefined) passiveBalances[txCurrency] = 0;
                   passiveBalances[txCurrency] = addCents(passiveBalances[txCurrency], realizedPnL);
               }
             }
             break;
            
          case 'transfer':
             // Deduct from Source (tx.accountId / tx.currency)
             // Add to Dest (tx.transferAccountId)
             if (shouldImpactCash) {
                 const sourceAccount = accounts.find(a => a.id === tx.accountId);
                 const destAccount = accounts.find(a => a.id === tx.transferAccountId);
                 
                 // 🔧 CRITICAL FIX: Derive currency from Account ID to match Aggregation Logic
                 // If source account is USD, but tx says 'AUD', we must deduct from USD bucket (as that's where the funds left)
                 const sourceCurrency = (sourceAccount?.currency || txCurrency) as Currency;
                 const destCurrency = (destAccount?.currency || txCurrency) as Currency;

                 if (cashBalances[sourceCurrency] === undefined) cashBalances[sourceCurrency] = 0;
                 if (cashBalances[destCurrency] === undefined) cashBalances[destCurrency] = 0;

                 // Source Side: Deduct Quantity
                 cashBalances[sourceCurrency] = subtractCents(cashBalances[sourceCurrency], toCents(tx.quantity));

                 // Dest Side: Add Quantity * Price (FX Rate)
                 // If price is 0/undefined, assume 1:1
                 const transferRate = (tx.price && tx.price > 0) ? tx.price : 1;
                 const destQty = Math.abs(tx.quantity) * transferRate;
                 cashBalances[destCurrency] = addCents(cashBalances[destCurrency], toCents(destQty));
                 
                 // Note: We don't deduct fee here? Usually transfer fee is separate expense or embedded. 
                 // Assuming feeInCents is deduction from source? Or separate? 
                 // Standard practice: Fee is separate expense transaction usually.
             }
             break;

          case 'fx':
             // Handle FX: fromCurrency -> toCurrency
             // Logic assumes symbol format "FROM_TO", e.g. "USD_AUD"
             if (tx.symbol && tx.symbol.includes('_')) {
                 const [from, to] = tx.symbol.split('_');
                 // Outflow from 'from' currency
                 if (cashBalances[from] === undefined) cashBalances[from] = 0;
                 cashBalances[from] = subtractCents(cashBalances[from], toCents(tx.quantity));
                 
                 // Inflow to 'to' currency (calculated from price)
                 // Price is rate? Or total amount? Usually price is rate.
                 // If price is rate: Amount = Qty * Price
                 if (cashBalances[to] === undefined) cashBalances[to] = 0;
                 const convertedAmountInCents = Math.round(priceInCents * tx.quantity);
                 cashBalances[to] = addCents(cashBalances[to], convertedAmountInCents);
             }
            break;
        }
      });
      
      // -- CALCULATE DAILY TOTALS (Converted to Display Currency) --
      
      // 1. Cash Total
      let totalCashDisplayCents = 0;
      Object.entries(cashBalances).forEach(([curr, cents]) => {
          const rate = getExchangeRate(curr as Currency, displayCurrency);
          totalCashDisplayCents += Math.round(cents * rate);
      });

      // 2. Invested & Market Value
      let totalInvestedDisplayCents = 0; // Cost Basis
      let totalMarketDisplayCents = 0;   // Market Value

      Object.entries(portfolioHoldings).forEach(([symbol, qty]) => {
          const symCurrency = symbolCurrency[symbol] || 'USD';
          const rate = getExchangeRate(symCurrency as Currency, displayCurrency);
          
          // Cost Basis
          if (symbolCostBasis[symbol]) {
              const costNativeCents = symbolCostBasis[symbol].totalCostCents;
              // Adjust cost basis for current holding portion if needed? 
              // symbolCostBasis tracks remaining cost, so it is correct for current qty.
              totalInvestedDisplayCents += Math.round(costNativeCents * rate);
          }

          // Market Value
          let priceNativeCents = lastKnownPrices[symbol] || 0;
          // Fallback to average cost if no price
          if (priceNativeCents === 0 && symbolCostBasis[symbol] && symbolCostBasis[symbol].quantity > 0) {
              priceNativeCents = Math.round(symbolCostBasis[symbol].totalCostCents / symbolCostBasis[symbol].quantity);
          }
          
          if (qty > 0 && priceNativeCents > 0) {
              const marketNativeCents = Math.round(qty * priceNativeCents);
              totalMarketDisplayCents += Math.round(marketNativeCents * rate);
          }
      });

      // 3. Passive Wealth Total
      let totalPassiveDisplayCents = 0;
      Object.entries(passiveBalances).forEach(([curr, cents]) => {
           const rate = getExchangeRate(curr as Currency, displayCurrency);
           totalPassiveDisplayCents += Math.round(cents * rate);
      });

      const netWorthCents = addCents(totalCashDisplayCents, totalMarketDisplayCents);

      snapshots.push({
        date: dateStr,
        cash: toUnits(totalCashDisplayCents),
        invested: toUnits(totalInvestedDisplayCents),
        marketValue: toUnits(totalMarketDisplayCents),
        netWorth: toUnits(netWorthCents),
        passiveSourceValue: toUnits(totalPassiveDisplayCents)
      });
    });

    // 4. Expenses (Converted to Display Currency at END of month? Or transaction time?)
    // For simplicity, convert at transaction time logic
    const monthlyExpenses: Record<string, number> = {};
    transactions
      .filter(tx => tx.transactionType === 'expense')
      .forEach(tx => {
        const monthKey = toISOString(tx.transactionDate).substring(0, 7);
        const txCurrency = tx.currency || 'USD';
        const rate = getExchangeRate(txCurrency as Currency, displayCurrency);
        const amountCents = Math.round(toCents(tx.quantity) * rate);
        
        monthlyExpenses[monthKey] = addCents(monthlyExpenses[monthKey] || 0, amountCents);
      });

    const expensesByMonth: MonthlyExpense[] = Object.entries(monthlyExpenses)
      .map(([month, cents]) => ({
        month,
        amount: Number(toUnits(cents).toFixed(2))
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      history: snapshots,
      expensesByMonth
    };
  }, [transactions, accounts, displayCurrency, getExchangeRate]);
}
