// 类型定义
export type {
  PulseType,
  PulseStage,
  DisplayMetadata,
  DividendPayload,
  PulsePayload,
  WealthPulse,
  WealthPulsePreferences,
  PulseStageResult,
} from './types';

// 核心函数
export {
  getPulseStage,
  shouldShowPulse,
  getDisplayMetadataForStage,
  sortPulsesByPriority,
} from './pulse-engine';

// Firestore 集成
export {
  createPulse,
  updatePulseStage,
  fetchActivePulses,
  markPulseAsCompleted,
  hidePulseInDashboard,
  syncPulseStates,
  getPulse,
  detectAndUpsertDividendPulse,  // 新增分红探测函数
  COLLECTION_NAME,
} from './firestore';

