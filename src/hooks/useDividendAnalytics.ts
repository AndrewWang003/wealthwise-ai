/**
 * 💰 DIVIDEND ANALYTICS HOOK
 * 
 * 聚合历史和未来分红数据，提供统一的数据接口
 * 
 * 数据源：
 * 1. 历史：transactions 集合中 type='income' && (metadata.parsedIntent='dividend' || category='dividend')
 * 2. 未来：wealth_pulses 集合中 type='DIVIDEND' 且 paymentDate 在未来
 * 
 * 核心算法：
 * - 合并两个数据源并按日期排序
 * - 去重：已确认的 Pulse 不计入未来预告（避免与 transactions 重复）
 * - 币种对齐：所有金额统一换算为 displayCurrency
 * - 月度聚合：用于柱状图展示
 */

'use client';

import { useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useWealthPulse } from '@/contexts/WealthPulseContext';
import type { Transaction, Currency } from '@/lib/types';
import type { DividendPayload } from '@/lib/wealth-pulse/types';

export interface DividendEvent {
  id: string;
  symbol: string;
  date: string;  // ISO date
  amount: number; // 已换算为 displayCurrency
  currency: Currency;
  status: 'confirmed' | 'pending' | 'announced';
  
  // 用于分红确认
  pulseId?: string;
  transactionId?: string;
}

export interface MonthlyDividend {
  month: string;  // 'YYYY-MM'
  monthLabel: string; // 'Jan 2026'
  amount: number;
  status: 'historical' | 'future';
}

export interface DividendAnalytics {
  // 事件列表（按日期升序）
  events: DividendEvent[];
  
  // 月度聚合（用于图表）
  monthlyData: MonthlyDividend[];
  
  // 统计数据
  totalHistorical: number;
  totalFuture: number;
  
  // 状态
  isEmpty: boolean;
}

export function useDividendAnalytics(): DividendAnalytics {
  const {
    displayCurrency,
    getExchangeRate,
    transactions,
  } = usePortfolio();
  
  const { rawPulses } = useWealthPulse();

  // 🔍 提取历史分红交易（容错处理）
  const historicalDividends = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    return transactions
      .filter(tx => {
        // 容错逻辑：判定为分红交易的条件
        if (tx.transactionType !== 'income') return false;
        
        // 检查 metadata.parsedIntent 或 旧版 category 字段
        const isDividend = 
          tx.metadata?.parsedIntent === 'dividend' ||
          (tx as any).category === 'dividend' ||
          tx.symbol?.toLowerCase().includes('dividend');
        
        return isDividend;
      })
      .map(tx => {
        const fxRate = getExchangeRate?.(tx.currency, displayCurrency) || 1;
        
        return {
          id: tx.id,
          symbol: tx.symbol.replace(' Dividend', ''), // 清理显示名称
          date: tx.transactionDate,
          amount: tx.quantity * fxRate,
          currency: tx.currency,
          status: 'confirmed' as const,
          transactionId: tx.id,
        };
      });
  }, [transactions, displayCurrency, getExchangeRate]);

  // 🔮 提取未来分红（去重：排除已确认的 Pulse）
  const futureDividends = useMemo(() => {
    const now = new Date();
    
    return rawPulses
      .filter(pulse => {
        if (pulse.type !== 'DIVIDEND') return false;
        
        const payload = pulse.payload as DividendPayload;
        const paymentDate = new Date(payload.paymentDate);
        
        // 📌 去重逻辑：如果 Pulse 已完成（isCompleted=true），则说明已转为 transaction
        if (pulse.isCompleted) return false;
        
        // 只包含未来的分红
        return paymentDate > now;
      })
      .map(pulse => {
        const payload = pulse.payload as DividendPayload;
        const fxRate = getExchangeRate?.(payload.currency, displayCurrency) || 1;
        
        // 判断状态
        let status: 'pending' | 'announced' = 'announced';
        if (pulse.status === 'ACTION_REQUIRED') {
          status = 'pending';
        }
        
        return {
          id: pulse.id,
          symbol: payload.symbol,
          date: payload.paymentDate,
          amount: payload.estimatedAmount * fxRate,
          currency: payload.currency,
          status,
          pulseId: pulse.id,
        } as DividendEvent;
      });
  }, [rawPulses, displayCurrency, getExchangeRate]);

  // 🔗 合并历史与未来
  const allEvents = useMemo(() => {
    const combined = [...historicalDividends, ...futureDividends];
    
    // 按日期升序排序
    return combined.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [historicalDividends, futureDividends]);

  // 📊 月度聚合
  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, { amount: number; isFuture: boolean }>();
    const now = new Date();
    
    allEvents.forEach(event => {
      const eventDate = new Date(event.date);
      const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
      
      const existing = monthMap.get(monthKey) || { amount: 0, isFuture: eventDate > now };
      monthMap.set(monthKey, {
        amount: existing.amount + event.amount,
        isFuture: eventDate > now,
      });
    });

    // 转换为数组并排序
    const months = Array.from(monthMap.entries())
      .map(([month, data]) => {
        const [year, monthNum] = month.split('-');
        const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1);
        const monthLabel = monthDate.toLocaleDateString('en-US', { 
          month: 'short', 
          year: 'numeric' 
        });
        
        return {
          month,
          monthLabel,
          amount: data.amount,
          status: data.isFuture ? 'future' : 'historical',
        } as MonthlyDividend;
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return months;
  }, [allEvents]);

  // 📈 统计数据
  const { totalHistorical, totalFuture } = useMemo(() => {
    const now = new Date();
    
    let historical = 0;
    let future = 0;
    
    allEvents.forEach(event => {
      const eventDate = new Date(event.date);
      if (eventDate <= now) {
        historical += event.amount;
      } else {
        future += event.amount;
      }
    });
    
    return { totalHistorical: historical, totalFuture: future };
  }, [allEvents]);

  return {
    events: allEvents,
    monthlyData,
    totalHistorical,
    totalFuture,
    isEmpty: allEvents.length === 0,
  };
}
