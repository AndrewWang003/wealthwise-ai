/**
 * 🌊 UNIFIED PULSE BANNER - Wealth Pulse System UI Component
 * 
 * 统一的 Pulse/Insight 展示组件
 * - 支持新 wealth_pulses 集合（状态机演进）
 * - 兼容旧 insights 集合（daily_change, dividend 等）
 * - Always Show 模式（无提醒时显示占位符）
 * - 完整的分红 transaction 创建逻辑
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/clientApp';
import { useUser } from '@/firebase';
import { X, CheckCircle, Clock, AlertCircle, XCircle, TrendingUp, DollarSign, Info, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWealthPulse } from '@/contexts/WealthPulseContext';
import type { WealthPulse, DividendPayload } from '@/lib/wealth-pulse/types';
import type { Insight } from '@/lib/types';
import { sortPulsesByPriority } from '@/lib/wealth-pulse';

interface PulseBannerProps {
  alwaysShow?: boolean;
}

/**
 * 统一 Banner 组件
 */
export function PulseBanner({ alwaysShow = false }: PulseBannerProps) {
  const { user } = useUser();
  const { activePulses, markAsSeen, hidePulse } = useWealthPulse();
  const { toast } = useToast();
  
  // 🔔 Legacy Insights (旧数据源)
  const [legacyInsights, setLegacyInsights] = useState<(Insight & { id: string })[]>([]);
  const [todayPulse, setTodayPulse] = useState<Insight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPulseId, setEditingPulseId] = useState<string | null>(null);

  // 🔔 订阅旧 insights 集合
  useEffect(() => {
    if (!user) {
      setTimeout(() => setIsLoading(false), 0);
      return;
    }

    const insightsRef = collection(db, `users/${user.uid}/insights`);
    const q = query(insightsRef, where('status', '==', 'unread'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newInsights = snapshot.docs.map(doc => {
        const data = doc.data() as Insight;
        return {
          ...data,
          id: doc.id,
        };
      });

      // 🧠 SMART SORT: Daily Pulse -> Priority -> Date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      
      newInsights.sort((a, b) => {
        if (a.type === 'daily_change' && b.type !== 'daily_change') return -1;
        if (a.type !== 'daily_change' && b.type === 'daily_change') return 1;

        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      });

      setLegacyInsights(newInsights);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 🔔 订阅今日 Pulse（用于 Always Show 模式）
  useEffect(() => {
    if (!user || !alwaysShow) return;
    
    const getTodayId = () => {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return new Intl.DateTimeFormat('en-CA', { 
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
      } catch { 
        return new Date().toISOString().split('T')[0]; 
      }
    };
    
    const pulseId = `daily_pulse_${getTodayId()}`;
    const pulseRef = doc(db, `users/${user.uid}/insights/${pulseId}`);
    
    const unsubscribe = onSnapshot(pulseRef, (docSnap) => {
      if (docSnap.exists()) {
        setTodayPulse(docSnap.data() as Insight);
      } else {
        setTodayPulse(null);
      }
    });
    
    return () => unsubscribe();
  }, [user, alwaysShow]);

  // 📊 合并两个数据源
  const hasContent = activePulses.length > 0 || legacyInsights.length > 0;

  if (isLoading) return null;
  if (!alwaysShow && !hasContent) return null;

  // 📝 Legacy Insight Actions
  const handleAcknowledgeLegacy = async (insightId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/insights/${insightId}`), {
        status: 'acknowledged',
        acknowledgedAt: serverTimestamp(),
      });
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleConfirmDividendLegacy = async (insight: Insight & { id: string }) => {
    if (!user || !insight.metadata?.dividendAmount) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        transactionType: 'income',
        symbol: `${insight.metadata?.symbol ?? 'Unknown'} Dividend`,
        quantity: insight.metadata.dividendAmount,
        price: 1,
        currency: insight.metadata.currency || 'USD',
        impactsCash: true,
        transactionDate: new Date().toISOString(),
        metadata: { parsedIntent: 'dividend', source: 'wealth_pulse', insightId: insight.id },
      });
      await handleAcknowledgeLegacy(insight.id);
      toast({ title: '✅ 收获已入账', description: '资金已存入现金账户' });
    } catch (error) { 
      console.error(error); 
    }
  };

  const handleClosePulse = async (pulse: WealthPulse) => {
    try {
      await markAsSeen(pulse.id, pulse.status);
      await hidePulse(pulse.id);
      toast({ title: '✅ 已关闭', description: '此提醒已隐藏' });
    } catch (error) {
      console.error('[PulseBanner] Close failed:', error);
    }
  };

  // 🎨 Legacy Insight Styles
  const getLegacyStyles = (type: Insight['type'], amount: number = 0, priority: string) => {
    if (type === 'daily_change' && amount >= 0) {
      return {
        container: 'bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 border-emerald-500/20 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.15)]',
        icon: 'text-emerald-400 bg-emerald-500/10 rounded-full p-1',
        text: 'text-emerald-50',
        subtext: 'text-emerald-200/70'
      };
    }
    if (type === 'daily_change' && amount < 0) {
      return {
        container: 'bg-gradient-to-r from-slate-900/60 to-slate-800/40 border-indigo-200/10 shadow-[0_4px_24px_-8px_rgba(99,102,241,0.1)]',
        icon: 'text-indigo-300 bg-indigo-500/10 rounded-full p-1',
        text: 'text-slate-100',
        subtext: 'text-slate-400'
      };
    }
    if (type === 'dividend') {
      return {
        container: 'bg-gradient-to-r from-amber-950/40 to-yellow-900/20 border-amber-500/20 shadow-[0_4px_24px_-6px_rgba(245,158,11,0.2)]',
        icon: 'text-amber-300 bg-amber-500/10 rounded-full p-1',
        text: 'text-amber-50',
        subtext: 'text-amber-200/70'
      };
    }
    if (priority === 'critical') {
      return {
        container: 'bg-red-950/40 border-red-500/20',
        icon: 'text-red-400', 
        text: 'text-red-50', 
        subtext: 'text-red-200/70'
      };
    }
    return {
      container: 'bg-blue-950/30 border-blue-500/10',
      icon: 'text-blue-400',
      text: 'text-blue-50',
      subtext: 'text-blue-200/70'
    };
  };

  const getPulseIcon = (pulse: WealthPulse) => {
    const metadata = pulse.displayMetadata[pulse.status];
    switch (metadata.icon) {
      case 'TrendingUp': return TrendingUp;
      case 'Clock': return Clock;
      case 'AlertCircle': return AlertCircle;
      case 'XCircle': return XCircle;
      case 'DollarSign': return DollarSign;
      default: return DollarSign;
    }
  };

  const getPulseBgClass = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 border-emerald-500/20 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.15)]';
      case 'PENDING':
        return 'bg-gradient-to-r from-amber-950/40 to-yellow-900/20 border-amber-500/20 shadow-[0_4px_24px_-6px_rgba(245,158,11,0.2)]';
      case 'ACTION_REQUIRED':
        return 'bg-gradient-to-r from-purple-950/40 to-indigo-900/20 border-purple-500/20 shadow-[0_4px_24px_-6px_rgba(139,92,246,0.2)]';
      case 'EXPIRED':
        return 'bg-gradient-to-r from-slate-900/40 to-slate-800/20 border-slate-500/20';
      default:
        return '';
    }
  };

  return (
    <div className="col-span-12 mb-8 relative z-10 w-full">
      <AnimatePresence mode="popLayout" initial={false}>
        {/* 新 Wealth Pulses */}
        {hasContent && sortPulsesByPriority(activePulses).slice(0, 3).map((pulse) => {
              const metadata = pulse.displayMetadata[pulse.status];
              const Icon = getPulseIcon(pulse);
              const isEditing = editingPulseId === pulse.id;
              
              return (
                <motion.div
                  key={`pulse-${pulse.id}`}
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`mb-3 last:mb-0 relative overflow-hidden rounded-xl border backdrop-blur-xl p-4 transition-all duration-300 ${getPulseBgClass(pulse.status)}`}
                >
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="flex-shrink-0 mt-1 rounded-full p-1" style={{ backgroundColor: `${metadata.color}20`, color: metadata.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed font-light" style={{ color: metadata.color }}>
                        {metadata.template}
                      </p>
                      {pulse.type === 'DIVIDEND' && pulse.status === 'ACTION_REQUIRED' && (
                        <DividendConfirmationRow
                          pulse={pulse}
                          isEditing={isEditing}
                          onEdit={() => setEditingPulseId(pulse.id)}
                          onCancel={() => setEditingPulseId(null)}
                        />
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-40 hover:opacity-100 hover:bg-white/10 text-white" onClick={() => handleClosePulse(pulse)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* 旧 Legacy Insights */}
            {legacyInsights.slice(0, 3).map((insight) => {
              const styles = getLegacyStyles(insight.type, insight.metadata?.dailyChangeAmount ?? 0, insight.priority);
              
              return (
                <motion.div
                  key={`insight-${insight.id}`}
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`mb-3 last:mb-0 relative overflow-hidden rounded-xl border backdrop-blur-xl p-4 transition-all duration-300 ${styles.container}`}
                >
                  <div className="flex items-start gap-4 relative z-10">
                    <div className={`flex-shrink-0 mt-1 ${styles.icon}`}>
                      {insight.type === 'daily_change' ? <Activity className="h-5 w-5" /> :
                       insight.type === 'dividend' ? <DollarSign className="h-5 w-5" /> :
                       insight.type === 'fx_alert' ? <TrendingUp className="h-5 w-5" /> : <Info className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-sm leading-tight tracking-wide mb-1 ${styles.text}`}>
                        {insight.title}
                      </h3>
                      <p className={`text-xs leading-relaxed font-light ${styles.subtext}`}>
                        {insight.content}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {insight.type === 'dividend' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-amber-500/10 border-amber-500/20 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100" onClick={() => handleConfirmDividendLegacy(insight)}>
                          <CheckCircle className="h-3 w-3 mr-1.5" /> 确认
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-40 hover:opacity-100 hover:bg-white/10 text-white" onClick={() => handleAcknowledgeLegacy(insight.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

        {!hasContent && alwaysShow && (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`rounded-xl border backdrop-blur-md p-4 transition-all ${todayPulse?.metadata?.dailyChangeAmount != null && todayPulse.metadata.dailyChangeAmount < 0 ? 'bg-slate-900/30 border-slate-700/30' : 'bg-emerald-950/20 border-emerald-500/10'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-1.5 rounded-full ${todayPulse?.metadata?.dailyChangeAmount && todayPulse.metadata.dailyChangeAmount < 0 ? 'bg-slate-500/20 text-slate-300' : 'bg-emerald-500/10 text-emerald-400'}`}>
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-200">
                  {todayPulse ? todayPulse.title : "Wealth Pulse Active"}
                </h3>
                <p className="text-xs text-slate-400 font-light mt-0.5">
                  {todayPulse ? todayPulse.content : "今日暂无异常，资产运行平稳。"}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 分红确认行（行内编辑）
 */
function DividendConfirmationRow({
  pulse,
  isEditing,
  onEdit,
  onCancel,
}: {
  pulse: WealthPulse;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { user } = useUser();
  const { completePulse } = useWealthPulse();
  const { toast } = useToast();
  const payload = pulse.payload as DividendPayload;
  
  const [amount, setAmount] = useState(payload.confirmedAmount || payload.estimatedAmount);

  const handleConfirm = async () => {
    if (!user) return;
    
    try {
      // ✅ 创建 dividend transaction
      await addDoc(collection(db, `users/${user.uid}/transactions`), {
        transactionType: 'income',
        symbol: `${payload.symbol} Dividend`,
        quantity: amount,
        price: 1,
        currency: payload.currency,
        impactsCash: true,
        transactionDate: new Date().toISOString(),
        metadata: { parsedIntent: 'dividend', source: 'wealth_pulse', pulseId: pulse.id },
      });

      // ✅ 标记 Pulse 为完成
      await completePulse(pulse.id);
      
      toast({
        title: '✅ 分红已确认',
        description: `${payload.symbol} 的分红 ${payload.currency} ${amount.toFixed(2)} 已记录`,
      });
      
      onCancel();
    } catch (error) {
      console.error('[DividendConfirmation] Failed:', error);
      toast({
        title: '❌ 确认失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="mt-3 flex items-center gap-3">
      {isEditing ? (
        <>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm w-32 focus:outline-none focus:ring-2 focus:ring-purple-400"
            aria-label="Dividend amount"
            autoFocus
          />
          <Button
            size="sm"
            className="h-7 text-xs bg-purple-500/20 border-purple-500/30 text-purple-200 hover:bg-purple-500/30"
            onClick={handleConfirm}
          >
            <CheckCircle className="h-3 w-3 mr-1.5" />
            确认入账
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-slate-300 hover:text-white"
            onClick={onCancel}
          >
            取消
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          className="h-7 text-xs bg-purple-500/10 border-purple-500/20 text-purple-200 hover:bg-purple-500/20"
          onClick={onEdit}
        >
          💰 点击编辑金额
        </Button>
      )}
    </div>
  );
}
