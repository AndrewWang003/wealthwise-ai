/**
 * 🌊 WEALTH PULSE SYSTEM - Type Definitions
 * 
 * 具备状态机演进能力的消息系统，首个落地场景：分红追踪
 * 
 * 核心特性：
 * - 状态机演进（Active → Pending → Action Required → Expired）
 * - 单次触达原则（每阶段仅提醒一次）
 * - 可扩展接口（支持未来添加新 Pulse 类型）
 */

import type { Currency } from '../types';

/**
 * Pulse 类型枚举
 * - DIVIDEND: 分红追踪
 * - PRICE_ALERT: 价格提醒（预留）
 * - MILESTONE: 里程碑通知（预留）
 * - SYSTEM: 系统通知（预留）
 */
export type PulseType = 'DIVIDEND' | 'PRICE_ALERT' | 'MILESTONE' | 'SYSTEM';

/**
 * Pulse 状态枚举（基于天数自动演进）
 * - ACTIVE: Day 1-7（视觉预告）
 * - PENDING: Day 8-15（在途标记，香槟金背景）
 * - ACTION_REQUIRED: Day 16-20（触发 ActionHUD 确认框）
 * - EXPIRED: Day 21+（已过期）
 */
export type PulseStage = 'ACTIVE' | 'PENDING' | 'ACTION_REQUIRED' | 'EXPIRED';

/**
 * 视觉配置接口
 * 定义每个阶段的 UI 呈现方式
 */
export interface DisplayMetadata {
  /** 主题色（Forest Green, Champagne Gold, Soft Purple, Cold Grey） */
  color: string;
  
  /** 背景色（带透明度） */
  backgroundColor: string;
  
  /** 图标名称（Lucide React 图标） */
  icon: string;
  
  /** 话术模板（支持变量插值：{symbol}, {amount}, {date}） */
  template: string;
  
  /** 优先级（用于多个 Pulse 同时存在时的排序） */
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  /** 是否需要用户交互（触发 ActionHUD） */
  requiresAction: boolean;
}

/**
 * 分红追踪专用 Payload
 */
export interface DividendPayload {
  /** 股票代码 */
  symbol: string;
  
  /** 预估分红金额（AI 计算） */
  estimatedAmount: number;
  
  /** 货币单位 */
  currency: Currency;
  
  /** 除息日（ISO 8601 格式） */
  exDividendDate: string;
  
  /** 派息日（ISO 8601 格式） */
  paymentDate: string;
  
  /** 持仓数量（快照） */
  holdingQuantity: number;
  
  /** 汇率（如需转换为显示货币） */
  fxRate?: number;
  
  /** 用户最终确认的金额（行内编辑后） */
  confirmedAmount?: number;
  
  /** 是否已确认入账 */
  isConfirmed?: boolean;
  
  /** 关联的 transaction ID（确认后生成） */
  transactionId?: string;
}

/**
 * 通用 Payload 类型（联合类型，支持扩展）
 */
export type PulsePayload = DividendPayload | Record<string, unknown>;

/**
 * Wealth Pulse 核心接口
 */
export interface WealthPulse {
  /** Firestore 文档 ID */
  id: string;
  
  /** 用户 ID */
  userId: string;
  
  /** Pulse 类型 */
  type: PulseType;
  
  /** 当前状态 */
  status: PulseStage;
  
  /** 视觉配置（JSON 存储，支持每个阶段的动态配置） */
  displayMetadata: Record<PulseStage, DisplayMetadata>;
  
  /** 业务数据（类型根据 type 字段确定） */
  payload: PulsePayload;
  
  /** 用户最后看到的阶段（用于单次触达原则） */
  lastSeenStage: PulseStage | null;
  
  /** 创建时间 */
  createdAt: any; // Firestore serverTimestamp
  
  /** 最后更新时间 */
  updatedAt: any; // Firestore serverTimestamp
  
  /** 是否已在 Dashboard 手动隐藏（不删除原始记录） */
  isHiddenInDashboard?: boolean;
  
  /** 是否已完成（确认入账后标记） */
  isCompleted?: boolean;
  
  /** 完成时间 */
  completedAt?: any; // Firestore serverTimestamp
}

/**
 * 用户偏好设置（扩展现有 UserSettings）
 */
export interface WealthPulsePreferences {
  /** 是否启用分红提醒 */
  hasDividendAlerts: boolean;
  
  /** 是否启用价格提醒（预留） */
  hasPriceAlerts?: boolean;
  
  /** 是否启用里程碑通知（预留） */
  hasMilestoneAlerts?: boolean;
}

/**
 * 状态演进结果接口
 */
export interface PulseStageResult {
  /** 当前应处于的阶段 */
  stage: PulseStage;
  
  /** 距离基准日期的天数 */
  daysSinceAnchor: number;
  
  /** 是否需要推送通知 */
  shouldNotify: boolean;
  
  /** 是否需要用户确认 */
  requiresUserAction: boolean;
}
