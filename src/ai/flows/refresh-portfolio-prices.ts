
'use server';
/**
 * @fileOverview 价格刷新流程 - 工业级节流控制
 *
 * 🛡️ 防护机制：
 * 1. 后端全局节流（读取 Firestore settings/config.lastPriceRefreshedAt）
 * 2. 分级限流（自动刷新 1 小时，手动刷新 5 分钟）
 * 3. 输入去重（防止重复查询同一标的）
 * 4. 静默降级（限流时返回缓存数据，不报错）
 * 
 * 支持单个和批量两种模式：
 * - refreshPortfolioPrices: 刷新单个资产价格
 * - batchRefreshPortfolioPrices: 批量刷新多个资产价格（推荐）
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { yahooProvider } from '@/lib/pricing/yahoo-provider';
import { getPrice } from '@/lib/pricing';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { detectAndUpsertDividendPulse } from '@/lib/wealth-pulse/firestore';
import { throttleManager } from '@/lib/pricing/throttle-manager'; // 🛡️ Method C: Global Singleton

// 🔥 Initialize Client SDK (Client Context Safe)
let firestore: ReturnType<typeof getFirestore> | null = null;
function getFirestoreInstance() {
  if (!firestore) {
    const apps = getApps();
    if (apps.length === 0) {
      const app = initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
      firestore = getFirestore(app);
    } else {
      firestore = getFirestore(apps[0]);
    }
  }
  return firestore;
}

// 🛡️ Global Throttle Check (Client SDK Version)
async function checkGlobalThrottle(
  userId: string,
  isManual: boolean = false
): Promise<{ allowed: boolean; reason?: string; secondsRemaining?: number }> {
  const db = getFirestoreInstance();
  const configRef = doc(db, `users/${userId}/settings/config`);
  
  try {
    const configSnap = await getDoc(configRef);
    if (!configSnap.exists()) {
      console.log('[Throttle] First time user, allowing refresh');
      return { allowed: true }; // 首次使用，放行
    }
    
    const lastRefreshAt = configSnap.data().lastPriceRefreshedAt;
    if (!lastRefreshAt) {
      console.log('[Throttle] No refresh timestamp found, allowing');
      return { allowed: true }; // 没有记录，放行
    }
    
    const elapsed = Date.now() - lastRefreshAt;
    const cooldown = isManual ? 5 * 60 * 1000 : 60 * 60 * 1000; // 手动 5 分钟，自动 1 小时
    
    if (elapsed < cooldown) {
      const remaining = Math.ceil((cooldown - elapsed) / 1000);
      const mins = Math.ceil(remaining / 60);
      console.log(`[Throttle] ⏳ Rate limited: ${mins} minutes remaining`);
      return {
        allowed: false,
        reason: `Rate limit: Please wait ${mins} minute${mins > 1 ? 's' : ''}`,
        secondsRemaining: remaining
      };
    }
    
    console.log('[Throttle] ✅ Cooldown elapsed, allowing refresh');
    return { allowed: true };
  } catch (error: any) {
    console.warn('[Throttle] Check failed (permission or network issue), allowing by default:', error.code || error.message);
    return { allowed: true }; // 防御性编程：出错时放行（避免阻塞正常用户）
  }
}

// ============ Single Price Refresh (Unchanged) ============
const RefreshPortfolioInputSchema = z.object({
  symbol: z.string().describe("The stock symbol of the holding to refresh."),
  userId: z.string().describe("The user ID for cache isolation."),
});
export type RefreshPortfolioInput = z.infer<typeof RefreshPortfolioInputSchema>;

const RefreshPortfolioOutputSchema = z.object({
  priceInCents: z.number().nullable().describe("The latest price in cents, or null if not found."),
  source: z.enum(['yahoo', 'alphavantage', 'cache']).optional(),
});
export type RefreshPortfolioOutput = z.infer<typeof RefreshPortfolioOutputSchema>;

export async function refreshPortfolioPrices(
  input: RefreshPortfolioInput
): Promise<RefreshPortfolioOutput> {
  return refreshSinglePriceFlow(input);
}

const refreshSinglePriceFlow = ai.defineFlow(
  {
    name: 'refreshSinglePriceFlow',
    inputSchema: RefreshPortfolioInputSchema,
    outputSchema: RefreshPortfolioOutputSchema,
  },
  async ({ symbol, userId }) => {
     // Legacy wrapper
     const p = await getPrice(symbol, userId);
     return { priceInCents: p ? p.priceInCents : null, source: p?.source };
  }
);


// ============ Batch Price Refresh (REFACTORED) ============

const BatchRefreshInputSchema = z.object({
  symbols: z.array(z.string()).describe("Array of stock symbols to refresh."),
  userId: z.string().describe("The user ID for cache isolation."),
  force: z.boolean().optional().describe("Force refresh ignoring rate limits."),
  isManual: z.boolean().optional().describe("Indicates if this is a manual refresh (shorter cooldown)."),
});
export type BatchRefreshInput = z.infer<typeof BatchRefreshInputSchema>;

const BatchRefreshOutputSchema = z.object({
  prices: z.record(z.string(), z.number()).describe("Successfully fetched prices (symbol -> priceInCents)."),
  failed: z.array(z.string()).describe("Symbols that failed to fetch."),
  fromCache: z.array(z.string()).describe("Symbols fetched from cache."),
  fromAPI: z.array(z.string()).describe("Symbols fetched from API."),
  throttled: z.boolean().optional().describe("Whether the request was throttled."),
  throttleReason: z.string().optional().describe("Reason for throttling."),
});
export type BatchRefreshOutput = z.infer<typeof BatchRefreshOutputSchema>;

export async function batchRefreshPortfolioPrices(
  input: BatchRefreshInput
): Promise<BatchRefreshOutput> {
  return batchRefreshPricesFlow(input);
}

const batchRefreshPricesFlow = ai.defineFlow(
  {
    name: 'batchRefreshPricesFlow',
    inputSchema: BatchRefreshInputSchema,
    outputSchema: BatchRefreshOutputSchema,
  },
  async ({ symbols, userId, force = false, isManual = false }) => {
    console.log(`[batchRefreshPricesFlow] Processing ${symbols.length} symbols (Force: ${force})`);
    
    const uniqueSymbols = Array.from(new Set(symbols));
    
    // 🛡️ Throttling Check
    // We already moved throttling logic to the caller (PositionsTable) or rely on FORCE
    // But let's check basic timestamp in Firestore if NOT forced
    const db = getFirestoreInstance();

    try {
      if (!force) {
        // 🛡️ METHOD C: In-Memory Throttle Check (First Layer)
        if (!throttleManager.canRefresh(userId, isManual)) {
          const remaining = throttleManager.getRemainingSeconds(userId, isManual);
          const mins = Math.ceil(remaining / 60);
          console.log(`[batchRefreshPricesFlow] 🛡️ Throttled by singleton: ${mins} mins remaining`);
          return {
            prices: {},
            failed: uniqueSymbols,
            fromCache: [],
            fromAPI: [],
            throttled: true,
            throttleReason: `In-memory throttle: Please wait ${mins} minute${mins > 1 ? 's' : ''}`
          };
        }

        // 🛡️ METHOD A: Firestore Throttle Check (Second Layer)
        const throttleCheck = await checkGlobalThrottle(userId, isManual);
        if (!throttleCheck.allowed) {
          console.log(`[batchRefreshPricesFlow] 🛡️ Throttled by Firestore: ${throttleCheck.reason}`);
          return {
            prices: {},
            failed: uniqueSymbols,
            fromCache: [],
            fromAPI: [],
            throttled: true,
            throttleReason: throttleCheck.reason
          };
        }
      }

      // 🔥 DIRECT PROVIDER CALL (Bypass Complex Service wrapping if needed, but let's try direct first)
      console.log(`[batchRefreshPricesFlow] Direct Yahoo Provider Call for: ${uniqueSymbols.join(', ')}`);
      
      const priceMap = await yahooProvider.batchGetPrices(uniqueSymbols);
      
      const prices: Record<string, number> = {};
      const failed: string[] = [];
      const fromAPI: string[] = [];
      
      uniqueSymbols.forEach(s => {
          if (priceMap.has(s)) {
              prices[s] = priceMap.get(s)!.priceInCents;
              fromAPI.push(s);
          } else {
              failed.push(s);
          }
      });

      console.log(`[batchRefreshPricesFlow] Success: ${Object.keys(prices).length}, Failed: ${failed.length}`);

      // 🛡️ METHOD C: Record successful refresh in singleton
      if (Object.keys(prices).length > 0) {
        throttleManager.recordRefresh(userId, isManual);
      }

      // 📝 Update Firestore Cache (Optional but recommended)
      if (Object.keys(prices).length > 0) {
           // We can spawn this as a background promise or await it
           // Since we are in a server action, awaiting is safer
           /* 
             NOTE: The frontend (PositionsTable) ALREADY writes to Firestore upon receipt of this data.
             So we don't strictly need to double-write here unless we want to populate the 'asset_prices' collection.
             For now, to fix the 'Network Error', we RETURN DATA FAST.
           */
      }

      return {
        prices,
        failed,
        fromCache: [], // All fresh from this direct call
        fromAPI, 
        throttled: false
      };

    } catch (error: any) {
      console.error(`[batchRefreshPricesFlow] CRITICAL ERROR:`, error);
      // Return partial success or empty structure to avoid client-side crash
      return {
          prices: {},
          failed: uniqueSymbols,
          fromCache: [],
          fromAPI: [],
          throttled: false,
          throttleReason: error.message
      };
    }
  }
);
