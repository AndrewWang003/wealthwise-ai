import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CategoryType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string; // Hex code
  icon: string;  // Emoji
  isDefault?: boolean;
}

interface CategoryState {
  categories: Category[];
  addCategory: (category: Category) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  getCategoryColor: (name: string) => string;
  getCategoryIcon: (name: string) => string;
  getCategoryByName: (name: string) => Category | undefined;
}

// All 19 default categories with isDefault: true
const DEFAULT_CATEGORIES: Category[] = [
  // --- Expenses ---
  { id: '1', name: 'General', type: 'expense', color: '#9CA3AF', icon: '🗂️', isDefault: true },
  { id: '2', name: 'Food & Dining', type: 'expense', color: '#EF4444', icon: '🍽️', isDefault: true },
  { id: '3', name: 'Transportation', type: 'expense', color: '#F59E0B', icon: '🚗', isDefault: true },
  { id: '4', name: 'Shopping', type: 'expense', color: '#EC4899', icon: '🛍️', isDefault: true },
  { id: '5', name: 'Entertainment', type: 'expense', color: '#8B5CF6', icon: '🎬', isDefault: true },
  { id: '6', name: 'Bills & Utilities', type: 'expense', color: '#3B82F6', icon: '💡', isDefault: true },
  { id: '7', name: 'Healthcare', type: 'expense', color: '#EF4444', icon: '🏥', isDefault: true },
  { id: '8', name: 'Education', type: 'expense', color: '#6366F1', icon: '📚', isDefault: true },
  { id: '9', name: 'Travel', type: 'expense', color: '#06B6D4', icon: '✈️', isDefault: true },
  { id: '10', name: 'Groceries', type: 'expense', color: '#10B981', icon: '🛒', isDefault: true },
  { id: '11', name: 'Personal Care', type: 'expense', color: '#F472B6', icon: '💆', isDefault: true },
  { id: '12', name: 'Gifts & Donations', type: 'expense', color: '#F87171', icon: '🎁', isDefault: true },
  { id: '13', name: 'Housing', type: 'expense', color: '#6366F1', icon: '🏠', isDefault: true },
  { id: '14', name: 'Tech', type: 'expense', color: '#14B8A6', icon: '💻', isDefault: true },
  { id: '15', name: 'Other', type: 'expense', color: '#9CA3AF', icon: '📌', isDefault: true },
  
  // --- Income ---
  { id: '16', name: 'Salary', type: 'income', color: '#10B981', icon: '💰', isDefault: true },
  { id: '17', name: 'Dividend', type: 'income', color: '#FBBF24', icon: '📈', isDefault: true },
  { id: '18', name: 'Interest', type: 'income', color: '#3B82F6', icon: '🏦', isDefault: true },
  { id: '19', name: 'Other Income', type: 'income', color: '#8B5CF6', icon: '💵', isDefault: true },
];

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set, get) => ({
      categories: DEFAULT_CATEGORIES,
      
      addCategory: (category) => set((state) => ({ 
        // Force new categories to be custom (not default)
        categories: [...state.categories, { ...category, isDefault: false }] 
      })),
      
      updateCategory: (id, updates) => set((state) => ({
        categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),
      
      deleteCategory: (id) => set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
      })),
      
      getCategoryColor: (name) => {
        const categories = get().categories;
        const targetCat = categories.find(c => c.name === name);
        
        // 1. Exact match
        if (targetCat) return targetCat.color;

        // 2. Fallback to 'Other' (Smart Fallback)
        const otherCat = categories.find(c => c.name === 'Other' || c.name === 'General');
        return otherCat ? otherCat.color : '#9CA3AF'; // Default Grey
      },
      
      getCategoryIcon: (name) => {
        const categories = get().categories;
        const targetCat = categories.find(c => c.name === name);

        // 1. Exact match
        if (targetCat) return targetCat.icon;

        // 2. Fallback to 'Other' (Smart Fallback)
        const otherCat = categories.find(c => c.name === 'Other' || c.name === 'General');
        return otherCat ? otherCat.icon : '📦'; // Default Box
      },
      
      getCategoryByName: (name) => {
        return get().categories.find(c => c.name === name);
      }
    }),
    { 
      name: 'wisecoin-category-storage',
      version: 1,
    }
  )
);
