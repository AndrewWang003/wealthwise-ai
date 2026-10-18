'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { Account, AccountType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Check, X, Pencil, CreditCard, Wallet, PiggyBank, TrendingUp, Bitcoin, Star } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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

// Preset colors for account selection
const PRESET_COLORS = [
  { name: 'Emerald', value: '#10b981', class: 'bg-emerald-500' },
  { name: 'Blue', value: '#3b82f6', class: 'bg-blue-500' },
  { name: 'Purple', value: '#8b5cf6', class: 'bg-violet-500' },
  { name: 'Pink', value: '#ec4899', class: 'bg-pink-500' },
  { name: 'Orange', value: '#f97316', class: 'bg-orange-500' },
  { name: 'Red', value: '#ef4444', class: 'bg-red-500' },
  { name: 'Teal', value: '#14b8a6', class: 'bg-teal-500' },
  { name: 'Indigo', value: '#6366f1', class: 'bg-indigo-500' },
  { name: 'Gray', value: '#6b7280', class: 'bg-gray-500' },
];

// Account type configurations
const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Wallet }[] = [
  { value: 'CASH', label: 'Cash', icon: Wallet },
  { value: 'SAVINGS', label: 'Savings', icon: PiggyBank },
  { value: 'CREDIT', label: 'Credit', icon: CreditCard },
  { value: 'INVESTMENT', label: 'Investment', icon: TrendingUp },
  { value: 'CRYPTO', label: 'Crypto', icon: Bitcoin },
];

// Common currencies
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'SGD'];

// Default icons for account types
const getAccountIcon = (type: AccountType): string => {
  switch (type) {
    case 'CASH': return '💵';
    case 'SAVINGS': return '🏦';
    case 'CREDIT': return '💳';
    case 'INVESTMENT': return '📈';
    case 'CRYPTO': return '₿';
    default: return '💰';
  }
};

interface AccountRow extends Account {
  transactionCount?: number;
}

export function AccountManager() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'CASH' as AccountType,
    currency: 'AUD',
    color: '#10b981',
    icon: '💵',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Account>>({});
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [transactionCounts, setTransactionCounts] = useState<Record<string, number>>({});

  // Fetch accounts from Firestore
  const accountsRef = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, `users/${user.uid}/accounts`);
  }, [user, firestore]);

  const { data: accountsData, isLoading } = useCollection<Account>(accountsRef);
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);

  // Fetch transaction counts for each account
  useEffect(() => {
    if (!user || accounts.length === 0) return;

    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      
      for (const account of accounts) {
        const q = query(
          collection(firestore, `users/${user.uid}/transactions`),
          where('accountId', '==', account.id)
        );
        const snapshot = await getDocs(q);
        counts[account.id] = snapshot.size;
      }
      setTransactionCounts(counts);
    };

    fetchCounts();
  }, [user, firestore, accounts]);

  const handleAddAccount = async () => {
    if (!newAccount.name.trim() || !user) return;

    const formatted = newAccount.name.trim();
    
    // Check for duplicates
    if (accounts.some(a => a.name.toLowerCase() === formatted.toLowerCase())) {
      toast({ title: 'Duplicate', description: 'An account with this name already exists.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const accountId = uuidv4();
      const isFirst = accounts.length === 0;
      
      const accountData: Account = {
        id: accountId,
        userId: user.uid,
        name: formatted,
        type: newAccount.type,
        currency: newAccount.currency,
        color: newAccount.color,
        icon: newAccount.icon || getAccountIcon(newAccount.type),
        isDefault: isFirst, // First account is default
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, `users/${user.uid}/accounts/${accountId}`), accountData);

      setNewAccount({ name: '', type: 'CASH', currency: 'AUD', color: '#10b981', icon: '💵' });
      setIsAddingNew(false);
      
      toast({
        title: 'Account Created',
        description: (
          <span className="text-zinc-400">
            &quot;{formatted}&quot; has been added to your accounts.
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

  const handleUpdateAccount = async (accountId: string) => {
    if (!user || !editForm.name?.trim()) return;

    setIsProcessing(true);
    try {
      await setDoc(
        doc(firestore, `users/${user.uid}/accounts/${accountId}`),
        {
          ...editForm,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setEditingId(null);
      setEditForm({});
      
      toast({
        title: 'Account Updated',
        description: 'Your changes have been saved.',
        duration: 3000,
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetDefault = async (accountId: string) => {
    if (!user) return;

    setIsProcessing(true);
    try {
      // Remove default from all accounts first
      for (const account of accounts) {
        if (account.isDefault) {
          await setDoc(
            doc(firestore, `users/${user.uid}/accounts/${account.id}`),
            { isDefault: false },
            { merge: true }
          );
        }
      }

      // Set new default
      await setDoc(
        doc(firestore, `users/${user.uid}/accounts/${accountId}`),
        { isDefault: true },
        { merge: true }
      );

      toast({
        title: 'Default Account Updated',
        description: 'This account will be pre-selected for new transactions.',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = (id: string) => {
    const count = transactionCounts[id] || 0;
    if (count > 0) {
      toast({
        title: 'Cannot Delete',
        description: `This account has ${count} linked transactions. Remove or reassign them first.`,
        variant: 'destructive',
      });
      return;
    }

    const account = accounts.find(a => a.id === id);
    if (account?.isDefault) {
      toast({
        title: 'Cannot Delete Default',
        description: 'Set another account as default before deleting this one.',
        variant: 'destructive',
      });
      return;
    }

    setAccountToDelete(id);
  };

  const confirmDelete = async () => {
    if (!accountToDelete || !user) return;

    try {
      setIsProcessing(true);
      await deleteDoc(doc(firestore, `users/${user.uid}/accounts/${accountToDelete}`));

      toast({
        title: 'Account Deleted',
        description: 'The account has been removed.',
        duration: 3000,
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setAccountToDelete(null);
    }
  };

  const startEditing = (account: Account) => {
    setEditingId(account.id);
    setEditForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      color: account.color,
      icon: account.icon,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingNew(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
        </div>

        {/* Add New Account Row */}
        {isAddingNew && (
          <div className="grid grid-cols-[60px_1fr_100px_80px_60px_60px] gap-3 px-4 py-4 items-center border rounded-lg bg-muted/30">
            {/* Icon */}
            <div className="text-2xl text-center">{newAccount.icon}</div>

            {/* Name Input */}
            <Input
              placeholder="Account name..."
              value={newAccount.name}
              onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
              className="bg-transparent"
              autoFocus
            />

            {/* Type Selector */}
            <Select
              value={newAccount.type}
              onValueChange={(val: AccountType) => setNewAccount(prev => ({
                ...prev,
                type: val,
                icon: getAccountIcon(val),
              }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                {ACCOUNT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Currency Selector */}
            <Select
              value={newAccount.currency}
              onValueChange={(val) => setNewAccount(prev => ({ ...prev, currency: val }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                {CURRENCIES.map(c => (
                  <SelectItem key={c} value={c} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Color Picker */}
            <div className="flex justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    aria-label="Select account color"
                    className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform"
                    style={{ backgroundColor: newAccount.color }}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="center">
                  <div className="grid grid-cols-3 gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c.value}
                        aria-label={`Select ${c.name} color`}
                        className={`w-6 h-6 rounded-full ${c.class} hover:scale-110 transition-transform ${newAccount.color === c.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                        onClick={() => setNewAccount(prev => ({ ...prev, color: c.value }))}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleAddAccount}
                disabled={isProcessing || !newAccount.name.trim()}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsAddingNew(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Account List */}
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[60px_1fr_100px_80px_60px_80px] gap-3 px-4 py-3 border-b border-white/5 bg-white/5">
            <div></div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Currency</div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider text-center">Color</div>
            <div></div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {accounts.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground">
                <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No accounts yet</p>
                <p className="text-xs">Create your first account to start tracking</p>
              </div>
            ) : (
              accounts.map((account) => {
                const isEditing = editingId === account.id;

                return (
                  <div
                    key={account.id}
                    className="grid grid-cols-[60px_1fr_100px_80px_60px_80px] gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors group"
                  >
                    {/* Icon */}
                    <div className="text-2xl text-center">
                      {account.icon || getAccountIcon(account.type)}
                    </div>

                    {/* Name */}
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <Input
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="h-8 bg-transparent"
                        />
                      ) : (
                        <>
                          <span className="font-medium text-zinc-200">{account.name}</span>
                          {account.isDefault && (
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5">
                              <Star className="h-2.5 w-2.5 mr-0.5" />
                              Default
                            </Badge>
                          )}
                        </>
                      )}
                    </div>

                    {/* Type */}
                    <div>
                      {isEditing ? (
                        <Select
                          value={editForm.type}
                          onValueChange={(val: AccountType) => setEditForm(prev => ({ ...prev, type: val }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                            {ACCOUNT_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-xs capitalize">
                          {account.type.toLowerCase()}
                        </Badge>
                      )}
                    </div>

                    {/* Currency */}
                    <div>
                      {isEditing ? (
                        <Select
                          value={editForm.currency}
                          onValueChange={(val) => setEditForm(prev => ({ ...prev, currency: val }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                            {CURRENCIES.map(c => (
                              <SelectItem key={c} value={c} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground">{account.currency}</span>
                      )}
                    </div>

                    {/* Color */}
                    <div className="flex justify-center">
                      {isEditing ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              aria-label="Select account color"
                              className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                              style={{ backgroundColor: editForm.color }}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="center">
                            <div className="grid grid-cols-3 gap-1">
                              {PRESET_COLORS.map(c => (
                                <button
                                  key={c.value}
                                  aria-label={`Select ${c.name} color`}
                                  className={`w-6 h-6 rounded-full ${c.class} hover:scale-110 transition-transform ${editForm.color === c.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                                  onClick={() => setEditForm(prev => ({ ...prev, color: c.value }))}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full border border-white/20"
                          style={{ backgroundColor: account.color }}
                        />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleUpdateAccount(account.id)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm({});
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {!account.isDefault && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleSetDefault(account.id)}
                                >
                                  <Star className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Set as default</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => startEditing(account)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity ${
                                  (transactionCounts[account.id] || 0) > 0 || account.isDefault
                                    ? 'text-muted-foreground/40 cursor-not-allowed'
                                    : 'hover:text-destructive'
                                }`}
                                onClick={() => handleDelete(account.id)}
                                disabled={(transactionCounts[account.id] || 0) > 0 || account.isDefault}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {account.isDefault
                                ? 'Cannot delete default'
                                : (transactionCounts[account.id] || 0) > 0
                                ? `${transactionCounts[account.id]} linked transactions`
                                : 'Delete'}
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
          <AlertDialogContent className="bg-zinc-950 border border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Account?</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                This will permanently remove this account. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-transparent hover:bg-white/10 text-white border-white/10">
                Cancel
              </AlertDialogCancel>
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
      </div>
    </TooltipProvider>
  );
}
