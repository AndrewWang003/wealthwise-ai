'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StandardCategory, STANDARD_CATEGORIES } from '@/lib/constants/categories';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, arrayUnion, arrayRemove, setDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { UserSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Check, X } from 'lucide-react';
import { useCategoryStore, CategoryType } from '@/stores/useCategoryStore';
import { useMemo } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';



// Preset colors for category selection
const PRESET_COLORS = [
  { name: 'Red', value: '#ef4444', class: 'bg-red-500' },
  { name: 'Orange', value: '#f97316', class: 'bg-orange-500' },
  { name: 'Amber', value: '#f59e0b', class: 'bg-amber-500' },
  { name: 'Yellow', value: '#eab308', class: 'bg-yellow-500' },
  { name: 'Lime', value: '#84cc16', class: 'bg-lime-500' },
  { name: 'Green', value: '#22c55e', class: 'bg-green-500' },
  { name: 'Emerald', value: '#10b981', class: 'bg-emerald-500' },
  { name: 'Teal', value: '#14b8a6', class: 'bg-teal-500' },
  { name: 'Cyan', value: '#06b6d4', class: 'bg-cyan-500' },
  { name: 'Blue', value: '#3b82f6', class: 'bg-blue-500' },
  { name: 'Indigo', value: '#6366f1', class: 'bg-indigo-500' },
  { name: 'Violet', value: '#8b5cf6', class: 'bg-violet-500' },
  { name: 'Purple', value: '#a855f7', class: 'bg-purple-500' },
  { name: 'Pink', value: '#ec4899', class: 'bg-pink-500' },
  { name: 'Rose', value: '#f43f5e', class: 'bg-rose-500' },
  { name: 'Gray', value: '#6b7280', class: 'bg-gray-500' },
];

interface CategoryRow {
  id: string;
  name: string;
  isStandard: boolean;
  emoji: string;
  color: string;
  type: 'expense' | 'income' | 'both';
  usageCount?: number;
}

export function CategoryManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Use category store
  const { categories, updateCategory, addCategory: addToStore } = useCategoryStore();
  
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '📁', color: '#6b7280', type: 'expense' as CategoryType });
  const [isProcessing, setIsProcessing] = useState(false);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [renameDialog, setRenameDialog] = useState<{ oldName: string; newName: string } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);



  // Calculate custom categories count from store
  const customCount = categories.filter(cat => !cat.isDefault).length;

  const settingsRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/settings/config`);
  }, [firestore, user]);

  const { data: settings } = useDoc<UserSettings>(settingsRef);
  
  // Memoize customCategories to prevent useEffect loop
  const customCategories = useMemo(() => settings?.customCategories || [], [settings]);
  
  const categoryMeta = settings?.categoryMeta || {};

  // Fetch usage counts for all categories
  useEffect(() => {
    if (!user) return;

    const fetchUsage = async () => {
      const allCategories = [...STANDARD_CATEGORIES, ...customCategories];
      const counts: Record<string, number> = {};
      
      for (const cat of allCategories) {
        const q = query(
          collection(firestore, `users/${user.uid}/transactions`), 
          where('category', '==', cat)
        );
        const snapshot = await getDocs(q);
        counts[cat] = snapshot.size;
      }
      setUsageCounts(counts);
    };

    fetchUsage();
  }, [user, firestore, customCategories]);

  // Build category rows from store
  const categoryRows: CategoryRow[] = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    isStandard: cat.isDefault || false,
    emoji: cat.icon,
    color: cat.color,
    type: cat.type,
    usageCount: usageCounts[cat.name],
  }));

  const handleAddCategory = async () => {
    if (!newCategory.name.trim() || !user || !settingsRef) return;

    const formatted = newCategory.name.trim().charAt(0).toUpperCase() + newCategory.name.trim().slice(1);
    
    if (STANDARD_CATEGORIES.includes(formatted as StandardCategory) || customCategories.includes(formatted)) {
      toast({ title: 'Duplicate', description: 'This category already exists.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      // Add to Firebase
      await setDoc(settingsRef, {
        customCategories: arrayUnion(formatted),
        categoryMeta: {
          ...categoryMeta,
          [formatted]: {
            emoji: newCategory.emoji,
            color: newCategory.color,
            type: 'expense',
          }
        }
      }, { merge: true });

      // Add to global store
      addToStore({
        id: `custom-${Date.now()}`,
        name: formatted,
        type: newCategory.type,
        color: newCategory.color,
        icon: newCategory.emoji,
        isDefault: false,
      });
      
      setNewCategory({ name: '', emoji: '📁', color: '#6b7280', type: 'expense' });
      setIsAddingNew(false);
      toast({ 
        title: 'Added', 
        description: (
          <span className="text-zinc-400">
            Category &quot;{formatted}&quot; created successfully.
          </span>
        ),
        duration: 5000,
        className: "bg-zinc-950/80 backdrop-blur-xl border border-white/10 text-white shadow-2xl rounded-xl z-[100]"
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateMeta = async (categoryId: string, categoryName: string, field: 'emoji' | 'color', value: string) => {
    if (!user || !settingsRef) return;

    try {
      // Update Firebase
      await setDoc(settingsRef, {
        categoryMeta: {
          ...categoryMeta,
          [categoryName]: {
            ...categoryMeta[categoryName],
            [field === 'emoji' ? 'emoji' : 'color']: value,
          }
        }
      }, { merge: true });

      // Update global store immediately (real-time sync)
      updateCategory(categoryId, field === 'emoji' ? { icon: value } : { color: value });

    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;

    const count = usageCounts[cat.name] || 0;
    if (count > 0) {
      toast({ 
        title: 'Cannot Delete', 
        description: `This category is used in ${count} transactions. Rename or move transactions first.`, 
        variant: 'destructive' 
      });
      return;
    }

    setCategoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete || !user || !settingsRef) return;
    
    const cat = categories.find(c => c.id === categoryToDelete);
    if (!cat) return;

    try {
      setIsProcessing(true);
      
      // 1. Remove from global store
      const { deleteCategory } = useCategoryStore.getState();
      deleteCategory(categoryToDelete);

      // 2. Remove from Firebase settings
      await setDoc(settingsRef, {
        customCategories: arrayRemove(cat.name)
      }, { merge: true });

      toast({ 
        title: 'Deleted', 
        description: (
          <span className="text-zinc-400">
            Category &quot;{cat.name}&quot; has been successfully removed.
          </span>
        ),
        duration: 5000,
        className: "bg-zinc-950/80 backdrop-blur-xl border border-white/10 text-white shadow-2xl rounded-xl z-[100]"
      });
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setCategoryToDelete(null);
    }
  };

  const handleRename = async () => {
    if (!user || !settingsRef || !renameDialog) return;
    const { oldName, newName } = renameDialog;
    const formattedNew = newName.trim().charAt(0).toUpperCase() + newName.trim().slice(1);

    if (formattedNew === oldName) {
      setRenameDialog(null);
      return;
    }

    setIsProcessing(true);
    try {
      // Update Settings
      await setDoc(settingsRef, {
        customCategories: arrayRemove(oldName)
      }, { merge: true });
      await setDoc(settingsRef, {
        customCategories: arrayUnion(formattedNew),
        categoryMeta: {
          ...categoryMeta,
          [formattedNew]: categoryMeta[oldName] || {},
        }
      }, { merge: true });

      // Batch Update Transactions
      const q = query(collection(firestore, `users/${user.uid}/transactions`), where('category', '==', oldName));
      const snapshot = await getDocs(q);
      
      const BATCH_SIZE = 500;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        docs.slice(i, i + BATCH_SIZE).forEach(docSnap => {
          batch.update(docSnap.ref, { category: formattedNew });
        });
        await batch.commit();
      }

      toast({ 
        title: 'Renamed', 
        description: `Updated category and ${docs.length} transactions.` 
      });
      setRenameDialog(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {categoryRows.length} categories • {customCount} custom
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsAddingNew(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        </div>

        {/* Add New Category Row - Glassmorphic */}
        {isAddingNew && (
          <div className="grid grid-cols-[50px_1fr_100px_60px_50px] gap-3 px-6 py-4 items-center border-b border-white/5 bg-white/5">
            {/* Emoji Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-2xl hover:bg-white/10 p-2 rounded-md transition-colors" aria-label="Select emoji">
                  {newCategory.emoji}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-none bg-transparent" align="start">
                <EmojiPicker 
                  theme={Theme.DARK} 
                  onEmojiClick={(e) => setNewCategory(prev => ({ ...prev, emoji: e.emoji }))}
                />
              </PopoverContent>
            </Popover>

            {/* Name Input - Seamless */}
            <input
              type="text"
              placeholder="Category name..."
              value={newCategory.name}
              onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
              className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-medium text-zinc-200 placeholder:text-zinc-600 w-full p-0"
              autoFocus
            />

            {/* Type Selector */}
            <Select
              value={newCategory.type}
              onValueChange={(val: CategoryType) => setNewCategory(prev => ({ ...prev, type: val }))}
            >
              <SelectTrigger className="h-8 w-[100px] bg-transparent border-white/10 text-xs capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/10">
                <SelectItem value="expense" className="text-xs">Expense</SelectItem>
                <SelectItem value="income" className="text-xs">Income</SelectItem>
              </SelectContent>
            </Select>

            {/* Color Picker */}
            <div className="flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 transition-transform bg-[color:var(--cat-color)]" 
                    style={{ '--cat-color': newCategory.color } as React.CSSProperties}
                    aria-label="Select category color"
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="center">
                  <div className="grid grid-cols-8 gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        className={`w-6 h-6 rounded-full ${c.class} hover:scale-110 transition-transform ${newCategory.color === c.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                        onClick={() => setNewCategory(prev => ({ ...prev, color: c.value }))}
                        title={c.name}
                        aria-label={`Select ${c.name} color`}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Actions - Ghost Buttons */}
            <div className="flex justify-end gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 hover:bg-white/10"
                onClick={handleAddCategory} 
                disabled={isProcessing || !newCategory.name.trim()} 
                aria-label="Confirm new category"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-400 hover:text-emerald-300" />
                )}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-white/10"
                onClick={() => setIsAddingNew(false)} 
                aria-label="Cancel adding category"
              >
                <X className="h-4 w-4 text-zinc-400 hover:text-white" />
              </Button>
            </div>
          </div>
        )}

        {/* Category Table - Glassmorphic Style */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[50px_1fr_100px_60px_50px] gap-3 px-6 py-3 border-b border-white/5 bg-white/5">
            <div></div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider text-center">Color</div>
            <div></div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {categoryRows.map((row) => (
              <div 
                key={row.id} 
                className="grid grid-cols-[50px_1fr_100px_60px_50px] gap-3 px-6 py-4 items-center hover:bg-white/5 transition-colors duration-200 group"
              >
              {/* Emoji */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-2xl hover:bg-white/10 p-2 rounded-md transition-colors text-center" aria-label="Change emoji">
                    {row.emoji}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none bg-transparent" align="start">
                  <EmojiPicker 
                    theme={Theme.DARK} 
                    onEmojiClick={(e) => handleUpdateMeta(row.id, row.name, 'emoji', e.emoji)}
                  />
                </PopoverContent>
              </Popover>

              {/* Name */}
              <div className="flex items-center gap-2">
                {row.isStandard ? (
                  <span className="font-medium text-zinc-200">{row.name}</span>
                ) : (
                  <button 
                    className="font-medium hover:underline text-left text-zinc-200"
                    onClick={() => setRenameDialog({ oldName: row.name, newName: row.name })}
                  >
                    {row.name}
                  </button>
                )}
                {row.isStandard && (
                  <Badge className="bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800 text-[10px] uppercase px-2 py-0.5 tracking-wider">
                    Default
                  </Badge>
                )}
              </div>

              {/* Type */}
              <div className="text-sm text-muted-foreground capitalize">
                {row.type}
              </div>

              {/* Color */}
              <div className="flex justify-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <button 
                      className="w-5 h-5 rounded-full border border-muted-foreground/20 hover:scale-110 transition-transform bg-[color:var(--cat-color)]" 
                      style={{ '--cat-color': row.color } as React.CSSProperties}
                      aria-label="Change category color"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="center">
                    <div className="grid grid-cols-8 gap-1">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c.value}
                          className={`w-6 h-6 rounded-full ${c.class} hover:scale-110 transition-transform ${row.color === c.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                          onClick={() => handleUpdateMeta(row.id, row.name, 'color', c.value)}
                          title={c.name}
                          aria-label={`Select ${c.name} color`}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Actions */}
              <div className="flex justify-end">
                {!row.isStandard && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={`p-1.5 rounded hover:bg-muted transition-colors ${
                          (usageCounts[row.name] || 0) > 0 
                            ? 'text-muted-foreground/40 cursor-not-allowed' 
                            : 'text-muted-foreground hover:text-destructive'
                        }`}
                        onClick={() => handleDelete(row.id)}
                        disabled={(usageCounts[row.name] || 0) > 0}
                        aria-label={`Delete ${row.name} category`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {(usageCounts[row.name] || 0) > 0 
                        ? `Used in ${usageCounts[row.name]} transactions`
                        : 'Delete category'
                      }
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>

        {/* Rename Dialog */}
        <Dialog open={!!renameDialog} onOpenChange={(open) => !open && setRenameDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Category</DialogTitle>
              <DialogDescription>
                This will update the category name across all transactions.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input 
                value={renameDialog?.newName || ''}
                onChange={e => setRenameDialog(prev => prev ? { ...prev, newName: e.target.value } : null)}
                placeholder="New Name"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialog(null)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={handleRename} disabled={isProcessing}>
                {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent className="bg-zinc-950 border border-white/10 sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Category?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently remove this category. Any existing transactions will fall back to &apos;Other&apos;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent hover:bg-white/10 text-white border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white border-none"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
