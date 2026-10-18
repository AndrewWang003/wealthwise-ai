/**
 * 🌊 WEALTH PULSE PROVIDER
 * 
 * Context Provider for Wealth Pulse system
 * - 登录时自动同步状态
 * - 提供实时 Pulse 订阅
 * - 通用接口支持未来扩展
 */

'use client';

import React, { createContext, useContext, ReactNode, useMemo, useEffect, useState, useCallback } from 'react';
import { useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { WealthPulse, PulseType, PulsePayload } from '@/lib/wealth-pulse/types';
import type { UserSettings } from '@/lib/types';
import {
  createPulse,
  syncPulseStates,
  updatePulseStage,
  hidePulseInDashboard,
  markPulseAsCompleted,
  COLLECTION_NAME,
} from '@/lib/wealth-pulse/firestore';
import { shouldShowPulse } from '@/lib/wealth-pulse';

interface WealthPulseContextType {
  /** 当前活跃的 Pulses（已过滤：需要展示的） */
  activePulses: WealthPulse[];
  
  /** 原始 Pulses（未经用户偏好过滤，用于后台逻辑） */
  rawPulses: WealthPulse[];
  
  /** 是否正在加载 */
  isLoading: boolean;
  
  /** 是否已同步（登录时触发一次） */
  isSynced: boolean;
  
  /** 创建新 Pulse */
  pushNewPulse: (type: PulseType, payload: PulsePayload) => Promise<string>;
  
  /** 标记已看过某个 Pulse 的当前阶段 */
  markAsSeen: (pulseId: string, stage: string) => Promise<void>;
  
  /** 隐藏 Pulse（不删除） */
  hidePulse: (pulseId: string) => Promise<void>;
  
  /** 完成 Pulse（分红确认） */
  completePulse: (pulseId: string, transactionId?: string) => Promise<void>;
}

const WealthPulseContext = createContext<WealthPulseContextType | undefined>(undefined);

export const WealthPulseProvider = ({ children }: { children: ReactNode }) => {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [isSynced, setIsSynced] = useState(false);

  // 🎯 获取用户偏好设置
  const settingsRef = useMemo(() => {
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/settings/config`);
  }, [user, firestore]);

  const { data: settings } = useDoc<UserSettings>(settingsRef);

  // 📋 查询用户的所有活跃 Pulses
  const pulsesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, COLLECTION_NAME),
      where('userId', '==', user.uid),
      where('isCompleted', '==', false),
      where('isHiddenInDashboard', '==', false),
      orderBy('createdAt', 'desc')
    );
  }, [user, firestore]);

  const { data: rawPulsesData, isLoading } = useCollection<WealthPulse>(pulsesQuery);

  // 🎯 过滤1：单次触达原则
  const pulsesAfterSingleTouch = useMemo(() => {
    if (!rawPulsesData) return [];
    
    return rawPulsesData.filter(pulse => 
      shouldShowPulse(pulse.status, pulse.lastSeenStage)
    );
  }, [rawPulsesData]);

  // 🛡️ 过滤2：用户偏好过滤（前端拦截逻辑）
  // 规则：根据 settings.hasDividendAlerts 等偏好决定是否展示特定类型的 Pulse
  const activePulses = useMemo(() => {
    if (!pulsesAfterSingleTouch) return [];
    
    return pulsesAfterSingleTouch.filter(pulse => {
      // 🔔 分红提醒开关检查
      if (pulse.type === 'DIVIDEND') {
        return settings?.hasDividendAlerts !== false; // 默认开启
      }
      
      // 🔔 价格提醒开关检查（预留）
      if (pulse.type === 'PRICE_ALERT') {
        return settings?.hasPriceAlerts !== false;
      }
      
      // 🔔 里程碑提醒开关检查（预留）
      if (pulse.type === 'MILESTONE') {
        return settings?.hasMilestoneAlerts !== false;
      }
      
      // 其他类型默认显示
      return true;
    });
  }, [pulsesAfterSingleTouch, settings]);


  // 🔄 登录时自动同步状态
  useEffect(() => {
    const syncOnLogin = async () => {
      if (!user || isUserLoading || isSynced) {
        return;
      }

      try {
        console.log('[WealthPulse] 🔄 Syncing pulse states on login...');
        const updatedCount = await syncPulseStates(firestore, user.uid);
        console.log(`[WealthPulse] ✅ Synced ${updatedCount} pulses`);
        setIsSynced(true);
      } catch (error) {
        console.error('[WealthPulse] ❌ Sync failed:', error);
      }
    };

    syncOnLogin();
  }, [user, firestore, isUserLoading, isSynced]);

  // 📝 API: 创建新 Pulse
  const pushNewPulse = useCallback(async (type: PulseType, payload: PulsePayload): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to create a pulse');
    }

    const pulseId = await createPulse(firestore, user.uid, type, payload);
    console.log(`[WealthPulse] ➕ Created new pulse: ${pulseId}`);
    return pulseId;
  }, [user, firestore]);

  // 📝 API: 标记为已看过
  const markAsSeen = useCallback(async (pulseId: string, stage: string): Promise<void> => {
    await updatePulseStage(firestore, pulseId, stage as any, true);
  }, [firestore]);

  // 📝 API: 隐藏 Pulse
  const hidePulse = useCallback(async (pulseId: string): Promise<void> => {
    await hidePulseInDashboard(firestore, pulseId);
  }, [firestore]);

  // 📝 API: 完成 Pulse
  const completePulse = useCallback(async (pulseId: string, transactionId?: string): Promise<void> => {
    await markPulseAsCompleted(firestore, pulseId, transactionId);
  }, [firestore]);

  const value = useMemo(() => ({
    activePulses,             // 🎯 前端展示用（经过偏好过滤）
    rawPulses: rawPulsesData || [], // 📋 原始数据（用于消息中心等后台逻辑）
    isLoading,
    isSynced,
    pushNewPulse,
    markAsSeen,
    hidePulse,
    completePulse,
  }), [activePulses, rawPulsesData, isLoading, isSynced, pushNewPulse, markAsSeen, hidePulse, completePulse]);

  return (
    <WealthPulseContext.Provider value={value}>
      {children}
    </WealthPulseContext.Provider>
  );
};

export const useWealthPulse = () => {
  const context = useContext(WealthPulseContext);
  if (context === undefined) {
    throw new Error('useWealthPulse must be used within a WealthPulseProvider');
  }
  return context;
};
