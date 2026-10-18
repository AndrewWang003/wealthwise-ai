/**
 * 💰 DIVIDEND CALENDAR CHART
 * 
 * 完整的分红日历可视化，包含：
 * - Recharts 月度柱状图（历史实色 + 未来透明）
 * - 本月分红明细列表
 * - 空状态处理
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Calendar, DollarSign } from 'lucide-react';
import { useDividendAnalytics, type DividendEvent } from '@/hooks/useDividendAnalytics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { useWealthPulse } from '@/contexts/WealthPulseContext';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/clientApp';
import { useUser } from '@/firebase';

// 香槟金主题色
const CHAMPAGNE_GOLD = '#D4AF37';
const CHAMPAGNE_GOLD_TRANSPARENT = '#D4AF3766'; // 40% 透明度

export function DividendCalendarChart() {
  const { monthlyData, events, isEmpty, totalHistorical, totalFuture } = useDividendAnalytics();
  const { completePulse } = useWealthPulse();
  const { user } = useUser();
  const { toast } = useToast();
  const [editingPulseId, setEditingPulseId] = useState<string | null>(null);

  // 🎨 空状态
  if (isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            分红日历
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">暂无分红数据</p>
            <p className="text-sm mt-2">当您的持仓产生分红时，这里会显示分红日历</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 📊 准备图表数据（最近12个月 + 未来3个月）
  const chartData = monthlyData.slice(-15).map(item => ({
    month: item.monthLabel,
    amount: item.amount,
    isFuture: item.status === 'future',
  }));

  // 📅 获取本月分红事件
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const thisMonthEvents = events.filter(event => 
    event.date.slice(0, 7) === currentMonth
  );

  // ✅ 确认分红
  const handleConfirmDividend = async (event: DividendEvent) => {
    if (!user || !event.pulseId) return;

    try {
      const amount = parseFloat(prompt(`确认分红金额 (${event.currency}):`, event.amount.toFixed(2)) || '0');
      if (amount <= 0) return;

      // 创建 transaction
      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        transactionType: 'income',
        symbol: `${event.symbol} Dividend`,
        quantity: amount,
        price: 1,
        currency: event.currency,
        impactsCash: true,
        transactionDate: new Date().toISOString(),
        metadata: { parsedIntent: 'dividend', source: 'wealth_pulse', pulseId: event.pulseId },
      });

      // 标记 Pulse 为完成
      await completePulse(event.pulseId);

      toast({
        title: '✅ 分红已确认',
        description: `${event.symbol} 的分红 ${event.currency} ${amount.toFixed(2)} 已记录`,
      });

      setEditingPulseId(null);
    } catch (error) {
      console.error('Dividend confirmation failed:', error);
      toast({
        title: '❌ 确认失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          分红日历
        </CardTitle>
        <div className="flex gap-6 text-sm text-muted-foreground mt-2">
          <div>
            <span className="font-medium">历史总计: </span>
            <span className="text-green-600">${totalHistorical.toFixed(2)}</span>
          </div>
          <div>
            <span className="font-medium">未来预估: </span>
            <span className="text-blue-600">${totalFuture.toFixed(2)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 📊 月度柱状图 */}
        <div className="w-full h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                label={{ value: 'Amount ($)', angle: -90, position: 'insideLeft', fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isFuture ? CHAMPAGNE_GOLD_TRANSPARENT : CHAMPAGNE_GOLD} 
                  />
                ))}
                <LabelList 
                  dataKey="amount" 
                  position="top" 
                  formatter={(value: number) => `$${value.toFixed(0)}`}
                  fontSize={10}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 📅 本月明细 */}
        {thisMonthEvents.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              本月分红明细
            </h3>
            <div className="space-y-2">
              {thisMonthEvents.map(event => (
                <div 
                  key={event.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                      {event.symbol.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{event.symbol}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(event.date).toLocaleDateString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-green-600">
                        ${event.amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {event.status === 'confirmed' && '✅ 已入账'}
                        {event.status === 'pending' && '⏳ 处理中'}
                        {event.status === 'announced' && '📢 已预告'}
                      </div>
                    </div>
                    
                    {event.status === 'pending' && event.pulseId && (
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => handleConfirmDividend(event)}
                      >
                        确认入账
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
