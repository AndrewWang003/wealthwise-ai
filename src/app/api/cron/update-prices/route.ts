import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { yahooProvider } from '@/lib/pricing/yahoo-provider';
import { Market } from '@/lib/types';

// 1. Initialize Firebase Admin (Server-Side)
if (!getApps().length) {
    try {
        initializeApp();
    } catch (e) {
        console.error('Firebase Admin Init Error:', e);
    }
}

// 2. Helper: Add Market Suffix (Same as frontend logic)
const addMarketSuffix = (symbol: string, market: string): string => {
    if (symbol.includes('.') || symbol.includes('=')) return symbol;

    switch (market) {
        case 'ASX': return `${symbol}.AX`;
        case 'HKEX': return `${symbol}.HK`;
        case 'SSE':
        case 'SZSE': return `${symbol}.SS`;
        case 'TSE': return `${symbol}.T`;
        case 'LSE': return `${symbol}.L`;
        case 'NASDAQ':
        case 'NYSE':
        case 'US':
        default: return symbol;
    }
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    console.log(`[Cron] Starting price update. Force: ${force}`);

    try {
        const db = getFirestore();
        const usersRef = db.collection('users');
        const usersSnap = await usersRef.get();

        const matchLog: string[] = [];
        let successCount = 0;
        let failCount = 0;
        const CACHE_DURATION_MINUTES = 30;
        const CACHE_MS = CACHE_DURATION_MINUTES * 60 * 1000;

        for (const userDoc of usersSnap.docs) {
            const userId = userDoc.id;

            // Get Holdings
            const holdingsRef = db.collection(`users/${userId}/asset_holdings`);
            const holdingsSnap = await holdingsRef.get();

            if (holdingsSnap.empty) continue;

            const symbolsToRefetch = new Set<string>();
            const holdingMap = new Map<string, any>();
            let displayCurrency = 'AUD';

            // Try to get user settings for display currency
            try {
                const settingsRef = db.doc(`users/${userId}/settings/config`);
                const settingsSnap = await settingsRef.get();
                if (settingsSnap.exists) {
                    displayCurrency = settingsSnap.data()?.displayCurrency || 'AUD';
                }
            } catch (e) {
                // ignore
            }

            holdingsSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.symbol && ['Stock', 'Crypto', 'ETF', 'REIT'].includes(data.assetClass)) {
                    // Only process active holdings
                    if (Math.abs(data.quantity) < 0.0001) return;

                    const market = data.market || 'US';
                    const suffixed = addMarketSuffix(data.symbol, market);
                    
                    // Store mapping
                    holdingMap.set(data.symbol, { ...data, yahooSymbol: suffixed });

                    // 🛡️ 2. Smart Cooldown Check
                    if (!force && data.lastPriceTimestamp) {
                        // Handle both Timestamp and native Date (admin sdk returns timestamp mostly)
                        const lastTime = data.lastPriceTimestamp.toMillis ? data.lastPriceTimestamp.toMillis() : new Date(data.lastPriceTimestamp).getTime();
                        if (Date.now() - lastTime < CACHE_MS) {
                            // Fresh enough, skip
                            return; 
                        }
                    }
                    
                    symbolsToRefetch.add(suffixed);

                    // Add FX pair if needed
                    if (data.nativeCurrency && data.nativeCurrency !== displayCurrency) {
                        symbolsToRefetch.add(`${data.nativeCurrency}${displayCurrency}=X`);
                    }
                }
            });

                // 🛡️ 1. Symbol Deduplication happens naturally via Set
            // 🔥 Add Global FX Pairs (USD Base) to ensure coverage for Cash/Income
            const GLOBAL_FX_PAIRS = [
                'USDCNY=X', 'USDTWD=X', 'USDJPY=X', 'USDHKD=X', 'USDKRW=X', // Asia
                'AUDUSD=X', 'GBPUSD=X', 'EURUSD=X' // Majors (Inverse often preferred for these)
            ];
            GLOBAL_FX_PAIRS.forEach(p => symbolsToRefetch.add(p));

            const symbols = Array.from(symbolsToRefetch);
            
            if (symbols.length === 0) {
                matchLog.push(`User ${userId}: All data fresh (Smart Cooldown)`);
                continue;
            }

            console.log(`[Cron] Updating ${symbols.length} symbols for user ${userId} (incl. Globals)`);

            try {
                // 🔥 Use YahooProvider directly 
                // 🛡️ 3. Graceful Failure handled inside provider (returns what it can) but we add extra try-catch
                const pricesMap = await yahooProvider.batchGetPrices(symbols);

                const batch = db.batch();
                let updateCount = 0;

                // Update Holdings
                holdingMap.forEach((holding, rawSymbol) => {
                    // Only update if we actually requested and got this symbol
                    if (!symbolsToRefetch.has(holding.yahooSymbol)) return;

                    const priceData = pricesMap.get(holding.yahooSymbol);
                    if (priceData) {
                        const ref = holdingsRef.doc(rawSymbol);
                        batch.set(ref, {
                            lastPrice: priceData.priceInCents,
                            lastPriceTimestamp: process.env.NODE_ENV === 'test' ? new Date() : Timestamp.now(), 
                            updatedAt: process.env.NODE_ENV === 'test' ? new Date() : Timestamp.now(), 
                            ...(priceData.dividendInfo ? { dividendInfo: priceData.dividendInfo } : {}),
                        }, { merge: true });
                        updateCount++;
                    }
                });

                // Update FX Rates (only if we fetched them)
                pricesMap.forEach((priceData, symbol) => {
                    if (symbol.endsWith('=X') && symbolsToRefetch.has(symbol)) {
                        const from = symbol.substring(0, 3);
                        const to = symbol.substring(3, 6);
                        const rateRef = db.collection('exchange_rates').doc(symbol);
                        const multiplier = 10000;
                        batch.set(rateRef, {
                            fromCurrency: from,
                            toCurrency: to,
                            rate: priceData.priceInCents / multiplier,
                            timestamp: Timestamp.now(),
                        });
                    }
                });

                // Update User Config Timestamp
                const configRef = db.doc(`users/${userId}/settings/config`);
                batch.set(configRef, { lastPriceRefreshedAt: Date.now() }, { merge: true });

                if (updateCount > 0) {
                    await batch.commit();
                    matchLog.push(`User ${userId}: Updated ${updateCount} holdings`);
                    successCount++;
                } else {
                    matchLog.push(`User ${userId}: No new data fetched`);
                }

            } catch (err: any) {
                console.error(`[Cron] Error for user ${userId}:`, err);
                // 🛡️ 3. Graceful Failure: Log but don't crash the whole cron loop
                matchLog.push(`User ${userId}: Partial/Full Failure - ${err.message}`);
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            summary: `Processed ${usersSnap.size} users. Success: ${successCount}, Failed: ${failCount}`,
            log: matchLog
        });

    } catch (error: any) {
        console.error('[Cron] Critical failure:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
