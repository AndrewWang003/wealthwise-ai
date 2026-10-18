
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, limit } from 'firebase/firestore';
import { Activity } from 'lucide-react';
import { calculateRiskMetrics, RiskMetrics } from '@/lib/analytics/riskUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils/format';
import { DividendPulse } from '@/components/dashboard/DividendPulse';
import { WealthSourcesChart } from '@/components/analytics/wealth-sources-chart';



export default function AnalyticsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [activeTab, setActiveTab] = useState('investment');

  // --- DATA FETCHING ---
  
  // 1. Snapshots (for Investment Risk)
  const snapshotsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/daily_snapshots`),
      orderBy('date', 'asc')
    );
  }, [user, firestore]);
  
  const { data: snapshots, isLoading: paramsLoading } = useCollection(snapshotsQuery);

  // 2. Transactions (for Lifestyle & Dividends)
  const txQuery = useMemoFirebase(() => {
     if (!user) return null;
     // Retrieve enough transactions for meaningful analytics. 
     // For a full app we might want to paginate or aggregate on server-side functions.
     // Here we fetch recent 500 for demo performance.
     return query(
        collection(firestore, `users/${user.uid}/transactions`),
        orderBy('transactionDate', 'desc'),
        limit(1000) // Increase limit to ensure good coverage for PnL filtering
     );
  }, [user, firestore]);

  const { data: transactions, isLoading: txLoading } = useCollection(txQuery);

  // --- METRIC CALCULATION ---

  const riskMetrics: RiskMetrics | null = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;
    // 🛡️ Pass transactions to filter out deposits from PnL
    return calculateRiskMetrics(snapshots, transactions || []);
  }, [snapshots, transactions]);




  if (paramsLoading || txLoading) {
     return <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <Skeleton className="h-40 w-full" />
           <Skeleton className="h-40 w-full" />
           <Skeleton className="h-40 w-full" />
        </div>
     </div>
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Deep dive into your financial health and patterns.</p>
        </div>
      </div>

      {/* 💰 Recent Income Widget */}
      <div className="grid grid-cols-1 gap-6">
        <DividendPulse />
      </div>

      {/* 📊 Wealth Attribution Chart (New Standalone) */}
      <WealthSourcesChart />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2">
          <TabsTrigger value="investment">Investment Risk</TabsTrigger>
        </TabsList>

        {/* --- INVESTMENT TAB --- */}
        <TabsContent value="investment" className="space-y-6 mt-6">
           {/* Risk Score Card */}
           <div className="w-full max-w-sm">
              <Card className="relative overflow-hidden border-t-4 border-t-purple-500">
                 <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Risk Score</CardTitle>
                 </CardHeader>
                 <CardContent>
                    <div className="text-4xl font-bold flex items-center gap-2">
                       {riskMetrics?.riskScore ?? '-'} 
                       <span className="text-sm font-normal text-muted-foreground">/ 100</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                       Based on volatility and max drawdown. Higher is safer.
                    </p>
                 </CardContent>
                 <Activity className="absolute right-6 top-6 h-8 w-8 text-purple-500/20" />
              </Card>
           </div>
        </TabsContent>

        {/* --- LIFESTYLE TAB --- */}

      </Tabs>
    </div>
  );
}
