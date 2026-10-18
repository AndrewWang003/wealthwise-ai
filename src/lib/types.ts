// 🌍 DYNAMIC: AssetClass now supports any currency cash (e.g., 'JPY Cash', 'EUR Cash')
export type AssetClass = 'Stock' | 'Crypto' | string; // string allows '[Currency] Cash'
export type Market = 'ASX' | 'NASDAQ' | 'NYSE' | 'US' | 'Crypto' | 'HKEX' | 'SSE' | 'SZSE' | 'TSE' | 'LSE';

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  onboardingComplete: boolean;
};

export type UserSettings = {
  isCashTrackingEnabled: boolean;
  displayCurrency: Currency;
  alwaysShowBriefing?: boolean; // 🔔 SMART BRIEFING: Always show banner even with no insights
  
  // 🌊 WEALTH PULSE: User preferences
  hasDividendAlerts?: boolean;
  hasPriceAlerts?: boolean;
  hasMilestoneAlerts?: boolean;
  
  // 🎨 DASHBOARD CUSTOMIZATION: Layout configuration
  dashboardLayout?: DashboardLayoutConfig;
  
  // 🎯 WEALTH GOAL: Target net worth tracking
  wealthGoal?: {
    targetNetWorth: number;      // Target net worth (in USD)
    currency?: Currency;          // NEW: Currency for the target (default USD)
    deadline?: string;            // Optional deadline (ISO format)
    createdAt?: string;           // When the goal was set
  };

  // 🏷️ CATEGORY MANAGEMENT
  customCategories?: string[];
  categoryMeta?: Record<string, CategoryMeta>;
};

// 🏷️ CATEGORY METADATA: Customization for each category
export type CategoryMeta = {
  emoji?: string;
  color?: string;
  type?: 'expense' | 'income' | 'both';
};

// 🌍 DYNAMIC: CashBalance now supports any currency via Record type
export type CashBalance = Record<string, number>;

export type CashAccount = {
  id: string; // The currency code, e.g., 'AUD', 'JPY', 'EUR'
  userId: string;
  currency: Currency;
  balance: number;
};

// 🏦 ACCOUNT TYPES: Multi-wallet support
export type AccountType = 'CASH' | 'SAVINGS' | 'CREDIT' | 'INVESTMENT' | 'CRYPTO';

export interface Account {
  id: string;                    // Firestore document ID (UUID)
  userId: string;                // Owner of the account
  name: string;                  // Display name (e.g., "CommBank")
  type: AccountType;             // Account classification
  currency: Currency;            // Primary currency (default: 'AUD')
  balance?: number;              // Optional: current balance (calculated or manual)
  isDefault: boolean;            // Default account for new transactions
  color?: string;                // Optional: UI theming color (hex)
  icon?: string;                 // Optional: Emoji icon
  createdAt: any;                // Firestore serverTimestamp
  updatedAt?: any;               // Firestore serverTimestamp
}

// 📊 ASSET TYPES: Investment classification
export type AssetType = 'STOCK' | 'ETF' | 'CRYPTO' | 'REIT' | 'BOND' | 'COMMODITY' | 'INDEX';

export interface Asset {
  id: string;                    // Firestore document ID
  userId: string;                // Owner of the asset record
  symbol: string;                // Unique ticker (e.g., "TSLA")
  name: string;                  // Display name (e.g., "Tesla Inc.")
  type: AssetType;               // Classification
  currency: Currency;            // Default currency
  market: Market;                // Exchange market
  createdAt: any;                // Firestore serverTimestamp
  updatedAt?: any;               // Firestore serverTimestamp
}

export type TransactionType = "buy" | "sell" | "income" | "expense" | "dividend" | "fx" | "update" | "delete" | "summary" | "equity_adjustment" | "adjustment" | "transfer";

// 🌍 DYNAMIC: Currency is now a string to support any world currency
export type Currency = string;

export type Transaction = {
  id: string;
  userId: string;
  accountId?: string;            // 🏦 Link to Account (source account)
  transferAccountId?: string;    // 🔄 Destination Account (for transfer transactions only)
  assetId?: string;              // 📊 Link to Asset (for buy/sell only)
  transactionType: TransactionType;
  symbol: string;
  quantity: number;
  price: number;
  fee: number;
  transactionDate: string; // ISO 8601 format
  currency: Currency;
  notes: string;
  assetClass: AssetClass;
  market: Market;
  createdAt: any; // serverTimestamp
  displayId?: string;
  costBasis?: number;
  fxRate?: number;
  impactsCash?: boolean;
  totalCost?: number;

  // 💎 PRINCIPAL MARKER: 标记本金类交易(权益注入/调整)
  isPrincipal?: boolean;

  // 🔍 METADATA: Track AI parsing intent for debugging and auditing
  metadata?: {
    parsedIntent?: 'trade' | 'initial_holding' | 'dividend';  // 🆕 添加 'dividend' 支持
    source?: string;
    pulseId?: string;
    insightId?: string;
  };

  // 🔒 PRECISION: InCents fields for accurate currency calculations
  priceInCents?: number;      // Price stored in cents (integer)
  feeInCents?: number;         // Fee stored in cents (integer)
  costBasisInCents?: number;   // Cost basis stored in cents (integer)

  // 🆕 V2.0: Scope and Category for Investment/Lifestyle tracking
  scope?: 'INVESTMENT' | 'LIFESTYLE';  // Default: 'INVESTMENT' for backward compatibility
  category?: string;  // e.g., "Stock Trade", "Food", "Entertainment", "Dividend Income"
};


export type Holding = {
  id: string; // Should be the symbol
  symbol: string;
  quantity: number;
  averageCost: number;
  currency: Currency;
  assetClass: AssetClass;
  market: Market;
  lastPrice?: number;
  lastPriceTimestamp?: any; // serverTimestamp
};


export type WithId<T> = T & { id: string };

export interface PageContextType {
  pageName: string;
  pageData: any;
  setPageName: (name: string) => void;
  setPageData: (data: any) => void;
  // 🔮 Optimistic Deletion Support
  optimisticDeletedIds?: Set<string>;
  addOptimisticDelete?: (ids: string[]) => void;
  clearOptimisticDelete?: () => void;
  optimisticUpdates?: Record<string, any>;
  addOptimisticUpdate?: (updates: Record<string, any>) => void;
  clearOptimisticUpdate?: () => void;
}

// 🔔 WEALTH PULSE: Insight types for intelligent notifications
export type InsightType = 'daily_change' | 'dividend' | 'fx_alert' | 'system' | 'price_alert' | 'holding_change';
export type InsightStatus = 'unread' | 'acknowledged' | 'dismissed';
export type InsightPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Insight {
  id: string;
  userId: string;
  type: InsightType;
  title: string;
  content: string;
  status: InsightStatus;
  priority: InsightPriority;
  createdAt: any; // Firestore serverTimestamp
  acknowledgedAt?: any;
  
  // Type-specific metadata
  metadata?: {
    // For daily_change insights
    dailyChangeAmount?: number;
    dailyChangePercent?: number;
    currentValue?: number;
    previousValue?: number;
    topGainer?: string;
    topLoser?: string;
    
    // For dividend insights
    symbol?: string;
    exDividendDate?: string;
    dividendAmount?: number;
    currency?: string;
    
    // For FX alerts
    fromCurrency?: string;
    toCurrency?: string;
    oldRate?: number;
    newRate?: number;
    changePercent?: number;
    
    // For price alerts
    currentPrice?: number;
    previousPrice?: number;
    
    // General
    actionUrl?: string;
    actionLabel?: string;
  };
}

/**
 * 🎨 DASHBOARD CUSTOMIZATION
 * 
 * 允许用户自定义仪表盘显示的模块
 */
export interface DashboardLayoutConfig {
  // 核心模块
  showNetWorthCard: boolean;
  showPortfolioSummary: boolean;
  showQuickActions: boolean;
  
  // 分红模块
  showDividendSummary: boolean;
  showDividendChart: boolean;
  
  // 风险分析模块
  showRiskMetrics: boolean;
  
  // 未来扩展
  showPerformanceChart?: boolean;
  showAllocationPie?: boolean;
  showRecentTransactions?: boolean;
}

/**
 * 默认仪表盘布局配置
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  showNetWorthCard: true,
  showPortfolioSummary: true,
  showQuickActions: true,
  showDividendSummary: false,  // 新功能默认关闭
  showDividendChart: false,     // 新功能默认关闭
  showRiskMetrics: false,       // 新功能默认关闭
};


/**
 * 💰 BUDGET WATCH: Budget monitoring interface
 */
export interface Budget {
  id: string;              // Firestore document ID (typically the category name)
  category: string;        // Expense category (e.g., "Housing", "Food")
  limit: number;           // Budget limit in cents (consistent with Transaction amounts)
  period: 'MONTHLY';       // Budget period (currently only monthly supported)
  userId: string;          // Associated user ID
  createdAt: any;          // Firestore serverTimestamp
  updatedAt: any;          // Firestore serverTimestamp
}




