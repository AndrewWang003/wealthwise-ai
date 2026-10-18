/**
 * 🌊 WEALTH PULSE SYSTEM - Firestore Integration
 * 
 * CRUD 操作和实时订阅
 * 遵循项目现有的 Firebase 模式
 */

'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import type {
  WealthPulse,
  PulseType,
  PulseStage,
  PulsePayload,
  DisplayMetadata,
  DividendPayload,
} from './types';
import { getPulseStage, getDisplayMetadataForStage } from './pulse-engine';

/**
 * 集合名称常量
 */
export const COLLECTION_NAME = 'wealth_pulses';

/**
 * 创建新 Pulse
 * 
 * 重要：会预先生成所有阶段的 displayMetadata 并存储
 * 
 * @param db - Firestore 实例
 * @param userId - 用户 ID
 * @param type - Pulse 类型
 * @param payload - 业务数据
 * @returns 新创建的 Pulse ID
 */
export async function createPulse(
  db: Firestore,
  userId: string,
  type: PulseType,
  payload: PulsePayload
): Promise<string> {
  // 1️⃣ 计算初始状态（基于派息日）
  const paymentDate = (payload as DividendPayload).paymentDate;
  const { stage: initialStage } = getPulseStage(paymentDate);

  // 2️⃣ 预先生成所有阶段的 displayMetadata
  const allStages: PulseStage[] = ['ACTIVE', 'PENDING', 'ACTION_REQUIRED', 'EXPIRED'];
  const displayMetadata: Record<PulseStage, DisplayMetadata> = {} as any;

  for (const stage of allStages) {
    displayMetadata[stage] = getDisplayMetadataForStage(stage, payload as DividendPayload);
  }

  // 3️⃣ 构造文档数据
  const pulseData: Omit<WealthPulse, 'id'> = {
    userId,
    type,
    status: initialStage,
    displayMetadata,
    payload,
    lastSeenStage: null, // 用户尚未看到
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isHiddenInDashboard: false,
    isCompleted: false,
  };

  // 4️⃣ 写入 Firestore
  const collectionRef = collection(db, COLLECTION_NAME);
  const docRef = await addDoc(collectionRef, pulseData);

  console.log(`[WealthPulse] ✅ Created new ${type} pulse: ${docRef.id}`);
  return docRef.id;
}

/**
 * 更新 Pulse 状态和 lastSeenStage
 * 
 * 用于状态演进和单次触达原则
 * 
 * @param db - Firestore 实例
 * @param pulseId - Pulse ID
 * @param newStage - 新阶段
 * @param markAsSeen - 是否同时更新 lastSeenStage
 */
export async function updatePulseStage(
  db: Firestore,
  pulseId: string,
  newStage: PulseStage,
  markAsSeen: boolean = true
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, pulseId);

  const updateData: any = {
    status: newStage,
    updatedAt: serverTimestamp(),
  };

  if (markAsSeen) {
    updateData.lastSeenStage = newStage;
  }

  await updateDoc(docRef, updateData);

  console.log(`[WealthPulse] 🔄 Updated pulse ${pulseId}: stage=${newStage}, markAsSeen=${markAsSeen}`);
}

/**
 * 查询用户的所有活跃 Pulses
 * 
 * 活跃 = isCompleted: false && isHiddenInDashboard: false
 * 
 * @param db - Firestore 实例
 * @param userId - 用户 ID
 * @param options - 可选的查询配置
 * @returns Pulse 数组
 */
export async function fetchActivePulses(
  db: Firestore,
  userId: string,
  options?: {
    includeHidden?: boolean;
    maxResults?: number;
  }
): Promise<WealthPulse[]> {
  const constraints: QueryConstraint[] = [
    where('userId', '==', userId),
    where('isCompleted', '==', false),
  ];

  // 默认不包含已隐藏的 Pulses
  if (!options?.includeHidden) {
    constraints.push(where('isHiddenInDashboard', '==', false));
  }

  // 按创建时间倒序
  constraints.push(orderBy('createdAt', 'desc'));

  // 限制结果数量
  if (options?.maxResults) {
    constraints.push(limit(options.maxResults));
  }

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);

  const pulses: WealthPulse[] = [];
  for (const docSnap of snapshot.docs) {
    pulses.push({
      id: docSnap.id,
      ...docSnap.data(),
    } as WealthPulse);
  }

  console.log(`[WealthPulse] 📋 Fetched ${pulses.length} active pulses for user ${userId}`);
  return pulses;
}

/**
 * 标记 Pulse 为已完成
 * 
 * 用于分红确认后
 * 
 * @param db - Firestore 实例
 * @param pulseId - Pulse ID
 * @param transactionId - 关联的 transaction ID（可选）
 */
export async function markPulseAsCompleted(
  db: Firestore,
  pulseId: string,
  transactionId?: string
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, pulseId);

  const updateData: any = {
    isCompleted: true,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 如果提供了 transactionId，更新 payload
  if (transactionId) {
    updateData['payload.transactionId'] = transactionId;
    updateData['payload.isConfirmed'] = true;
  }

  await updateDoc(docRef, updateData);

  console.log(`[WealthPulse] ✅ Marked pulse ${pulseId} as completed`);
}

/**
 * 在 Dashboard 中隐藏 Pulse
 * 
 * 不删除原始记录，仅设置 isHiddenInDashboard = true
 * 
 * @param db - Firestore 实例
 * @param pulseId - Pulse ID
 */
export async function hidePulseInDashboard(
  db: Firestore,
  pulseId: string
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, pulseId);

  await updateDoc(docRef, {
    isHiddenInDashboard: true,
    updatedAt: serverTimestamp(),
  });

  console.log(`[WealthPulse] 👁️ Hidden pulse ${pulseId} in dashboard`);
}

/**
 * 批量同步用户所有 Pulses 的状态
 * 
 * 登录时调用，处理状态跳跃逻辑（长时间未登录）
 * 
 * @param db - Firestore 实例
 * @param userId - 用户 ID
 * @returns 更新的 Pulse 数量
 */
export async function syncPulseStates(
  db: Firestore,
  userId: string
): Promise<number> {
  // 1️⃣ 获取所有未完成的 Pulses（包括已隐藏的）
  const pulses = await fetchActivePulses(db, userId, { includeHidden: true });

  if (pulses.length === 0) {
    console.log('[WealthPulse] 📭 No pulses to sync');
    return 0;
  }

  // 2️⃣ 批量更新
  const batch = writeBatch(db);
  let updateCount = 0;

  for (const pulse of pulses) {
    // 只处理 DIVIDEND 类型的 Pulse
    if (pulse.type !== 'DIVIDEND') {
      continue;
    }

    const payload = pulse.payload as DividendPayload;
    const { stage: newStage } = getPulseStage(payload.paymentDate);

    // 如果状态发生变化，更新
    if (newStage !== pulse.status) {
      const docRef = doc(db, COLLECTION_NAME, pulse.id);
      batch.update(docRef, {
        status: newStage,
        updatedAt: serverTimestamp(),
      });
      updateCount++;

      console.log(
        `[WealthPulse] 🔄 Sync pulse ${pulse.id}: ${pulse.status} → ${newStage}`
      );
    }
  }

  // 3️⃣ 提交批量更新
  if (updateCount > 0) {
    await batch.commit();
    console.log(`[WealthPulse] ✅ Synced ${updateCount} pulses`);
  }

  return updateCount;
}

/**
 * 获取单个 Pulse
 * 
 * @param db - Firestore 实例
 * @param pulseId - Pulse ID
 * @returns Pulse 或 null
 */
export async function getPulse(
  db: Firestore,
  pulseId: string
): Promise<WealthPulse | null> {
  const docRef = doc(db, COLLECTION_NAME, pulseId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as WealthPulse;
}

/**
 * 💰 分红探测与自动生成 (Industrial Grade)
 * 
 * 当价格服务发现新分红信息时调用。
 * 只有当该分红事件尚未记录时，才会创建新的 WealthPulse。
 */
export async function detectAndUpsertDividendPulse(
  db: Firestore,
  userId: string,
  symbol: string,
  dividendInfo: {
    exDividendDate?: string;
    paymentDate?: string;
    dividendAmount?: number;
    currency?: string;
  },
  holdingQuantity: number
): Promise<string | null> {
  if (!dividendInfo.exDividendDate || !dividendInfo.dividendAmount) {
    return null;
  }

  // 1️⃣ 生成唯一标识符：symbol + exDate
  // 防止同一个分红事件被重复记录
  const pulseId = `div_${symbol}_${dividendInfo.exDividendDate.split('T')[0]}`;
  const docRef = doc(db, COLLECTION_NAME, pulseId);
  
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // 如果已存在且未完成，检查是否有金额变化（可选，此处暂不更新）
      return null;
    }

    // 2️⃣ 准备 Payload
    const payload: DividendPayload = {
      symbol,
      exDividendDate: dividendInfo.exDividendDate,
      paymentDate: dividendInfo.paymentDate || dividendInfo.exDividendDate, // 如果没有派息日，退而求其次
      estimatedAmount: dividendInfo.dividendAmount * holdingQuantity,
      holdingQuantity, // 补全缺失字段
      currency: (dividendInfo.currency as any) || 'USD',
      isConfirmed: false,
    };

    // 3️⃣ 创建 Pulse（使用固定 ID 确保幂等性）
    const initialStage = getPulseStage(payload.paymentDate).stage;
    const allStages: PulseStage[] = ['ACTIVE', 'PENDING', 'ACTION_REQUIRED', 'EXPIRED'];
    const displayMetadata: Record<PulseStage, DisplayMetadata> = {} as any;

    for (const stage of allStages) {
      displayMetadata[stage] = getDisplayMetadataForStage(stage, payload);
    }

    const pulseData: WealthPulse = {
      id: pulseId,
      userId,
      type: 'DIVIDEND',
      status: initialStage,
      displayMetadata,
      payload,
      lastSeenStage: null,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
      isHiddenInDashboard: false,
      isCompleted: false,
    };

    await setDoc(docRef, pulseData);
    console.log(`[WealthPulse] 🤖 Auto-detected new dividend for ${symbol}: ${pulseId}`);
    return pulseId;
  } catch (error) {
    console.error(`[WealthPulse] ❌ Failed to upsert dividend pulse for ${symbol}:`, error);
    return null;
  }
}

