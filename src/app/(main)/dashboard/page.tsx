'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useMemoFirebase, useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { usePortfolioAggregation } from '@/hooks/usePortfolioAggregation';
import { useDailySnapshot } from '@/hooks/useDailySnapshot';
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, LayoutTemplate, Save, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

// Widgets


import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { SpendingTrendWidget } from '@/components/dashboard/widgets/SpendingTrendWidget';
import { NotificationBar } from '@/components/dashboard/NotificationBar';
import { SmartCurrencyTabs } from '@/components/common/SmartCurrencyTabs';
import { CashFlowSummary } from '@/components/cash-flow/CashFlowSummary';
import { useCashFlow } from '@/hooks/useCashFlow';

// RGL & Customization
// @ts-ignore
import { Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore, DASHBOARD_WIDGETS, type GridHelperLayout } from '@/stores/useDashboardStore';
import { DraggableWidgetWrapper } from '@/components/dashboard/DraggableWidgetWrapper';
import { withWidth } from '@/components/dashboard/WidthProvider';

// --- Types ---
const ResponsiveGridLayout = withWidth(Responsive);

const WIDGET_LABELS: Record<string, string> = {
  [DASHBOARD_WIDGETS.NET_WORTH]: 'Total Valuation',
  [DASHBOARD_WIDGETS.SPENDING_TREND]: 'Monthly Burn',
  [DASHBOARD_WIDGETS.DIVIDEND_RECEIVED]: 'Recent Income',
  [DASHBOARD_WIDGETS.WEALTH_GOAL]: 'Wealth Goal',
  [DASHBOARD_WIDGETS.CASH_FLOW_SUMMARY]: 'Cash Flow',
};

import { usePortfolio } from '@/contexts/PortfolioContext';

// Wrapper component for CashFlowSummary to handle data fetching
function CashFlowSummaryWidget({ transactions }: { transactions: any[] }) {
  const { displayCurrency, getExchangeRate } = usePortfolio();
  const { monthlyIncome, monthlyExpense } = useCashFlow(transactions, displayCurrency, getExchangeRate);
  return <CashFlowSummary income={monthlyIncome} expense={monthlyExpense} currencyCode={displayCurrency} />;
}

export default function DashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  
  // Customization Store
  const { layout, isEditMode, updateLayout, toggleEditMode, resetLayout, toggleWidgetVisibility } = useDashboardStore();
  
  // Filter for visible items and enforce static mode when not editing
  const activeLayout = useMemo(() => {
      return layout
        .filter(l => l.visible !== false)
        .map(l => ({
            ...l,
            static: !isEditMode, // CRITICAL: This forces the item to be locked
            isDraggable: isEditMode,
            isResizable: isEditMode
        }));
  }, [layout, isEditMode]);
  
  // Data Fetching Logic (Kept from original)
  // RE-INJECTING useFirebase for DATA FETCHING ONLY
  const { user: authUser } = require('@/firebase').useFirebase(); 

  const realTransactionsQuery = useMemoFirebase(() => {
     if (!authUser) return null;
     return query(
       collection(firestore, `users/${authUser.uid}/transactions`),
       orderBy('createdAt', 'desc'),
       limit(200)
     );
  }, [authUser, firestore]);

  const { data: transactions, isLoading } = useCollection(realTransactionsQuery);
  const { aggregatedPositions } = usePortfolioAggregation(transactions || [], [], true);
  
  let investmentsValue = 0;
  let cashValue = 0;
  aggregatedPositions.forEach(pos => {
    const value = pos.totalQuantity * pos.averageCost; 
    if (pos.isCash || pos.symbol.includes('USD') || pos.symbol.includes('AUD')) {
        cashValue += value;
    } else {
        investmentsValue += value;
    }
  });

  const currentNetWorth = investmentsValue + cashValue;

  // Snapshot Trigger
  useDailySnapshot(isLoading ? null : {
    netWorth: currentNetWorth,
    totalAssets: investmentsValue,
    totalCash: cashValue,
    currency: 'AUD'
  });

  // Calculate Net Worth Change for Display (Mocked for existing UI parity)
  const ytdChange = "+12.5%"; // Static for now as per design

  // --- Render Helpers ---

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };
  
  const userDisplayName = user?.displayName || authUser?.displayName || "Investigator";

  if (isLoading) {
     return <Skeleton className="w-full h-screen bg-black" />;
  }

  // --- RGL Handlers ---

  const handleLayoutChange = (currentLayout: any[]) => {
    // CRITICAL FIX: Only save changes to store if user is explicitly in Edit Mode.
    // This prevents browser resizing from permanently corrupting the desktop layout.
    if (isEditMode && currentLayout && currentLayout.length > 0) {
        // MERGE LOGIC:
        // RGL returns only the visible/active items in 'currentLayout'.
        // We must merge these updated positions (x, y, w, h) into our master 'layout'
        // while preserving the items that are currently hidden (visible: false).
        // Otherwise, hidden items would be permanently deleted from the store.
        
        const newFullLayout = layout.map(originalItem => {
            const updatedItem = currentLayout.find(l => l.i === originalItem.i);
            if (updatedItem) {
                return {
                    ...originalItem,
                    x: updatedItem.x,
                    y: updatedItem.y,
                    w: updatedItem.w,
                    h: updatedItem.h
                };
            }
            return originalItem;
        });

        updateLayout(newFullLayout);
    }
  };

  // Developer tool: Copy current layout JSON to clipboard
  const handleCopyLayout = () => {
    const json = JSON.stringify(layout, null, 2);
    navigator.clipboard.writeText(json);
    alert("Layout JSON copied to clipboard! Paste this to the AI.");
    console.log("Current Layout:", layout);
  };

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto px-6 py-8 space-y-6 min-h-screen bg-black/50">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/50">
                    {getGreeting()}, <span className="text-violet-400">{userDisplayName}</span>
                </h1>
                <div className="flex items-center gap-2 text-muted-foreground/60 text-xs uppercase tracking-[0.2em] font-medium">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                    System Online • Wealth Pulse Active
                </div>
            </div>

            <div className="flex items-center gap-2">
               {/* 💎 Currency Selector */}
               <SmartCurrencyTabs />

               {/* Manage Widgets (Edit Mode Only) */}
               {isEditMode && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 h-8 text-xs bg-zinc-900/50 border-white/10 hover:bg-zinc-800">
                        <Settings2 className="h-3.5 w-3.5 text-zinc-400" /> Manage Widgets
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 bg-zinc-950 border-white/10 text-zinc-200">
                      <DropdownMenuLabel className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Visible Widgets</DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-white/10" />
                      {layout.map((item) => (
                        <DropdownMenuItem key={item.i} onSelect={(e) => e.preventDefault()} className="focus:bg-zinc-900 cursor-pointer">
                          <div className="flex items-center justify-between w-full py-1">
                            <span className="text-sm font-medium capitalize text-zinc-300">
                                {WIDGET_LABELS[item.i] || item.i.replace(/-/g, ' ')}
                            </span>
                            <Switch 
                              checked={item.visible !== false} 
                              onCheckedChange={() => toggleWidgetVisibility(item.i)}
                              className="data-[state=checked]:bg-violet-600 data-[state=unchecked]:bg-zinc-700"
                            />
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

               {/* Copy Layout Config (Edit Mode Only - Developer Tool) */}
               {isEditMode && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCopyLayout}
                    className="gap-2 h-8 text-xs border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-500"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Config
                  </Button>
               )}

               {/* Reset Layout (Edit Mode Only) */}
               {isEditMode && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-muted-foreground hover:text-white hover:bg-white/10 h-8 text-xs"
                      >
                          Reset Layout
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-zinc-950 border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Reset Dashboard Layout?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                          This will revert your dashboard to the default arrangement. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-white/10 text-white hover:bg-zinc-700">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={resetLayout} 
                          className="bg-rose-500 hover:bg-rose-600 text-white border-0"
                        >
                          Yes, Reset Layout
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
               )}

               {/* Edit Layout Toggle */}
               <Button 
                 variant={isEditMode ? "secondary" : "outline"} 
                 onClick={toggleEditMode}
                 className={cn(
                    "bg-white/5 border-white/10 hover:bg-white/10 transition-all text-xs uppercase tracking-wider h-8 gap-2",
                    isEditMode && "bg-violet-500/20 border-violet-500/50 text-violet-300"
                 )}
               >
                 {isEditMode ? <Check className="h-3.5 w-3.5" /> : <LayoutTemplate className="h-3.5 w-3.5" />}
                 {isEditMode ? "Done" : "Customize"}
               </Button>
            </div>
        </div>

        {/* NOTIFICATION BAR */}
        <NotificationBar />

        {/* CUSTOMIZABLE GRID LAYOUT */}
        <div className="relative min-h-[800px]">
            <ResponsiveGridLayout
                className="layout"
                layouts={{ lg: activeLayout as any }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={60} // Calibrated to ~60px
                isDraggable={isEditMode}
                isResizable={isEditMode}
                resizeHandles={['se', 's', 'e']}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".draggable-handle"
                margin={[24, 24]} // Match existing gap-6 (24px)
            >
                {/* 1. Net Worth Chart */}
                {activeLayout.some(l => l.i === DASHBOARD_WIDGETS.NET_WORTH) && (
                <div key={DASHBOARD_WIDGETS.NET_WORTH}>
                <DraggableWidgetWrapper item={activeLayout.find(l => l.i === DASHBOARD_WIDGETS.NET_WORTH)} isEditMode={isEditMode}>
                     <NetWorthChart />
                </DraggableWidgetWrapper>
                </div>
                )}

                {/* 2. Spending Trend */}
                {activeLayout.some(l => l.i === DASHBOARD_WIDGETS.SPENDING_TREND) && (
                <div key={DASHBOARD_WIDGETS.SPENDING_TREND}>
                <DraggableWidgetWrapper item={activeLayout.find(l => l.i === DASHBOARD_WIDGETS.SPENDING_TREND)} isEditMode={isEditMode}>
                    <SpendingTrendWidget transactions={transactions || []} />
                </DraggableWidgetWrapper>
                </div>
                )}



                {/* 3. Cash Flow Summary */}
                {activeLayout.some(l => l.i === DASHBOARD_WIDGETS.CASH_FLOW_SUMMARY) && (
                <div key={DASHBOARD_WIDGETS.CASH_FLOW_SUMMARY}>
                <DraggableWidgetWrapper item={activeLayout.find(l => l.i === DASHBOARD_WIDGETS.CASH_FLOW_SUMMARY)} isEditMode={isEditMode}>
                    <CashFlowSummaryWidget transactions={transactions || []} />
                </DraggableWidgetWrapper>
                </div>
                )}

            </ResponsiveGridLayout>

             {/* Footer - Static outside grid for now/optional to include in grid later */}
             <div className="mt-12 flex justify-center py-6 opacity-30 hover:opacity-100 transition-opacity duration-500">
                <p className="text-[9px] uppercase tracking-[0.3em] font-medium bg-clip-text text-transparent bg-gradient-to-r from-white/20 via-white/80 to-white/20">
                    Wisecoin AI System v3.0 // Aura Flux
                </p>
            </div>
            


        </div>
    </div>
  );
}
