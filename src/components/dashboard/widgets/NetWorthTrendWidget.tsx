'use client';

import { useEffect } from 'react';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardWidget } from './DashboardWidget';
import { Skeleton } from '@/components/ui/skeleton';

export function NetWorthTrendWidget({ className }: { className?: string }) {
  const { user } = useUser();
  const firestore = useFirestore();

  const snapshotsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/daily_snapshots`),
      orderBy('date', 'asc') // Relaxed query: ALL history
    );
  }, [user, firestore]);

  const { data: snapshots, isLoading } = useCollection(snapshotsQuery);

  useEffect(() => {
    // Debug logging removed for production
  }, [snapshots, isLoading]);

  if (isLoading) return <Skeleton className={`h-[300px] w-full ${className}`} />;

  const data = snapshots?.map(doc => ({
      date: new Date(doc.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: doc.netWorth || 0
  })) || []; 
  // Removed .filter(d => d.value > 0) to debug zero values if any exist

  // RELAXED THRESHOLD & DEBUG UI
  if (data.length === 0) {
    return (
        <DashboardWidget title="Net Worth Trend" className={`h-[300px] ${className}`}>
           <div className="flex h-full flex-col items-center justify-center text-muted-foreground space-y-2 p-4 text-center">
              <p className="text-red-400 font-bold">DEBUG: Found 0 snapshots.</p>
              <p className="text-xs font-mono break-all text-red-300 opacity-80">
                 Path: users/{user?.uid}/daily_snapshots
              </p>
              <p className="text-xs opacity-50 mt-4">
                 Try &quot;Reconstruct History&quot; in Settings.
              </p>
           </div>
        </DashboardWidget>
    );
  }

  return (
    <DashboardWidget title="Net Worth Trend" className={`h-[300px] ${className}`}>
      <div className="h-[240px] w-full -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              tick={{fontSize: 10}} 
              tickLine={false} 
              axisLine={false} 
              minTickGap={30}
            />
            <YAxis 
                hide={true} 
                domain={['auto', 'auto']} 
            />
            <Tooltip 
                cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '5 5' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(val: number) => [`$${val.toLocaleString()}`, 'Net Worth']}
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  borderColor: '#374151', 
                  borderRadius: '8px', 
                  color: '#F3F4F6' 
                }}
                itemStyle={{ color: '#F3F4F6' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#10b981" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardWidget>
  );
}

