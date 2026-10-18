import { ParseTransactionOutput } from '@/ai/flows/parse-transaction-from-natural-language';

// AI Chat Message
export type ConversationMessage = {
  role: 'user' | 'ai';
  content: string;
};

// Transaction record for audit display
export type AffectedTransaction = {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  totalCost: number;
  transactionDate: string;
  displayId?: string;
};

// Update operation diff
export type UpdateDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  displayName: string;
};

// Pending confirmation state for tiered audit
export type PendingConfirmation = {
  action: ParseTransactionOutput;
  expectedInput: string;  // 'confirm' or 'delete'
  message: string;
  timestamp: number; // ⏰ Timeout tracking
  tier?: 1 | 2 | 3 | 4; // 🎯 Audit tier
  affectedCount?: number; // 📊 Total affected records
  affectedRecords?: AffectedTransaction[]; // 📋 Detailed records for tier 2 & 3
  totalAmount?: number; // 💰 Total financial impact
  updateDiffs?: UpdateDiff[]; // 🔄 For update operations: old vs new values
  operationType?: 'delete' | 'update'; // 🎯 Operation type
} | null;

// Undo operation state
export type UndoOperation = {
  type: 'delete' | 'add' | 'update';
  deletedRecords?: any[]; // For delete operations
  transactionId?: string; // For add operations
  originalData?: any; // For update operations (to restore)
  timestamp: number;
} | null;

// 📦 Context Stash: Pending Intent for incomplete instructions
export type PendingIntent = {
  rawData: Partial<ParseTransactionOutput>;
  missingFields: string[];
  timestamp: number;
  userInput: string;
} | null;

// Error Codes for Global Error Interpreter
export enum ErrorCode {
  LOGIC_ERROR = 'LOGIC_ERROR',
  TIMEOUT = 'TIMEOUT',
  PARSING_FAILURE = 'PARSING_FAILURE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN = 'UNKNOWN'
}
