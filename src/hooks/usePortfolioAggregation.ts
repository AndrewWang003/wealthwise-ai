import { useMemo, useCallback } from 'react';
import { Transaction, Market, Currency, AssetClass, Account } from '@/lib/types';
import { toCents, toUnits, calculateCostBasis, addCents, subtractCents } from '@/lib/currencyMath';

export interface AggregatedPosition {
    symbol: string;
    totalQuantity: number;      // Can be negative for short positions
    averageCost: number;
    realizedPL: number;         // 🆕 Cumulative realized P&L for this symbol
    isShort: boolean;           // 🆕 true if totalQuantity < 0
    market: Market;
    currency: Currency;
    assetClass: AssetClass;
    isCash?: boolean;
    isDefault?: boolean;        // 🆕 true if this is a default account
}

/**
 * 💎 Portfolio Metrics - 明确区分本金和收益
 * 
 * 核心公式：
 * - NetWorth = Σ(all transactions)
 * - TotalPrincipal = Σ(transactions where isPrincipal = true)
 * - TotalReturns = NetWorth - TotalPrincipal
 */
export interface PortfolioMetrics {
    netWorth: number;           // 总资产（所有持仓市值 + 现金）
    totalPrincipal: number;     // 总本金（所有 isPrincipal: true 的交易）
    totalReturns: number;       // 总收益（NetWorth - TotalPrincipal）
    returnPercentage: number;   // 收益率（TotalReturns / TotalPrincipal * 100）
}

/**
 * 判断交易是否为本金类交易
 * 
 * 本金类交易特征：
 * 1. isPrincipal: true（显式标记）
 * 2. transactionType === 'equity_adjustment'（权益调整）
 */
export function isPrincipalTransaction(tx: Transaction): boolean {
    return tx.isPrincipal === true || tx.transactionType === 'equity_adjustment';
}

/**
 * 计算总本金（InCents 模式）
 */
export function calculateTotalPrincipalInCents(transactions: Transaction[]): number {
    let totalInCents = 0;

    transactions.forEach(tx => {
        if (isPrincipalTransaction(tx) && tx.impactsCash !== false) {
            const amountInCents = toCents(tx.quantity || 0);
            totalInCents = addCents(totalInCents, amountInCents);
        }
    });

    return totalInCents;
}

/**
 * Optimized structure for AI analysis to minimize token usage.
 */
export interface AiPositionSnapshot {
    s: string;  // Symbol
    q: number;  // Quantity
    p: number;  // Average Price/Cost
    w: string;  // Weight (%)
    pl: string; // P/L (%)
    c: string;  // Class
    sc: string; // Sector
}

// Dummy helper for sectors (Phase 3 will likely derive this from a better source)
const getSectorForSymbol = (symbol: string): string => {
    const tech = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
    const financials = ['CBA.AX', 'NAB.AX', 'ANZ.AX', 'WBC.AX'];
    if (tech.includes(symbol)) return 'Technology';
    if (financials.includes(symbol)) return 'Financial Services';
    if (symbol.includes('Cash')) return 'Liquidity';
    return 'Other';
};

export function usePortfolioAggregation(
    transactions: Transaction[],
    accounts: Account[] = [], // 🆕 Accept accounts
    isCashTrackingEnabled: boolean = false
): {
    aggregatedPositions: AggregatedPosition[],
    getAiReadySnapshot: (positions: any[]) => AiPositionSnapshot[],
    getPerformanceTrend: (currentPositions: any[], usdToAudRate: number) => any[],
    getHoldingsByCurrency: (positions: any[], getExchangeRate: (from: Currency, to: Currency) => number, displayCurrency: Currency) => Currency[]
} {
    const aggregatedPositions = useMemo(() => {
        const symbolGroups: Record<string, Transaction[]> = {};
        
        // 🎯 DYNAMIC CASH BUCKETS: Scan all transactions to discover unique currencies
        // This future-proofs the system for any currency without code changes
        const discoveredCurrencies = new Set<string>();
        transactions.forEach(tx => {
            if (tx.currency) {
                discoveredCurrencies.add(tx.currency);
            }
        });

        // Initialize cash balances dynamically for ALL discovered currencies
        // 💰 UNASSIGNED CASH BUCKETS: For transactions without an accountId
        const cashBalancesInCents: Record<string, number> = {};
        discoveredCurrencies.forEach(currency => {
            cashBalancesInCents[currency] = 0;
        });

        // 🏦 ACCOUNT BUCKETS: Initialize balances for specific accounts
        const accountBalancesInCents: Record<string, number> = {};
        if (Array.isArray(accounts)) {
            accounts.forEach(acc => {
                accountBalancesInCents[acc.id] = 0;
            });
        }

        console.log(`💰 [Portfolio Aggregation] Discovered currencies:`, Array.from(discoveredCurrencies));
        console.log(`🏦 [Portfolio Aggregation] Initialized ${accounts?.length ?? 0} account buckets`);

        // 1. Sort all transactions by date first
        const sortedAllTxs = [...transactions].sort((a, b) =>
            new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
        );

        // 2. Group transactions & Calculate Cash Balance
        // 💰 CASH TRACKING: Process transactions to calculate cash balances
        sortedAllTxs.forEach(tx => {
            // 🔒 SAFETY: Skip if transaction is undefined or missing transactionType
            if (!tx || !tx.transactionType) {
                console.warn('Skipping invalid transaction:', tx);
                return;
            }

            // Group by symbol for position aggregation
            // 🚫 EXCLUDE: These types should NOT create positions (only affect account/cash balances)
            if (tx.symbol && !['income', 'expense', 'fx', 'summary', 'delete', 'update', 'equity_adjustment', 'adjustment'].includes(tx.transactionType)) {
                if (!symbolGroups[tx.symbol]) {
                    symbolGroups[tx.symbol] = [];
                }
                symbolGroups[tx.symbol].push(tx);
            }

            if (isCashTrackingEnabled) {
                // 💰 CASH IMPACT: Check if this transaction should impact cash balance
                // Position-only entries (impactsCash=false) should NOT modify cash
                const shouldImpactCash = tx.impactsCash !== false;

                if (shouldImpactCash) {
                    // 🚫 FILTER: Ignore "Legacy/Test" USD transactions that have nice round numbers
                    // Real fix: User should delete these via UI, but to fix the display now:
                    // If it is USD and looks like test data (generic symbol often?), we might need to be careful.
                    // Actually, looking at the logs: "income 50000", "expense 20000".
                    // These are huge. 
                    // Let's print the specific ID so the user can delete them? 
                    // OR, if the user says "Total Valuation is wrong", implies they DON'T want these counting.
                    
                    // 🛡️ SAFE ACCESSOR: Ensure currency exists in cashBalancesInCents
                    const ensureCurrency = (currency: string) => {
                        if (cashBalancesInCents[currency] === undefined) {
                            cashBalancesInCents[currency] = 0;
                            console.log(`💰 [Late Discovery] Added currency: ${currency}`);
                        }
                    };

                    // Ensure transaction currency exists
                    ensureCurrency(tx.currency);
                    
                    if (tx.currency === 'USD') {
                        console.log(`💵 [USD TRACE] ${tx.transactionType} ${tx.quantity} units (impactsCash=${shouldImpactCash})`);
                    }

                    // 🔒 PRECISION FIX: Use InCents fields with fallback & Defensive Casting
                    const qty = Number(tx.quantity) || 0;
                    const price = Number(tx.price) || 0;
                    const fee = Number(tx.fee) || 0;

                    const priceInCents = tx.priceInCents ?? toCents(price);
                    const feeInCents = tx.feeInCents ?? toCents(fee);
                    // Ensure costBasis is calculated if missing, using robust inputs
                    const costBasisInCents = tx.costBasisInCents ?? calculateCostBasis(priceInCents, qty, feeInCents);

                    // 🏦 ACCOUNT ROUTING: Determine which bucket to update
                    // If tx.accountId exists and matches a known account, use that bucket.
                    // Otherwise, fall back to generic per-currency bucket.
                    const updateBalance = (currency: string, deltaInCents: number) => {
                        if (tx.accountId && accountBalancesInCents[tx.accountId] !== undefined) {
                            accountBalancesInCents[tx.accountId] = addCents(accountBalancesInCents[tx.accountId], deltaInCents);
                        } else {
                            // Link check: Only if currency matches? No, logic above already checked currency existence logic.
                            // But wait, if an account has a specific currency, we should respect that?
                            // For complex multi-currency accounts, this simple model assumes the account holds the tx currency.
                            // For this MVP, we just aggregate value into the account regardless of currency mixing (simplified),
                            // OR we assume the account matches the tx currency. 
                            // Standard behavior: Accounts usually hold their native currency.
                            // If I have a USD account and spend AUD, does it convert?
                            // Let's stick to: Transaction affects the named account in the transaction's currency value.
                            // Actually, calculating "Account Balance" implies summing native value?
                            // If Account is AUD, and I have a USD income linked to it...
                            // Ideally, that USD is held IN that account.
                            // So we should track (AccountId, Currency) tuples? 
                            // For simplicity V1: We track raw value flowing in. 
                            // But wait, aggregatedPositions expects a single "Total Quantity" and "Currency".
                            // If an account holds mixed currencies, we can't represent it as one position easily without conversion.
                            // DECISION: For V1, we simply update the account balance assuming the transaction currency MATCHES the account currency,
                            // OR we accept that the resulting "Qty" is a mix (which is bad).
                            
                            // BETTER: We update the bucket corresponding to the TARGET.
                            // If tx has accountId, we update that Account's balance.
                            // We assume strict alignment for now: Account Currency == Transaction Currency for simple cash flow.
                            // If they mismatch, we strictly shouldn't sum them safely without FX.
                            // However, strictly referencing the user request: "Calculate account assets".
                            
                            if (tx.accountId && accountBalancesInCents[tx.accountId] !== undefined) {
                                accountBalancesInCents[tx.accountId] = addCents(accountBalancesInCents[tx.accountId], deltaInCents);
                            } else {
                                // Fallback to unassigned cash
                                cashBalancesInCents[currency] = addCents(cashBalancesInCents[currency], deltaInCents);
                            }
                        }
                    };

                    if (tx.transactionType === 'equity_adjustment') {
                         updateBalance(tx.currency, toCents(qty));
                         const targetName = tx.accountId ? (accounts?.find(a=>a.id===tx.accountId)?.name || 'Unknown') : 'Unassigned';
                         console.log(`💎 [equity_adj] -> ${targetName}: +${qty} ${tx.currency}`);
                    } else if (tx.transactionType === 'buy') {
                         if (isNaN(costBasisInCents)) {
                            console.error('🚨 [Portfolio] NaN Cost Basis for buy tx:', tx);
                        } else {
                            updateBalance(tx.currency, -costBasisInCents);
                        }
                    } else if (tx.transactionType === 'sell') {
                        const proceedsInCents = subtractCents(
                            Math.round((priceInCents * qty * 10000) / 10000),
                            feeInCents
                        );
                        updateBalance(tx.currency, proceedsInCents);
                    } else if (tx.transactionType === 'income') {
                        // 💰 INCOME: Total received = quantity * price
                        const incomeAmountInCents = Math.round((priceInCents * qty * 10000) / 10000);
                        updateBalance(tx.currency, incomeAmountInCents);
                    } else if (tx.transactionType === 'expense') {
                        // 💸 EXPENSE: Total spent = quantity * price + fee
                        const expenseAmountInCents = Math.round((priceInCents * qty * 10000) / 10000);
                        const totalExpenseInCents = addCents(expenseAmountInCents, feeInCents);
                        updateBalance(tx.currency, -totalExpenseInCents);
                    } else if (tx.transactionType === 'adjustment') {
                        // 🔧 ADJUSTMENT: Manual balance adjustment (positive qty = add to account)
                        updateBalance(tx.currency, toCents(qty));
                    } else if (tx.transactionType === 'transfer') {
                        // 🔄 TRANSFER: Move funds between accounts (supports FX)
                        // Quantity = Source Amount. Price = Exchange Rate (Source -> Dest).
                        
                        const sourceAccount = accounts.find(a => a.id === tx.accountId);
                        const destAccount = accounts.find(a => a.id === tx.transferAccountId);
                        const sourceCurrency = sourceAccount?.currency || tx.currency; 
                        
                        // 1. Source Side (Deduct Quantity)
                        const sourceAmountInCents = toCents(qty);
                        // updateBalance helper uses tx.accountId, so it correctly targets the source account bucket
                        updateBalance(sourceCurrency, -sourceAmountInCents);

                        // 2. Destination Side (Add Quantity * Price)
                        // If Price is missing or 0, assume 1:1 transfer
                        const fxRate = (price && price > 0) ? price : 1;
                        const destQty = Math.abs(qty) * fxRate;
                        const destAmountInCents = toCents(destQty);

                        // Manual update for Destination Account (since updateBalance is bound to tx.accountId)
                        if (tx.transferAccountId && accountBalancesInCents[tx.transferAccountId] !== undefined) {
                             accountBalancesInCents[tx.transferAccountId] = addCents(accountBalancesInCents[tx.transferAccountId], destAmountInCents);
                        } else if (tx.transferAccountId) {
                             // Fallback: Add to unassigned cash bucket
                             // If tx.currency is set to target currency (new logic), use it. Else infer from account.
                             const destCurrency = destAccount?.currency || tx.currency;
                             ensureCurrency(destCurrency);
                             cashBalancesInCents[destCurrency] = addCents(cashBalancesInCents[destCurrency], destAmountInCents);
                        }
                    } else if (tx.transactionType === 'fx' && tx.symbol) {
                        const [fromCurrency, toCurrency] = tx.symbol.split('_') as [Currency, Currency];
                        if (fromCurrency && toCurrency) {
                            ensureCurrency(fromCurrency);
                            ensureCurrency(toCurrency);
                            
                            const fromAmountInCents = toCents(qty);
                            const toAmountInCents = Math.round((priceInCents * qty * 10000) / 10000);

                            // Handle FX Source (Sell From)
                            // If tx has accountId, does it apply to Source or Dest? 
                            // Usually FX is a transfer. Logic often splits. 
                            // For simplicity, applies to unassigned unless we have sophisticated "Transfer" type.
                            // Or we check `accountId` (Source) vs `toAccountId` (Dest - if we had it).
                            // Default to unassigned for FX to avoid mess in V1 unless explicit.
                            // Actually, standard logic:
                            cashBalancesInCents[fromCurrency] = subtractCents(cashBalancesInCents[fromCurrency], fromAmountInCents);
                            cashBalancesInCents[toCurrency] = addCents(cashBalancesInCents[toCurrency], toAmountInCents);
                        }
                    }
                }
            }
        });

        // 3. Aggregate each symbol with BI-DIRECTIONAL SUPPORT
        const positions: AggregatedPosition[] = Object.entries(symbolGroups).map(([symbol, txs]) => {
            // 🔒 STEP 1: Sort by date + createdAt for strict chronological order
            const sortedTxs = [...txs].sort((a, b) => {
                const dateA = new Date(a.transactionDate).getTime();
                const dateB = new Date(b.transactionDate).getTime();
                if (dateA !== dateB) return dateA - dateB;
                // Secondary sort by createdAt if same date
                const createdA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
                const createdB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
                return createdA - createdB;
            });

            let quantity = 0;                    // Can be negative (short position)
            let avgCostInCents = 0;              // Average cost basis in cents
            let realizedPLInCents = 0;           // Cumulative realized P&L
            let lastMarket: Market = 'US';
            let lastCurrency: Currency = 'USD';
            let lastAssetClass: AssetClass = 'Stock';

            // 🧮 Helper: Weighted Average Cost calculation
            const calcWeightedAvg = (oldAvg: number, oldQty: number, newPrice: number, newQty: number): number => {
                if (oldQty + newQty === 0) return 0;
                return Math.round((oldAvg * Math.abs(oldQty) + newPrice * newQty) / (Math.abs(oldQty) + newQty));
            };

            sortedTxs.forEach((tx) => {
                lastMarket = tx.market;
                lastCurrency = tx.currency;
                lastAssetClass = tx.assetClass;

                const priceInCents = tx.priceInCents ?? toCents(tx.price || 0);
                const txQty = tx.quantity;
                const isBuy = tx.transactionType === 'buy';
                const isSell = tx.transactionType === 'sell';

                console.log(`📊 [${symbol}] Processing: ${tx.transactionType} ${txQty}@${toUnits(priceInCents)}, before: qty=${quantity}, avgCost=${toUnits(avgCostInCents)}`);

                if (isBuy) {
                    // ═══════════════════════════════════════════════════════════════
                    // BUY LOGIC: Increases Long OR Decreases/Flips Short
                    // ═══════════════════════════════════════════════════════════════
                    if (quantity >= 0) {
                        // CASE A: Currently Long (or flat) + Buy = Increase Long
                        avgCostInCents = calcWeightedAvg(avgCostInCents, quantity, priceInCents, txQty);
                        quantity += txQty;
                    } else {
                        // CASE B: Currently Short + Buy = Cover Short
                        const shortQty = Math.abs(quantity);
                        
                        if (txQty <= shortQty) {
                            // B1: Partial Cover (still short after)
                            // Realize P&L: (ShortEntryPrice - CoverPrice) * qty
                            realizedPLInCents += (avgCostInCents - priceInCents) * txQty;
                            quantity += txQty;  // Still short (negative)
                            // avgCostInCents remains unchanged
                        } else {
                            // B2: THE FLIP - Cover entire short + go long with remainder
                            // Step 1: Realize P&L on the covered portion
                            realizedPLInCents += (avgCostInCents - priceInCents) * shortQty;
                            // Step 2: Open new long position with remainder
                            const longQty = txQty - shortQty;
                            quantity = longQty;              // Now positive (long)
                            avgCostInCents = priceInCents;    // Reset to new entry price
                            console.log(`🔄 [${symbol}] THE FLIP: Short→Long, new qty=${quantity}, new avgCost=${toUnits(avgCostInCents)}`);
                        }
                    }
                } else if (isSell) {
                    // ═══════════════════════════════════════════════════════════════
                    // SELL LOGIC: Decreases/Flips Long OR Increases Short
                    // ═══════════════════════════════════════════════════════════════
                    if (quantity <= 0) {
                        // CASE A: Currently Short (or flat) + Sell = Increase Short
                        if (quantity === 0) {
                            // Opening new short position
                            avgCostInCents = priceInCents;
                        } else {
                            // Adding to existing short
                            avgCostInCents = calcWeightedAvg(avgCostInCents, Math.abs(quantity), priceInCents, txQty);
                        }
                        quantity -= txQty;  // Becomes more negative
                    } else {
                        // CASE B: Currently Long + Sell = Reduce Long
                        if (txQty <= quantity) {
                            // B1: Partial Sell (still long after)
                            // Realize P&L: (SellPrice - AvgCost) * qty
                            realizedPLInCents += (priceInCents - avgCostInCents) * txQty;
                            quantity -= txQty;
                            // avgCostInCents remains unchanged
                        } else {
                            // B2: THE FLIP - Sell entire long + go short with remainder
                            // Step 1: Realize P&L on the sold portion
                            realizedPLInCents += (priceInCents - avgCostInCents) * quantity;
                            // Step 2: Open new short position with remainder
                            const shortQty = txQty - quantity;
                            quantity = -shortQty;             // Now negative (short)
                            avgCostInCents = priceInCents;     // Reset to new entry price
                            console.log(`🔄 [${symbol}] THE FLIP: Long→Short, new qty=${quantity}, new avgCost=${toUnits(avgCostInCents)}`);
                        }
                    }
                } else if (tx.transactionType === 'adjustment') {
                    // ═══════════════════════════════════════════════════════════════
                    // ADJUSTMENT LOGIC: Modifies Quantity/Cost WITHOUT Realizing P&L
                    // ═══════════════════════════════════════════════════════════════
                    const potentialNewQty = quantity + txQty;

                    if (quantity === 0 && potentialNewQty !== 0) {
                         // Opening Position
                         avgCostInCents = priceInCents;
                    } else if ((quantity > 0 && potentialNewQty < 0) || (quantity < 0 && potentialNewQty > 0)) {
                        // Position Flip (Long <-> Short)
                        // Reset cost basis to new price for the flipped portion
                        avgCostInCents = priceInCents;
                    } else if (Math.abs(potentialNewQty) > Math.abs(quantity)) {
                        // Increasing Position Size (Weighted Average)
                        avgCostInCents = calcWeightedAvg(avgCostInCents, quantity, priceInCents, txQty);
                    }
                    // Else: Reducing Position (Keep Avg Cost Same)

                    quantity += txQty;
                    console.log(`🔧 [${symbol}] Adjustment: ${txQty}@${toUnits(priceInCents)}, new qty=${quantity}, new avgCost=${toUnits(avgCostInCents)}`);
                }

                console.log(`📊 [${symbol}] After: qty=${quantity}, avgCost=${toUnits(avgCostInCents)}, realizedPL=${toUnits(realizedPLInCents)}`);
            });

            return {
                symbol,
                totalQuantity: quantity,
                averageCost: toUnits(avgCostInCents),
                realizedPL: toUnits(realizedPLInCents),  // 🆕 Realized P&L for this symbol
                isShort: quantity < 0,                    // 🆕 Short position indicator
                market: lastMarket,
                currency: lastCurrency,
                assetClass: lastAssetClass,
            };
        });

        // 4. Add cash positions dynamically for ALL currencies
        if (isCashTrackingEnabled) {
            const getExists = (sym: string) => positions.some(p => p.symbol === sym);

            // A) Add Account-based positions
            if (Array.isArray(accounts)) {
                accounts.forEach(account => {
                    const balanceInCents = accountBalancesInCents[account.id];
                    const balanceInUnits = toUnits(balanceInCents || 0);
                    
                    // 🔍 Show ALL accounts regardless of balance, so users can see all configured accounts
                    // This is important for credit cards and other accounts that may have 0 balance
                    let market: Market = 'US';
                    if (account.currency === 'AUD') market = 'ASX';

                    positions.push({
                        symbol: account.name, // Display Name
                        totalQuantity: balanceInUnits,
                        averageCost: 1, 
                        realizedPL: 0,
                        isShort: balanceInUnits < 0,
                        market,
                        currency: account.currency as Currency,
                        assetClass: `${account.currency} Cash` as AssetClass,
                        isCash: true,
                        isDefault: account.isDefault, // 🆕 Pass isDefault flag
                    });
                });
            }

            console.log(`💵 [Unassigned Cash] Processing ${Object.keys(cashBalancesInCents).length} buckets...`);

            // B) Add Legacy/Unassigned Cash
            Object.entries(cashBalancesInCents).forEach(([currency, balanceInCents]) => {
                const balanceInUnits = toUnits(balanceInCents);
                const cashSymbol = `${currency} Cash`; // e.g., "USD Cash"

                console.log(`💵 [${currency}] Balance: ${balanceInUnits.toFixed(2)} (${balanceInCents} cents), exists: ${getExists(cashSymbol)}`);

                if (Math.abs(balanceInUnits) > 0.01 && !getExists(cashSymbol)) {
                    // Determine market based on currency
                    let market: Market = 'US';
                    if (currency === 'AUD') market = 'ASX';

                    // 💎 CASH NEUTRALITY: Set averageCost = current balance to ensure P/L = 0%
                    // This prevents FX fluctuations or initial entry issues from affecting cash P/L
                    positions.push({
                        symbol: cashSymbol,
                        totalQuantity: balanceInUnits,
                        averageCost: 1, // Always 1 for cash (face value)
                        realizedPL: 0,  // 🆕 Cash has no realized P&L
                        isShort: balanceInUnits < 0,  // 🆕 Negative cash = overdraft
                        market,
                        currency: currency as Currency,
                        assetClass: `${currency} Cash` as AssetClass,
                        isCash: true,
                    });

                    console.log(`💵 [Portfolio] Added ${cashSymbol} position: ${balanceInUnits.toFixed(2)}`);
                } else if (Math.abs(balanceInUnits) <= 0.01) {
                    console.log(`💵 [${currency}] Skipped (balance too small: ${balanceInUnits})`);
                } else if (getExists(cashSymbol)) {
                    console.log(`💵 [${currency}] Skipped (already exists in positions)`);
                }
            });

            console.log(`💵 [Cash Positions] Final positions count: ${positions.length}`);
        }

        return positions;
    }, [transactions, accounts, isCashTrackingEnabled]);

    /**
     * Minimalist JSON snapshot for AI analysis (Token Optimized)
     * 🔒 PRECISION FIX: Convert to units with proper decimal places for AI
     */
    const getAiReadySnapshot = useCallback((positions: any[]): AiPositionSnapshot[] => {
        return positions
            .filter(p => Math.abs(p.quantity) > 0.0001 || p.isCash) // Only active positions or cash
            .map(p => ({
                s: p.symbol,
                q: Number(p.quantity.toFixed(4)),
                p: Number(p.averageCost.toFixed(2)),  // 🔒 PRECISION FIX: Always 2 decimals
                w: `${p.weight.toFixed(2)}%`,
                pl: p.isCash ? '-' : `${p.plPercent.toFixed(2)}%`,
                c: p.assetClass,
                sc: getSectorForSymbol(p.symbol)
            }));
    }, []);

    /**
     * Calculates historical performance trend points.
     * 🔒 PRECISION FIX: Use cents for all calculations
     */
    const getPerformanceTrend = useCallback((
        currentPositions: any[],
        usdToAudRate: number
    ) => {
        if (!transactions.length) return [];

        const sortedTxs = [...transactions].sort((a, b) =>
            new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
        );

        const trend: { date: string; netWorth: number; profit: number }[] = [];
        const holdingsMap = new Map<string, { q: number; avgInCents: number; cur: Currency; m: Market }>();
        let cumulativeRealizedPLInCents = 0;
        let cashAUDInCents = 0;
        let cashUSDInCents = 0;

        // Group by date to avoid multiple points for same day
        const txsByDate: Record<string, Transaction[]> = {};
        sortedTxs.forEach(tx => {
            const d = tx.transactionDate.split('T')[0];
            if (!txsByDate[d]) txsByDate[d] = [];
            txsByDate[d].push(tx);
        });

        const sortedDates = Object.keys(txsByDate).sort();

        sortedDates.forEach(date => {
            const dayTxs = txsByDate[date];
            dayTxs.forEach(tx => {
                // 🔒 SAFETY: Skip if transaction is undefined or missing transactionType
                if (!tx || !tx.transactionType) {
                    console.warn('Skipping invalid transaction in performance trend:', tx);
                    return;
                }

                if (tx.transactionType === 'expense') return; // Ignore expenses as per request

                // 💰 CASH IMPACT: Check if this transaction should impact cash balance
                const shouldImpactCash = tx.impactsCash !== false;

                const fx = (tx.currency === 'USD' || tx.market === 'US') ? usdToAudRate : 1;

                // 🔒 PRECISION FIX: Use InCents fields with fallback
                const priceInCents = tx.priceInCents ?? toCents(tx.price || 0);
                const feeInCents = tx.feeInCents ?? toCents(tx.fee || 0);

                if (tx.transactionType === 'equity_adjustment') {
                    // 💎 EQUITY ADJUSTMENT: 权益调整增加现金，但不计入收益
                    // isPrincipal: true 标记表明这是本金注入，不是投资收益
                    // 这确保收益曲线不会因校准产生虚假的垂直跳变
                    const injectionInCents = toCents(tx.quantity);
                    cashAUDInCents += Math.round(injectionInCents * fx);
                    // 注意：不修改 cumulativeRealizedPLInCents，因为这不是收益
                } else if (tx.transactionType === 'buy') {
                    const existing = holdingsMap.get(tx.symbol) || { q: 0, avgInCents: 0, cur: tx.currency, m: tx.market };
                    const newQ = existing.q + tx.quantity;
                    const qScaled = Math.round(newQ * 10000);
                    const existingCostInCents = Math.round((existing.avgInCents * Math.round(existing.q * 10000)) / 10000);
                    const txCostInCents = Math.round((priceInCents * Math.round(tx.quantity * 10000)) / 10000);
                    const newAvgInCents = Math.round(((existingCostInCents + txCostInCents) * 10000) / qScaled);

                    holdingsMap.set(tx.symbol, { q: newQ, avgInCents: newAvgInCents, cur: tx.currency, m: tx.market });

                    // Only impact cash if this is a real transaction
                    if (shouldImpactCash) {
                        const costInCents = addCents(Math.round((priceInCents * Math.round(tx.quantity * 10000)) / 10000), feeInCents);
                        cashAUDInCents -= Math.round(costInCents * fx);
                    }
                } else if (tx.transactionType === 'sell') {
                    const existing = holdingsMap.get(tx.symbol);
                    if (existing) {
                        const realizedInCents = subtractCents(priceInCents, existing.avgInCents);
                        const realizedTotalInCents = Math.round((realizedInCents * Math.round(tx.quantity * 10000)) / 10000);

                        // Only impact P/L if this is a real transaction
                        if (shouldImpactCash) {
                            cumulativeRealizedPLInCents = addCents(cumulativeRealizedPLInCents, Math.round(realizedTotalInCents * fx));
                        }

                        existing.q -= tx.quantity;
                        if (existing.q <= 0) holdingsMap.delete(tx.symbol);
                        else holdingsMap.set(tx.symbol, existing);

                        // Only impact cash if this is a real transaction
                        if (shouldImpactCash) {
                            const proceedsInCents = subtractCents(Math.round((priceInCents * Math.round(tx.quantity * 10000)) / 10000), feeInCents);
                            cashAUDInCents += Math.round(proceedsInCents * fx);
                        }
                    }
                } else if (tx.transactionType === 'income') {
                    const incomeInCents = toCents(tx.quantity);
                    cumulativeRealizedPLInCents = addCents(cumulativeRealizedPLInCents, Math.round(incomeInCents * fx));
                    cashAUDInCents += Math.round(incomeInCents * fx);
                } else if (tx.transactionType === 'fx') {
                    // Simplified FX handling for trend
                    const [from, to] = tx.symbol.split('_');
                    const qtyInCents = toCents(tx.quantity);
                    const convertedInCents = Math.round((priceInCents * Math.round(tx.quantity * 10000)) / 10000);

                    if (from === 'USD') cashAUDInCents -= Math.round(qtyInCents * usdToAudRate);
                    if (to === 'USD') cashAUDInCents += Math.round(convertedInCents * usdToAudRate);
                    if (from === 'AUD') cashAUDInCents -= qtyInCents;
                    if (to === 'AUD') cashAUDInCents += convertedInCents;
                }
            });

            // Calculate daily snap
            let currentUnrealizedInCents = 0;
            let currentMarketValueInCents = 0;

            holdingsMap.forEach((h, sym) => {
                const pos = currentPositions.find(p => p.symbol === sym);
                const currentPriceInCents = pos?.lastPrice ? toCents(pos.lastPrice) : h.avgInCents;
                const fx = (h.cur === 'USD' || h.m === 'US') ? usdToAudRate : 1;

                const marketValInCents = Math.round((currentPriceInCents * Math.round(h.q * 10000)) / 10000);
                currentMarketValueInCents += Math.round(marketValInCents * fx);

                const unrealizedInCents = subtractCents(currentPriceInCents, h.avgInCents);
                const unrealizedTotalInCents = Math.round((unrealizedInCents * Math.round(h.q * 10000)) / 10000);
                currentUnrealizedInCents += Math.round(unrealizedTotalInCents * fx);
            });

            trend.push({
                date,
                netWorth: Number(toUnits(addCents(currentMarketValueInCents, cashAUDInCents)).toFixed(2)),
                profit: Number(toUnits(addCents(cumulativeRealizedPLInCents, currentUnrealizedInCents)).toFixed(2))
            });
        });

        return trend;
    }, [transactions]);

    /**
     * 🎯 智能币种检测：按资产总额排序币种
     * 
     * 提取用户持仓中所有非零资产的币种，计算每个币种的总市值（换算为统一本位币），
     * 返回按资产总额从大到小排列的货币代码数组。
     * 
     * @param positions - 当前持仓数据
     * @param getExchangeRate - 汇率查询函数
     * @param displayCurrency - 当前显示币种（用于折算）
     * @returns 按资产权重排序的币种数组（如 ['USD', 'AUD', 'JPY', 'CNY']）
     */
    const getHoldingsByCurrency = useCallback((
        positions: any[],
        getExchangeRate: (from: Currency, to: Currency) => number,
        displayCurrency: Currency
    ): Currency[] => {
        // 1. 按币种聚合市值
        const currencyValues = new Map<Currency, number>();

        positions.forEach(pos => {
            if (Math.abs(pos.quantity) < 0.0001) return; // 跳过零持仓
            
            const nativeCurrency = pos.currency || pos.nativeCurrency;
            if (!nativeCurrency) return;

            const fxRate = getExchangeRate(nativeCurrency, displayCurrency);
            const marketValueNative = pos.quantity * (pos.lastPrice || pos.averageCost);
            const marketValueInDisplay = marketValueNative * fxRate;

            const current = currencyValues.get(nativeCurrency) || 0;
            // Use absolute value for RANKING purposes only (we want to rank by magnitude, not sign)
            // This doesn't affect the actual networth calculation - just determines display order
            currencyValues.set(nativeCurrency, current + Math.abs(marketValueInDisplay));
        });

        // 2. 按市值从大到小排序
        const sortedCurrencies = Array.from(currencyValues.entries())
            .sort((a, b) => b[1] - a[1]) // b[1] - a[1] 降序排列
            .map(entry => entry[0]);

        return sortedCurrencies;
    }, []);

    return { aggregatedPositions, getAiReadySnapshot, getPerformanceTrend, getHoldingsByCurrency };
}

