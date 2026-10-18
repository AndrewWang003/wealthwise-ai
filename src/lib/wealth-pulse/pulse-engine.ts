/**
 * 🌊 WEALTH PULSE SYSTEM - Evolution Engine
 * 
 * 核心状态机演进逻辑
 * 负责计算 Pulse 应处于的阶段，并判断是否需要触发通知
 */

import type { PulseStage, PulseStageResult, DividendPayload } from './types';

/**
 * 🎯 核心函数：计算 Pulse 应处于的阶段
 * 
 * 算法：
 * 1. 计算当前日期与派息日的差值
 * 2. 根据天数差值判断应处于的阶段
 * 3. 特殊处理：如果用户长时间未登录，直接跳跃至当前日期匹配的最高阶段
 * 
 * @param paymentDate - 派息日（ISO 8601 格式字符串）
 * @param currentDate - 当前日期（可选，默认为 new Date()）
 * @returns PulseStageResult - 包含计算结果的对象
 * 
 * @example
 * const result = getPulseStage('2026-01-20');
 * console.log(result.stage); // 'ACTIVE' | 'PENDING' | 'ACTION_REQUIRED' | 'EXPIRED'
 */
export function getPulseStage(
  paymentDate: string,
  currentDate: Date = new Date()
): PulseStageResult {
  // 1️⃣ 解析派息日
  const payment = new Date(paymentDate);
  
  // 2️⃣ 计算天数差值（向下取整）
  const diffMs = currentDate.getTime() - payment.getTime();
  const daysSincePayment = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // 3️⃣ 根据天数差值判断阶段
  let stage: PulseStage;
  let shouldNotify = false;
  let requiresUserAction = false;
  
  if (daysSincePayment < 0) {
    // 派息日尚未到来（提前创建的 Pulse）
    const daysUntilPayment = Math.abs(daysSincePayment);
    
    if (daysUntilPayment <= 7) {
      // Day -7 to Day 0: ACTIVE（视觉预告）
      stage = 'ACTIVE';
      shouldNotify = true; // 首次进入此阶段时需要通知
    } else {
      // Day -∞ to Day -8: 尚未激活（提前创建但不推送）
      stage = 'ACTIVE';
      shouldNotify = false;
    }
  } else if (daysSincePayment <= 7) {
    // Day 1-7: ACTIVE（视觉预告）
    stage = 'ACTIVE';
    shouldNotify = true;
  } else if (daysSincePayment <= 15) {
    // Day 8-15: PENDING（在途标记，香槟金背景）
    stage = 'PENDING';
    shouldNotify = true;
  } else if (daysSincePayment <= 20) {
    // Day 16-20: ACTION_REQUIRED（触发确认框）
    stage = 'ACTION_REQUIRED';
    shouldNotify = true;
    requiresUserAction = true;
  } else {
    // Day 21+: EXPIRED（已过期）
    stage = 'EXPIRED';
    shouldNotify = false; // 不再推送通知
    requiresUserAction = false;
  }
  
  return {
    stage,
    daysSinceAnchor: daysSincePayment,
    shouldNotify,
    requiresUserAction,
  };
}

/**
 * 🔄 状态同步函数：判断是否需要更新 Pulse 状态
 * 
 * 单次触达原则：
 * - 只有当 currentStage !== lastSeenStage 时才需要提醒用户
 * - 用户确认后立即更新 lastSeenStage
 * 
 * @param currentStage - 当前计算出的阶段
 * @param lastSeenStage - 用户上次看到的阶段（从 Firestore 读取）
 * @returns boolean - 是否需要向用户展示此 Pulse
 */
export function shouldShowPulse(
  currentStage: PulseStage,
  lastSeenStage: PulseStage | null
): boolean {
  // 如果用户从未见过此 Pulse，必须展示
  if (lastSeenStage === null) {
    return true;
  }
  
  // 如果阶段已演进，需要展示
  if (currentStage !== lastSeenStage) {
    return true;
  }
  
  // 如果阶段未变化，不重复提醒
  return false;
}

/**
 * 🎨 生成阶段特定的 DisplayMetadata
 * 
 * 根据当前阶段返回对应的视觉配置
 * 这些配置将在创建 Pulse 时预先生成并存储在 Firestore 中
 */
export function getDisplayMetadataForStage(
  stage: PulseStage,
  payload: DividendPayload
): {
  color: string;
  backgroundColor: string;
  icon: string;
  template: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requiresAction: boolean;
} {
  const { symbol, estimatedAmount, currency, paymentDate } = payload;
  
  switch (stage) {
    case 'ACTIVE':
      return {
        color: '#10B981', // Forest Green
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        icon: 'TrendingUp',
        template: `🌱 ${symbol} 的分红即将到账：预估 ${currency} ${estimatedAmount.toFixed(2)}（派息日：${paymentDate}）`,
        priority: 'low',
        requiresAction: false,
      };
      
    case 'PENDING':
      return {
        color: '#F59E0B', // Champagne Gold
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        icon: 'Clock',
        template: `⏳ ${symbol} 的分红在途中：预估 ${currency} ${estimatedAmount.toFixed(2)}（已派息，等待入账）`,
        priority: 'medium',
        requiresAction: false,
      };
      
    case 'ACTION_REQUIRED':
      return {
        color: '#8B5CF6', // Soft Purple
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        icon: 'AlertCircle',
        template: `✅ ${symbol} 的分红应已到账！请确认实际金额：预估 ${currency} ${estimatedAmount.toFixed(2)}`,
        priority: 'high',
        requiresAction: true,
      };
      
    case 'EXPIRED':
      return {
        color: '#6B7280', // Cold Grey
        backgroundColor: 'rgba(107, 114, 128, 0.1)',
        icon: 'XCircle',
        template: `❌ ${symbol} 的分红已过期（未确认入账）`,
        priority: 'low',
        requiresAction: false,
      };
      
    default:
      // TypeScript 类型守卫（永远不应该到达这里）
      const _exhaustiveCheck: never = stage;
      throw new Error(`Unknown stage: ${_exhaustiveCheck}`);
  }
}

/**
 * 🔍 批量计算 Pulses 的优先级排序
 * 
 * 排序规则：
 * 1. ACTION_REQUIRED > PENDING > ACTIVE > EXPIRED
 * 2. 同阶段按创建时间倒序
 */
export function sortPulsesByPriority<T extends { status: PulseStage; createdAt: any }>(
  pulses: T[]
): T[] {
  const priorityMap: Record<PulseStage, number> = {
    ACTION_REQUIRED: 3,
    PENDING: 2,
    ACTIVE: 1,
    EXPIRED: 0,
  };
  
  return pulses.sort((a, b) => {
    // 先按阶段优先级排序
    const priorityDiff = priorityMap[b.status] - priorityMap[a.status];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    
    // 同阶段按创建时间倒序（新的在前）
    return b.createdAt?.toMillis?.() || 0 - a.createdAt?.toMillis?.() || 0;
  });
}
