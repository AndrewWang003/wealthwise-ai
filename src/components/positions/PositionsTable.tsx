'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc, serverTimestamp, onSnapshot, collection, getDocs } from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePageContext } from '@/contexts/PageContext';
import { batchRefreshPortfolioPrices } from '@/ai/flows/refresh-portfolio-prices';
import { writeBatch } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { InfoIcon, History, RefreshCw, AlertTriangle, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

import { SmartCurrencyTabs } from '@/components/common/SmartCurrencyTabs';
import { Currency, Market, Asset, AssetType } from '@/lib/types';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

export function PositionsTable() {
  const { 
    positions, 
    isLoading, 
    settings, 
    firestore, 
    user,
    displayCurrency,
    totalNetWorth,
    refreshData 
  } = usePortfolio();
  const { setPageData, setPageName } = usePageContext();
  const [showClosedPositions, setShowClosedPositions] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'positions' | 'accounts'>('all');

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isThrottleDataLoaded, setIsThrottleDataLoaded] = useState(false); // 🛡️ Race Condition Fix
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReloadingData, setIsReloadingData] = useState(false);
  const { toast } = useToast();

  // 🎯 Stable References for useEffect (Method B Fix)
  const displayCurrencyRef = useRef(displayCurrency);
  const filteredPositionsRef = useRef<typeof positions>([]);

  // 📊 Asset Type Grouping
  const [groupByType, setGroupByType] = useState(true);
  const [assetsMap, setAssetsMap] = useState<Map<string, Asset>>(new Map());

  // Fetch user's assets for type lookup
  useEffect(() => {
    if (!user || !firestore) return;
    
    const fetchAssets = async () => {
      try {
        const assetsSnap = await getDocs(collection(firestore, `users/${user.uid}/assets`));
        const map = new Map<string, Asset>();
        assetsSnap.docs.forEach(doc => {
          const asset = doc.data() as Asset;
          map.set(asset.symbol?.toUpperCase() || '', asset);
        });
        setAssetsMap(map);
      } catch (err) {
        console.error('[PositionsTable] Failed to fetch assets:', err);
      }
    };
    
    fetchAssets();
  }, [user, firestore]);

  // Infer asset type from symbol/assetClass if not in assets collection
  const getAssetType = useCallback((symbol: string, assetClass: string): AssetType => {
    const asset = assetsMap.get(symbol.toUpperCase());
    if (asset?.type) return asset.type;
    
    // Fallback heuristics
    const lowerClass = assetClass?.toLowerCase() || '';
    if (lowerClass === 'etf') return 'ETF';
    if (lowerClass === 'crypto') return 'CRYPTO';
    if (lowerClass === 'reit') return 'REIT';
    if (lowerClass === 'bond') return 'BOND';
    if (lowerClass === 'commodity') return 'COMMODITY';
    if (lowerClass === 'index') return 'INDEX';
    return 'STOCK';
  }, [assetsMap]);

  // 🔍 SORTING STATE
  type SortKey = 'symbol' | 'assetClass' | 'market' | 'quantity' | 'avgCost' | 'price' | 'fxRate' | 'marketValue' | 'plPercent' | 'weight';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: SortKey) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return current.direction === 'asc' 
          ? { key, direction: 'desc' } 
          : null; // Toggle off if clicking desc
      }
      return { key, direction: 'asc' };
    });
  };

  const renderSortArrow = (key: SortKey) => {
    if (sortConfig?.key !== key) return <div className="w-3 h-3 ml-1" />; // Placeholder
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  // 🎯 Helper: Add market suffix to symbols for Yahoo Finance API
  const addMarketSuffix = (symbol: string, market: Market): string => {
    // Skip if already has suffix
    if (symbol.includes('.') || symbol.includes('=')) return symbol;
    
    switch (market) {
      case 'ASX':
        return `${symbol}.AX`;
      case 'HKEX':
        return `${symbol}.HK`;
      case 'SSE':
      case 'SZSE':
        return `${symbol}.SS`; // Shanghai/Shenzhen
      case 'TSE':
        return `${symbol}.T`; // Tokyo
      case 'LSE':
        return `${symbol}.L`; // London
      case 'NASDAQ':
      case 'NYSE':
      case 'US':
      default:
        return symbol; // US stocks don't need suffix
    }
  };

  // 👂 Listen for backend refresh timestamp (Transparency)
  useEffect(() => {
    if (!user || !firestore) return;
    const unsub = onSnapshot(doc(firestore, `users/${user.uid}/settings/config`), (snap) => {
      if (snap.exists() && snap.data().lastPriceRefreshedAt) {
        // Handle both number (Date.now()) and Firestore Timestamp
        const val = snap.data().lastPriceRefreshedAt;
        const date = typeof val === 'number' ? new Date(val) : val?.toDate ? val.toDate() : null;
        if (date) setLastRefresh(date);
      } else {
        // No timestamp found, meaning it's the first refresh ever
        setLastRefresh(null);
      }
      // 🛡️ Mark as loaded (even if no data exists)
      setIsThrottleDataLoaded(true);
    });
    return () => unsub();
  }, [user, firestore]);

  // Filter positions based on quantity and toggle
  const filteredPositions = useMemo(() => {
    return positions.filter(pos => {
      const hasBalance = Math.abs(pos.quantity) > 0.0001;
      if (hasBalance) return true;
      
      // 🔍 Distinguish between:
      // 1. Account-based cash positions (from Settings > Accounts) - KEEP ALL
      // 2. Generic currency buckets (e.g., "USD Cash", "AUD Cash") - FILTER IF ZERO
      const isCashType = pos.isCash || pos.assetClass.includes('Cash') || pos.symbol.includes('Cash');
      
      if (isCashType) {
        // If symbol matches pattern "XXX Cash" (generic currency bucket), filter it out
        const isGenericCashBucket = /^[A-Z]{3} Cash$/.test(pos.symbol);
        if (isGenericCashBucket) return false;
        
        // Otherwise, it's an account-based position (e.g., "Common", "MooMoo") - keep it
        return true;
      }
      
      return showClosedPositions;
    });
  }, [positions, showClosedPositions]);

  // 🔄 Update refs whenever these values change (but don't trigger useEffect)
  useEffect(() => {
    displayCurrencyRef.current = displayCurrency;
  }, [displayCurrency]);

  useEffect(() => {
    filteredPositionsRef.current = filteredPositions;
  }, [filteredPositions]);

  // 🧮 MEMOIZED SORTING LOGIC
  const sortedPositions = useMemo(() => {
    if (!sortConfig) return filteredPositions;

    return [...filteredPositions].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      // Map SortKey to actual data properties
      switch (sortConfig.key) {
        case 'symbol': valA = a.symbol; valB = b.symbol; break;
        case 'assetClass': valA = a.assetClass; valB = b.assetClass; break;
        case 'market': valA = a.market; valB = b.market; break;
        case 'quantity': valA = Math.abs(a.quantity); valB = Math.abs(b.quantity); break; // Sort by magnitude
        case 'avgCost': valA = a.averageCost; valB = b.averageCost; break;
        case 'price': valA = a.lastPrice; valB = b.lastPrice; break;
        case 'fxRate': valA = a.fxRate; valB = b.fxRate; break;
        case 'marketValue': valA = a.marketValueDisplay; valB = b.marketValueDisplay; break;
        case 'plPercent': valA = a.plPercent; valB = b.plPercent; break;
        case 'weight': valA = a.weight; valB = b.weight; break;
        default: return 0;
      }

      // Handle strings (case-insensitive)
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      // Handle numbers
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPositions, sortConfig]);

  // 📊 Group positions by asset type
  const groupedPositions = useMemo(() => {
    if (!groupByType) return null;
    
    const groups: Record<AssetType, typeof sortedPositions> = {
      'STOCK': [],
      'ETF': [],
      'CRYPTO': [],
      'REIT': [],
      'BOND': [],
      'COMMODITY': [],
      'INDEX': [],
    };
    
    sortedPositions.forEach(pos => {
      // Skip cash positions from grouping
      if (pos.isCash) return;
      
      const type = getAssetType(pos.symbol, pos.assetClass);
      groups[type].push(pos);
    });
    
    // Filter out empty groups
    return Object.entries(groups)
      .filter(([_, items]) => items.length > 0)
      .map(([type, items]) => ({ type: type as AssetType, items }));
  }, [sortedPositions, groupByType, getAssetType]);

  // Get cash positions separately
  const cashPositions = useMemo(() => {
    return sortedPositions.filter(pos => pos.isCash);
  }, [sortedPositions]);

  // 🎯 View Filter Logic
  const viewFilteredData = useMemo(() => {
    switch (viewFilter) {
      case 'positions':
        return sortedPositions.filter(pos => !pos.isCash);
      case 'accounts':
        return sortedPositions.filter(pos => pos.isCash);
      case 'all':
      default:
        return sortedPositions;
    }
  }, [sortedPositions, viewFilter]);

  // 🧮 Calculate dynamic total based on view filter
  // ⚠️ IMPORTANT: Keep this hook before any conditional returns (e.g., loading/empty states) 
  // to strictly adhere to React's Rules of Hooks.
  const filteredTotalValue = useMemo(() => {
    return viewFilteredData.reduce((acc, pos) => acc + (pos.marketValueDisplay || 0), 0);
  }, [viewFilteredData]);

  // 🧮 Calculate Total Cost Basis & P/L
  const filteredTotalCost = useMemo(() => {
    return viewFilteredData.reduce((acc, pos) => {
      // For cash, cost basis is roughly equal to value (ignoring FX nuances for now), 
      // but usually we don't track P/L on cash unless it's explicitly FX trading.
      // If it's a cash position, let's treat Cost = Value (P/L = 0) to avoid skewing stats,
      // OR if we want to show pure investment P/L, we might handle it differently.
      // Current logic: Cash positions usually have plPercent = 0.
      if (pos.isCash) {
        return acc + (pos.marketValueDisplay || 0);
      }
      return acc + (Math.abs(pos.quantity) * pos.averageCost * pos.fxRate);
    }, 0);
  }, [viewFilteredData]);

  const totalUnrealizedPL = filteredTotalValue - filteredTotalCost;
  const totalPLPercent = filteredTotalCost !== 0 ? (totalUnrealizedPL / filteredTotalCost) * 100 : 0;

  // Use global total for 'All', otherwise use filtered total
  const displayTotal = viewFilter === 'all' ? totalNetWorth : filteredTotalValue;

  // 🏭 Pagination Hook (Uses View Filtered Data)
  const { currentData, ...pagination } = usePagination(viewFilteredData, 20);

  // 🔄 Firestore Data Refresh (No API Call)
  const reloadFirestoreData = useCallback(() => {
    if (isReloadingData) return;
    
    setIsReloadingData(true);
    console.log('[Data Reload] 🔄 触发软刷新...');
    
    // Use Context refresh trigger to force re-fetch
    refreshData();
    
    // Firestore 监听器会自动获取最新数据
    setTimeout(() => {
      console.log('[Data Reload] 💡 Firestore 实时监听器已激活，数据应在1-2秒内更新');
      setIsReloadingData(false);
    }, 1500);
  }, [isReloadingData, refreshData]);

  // 🔄 Manual Force Refresh Function
  const forceRefreshPrices = async () => {
    if (!user || !firestore || isRefreshing) return;
    
    setIsRefreshing(true);
    console.log('[Manual Refresh] 🚀 User triggered force refresh');
    
    try {
      const stocksToUpdate = filteredPositions.filter(h => h.assetClass === 'Stock' && Math.abs(h.quantity) > 0.0001);
      const symbols = Array.from(new Set(stocksToUpdate.map(s => addMarketSuffix(s.symbol, s.market))));
      
      const nativeCurrencies = Array.from(new Set(filteredPositions.map(p => p.nativeCurrency)));
      nativeCurrencies.forEach(nc => {
        if (nc !== displayCurrency) {
          symbols.push(`${nc}${displayCurrency}=X`);
        }
      });

      if (symbols.length === 0) {
        console.log('[Manual Refresh] No symbols to refresh.');
        return;
      }

      console.log(`[Manual Refresh] 🔄 Refreshing ${symbols.length} symbols: ${symbols.join(', ')}`);

      const result = await batchRefreshPortfolioPrices({
        symbols,
        userId: user.uid,
        isManual: true, // 🔥 标记为手动刷新（5分钟冷却）
        force: true, // 🚀 强制刷新，跳过节流检查
      });

      console.log(`[Manual Refresh] 📊 Result:`, {
        totalPrices: Object.keys(result.prices || {}).length,
        fromCache: result.fromCache?.length || 0,
        fromAPI: result.fromAPI?.length || 0,
        failed: result.failed?.length || 0,
        throttled: result.throttled || false,
      });

      // 🛡️ 处理限流响应
      if (result.throttled) {
        console.warn(`[Manual Refresh] ⏳ 被限流: ${result.throttleReason}`);
        toast({
          title: "⏳ Refresh Throttled",
          description: result.throttleReason || "Please wait before refreshing again",
          variant: "default",
        });
        setIsRefreshing(false);
        return;
      }

      if (result && result.prices && Object.keys(result.prices).length > 0) {
        const batch = writeBatch(firestore);
        let updateCount = 0;

        stocksToUpdate.forEach(stock => {
          const yahooSymbol = addMarketSuffix(stock.symbol, stock.market);
          const priceData = (result.prices as any)[yahooSymbol];
          if (priceData && typeof priceData === 'number') {
            // 🔥 使用 symbol 作为文档 ID，确保文档存在
            const holdingRef = doc(firestore, `users/${user.uid}/asset_holdings/${stock.symbol}`);
            batch.set(holdingRef, {
              symbol: stock.symbol,
              market: stock.market,
              assetClass: stock.assetClass,
              lastPrice: priceData,
              lastPriceTimestamp: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }, { merge: true });
            updateCount++;
            console.log(`[Manual Refresh] 💰 Updated ${stock.symbol}: ${priceData} cents`);
          }
        });

        Object.entries(result.prices as any).forEach(([symbol, data]: [string, any]) => {
          if (symbol.endsWith('=X')) {
            const from = symbol.substring(0, 3) as Currency;
            const to = symbol.substring(3, 6) as Currency;
            const rateRef = doc(firestore, 'exchange_rates', symbol);
            const multiplier = 10000;
            batch.set(rateRef, {
              fromCurrency: from,
              toCurrency: to,
              rate: data / multiplier,
              timestamp: serverTimestamp(),
            });
            console.log(`[Manual Refresh] 💱 Updated FX ${symbol}: ${(data / multiplier).toFixed(4)}`);
          }
        });

        const configRef = doc(firestore, `users/${user.uid}/settings/config`);
        batch.set(configRef, { lastPriceRefreshedAt: Date.now() }, { merge: true });

        if (updateCount > 0 || Object.keys(result.prices).some(s => s.endsWith('=X'))) {
          await batch.commit();
          console.log(`[Manual Refresh] ✅ Complete: ${updateCount} holdings + ${Object.keys(result.prices).filter(s => s.endsWith('=X')).length} FX rates updated`);
          console.log('[Manual Refresh] 💡 Firestore 已更新，UI 将通过 onSnapshot 自动刷新');
          
          toast({
            title: "✅ Prices Refreshed",
            description: `Updated ${updateCount} holdings and ${Object.keys(result.prices).filter(s => s.endsWith('=X')).length} FX rates`,
            variant: "default",
          });
        } else {
          toast({
            title: "ℹ️ No Updates Needed",
            description: "All prices are current (from cache)",
            variant: "default",
          });
        }
      } else {
        toast({
          title: "⚠️ No Prices Retrieved",
          description: "Unable to fetch price data. Check your internet connection.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error(`[Manual Refresh] ❌ Failed:`, error);
      toast({
        title: "❌ Refresh Failed",
        description: error?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Price Refresh Scheduler (Batch Mode with Hard Throttling)
  // 🎯 METHOD B FIX: Only depend on stable infrastructure (user.uid, firestore)
  useEffect(() => {
    if (!user || !firestore) {
      return;
    }

    // 🛡️ RACE CONDITION FIX: Wait for Firestore throttle data to load
    if (!isThrottleDataLoaded) {
      console.log('[Price-Scheduler] ⏳ Waiting for throttle data to load from Firestore...');
      return;
    }

    // Use ref to get latest values without triggering re-execution
    const currentFilteredPositions = filteredPositionsRef.current;
    const currentDisplayCurrency = displayCurrencyRef.current;

    if (!currentFilteredPositions || currentFilteredPositions.length === 0) {
      console.log('[Price-Scheduler] No positions to refresh yet');
      return;
    }

    const stocksToUpdate = currentFilteredPositions.filter(h => h.assetClass === 'Stock' && Math.abs(h.quantity) > 0.0001);
    
    const runBatchRefresh = async () => {
      // 🛡️ API PROTECTION: Hard Throttling (1 Hour)
      // Check both local state and "transparency" record
      if (lastRefresh) {
        const timeSinceLastRefresh = Date.now() - lastRefresh.getTime();
        const ONE_HOUR = 3600000;
        if (timeSinceLastRefresh < ONE_HOUR) {
          console.log(`[Price-Scheduler] ⏳ Throttled. Last refresh was ${Math.round(timeSinceLastRefresh / 60000)} mins ago. Next refresh in ${Math.round((ONE_HOUR - timeSinceLastRefresh) / 60000)} mins.`);
          return;
        }
      }

      const symbols = Array.from(new Set(stocksToUpdate.map(s => addMarketSuffix(s.symbol, s.market))));
      
      // 🎯 FX as Tickers Logic - Use ref value
      const nativeCurrencies = Array.from(new Set(currentFilteredPositions.map(p => p.nativeCurrency)));
      nativeCurrencies.forEach(nc => {
        if (nc !== currentDisplayCurrency) {
          symbols.push(`${nc}${currentDisplayCurrency}=X`);
        }
      });

      if (symbols.length === 0) {
        console.log('[Price-Scheduler] No symbols to refresh.');
        return;
      }

      console.log(`[Price-Scheduler] 🔄 Initiating API Refresh for ${symbols.length} symbols: ${symbols.join(', ')}`);

      try {
        const result = await batchRefreshPortfolioPrices({
          symbols,
          userId: user.uid,
          isManual: false, // 自动刷新（1小时冷却）
        });

        console.log(`[Price-Scheduler] 📊 Result:`, {
          totalPrices: Object.keys(result.prices || {}).length,
          fromCache: result.fromCache?.length || 0,
          fromAPI: result.fromAPI?.length || 0,
          failed: result.failed?.length || 0,
          throttled: result.throttled || false,
        });

        // 🛡️ 静默处理限流（自动刷新不报错）
        if (result.throttled) {
          console.log(`[Price-Scheduler] ⏳ 静默限流，使用缓存数据`);
          return; // 静默退出
        }

        if (result && result.prices && Object.keys(result.prices).length > 0) {
          const batch = writeBatch(firestore);
          let updateCount = 0;

          // Update asset holdings prices
          stocksToUpdate.forEach(stock => {
            const yahooSymbol = addMarketSuffix(stock.symbol, stock.market);
            const priceData = (result.prices as any)[yahooSymbol];
            if (priceData && typeof priceData === 'number') {
              // 🔥 使用 symbol 作为文档 ID
              const holdingRef = doc(firestore, `users/${user.uid}/asset_holdings/${stock.symbol}`);
              batch.set(holdingRef, {
                symbol: stock.symbol,
                market: stock.market,
                assetClass: stock.assetClass,
                lastPrice: priceData,
                lastPriceTimestamp: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }, { merge: true });
              updateCount++;
              console.log(`[Price-Scheduler] 💰 Updated ${stock.symbol}: ${priceData} cents`);
            }
          });

          // Update global exchange rates
          Object.entries(result.prices as any).forEach(([symbol, data]: [string, any]) => {
            if (symbol.endsWith('=X')) {
              const from = symbol.substring(0, 3) as Currency;
              const to = symbol.substring(3, 6) as Currency;
              const rateRef = doc(firestore, 'exchange_rates', symbol);
              const multiplier = 10000;
              batch.set(rateRef, {
                fromCurrency: from,
                toCurrency: to,
                rate: data / multiplier,
                timestamp: serverTimestamp(),
              });
              console.log(`[Price-Scheduler] 💱 Updated FX ${symbol}: ${(data / multiplier).toFixed(4)}`);
            }
          });

          // 📝 Record Success Timestamp (Server-side Throttling Record)
          const configRef = doc(firestore, `users/${user.uid}/settings/config`);
          batch.set(configRef, { lastPriceRefreshedAt: Date.now() }, { merge: true });

          if (updateCount > 0 || Object.keys(result.prices).some(s => s.endsWith('=X'))) {
            await batch.commit();
            console.log(`[Price-Scheduler] ✅ Batch Update Complete: ${updateCount} holdings + ${Object.keys(result.prices).filter(s => s.endsWith('=X')).length} FX rates updated`);
          } else {
            console.log(`[Price-Scheduler] ⚠️ No updates needed (all prices from cache)`);
          }
        } else {
          console.warn(`[Price-Scheduler] ⚠️ No prices returned from API`);
        }
      } catch (error) {
        console.error(`[Price-Scheduler] ❌ Batch Failed:`, error);
      }
    };

    // Run throttled check immediately
    runBatchRefresh();
    
    // Set interval to 60 mins (Consistency)
    const intervalId = setInterval(runBatchRefresh, 3600000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, firestore, isThrottleDataLoaded]); // ← Added isThrottleDataLoaded to prevent race condition

  useEffect(() => {
    setPageName('positions');
    setPageData({ positions, totalNetWorth });

    return () => {
      setPageData(null);
    };
  }, [positions, totalNetWorth, setPageData, setPageName]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Positions</CardTitle>
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Positions Yet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              You don&apos;t have any holdings. Add a transaction to start your investment journey.
            </p>
            <Button asChild>
              <Link href="/transactions">Add Transaction</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-md">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">Current Positions</CardTitle>
            <CardDescription>
              {settings?.isCashTrackingEnabled
                ? "A summary of your current asset holdings and cash balances."
                : "A summary of your current stock and crypto holdings (Cash Tracking Disabled)."}
            </CardDescription>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* 💎 智能动态币种选择器 */}
            <SmartCurrencyTabs />

            <div className="flex items-center h-9 space-x-2 bg-white/5 px-3 rounded-lg border border-white/10 shrink-0">
              <History className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="show-history" className="text-xs font-medium cursor-pointer">View History</Label>
              <Switch
                id="show-history"
                checked={showClosedPositions}
                onCheckedChange={setShowClosedPositions}
                className="scale-75 origin-right" 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 🆕 View Filter Tabs */}
          <Tabs value={viewFilter} onValueChange={(v) => setViewFilter(v as typeof viewFilter)} className="w-full mb-6">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 🛡️ API Protection & Transparency Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-md gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              <div className="flex flex-col">
                <span className="text-xs font-mono text-muted-foreground">
                  Last Updated: <span className="text-foreground font-bold">{lastRefresh ? lastRefresh.toLocaleTimeString() : 'Pending...'}</span>
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <AlertTriangle className="h-3 w-3 text-yellow-500/50" />
                  <span className="text-[10px] text-muted-foreground/60">
                    提示：行情价格为非实时数据，存在约 15-20 分钟延迟。
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={forceRefreshPrices}
                    disabled={isRefreshing || isReloadingData}
                    className={clsx(
                      "h-8 gap-2",
                      isRefreshing && "opacity-50 cursor-wait"
                    )}
                  >
                    <RefreshCw className={clsx("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-zinc-900 text-zinc-100 border-zinc-800">
                  <p>强制从 Yahoo Finance API 获取最新价格</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={reloadFirestoreData}
                    disabled={isRefreshing || isReloadingData}
                    className={clsx(
                      "h-8 gap-2",
                      isReloadingData && "opacity-50 cursor-wait"
                    )}
                  >
                    <RefreshCw className={clsx("h-3.5 w-3.5", isReloadingData && "animate-spin")} />
                    {isReloadingData ? 'Reloading...' : 'Refresh Data'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-zinc-900 text-zinc-100 border-zinc-800">
                  <p>从 Firestore 重新加载数据（不调用 API）</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
           <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-white/10 text-xs uppercase tracking-wider">
                  <TableHead className="font-semibold cursor-pointer select-none" onClick={() => handleSort('symbol')}>
                    <div className="flex items-center hover:text-white transition-colors">
                      Symbol {renderSortArrow('symbol')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold hidden md:table-cell cursor-pointer select-none" onClick={() => handleSort('assetClass')}>
                    <div className="flex items-center hover:text-white transition-colors">
                      Class {renderSortArrow('assetClass')}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold hidden lg:table-cell cursor-pointer select-none" onClick={() => handleSort('market')}>
                    <div className="flex items-center hover:text-white transition-colors">
                      Mkt {renderSortArrow('market')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer select-none" onClick={() => handleSort('quantity')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      Qty {renderSortArrow('quantity')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer select-none" onClick={() => handleSort('avgCost')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      Avg Cost {renderSortArrow('avgCost')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer select-none" onClick={() => handleSort('price')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      Price {renderSortArrow('price')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold hidden sm:table-cell cursor-pointer select-none" onClick={() => handleSort('fxRate')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      FX {renderSortArrow('fxRate')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer select-none" onClick={() => handleSort('marketValue')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      Value ({displayCurrency}) {renderSortArrow('marketValue')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold cursor-pointer select-none" onClick={() => handleSort('plPercent')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      P/L % {renderSortArrow('plPercent')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right font-semibold hidden xl:table-cell cursor-pointer select-none" onClick={() => handleSort('weight')}>
                    <div className="flex items-center justify-end hover:text-white transition-colors">
                      Weight {renderSortArrow('weight')}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout" initial={false}>
                {currentData.map((pos) => (
                  <motion.tr
                    key={pos.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className={clsx("group border-b border-white/5 hover:bg-white/5 transition-colors", {
                      "opacity-50 grayscale-[0.5]": Math.abs(pos.quantity) < 0.0001
                    })}
                  >
                    <TableCell className="font-bold py-4">
                      <div className="flex items-center gap-2">
                        {pos.symbol}
                        {pos.isCash && pos.quantity < 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <InfoIcon className="h-3.5 w-3.5 text-red-400" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[200px] bg-zinc-900 text-zinc-100 border-zinc-800">
                                <p>余额为负数可能由于过度购买或未记录的入金操作。建议补充现金以平衡账户。</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {/* 🏦 Default Account Badge */}
                        {pos.isDefault && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase font-semibold">
                            Default
                          </span>
                        )}
                        {/* ⚠️ Closed Position Badge - Only for non-cash, non-default positions */}
                        {Math.abs(pos.quantity) < 0.0001 && !pos.isCash && !pos.isDefault && (
                          <span className="text-[10px] text-muted-foreground border px-1 rounded uppercase">Closed</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={clsx("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", {
                        'bg-blue-500/10 text-blue-400': pos.assetClass === 'Stock',
                        'bg-purple-500/10 text-purple-400': pos.isCash,
                        'bg-orange-500/10 text-orange-400': pos.assetClass === 'Crypto'
                      })}>
                        {pos.assetClass}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">{pos.market}</TableCell>
                    <TableCell className={clsx("text-right font-mono", {
                      'text-red-400 font-bold': pos.quantity < 0,  // 🆕 All negative (shorts + overdraft)
                      'text-zinc-200 font-medium': pos.quantity >= 0
                    })}>
                      {/* 🆕 SHORT POSITION: Show parentheses for negative quantities */}
                      {pos.quantity < 0 
                        ? `(${Math.abs(pos.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                        : pos.quantity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {formatCurrency(pos.averageCost, pos.nativeCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(pos.lastPrice, pos.nativeCurrency)}
                    </TableCell>
                    {/* 🎯 透明汇率列 */}
                    <TableCell className="text-right hidden sm:table-cell">
                      {pos.nativeCurrency === displayCurrency ? (
                        <span className="text-muted-foreground/30">—</span>
                      ) : (pos as any).hasConversionError ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-end cursor-help">
                              <span className="text-[10px] text-red-400 uppercase">{pos.nativeCurrency}→{displayCurrency}</span>
                              <span className="text-xs font-mono text-red-500">⚠️ N/A</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-red-950/90 border-red-500/50">
                            <p className="text-xs text-red-100">无法获取 {pos.nativeCurrency} 汇率</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-muted-foreground uppercase">{pos.nativeCurrency}→{displayCurrency}</span>
                          <span className="text-xs font-mono text-primary/80">{pos.fxRate.toFixed(4)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={clsx("text-right font-bold", {
                      'text-red-400': pos.marketValueDisplay < 0 || (pos as any).hasConversionError,
                      'text-primary': pos.marketValueDisplay >= 0 && !(pos as any).hasConversionError
                    })}>
                      {(pos as any).hasConversionError ? '—' : formatCurrency(pos.marketValueDisplay, displayCurrency)}
                    </TableCell>
                    <TableCell className={clsx("text-right font-bold", {
                      'text-green-400': pos.plPercent > 0,
                      'text-red-400': pos.plPercent < 0,
                      'text-muted-foreground': pos.isCash || Math.abs(pos.quantity) < 0.0001
                    })}>
                      {pos.isCash ? '-' : `${pos.plPercent.toFixed(2)}%`}
                    </TableCell>
                    <TableCell className="text-right hidden xl:table-cell">
                      <div className="flex flex-col items-end gap-1">
                        <span className={clsx("text-xs font-mono", {
                          "text-red-400": pos.weight < 0,
                          "text-zinc-200": pos.weight >= 0
                        })}>
                          {pos.weight.toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(Math.abs(pos.weight), 100)}%` }}
                            className={clsx("h-full rounded-full shadow-[0_0_8px_rgba(0,0,0,0)]", {
                              "bg-gradient-to-r from-amber-400 to-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]": pos.weight >= 0,
                              "bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.4)]": pos.weight < 0
                            })}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
              <TableFooter className="w-full bg-zinc-900/50 backdrop-blur-sm border-t border-white/10">
                <TableRow className="hover:bg-transparent w-full">
                  <TableCell colSpan={5} className="py-5 text-base font-medium text-zinc-400">
                    <div className="flex items-center gap-3">
                      <span>Total Portfolio Value</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-5 col-span-4" colSpan={4}>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-2xl font-bold text-emerald-400 tracking-tight">
                        {formatCurrency(displayTotal, displayCurrency)}
                      </span>
                      
                      {/* Only show Unrealized P/L in 'Positions' view */}
                      {viewFilter === 'positions' && (
                        <span className={clsx("text-sm font-mono font-bold tracking-wide flex items-center gap-2", {
                          "text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]": totalUnrealizedPL >= 0,
                          "text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]": totalUnrealizedPL < 0
                        })}>
                          <span>
                            {totalUnrealizedPL >= 0 ? "+" : ""}{formatCurrency(totalUnrealizedPL, displayCurrency)}
                          </span>
                          <span>
                            {totalPLPercent >= 0 ? "+" : ""}{totalPLPercent.toFixed(2)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell py-5"></TableCell>
                </TableRow>
              </TableFooter>
          </Table>
        </div>
        
        {/* 🏭 Industrial-Grade Pagination System */}
        {filteredPositions.length > 0 && (
          <TablePagination
            {...pagination}
            onPageChange={pagination.setCurrentPage}
            onPageSizeChange={pagination.setPageSize}
            isLoading={isLoading}
          />
        )}
      </CardContent>
    </Card>



    </TooltipProvider>
  );
}
