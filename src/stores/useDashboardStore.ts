import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// import type { Layout } from 'react-grid-layout'; // Removing ambiguous import

// ----------------------------------------------------------------------
// Constants & Types
// ----------------------------------------------------------------------

export const DASHBOARD_WIDGETS = {
  NET_WORTH: 'net-worth',
  SPENDING_TREND: 'spending-trend',
  DIVIDEND_RECEIVED: 'dividend-received',
  WEALTH_GOAL: 'wealth-goal',
  CASH_FLOW_SUMMARY: 'cash-flow-summary',
} as const;

export type WidgetId = (typeof DASHBOARD_WIDGETS)[keyof typeof DASHBOARD_WIDGETS];

// Explicitly define LayoutItem to avoid type ambiguity
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
  visible?: boolean; // New: Visibility Flag
}

export type GridHelperLayout = LayoutItem[];

// 12-column grid. RowHeight approx 60px. Golden Layout (7:5 ratio).
const DEFAULT_LAYOUT: GridHelperLayout = [
  // 1. Cash Flow Summary (Top Full Width)
  {
    i: DASHBOARD_WIDGETS.CASH_FLOW_SUMMARY,
    x: 0,
    y: 0,
    w: 12,
    h: 4,
    minH: 4,
    visible: true
  },
  // 2. Net Worth (Bottom Left)
  {
    i: DASHBOARD_WIDGETS.NET_WORTH,
    x: 0,
    y: 4,
    w: 6,
    h: 8,
    visible: true
  },
  // 3. Spending Trend (Bottom Right)
  {
    i: DASHBOARD_WIDGETS.SPENDING_TREND,
    x: 6,
    y: 4,
    w: 6,
    h: 8,
    visible: true
  }
];

interface DashboardState {
  layout: GridHelperLayout;
  isEditMode: boolean;
  
  // Actions
  toggleEditMode: () => void;
  updateLayout: (newLayout: GridHelperLayout) => void;
  toggleWidgetVisibility: (id: string) => void;
  resetLayout: () => void;
}

// ----------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      layout: DEFAULT_LAYOUT,
      isEditMode: false,

      toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),
      
      updateLayout: (newLayout) => set({ layout: newLayout }),

      toggleWidgetVisibility: (id: string) => {
        set((state) => {
          const layout = [...state.layout];
          const itemIndex = layout.findIndex((l) => l.i === id);
          
          if (itemIndex > -1) {
              const item = { ...layout[itemIndex] };
              item.visible = item.visible === undefined ? false : !item.visible;
              layout[itemIndex] = item;
              return { layout };
          }
          return state;
        });
      },

      resetLayout: () => set({ layout: DEFAULT_LAYOUT }),
    }),
    {
      name: 'dashboard-layout-storage-v6', // Version bumped to force reload new structure
    }
  )
);
