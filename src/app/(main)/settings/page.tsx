
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { collection, getDocs, orderBy, query, doc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Wallet, Palette, Check, Tags, Database, AlertTriangle, CreditCard } from "lucide-react";
import { useState } from "react";
import { Transaction, UserSettings } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";

import { usePortfolioAggregation } from "@/hooks/usePortfolioAggregation";
import { ImportWizard } from "@/components/import/ImportWizard";
import { CategoryManager } from "@/components/settings/CategoryManager";
import { AccountManager } from "@/components/settings/AccountManager";


export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const [activeTab, setActiveTab] = useState<'appearance' | 'financial' | 'accounts' | 'categories' | 'data'>('appearance');

  const settingsRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/settings/config`);
  }, [firestore, user]);

  const { data: settings, isLoading: isSettingsLoading } = useDoc<UserSettings>(settingsRef);

  // 获取所有交易记录用于计算现金余额
  const transactionsCollectionRef = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, `users/${user.uid}/transactions`);
  }, [firestore, user]);

  const { data: transactionsData } = useCollection<Transaction>(transactionsCollectionRef);
  const transactions = transactionsData ?? [];

  // 使用 usePortfolioAggregation 计算现金余额
  const { aggregatedPositions } = usePortfolioAggregation(
    transactions,
    [],
    settings?.isCashTrackingEnabled ?? false
  );

  // 提取现金余额
  const audCashPosition = aggregatedPositions.find(p => p.symbol === 'AUD Cash');
  const usdCashPosition = aggregatedPositions.find(p => p.symbol === 'USD Cash');
  const currentAudBalance = audCashPosition?.totalQuantity ?? 0;
  const currentUsdBalance = usdCashPosition?.totalQuantity ?? 0;

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length > 1) {
      return parts[0][0] + parts[parts.length - 1][0];
    }
    return name[0];
  };

  const handleToggleCashTracking = async (checked: boolean) => {
    if (!user || !settingsRef) return;

    setIsUpdatingSettings(true);
    try {
      await setDoc(settingsRef, {
        isCashTrackingEnabled: checked
      }, { merge: true });

      toast({
        title: checked ? "已开启现金追踪" : "已关闭现金追踪",
        description: "切换模式后，总资产计算方式将发生变化。",
      });
    } catch (error: any) {
      console.error("Failed to update settings:", error);
      toast({
        title: "设置更新失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleExport = async () => {
    if (!user) {
      toast({
        title: "错误",
        description: "您必须登录才能导出数据。",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      const transactionsQuery = query(
        collection(firestore, `users/${user.uid}/transactions`),
        orderBy("transactionDate", "desc")
      );
      const querySnapshot = await getDocs(transactionsQuery);
      const transactions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));

      if (transactions.length === 0) {
        toast({
          title: "无数据",
          description: "没有可供导出的交易记录。",
        });
        return;
      }

      // 1. Standard Export Schema & Data Cleaning
      const headers = ["ID", "Date", "Type", "Symbol", "Market", "Quantity", "Price", "Currency", "Fee", "TotalAmount", "Notes"];
      
      const csvRows = transactions.map(tx => {
        // Date Formatting (YYYY-MM-DD)
        const dateObj = typeof tx.transactionDate === 'string' 
          ? new Date(tx.transactionDate)
          : (tx.transactionDate as any)?.toDate 
            ? (tx.transactionDate as any).toDate() 
            : new Date();
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : '';
        
        // Price/Fee Formatting (Cents -> Units)
        const price = (tx.priceInCents !== undefined) ? tx.priceInCents / 100 : tx.price;
        const fee = (tx.feeInCents !== undefined) ? tx.feeInCents / 100 : tx.fee;

        // Logic Calculation: (Quantity * Price) + Fee
        // Note: This formula is applied strictly as requested.
        const totalAmount = (tx.quantity * price) + fee;

        // Map strictly to schema
        const rowData = [
          tx.displayId || tx.id,
          dateStr,
          tx.transactionType,
          tx.symbol,
          tx.market || '',
          tx.quantity,
          price,
          tx.currency,
          fee,
          totalAmount.toFixed(2), // Ensure decimal consistency
          tx.notes || ''
        ];

        // Escape & Quote (Robustness)
        return rowData.map(val => {
          const str = String(val ?? '').replace(/"/g, '""');
          return `"${str}"`;
        }).join(',');
      });

      const csvContent = [headers.join(','), ...csvRows].join('\n');

      // Create a Blob and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'transactions.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      toast({
        title: "导出成功",
        description: "您的交易记录已开始下载。",
      });

    } catch (error: any) {
      console.error("Export failed:", error);
      toast({
        title: "导出失败",
        description: `无法导出数据: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  type NavItem = {
    id: 'appearance' | 'financial' | 'accounts' | 'categories' | 'data';
    icon: typeof Palette | typeof Wallet | typeof Tags | typeof Database | typeof CreditCard;
    label: string;
  };

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'PREFERENCES',
      items: [
        { id: 'appearance', icon: Palette, label: 'Appearance' },
        { id: 'financial', icon: Wallet, label: 'Financial Logic' },
        { id: 'accounts', icon: CreditCard, label: 'Accounts' },
        { id: 'categories', icon: Tags, label: 'Categories' },
      ]
    },
    {
      title: 'DATA',
      items: [
        { id: 'data', icon: Database, label: 'Data Management' },
      ]
    }
  ];

  const allNavItems = navGroups.flatMap(g => g.items);

  return (
    <div className="min-h-[calc(100vh-100px)]">
      {/* Mobile: Horizontal Tabs */}
      <div className="md:hidden border-b sticky top-0 bg-background z-10">
        <div className="flex overflow-x-auto scrollbar-none -mb-px">
          {allNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === item.id 
                  ? 'border-foreground text-foreground' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: Sidebar + Content */}
      <div className="md:flex">
        {/* Left Sidebar */}
        <aside className="hidden md:block w-64 shrink-0 border-r min-h-[calc(100vh-100px)] sticky top-0">
          <div className="p-6 space-y-6">
            {/* Navigation Groups */}
            <nav className="space-y-6">
              {navGroups.map(group => (
                <div key={group.title}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center gap-3 w-full px-2 py-2 rounded-md text-sm transition-colors ${
                          activeTab === item.id 
                            ? 'bg-secondary text-secondary-foreground font-medium' 
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-3xl">
          {/* Tab: Appearance */}
          {activeTab === 'appearance' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
                <p className="text-muted-foreground mt-1">Customize the look and feel of your interface.</p>
              </div>
              
              {/* Theme Selection */}
              <div>
                <h3 className="text-sm font-medium mb-4">Theme</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'light', label: 'Light', bg: 'from-slate-100 to-slate-200', border: 'border-slate-300', bars: ['bg-indigo-900', 'bg-purple-400'] },
                    { id: 'dark', label: 'Dark', bg: 'from-slate-800 to-slate-900', border: 'border-slate-700', bars: ['bg-slate-100', 'bg-purple-400'] },
                    { id: 'aura', label: 'Aura', bg: 'from-blue-950 via-indigo-950 to-purple-950', border: 'border-blue-900', bars: ['bg-blue-400', 'bg-purple-400'] },
                    { id: 'aura-light', label: 'Aura Light', bg: 'from-blue-50 via-indigo-50 to-purple-50', border: 'border-blue-200', bars: ['bg-blue-600', 'bg-purple-500'] },
                    { id: 'aura-flux', label: 'Aura Flux', bg: 'from-purple-950 via-indigo-950 to-slate-950', border: 'border-purple-900', bars: ['bg-purple-400', 'bg-violet-500'] },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as any)}
                      data-state={theme === t.id ? 'checked' : 'unchecked'}
                      className={`relative p-3 rounded-lg border transition-all hover:scale-[1.02] theme-card ${
                        theme === t.id ? 'border-foreground ring-1 ring-foreground' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">{t.label}</span>
                        {theme === t.id && <Check className="h-3 w-3" />}
                      </div>
                      <div className={`h-10 rounded-md bg-gradient-to-br ${t.bg} border ${t.border} p-2 space-y-1`}>
                        <div className={`h-1 w-6 ${t.bars[0]} rounded`}></div>
                        <div className={`h-1 w-4 ${t.bars[1]} rounded`}></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Financial Logic */}
          {activeTab === 'financial' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Financial Logic</h1>
                <p className="text-muted-foreground mt-1">Configure how your portfolio is calculated.</p>
              </div>

              {/* Settings List */}
              <div className="divide-y">
                {/* Cash Tracking Toggle */}
                <div className="flex items-center justify-between py-4">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Double-Entry Mode</div>
                    <div className="text-sm text-muted-foreground">
                      Track cash balance alongside investments
                    </div>
                  </div>
                  <div className="flex items-center">
                    {(isSettingsLoading || isUpdatingSettings) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      id="cash-tracking"
                      checked={settings?.isCashTrackingEnabled ?? false}
                      onCheckedChange={handleToggleCashTracking}
                      disabled={isSettingsLoading || isUpdatingSettings || !user}
                    />
                  </div>
                </div>
              </div>

              {/* Cash Balance Calibration - REMOVED */}
            </div>
          )}

          {/* Tab: Accounts */}
          {activeTab === 'accounts' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
                <p className="text-muted-foreground mt-1">Manage your financial accounts and wallets.</p>
              </div>
              
              <AccountManager />
            </div>
          )}

          {/* Tab: Categories */}
          {activeTab === 'categories' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
                <p className="text-muted-foreground mt-1">Manage your custom transaction categories.</p>
              </div>
              
              <CategoryManager />
            </div>
          )}

          {/* Tab: Data Management */}
          {activeTab === 'data' && (
            <div className="space-y-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Data Management</h1>
                <p className="text-muted-foreground mt-1">Import, export, and maintain your data.</p>
              </div>

              {/* Import Section */}
              <ImportWizard />

              {/* Export Section */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Export Data</div>
                    <div className="text-sm text-muted-foreground">Download all transactions as CSV</div>
                  </div>
                  <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Export
                  </Button>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border border-red-200 dark:border-red-900/50 rounded-lg p-4 bg-red-50/30 dark:bg-red-950/10">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">Danger Zone</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Reconstruct History</div>
                    <div className="text-sm text-muted-foreground">Rebuild daily snapshots from transactions</div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="border-red-200 hover:bg-red-100 dark:border-red-900 dark:hover:bg-red-900/20"
                    onClick={async () => {
                       if (!user) return;
                       
                       const confirm = window.confirm("确定要重建历史数据吗？这将覆盖所有的 daily_snapshots。");
                       if (!confirm) return;

                       try {
                         const { reconstructHistory } = await import('@/lib/data/reconstructHistory');
                         toast({ title: '正在重建...', description: '这可能需要几秒钟。' });
                         
                         const count = await reconstructHistory(user.uid, firestore);
                         
                         toast({ 
                            title: '✅ 历史重建完成', 
                            description: `已生成 ${count} 条每日快照。页面将自动刷新。` 
                         });

                         setTimeout(() => {
                            window.location.reload();
                         }, 1000);
                       } catch (e: any) {
                         console.error(e);
                         toast({ title: '失败', description: e.message, variant: 'destructive' });
                       }
                    }}
                  >
                    Rebuild
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

