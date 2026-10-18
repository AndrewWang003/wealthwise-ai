
'use client';

import { useMemo } from 'react';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { useFirestore } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Scale } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function ExchangeRateCard() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const exchangeRateQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `exchange_rates`),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
  }, [user, firestore]);

  const { data: rates, isLoading: isRatesLoading } = useCollection(exchangeRateQuery);
  const isLoading = isUserLoading || isRatesLoading;

  const latestRate = useMemo(() => {
    if (!rates || rates.length === 0) return null;
    const rate = rates[0];
    return {
      ...rate,
      from: rate.fromCurrency,
      to: rate.toCurrency,
      timestamp: new Date(rate.timestamp)
    };
  }, [rates]);

  if (isLoading) {
    return <Skeleton className="h-[350px] w-full" />;
  }
  
  return (
    <Card className="h-full flex flex-col">
       <CardHeader>
        <CardTitle>Live Exchange Rate</CardTitle>
        <CardDescription>
          Latest USD to AUD conversion rate.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col items-center justify-center">
        {latestRate ? (
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-2">
                <span className="text-2xl font-bold text-muted-foreground">{latestRate.from}</span>
                <Scale className="h-6 w-6 text-muted-foreground" />
                <span className="text-2xl font-bold text-muted-foreground">{latestRate.to}</span>
            </div>
            <p className="text-6xl font-bold tracking-tighter text-primary">{latestRate.rate.toFixed(4)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Updated {formatDistanceToNow(latestRate.timestamp, { addSuffix: true })}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">No exchange rate data available.</p>
        )}
      </CardContent>
    </Card>
  );
}
