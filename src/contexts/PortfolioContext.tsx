
'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useCallback } from 'react';
import { useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, limit, doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Holding, CashAccount, UserSettings, AssetClass, Market, Transaction, Currency, Account } from '@/lib/types';
import { usePortfolioAggregation } from '@/hooks/usePortfolioAggregation';
import { createDailySnapshot, getTodaySnapshot } from '@/lib/insights/daily-snapshot';
import { updateDailyWealthPulse } from '@/lib/insights/wealth-pulse';
import { getTodayDateString } from '@/lib/insights/daily-snapshot';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';

export interface PortfolioPosition extends Holding {
    lastPrice: number;
    fxRate: number;
    marketValueDisplay: number;
    floatingPL_Display: number;
    plPercent: number;
    beta: number;
    weight: number;
    isCash: boolean;
    nativeCurrency: Currency;
    isDefault?: boolean;  // 🆕 true if this is a default account
}

interface PortfolioContextType {
    positions: PortfolioPosition[];
    totalNetWorth: number;
    totalMarketValue: number;
    totalCashValue: number;
    displayCurrency: Currency;
    setDisplayCurrency: (currency: Currency) => Promise<void>;
    sortedCurrencies: Currency[];
    hasConversionErrors: boolean;
    failedCurrencies: Set<string>;
    settings: UserSettings | null;
    isLoading: boolean;
    user: any;
    firestore: any;
    transactions: Transaction[];  // 🆕 暴露 transactions 供分红中心使用
    getAiReadySnapshot: () => any[];
    getPerformanceTrend: () => any[];
    getExchangeRate: (from: Currency, to: Currency) => number | null;
    exchangeRates: Record<string, number>;  // 💱 暴露 exchangeRates 供 currency conversion使用
    history: any[];
    expensesByMonth: any[];
    expenseCategories?: any[]; // Allow for any other data exposed 
    accounts: Account[]; // 🆕 Expose accounts
    refreshData: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refreshData = useCallback(() => {
        console.log('[PortfolioContext] 🔄 Forcing data refresh...');
        setRefreshTrigger(prev => prev + 1);
    }, []);

    const holdingsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, `users/${user.uid}/asset_holdings`), orderBy('symbol', 'asc'));
    }, [user, firestore, refreshTrigger]);

    const exchangeRateQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'exchange_rates'));
    }, [user, firestore, refreshTrigger]);

    const settingsRef = useMemo(() => {
        if (!user) return null;
        return doc(firestore, `users/${user.uid}/settings/config`);
    }, [user, firestore]); // settings probably doesn't need aggressive refresh, but OK to leave as is or add if needed. Leaving for now.

    const transactionsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, `users/${user.uid}/transactions`), orderBy('transactionDate', 'asc'));
    }, [user, firestore, refreshTrigger]);

    const accountsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, `users/${user.uid}/accounts`));
    }, [user, firestore, refreshTrigger]);

    const { data: holdings, isLoading: isHoldingsLoading } = useCollection<Holding>(holdingsQuery);
    const { data: transactions, isLoading: isTransactionsLoading } = useCollection<Transaction>(transactionsQuery);
    const { data: accounts, isLoading: isAccountsLoading } = useCollection<Account>(accountsQuery);
    const { data: rates, isLoading: isRatesLoading } = useCollection(exchangeRateQuery);
    const { data: settings, isLoading: isSettingsLoading } = useDoc<UserSettings>(settingsRef);

    const displayCurrency = settings?.displayCurrency || 'AUD';

    /**
     * 🎯 FAIL-SAFE Exchange Rate Retrieval
     * Returns { rate, failed } object
     * 
     * Priority:
     * 1. Direct pair from Firestore
     * 2. Inverse pair from Firestore
     * 3. USD Bridge (if both legs available)
     * 4. Hardcoded fallback table (safety net)
     */
    const getExchangeRate = useCallback((from: Currency, to: Currency): { rate: number | null; failed: boolean } => {
        if (from === to) return { rate: 1, failed: false };
        
        // Helper: Find rate from Firestore (direct or inverse)
        const findRate = (f: Currency, t: Currency): number | null => {
            if (f === t) return 1;
            const d = rates?.find(r => r.fromCurrency === f && r.toCurrency === t);
            if (d) return d.rate;
            const i = rates?.find(r => r.fromCurrency === t && r.toCurrency === f);
            if (i && i.rate !== 0) return 1 / i.rate;
            return null;
        };
        
        // 1. Try direct/inverse from Firestore
        const directRate = findRate(from, to);
        if (directRate !== null) return { rate: directRate, failed: false };

        // 2. Try USD Bridge (from -> USD -> to)
        if (from !== 'USD' && to !== 'USD') {
            const fromToUSD = findRate(from, 'USD');
            const usdToTo = findRate('USD', to);
            if (fromToUSD !== null && usdToTo !== null) {
                return { rate: fromToUSD * usdToTo, failed: false };
            }
        }
        
        // 3. Hardcoded Fallback Table (Safety Net for Missing API Data)
        // These are approximate rates as of Jan 2026 - used ONLY when Firestore has no data
        const FALLBACK_USD_RATES: Record<string, number> = {
            'AUD': 1.58,   // 1 USD = 1.58 AUD
            'CNY': 7.25,   // 1 USD = 7.25 CNY
            'TWD': 32.5,   // 1 USD = 32.5 TWD
            'JPY': 156.0,  // 1 USD = 156 JPY
            'HKD': 7.82,   // 1 USD = 7.82 HKD
            'KRW': 1430,   // 1 USD = 1430 KRW
            'EUR': 0.92,   // 1 USD = 0.92 EUR
            'GBP': 0.79,   // 1 USD = 0.79 GBP
            'SGD': 1.34,   // 1 USD = 1.34 SGD
            'CAD': 1.44,   // 1 USD = 1.44 CAD
            'NZD': 1.71,   // 1 USD = 1.71 NZD
            'CHF': 0.90,   // 1 USD = 0.90 CHF
            'INR': 86.0,   // 1 USD = 86 INR
        };
        
        // Try fallback bridge through USD
        const fromUSD = from === 'USD' ? 1 : FALLBACK_USD_RATES[from];
        const toUSD = to === 'USD' ? 1 : FALLBACK_USD_RATES[to];
        
        if (fromUSD && toUSD) {
            // fromCurrency -> USD -> toCurrency
            // Rate = (1 / fromUSD) * toUSD = toUSD / fromUSD
            const fallbackRate = toUSD / fromUSD;
            console.warn(`⚠️ [FX Fallback Used] ${from} → ${to} = ${fallbackRate.toFixed(4)} (Hardcoded)`);
            return { rate: fallbackRate, failed: false };
        }
        
        // 🚨 CRITICAL: Rate not available at all
        console.error(`🚨 [FX Rate Missing] Cannot convert ${from} → ${to}. No fallback available.`);
        return { rate: null, failed: true };
    }, [rates]);

    const isCashTrackingEnabled = settings?.isCashTrackingEnabled ?? false;

    const setDisplayCurrency = useCallback(async (currency: Currency) => {
        if (!user) return;
        const settingsRef = doc(firestore, `users/${user.uid}/settings/config`);
        await setDoc(settingsRef, { displayCurrency: currency }, { merge: true });
    }, [user, firestore]);

    const { aggregatedPositions, getAiReadySnapshot, getPerformanceTrend, getHoldingsByCurrency } = usePortfolioAggregation(transactions || [], accounts || [], isCashTrackingEnabled);

    const portfolioData = useMemo(() => {
        if (isHoldingsLoading || isTransactionsLoading || isRatesLoading || isUserLoading || isAccountsLoading) {
            return { positions: [], totalNetWorth: 0, totalMarketValue: 0, totalCashValue: 0, hasErrors: false, failedCurrencies: new Set<string>() };
        }

        // 🔍 调试：记录 holdings 更新
        console.log(`[PortfolioContext] 💫 重新计算 Portfolio (${holdings?.length || 0} holdings, ${aggregatedPositions.length} positions)`);
        if (holdings && holdings.length > 0) {
            const samplePrices = holdings.slice(0, 3).map(h => `${h.symbol}=${h.lastPrice}`);
            console.log(`[PortfolioContext] 📊 当前价格示例: ${samplePrices.join(', ')}`);
        }

        const failedConversions = new Set<string>();

        const calculatedPositions = aggregatedPositions.map(agg => {
            const existingHolding = holdings?.find(h => h.symbol === agg.symbol);
            const livePriceInUnits = existingHolding?.lastPrice ? existingHolding.lastPrice / 100 : undefined;
            const lastPrice = agg.isCash ? 1 : (livePriceInUnits ?? agg.averageCost);

            const assetClass = agg.isCash
                ? `${agg.currency} Cash` as AssetClass
                : (existingHolding?.assetClass || 'Stock');

            // 🎯 FAIL-SAFE Multi-Currency FX Logic
            const nativeCurrency = agg.currency;
            const fxResult = getExchangeRate(nativeCurrency, displayCurrency);
            const fxRate = fxResult.rate;

            // Track failed conversions
            if (fxResult.failed) {
                failedConversions.add(`${nativeCurrency}→${displayCurrency}`);
            }

            // 🆕 SHORT POSITION SUPPORT: Use absolute quantity for SHORT STOCKS only
            // 🔧 CRITICAL FIX: For CASH, preserve negative sign (debt reduces net worth)
            const isShort = agg.totalQuantity < 0;
            const isCash = !!agg.isCash;
            
            // For cash: use raw quantity (preserve negative for debt)
            // For short stocks: use absolute value (market value is always positive, P&L is inverted)
            // For long stocks: use raw quantity (always positive)
            const effectiveQty = isCash ? agg.totalQuantity : Math.abs(agg.totalQuantity);
            const marketValueNative = effectiveQty * lastPrice;
            
            // 🚨 TOLERANCE: Skip calculation if FX rate unavailable
            const marketValueDisplay = fxRate !== null ? marketValueNative * fxRate : null;

            // For cost basis, always use absolute (we're measuring magnitude of investment)
            const absQty = Math.abs(agg.totalQuantity);
            const costBasisNative = absQty * agg.averageCost;
            const costBasisDisplay = fxRate !== null ? costBasisNative * fxRate : null;

            // 🆕 SHORT P&L LOGIC: For shorts, profit when price goes DOWN
            // Long:  P&L = (MarketValue - CostBasis) = (currentPrice - avgCost) * qty
            // Short: P&L = (CostBasis - MarketValue) = (avgCost - currentPrice) * absQty
            const floatingPL_Display = (fxRate !== null && !agg.isCash) 
                ? (isShort 
                    ? (costBasisNative - marketValueNative) * fxRate  // Short: profit when price drops
                    : (marketValueNative - costBasisNative) * fxRate) // Long: profit when price rises
                : 0;
            
            const plPercent = (!agg.isCash && costBasisDisplay && costBasisDisplay > 0) 
                ? (floatingPL_Display / costBasisDisplay) * 100 
                : 0;
            
            const beta = agg.isCash ? 0 : 1.1;

            return {
                id: agg.symbol,
                symbol: agg.symbol,
                quantity: agg.totalQuantity,
                averageCost: agg.averageCost,
                currency: nativeCurrency,
                nativeCurrency: nativeCurrency,
                assetClass: assetClass as AssetClass,
                market: agg.market,
                isCash: !!agg.isCash,
                isDefault: agg.isDefault,  // 🆕 Pass through isDefault flag
                lastPrice,
                fxRate: fxRate ?? 0,
                hasConversionError: fxResult.failed,
                marketValueDisplay: marketValueDisplay ?? 0,
                floatingPL_Display,
                plPercent,
                beta,
            } as PortfolioPosition & { hasConversionError: boolean };
        });

        // 🛡️ TOLERANCE CALCULATION: Sum only successfully converted values
        
        // 🔍 DEBUG: Inspect Rates
        if (rates && rates.length > 0) {
            console.log(`[Context Debug] 🌍 Raw Rates available:`, rates.map(r => `${r.fromCurrency}->${r.toCurrency}=${r.rate}`));
        } else {
             console.warn(`[Context Debug] ⚠️ rates array is empty or undefined!`);
        }

        const totalMarketValue = calculatedPositions
            .filter(p => !p.isCash && !p.hasConversionError)
            .reduce((acc, pos) => acc + (pos.marketValueDisplay || 0), 0);

        const totalCashValue = calculatedPositions
            .filter(p => p.isCash && !p.hasConversionError)
            .reduce((acc, pos) => {
                const val = pos.marketValueDisplay || 0;
                return acc + val; 
            }, 0);

        const totalNetWorth = totalMarketValue + totalCashValue;
        
        console.log(`[Context Debug] 🏁 TOTAL: Market=${totalMarketValue.toFixed(2)} + Cash=${totalCashValue.toFixed(2)} = ${totalNetWorth.toFixed(2)}`);

        const positionsWithWeight = calculatedPositions.map(pos => ({
            ...pos,
            weight: totalNetWorth !== 0 ? ((pos.marketValueDisplay || 0) / totalNetWorth) * 100 : 0,
        }));

        return {
            positions: positionsWithWeight,
            totalNetWorth,
            totalMarketValue,
            totalCashValue,
            hasErrors: failedConversions.size > 0,
            failedCurrencies: failedConversions
        };

    }, [aggregatedPositions, holdings, displayCurrency, isHoldingsLoading, isTransactionsLoading, isRatesLoading, isUserLoading, getExchangeRate, rates, isAccountsLoading]);

    // 🎯 智能币种排序
    const sortedCurrencies = useMemo(() => {
        // Wrapper function that extracts rate for backward compatibility
        const getRateOnly = (from: Currency, to: Currency) => getExchangeRate(from, to).rate ?? 1;
        return getHoldingsByCurrency(portfolioData.positions, getRateOnly, displayCurrency);
    }, [portfolioData.positions, getHoldingsByCurrency, displayCurrency, getExchangeRate]);

    const { history, expensesByMonth } = usePortfolioHistory(
        transactions || [],
        accounts || [],
        displayCurrency,
        (from, to) => getExchangeRate(from, to).rate ?? 1
    );

    const value = useMemo(() => ({
        ...portfolioData,
        settings: settings || null,
        displayCurrency,
        setDisplayCurrency,
        sortedCurrencies,
        hasConversionErrors: portfolioData.hasErrors,
        failedCurrencies: portfolioData.failedCurrencies,
        isLoading: isUserLoading || isHoldingsLoading || isRatesLoading || isSettingsLoading || isAccountsLoading,
        user,
        firestore,
        transactions: transactions || [],  // 🆕 暴露 transactions
        accounts: accounts || [], // 🆕 Expose accounts
        getAiReadySnapshot: () => getAiReadySnapshot(portfolioData.positions),
        getPerformanceTrend: () => getPerformanceTrend(portfolioData.positions, getExchangeRate('USD', 'AUD').rate ?? 1),
        getExchangeRate: (from: Currency, to: Currency) => getExchangeRate(from, to).rate,
        exchangeRates: (rates || []).reduce((acc, r) => {
            acc[`${r.fromCurrency}${r.toCurrency}=X`] = r.rate;
            return acc;
        }, {} as Record<string, number>),  // 💱 暴露 exchangeRates
        history,
        expensesByMonth,
        refreshData
    }), [portfolioData, settings, displayCurrency, sortedCurrencies, transactions, accounts, isUserLoading, isHoldingsLoading, isRatesLoading, isSettingsLoading, isAccountsLoading, user, firestore, getAiReadySnapshot, getPerformanceTrend, history, expensesByMonth, refreshData, setDisplayCurrency, getExchangeRate, rates]);

    // 🎩 WEALTH PULSE: Track daily changes
    React.useEffect(() => {
        const handleWealthPulse = async () => {
            if (isUserLoading || isHoldingsLoading || isRatesLoading || !user || portfolioData.totalNetWorth === 0) {
                return;
            }

            try {
                const todayStr = getTodayDateString();
                const currentTotal = portfolioData.totalNetWorth;
                
                // 1. Try to get today's snapshot (Benchmark)
                let snapshot = await getTodaySnapshot(firestore, user.uid);
                
                // 2. If no snapshot exists for today, create one (Today's Open)
                if (!snapshot) {
                    await createDailySnapshot(
                        firestore, 
                        user.uid, 
                        currentTotal, 
                        displayCurrency
                    );
                    // Use current as baseline if just created
                    snapshot = { totalValue: currentTotal } as any; 
                }

                // 3. Calculate change and update insight
                // (Only if we have a valid snapshot to compare against)
                if (snapshot) {
                    await updateDailyWealthPulse(
                        user.uid,
                        user.displayName || 'Sir/Madam',
                        todayStr,
                        displayCurrency,
                        currentTotal,
                        snapshot.totalValue ?? currentTotal
                    );
                }
            } catch (error) {
                console.error('Wealth Pulse Error:', error);
            }
        };

        // Debounce slightly to avoid rapid-fire updates on load
        const timer = setTimeout(handleWealthPulse, 3000);
        return () => clearTimeout(timer);
        
    }, [
        user, 
        firestore, 
        portfolioData.totalNetWorth, 
        isUserLoading, 
        isHoldingsLoading, 
        isRatesLoading, 
        displayCurrency
    ]);

    return (
        <PortfolioContext.Provider value={value}>
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = () => {
    const context = useContext(PortfolioContext);
    if (context === undefined) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
};
