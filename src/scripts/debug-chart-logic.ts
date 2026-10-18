
import { Transaction, Currency } from '@/lib/types';
import { addCents, subtractCents, toCents, toUnits, calculateCostBasis } from '@/lib/currencyMath';
import { startOfDay, format, eachDayOfInterval, parseISO, isBefore } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

// --- MOCK DEPENDENCIES ---
// We copy the relevant logic from usePortfolioHistory because we can't run hooks in Node
// We mock getExchangeRate to always return 1 (assuming AUD for simplicity based on user CSV)

const MOCK_FX_RATE = 1;

// --- UTILS (Copied/Mocked) ---
function toISOString(date: any): string {
    if (typeof date === 'string') return date;
    if (date?.toDate) return date.toDate().toISOString();
    if (date instanceof Date) return date.toISOString();
    return new Date().toISOString(); 
}

// --- DATA ---
// Based on user's CSV import
const mockTransactions: any[] = [
    {
        id: '1', transactionDate: '2025-11-01', transactionType: 'income', 
        category: 'Income', amount: 100000.00, quantity: 100000.00, price: 1, 
        currency: 'AUD', impactsCash: true, symbol: ''
    },
    {
        id: '2', transactionDate: '2025-11-06', transactionType: 'buy', 
        symbol: 'IVV', quantity: 80, price: 500.00, 
        currency: 'AUD', impactsCash: true, fee: 0
    },
    // Add logic to test negative cash handling or mixed currencies if needed
];

// --- LOGIC UNDER TEST ---
function runSimulation(transactions: any[]) {
    console.log("🚀 Starting History Simulation...");
    
    // 1. Group by Date
    const txByDate: Record<string, any[]> = {};
    let earliestDate = new Date(); // Start big? No, finding min.
    
    // Initial min date check
    earliestDate = new Date(transactions[0].transactionDate);

    transactions.forEach(tx => {
        const isoDate = toISOString(tx.transactionDate);
        const dateStr = isoDate.split('T')[0];
        if (!txByDate[dateStr]) txByDate[dateStr] = [];
        txByDate[dateStr].push(tx);

        const txDate = new Date(isoDate);
        if (txDate < earliestDate) earliestDate = txDate;
    });

    const today = new Date('2025-11-10'); // Simulate a date shortly after
    const timeline = eachDayOfInterval({
        start: startOfDay(earliestDate),
        end: startOfDay(today),
    });

    // STATE
    const cashBalances: Record<string, number> = {}; 
    const portfolioHoldings: Record<string, number> = {}; 
    const symbolCostBasis: Record<string, { quantity: number; totalCostCents: number }> = {};
    const snapshots: any[] = [];

    timeline.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dailyTxs = txByDate[dateStr] || [];

        console.log(`\n📅 Processing ${dateStr} (${dailyTxs.length} txs)...`);

        dailyTxs.forEach(tx => {
            const txCurrency = tx.currency || 'AUD';
            if (cashBalances[txCurrency] === undefined) cashBalances[txCurrency] = 0;

            const priceInCents = toCents(tx.price || 0);
            const feeInCents = toCents(tx.fee || 0);
            
            // Replicate usePortfolioHistory Logic
            // Note: In original code, totalCostInCents calculation depends on helper
            // Simplification: cost = qty * price + fee
            const totalCostInCents = Math.round((tx.quantity * priceInCents) + feeInCents); 

            if (tx.transactionType === 'income') {
                 cashBalances[txCurrency] += toCents(tx.quantity);
                 console.log(`   ➕ Income: +${tx.quantity} -> Cash=${toUnits(cashBalances[txCurrency])}`);
            }
            else if (tx.transactionType === 'buy') {
                cashBalances[txCurrency] -= totalCostInCents;
                
                // Cost Basis Logic
                portfolioHoldings[tx.symbol] = (portfolioHoldings[tx.symbol] || 0) + tx.quantity;
                if (!symbolCostBasis[tx.symbol]) symbolCostBasis[tx.symbol] = { quantity: 0, totalCostCents: 0 };
                
                symbolCostBasis[tx.symbol].quantity += tx.quantity;
                symbolCostBasis[tx.symbol].totalCostCents += totalCostInCents;
                
                console.log(`   🛒 Buy ${tx.symbol}: CostBasis=${toUnits(symbolCostBasis[tx.symbol].totalCostCents)}`);
            }
        });

        // SNAPSHOT CALC
        let totalCash = 0;
        let totalInvested = 0; // Cost Basis
        let totalMarket = 0;

        // Cash
        Object.values(cashBalances).forEach(c => totalCash += c);

        // Invested (Principal)
        Object.values(symbolCostBasis).forEach(cb => {
            totalInvested += cb.totalCostCents;
        });
        
        // Market (Simplified: Price = Cost for simulation if no price update logic)
        // In real app, price comes from LastKnownPrices. 
        // Let's rely on Cost Basis for Market Value if no price update (matches app logic fallback)
        totalMarket = totalInvested; 

        const principal = toUnits(totalCash + totalInvested);
        const netWorth = toUnits(totalCash + totalMarket); // Should include market value P&L?
        
        // In chart: Principal Line = Cash + CostBasis
        // Area Top = Cash + MarketValue (~NetWorth)
        
        console.log(`   📊 EOD: Cash=${toUnits(totalCash)}  Principal(Cost)=${toUnits(totalInvested)}`);
        console.log(`      -> Principal Line (Cash+Cost) = ${principal}`);
        console.log(`      -> Area Top (NetWorth)        = ${netWorth}`);
        
        snapshots.push({ date: dateStr, principal, netWorth });
    });
    
    return snapshots;
}

runSimulation(mockTransactions);
