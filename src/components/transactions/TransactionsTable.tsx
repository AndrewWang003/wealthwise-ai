'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc, deleteDoc, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { formatTransactionDate } from '@/lib/date-utils';
import { usePageContext } from '@/contexts/PageContext';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { getCategoryEmoji } from '@/lib/utils/category-emoji';
import { Pencil, Check, X, Trash2, ArrowUp, ArrowDown, CreditCard, Plus } from 'lucide-react';
import type { Transaction, Account } from '@/lib/types';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { SmartCurrencyTabs } from '@/components/common/SmartCurrencyTabs';
import { formatCurrency } from '@/lib/utils/format';
import { useCategoryStore } from '@/stores/useCategoryStore'; // 🏷️ New: Use global store
import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EnhancedCalendar } from '@/components/ui/enhanced-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';



const TRANSACTION_TYPES = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'transfer', label: 'Transfer' } // 🔄 Account-to-account transfer
];

// 💱 CURRENCIES: Common currencies for transactions
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'SGD'];

// 🎯 ASSET TYPES: For investment transactions only (Buy/Sell)
const ASSET_TYPES = [
  { value: 'Stock', label: 'Stock' },
  { value: 'ETF', label: 'ETF' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'REIT', label: 'REIT' },
  { value: 'Bond', label: 'Bond' },
  { value: 'MutualFund', label: 'Mutual Fund' },
  { value: 'IndexFund', label: 'Index Fund' },
  { value: 'Futures', label: 'Futures' },
  { value: 'Options', label: 'Options' },
  { value: 'Commodity', label: 'Commodity' },
  { value: 'Forex', label: 'Forex' },
  { value: 'CFD', label: 'CFD' },
  { value: 'Warrant', label: 'Warrant' },
  { value: 'Preferred', label: 'Preferred Stock' },
  { value: 'Convertible', label: 'Convertible Bond' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Other', label: 'Other' }
];

// 🎯 Helper: Check if transaction type is investment-related
const isInvestmentType = (type: string): boolean => type === 'buy' || type === 'sell';

// 🔄 Helper: Check if transaction type is transfer
const isTransferType = (type: string): boolean => type === 'transfer';

// 🔍 Helper: Check if transaction type is lifestyle (Income/Expense)
const isLifestyleType = (type: string): boolean => {
  return type === 'income' || type === 'expense' || type === 'adjustment';
};

// Helper function for semantic badge styling
const getTypeStyles = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'buy':
    case 'income':
    case 'deposit':
    case 'receive':
    case 'dividend':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20';
    case 'sell':
    case 'expense':
    case 'withdraw':
    case 'send':
    case 'payment':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20';
    case 'transfer':
    case 'exchange':
    case 'swap':
    case 'fx':
    case 'fx':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20';
    case 'adjustment':
    case 'equity_adjustment':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20';
    default:
      return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
};


  const DEFAULT_WIDTHS = {
    select: 40,
    edit: 80,    // 200% width
    date: 120,
    type: 110,
    symbol: 240, // Increased default
    id: 70,
    class: 100, // New: Asset Class column
    account: 150, // 🏦 Account column
    quantity: 110,
    price: 110,
    currency: 70, // New: Currency column
    fee: 90,
    total: 130
  };
export function TransactionsTable() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { setPageName, setPageData, optimisticDeletedIds, optimisticUpdates } = usePageContext(); // 🔮 Added optimisticUpdates
  const { toast } = useToast();
  const { displayCurrency, exchangeRates, getExchangeRate } = usePortfolio();
  
  // 🐛 DEBUG: Log currency state
  useEffect(() => {
    console.log('💱 [TransactionsTable] displayCurrency:', displayCurrency);
    console.log('💱 [TransactionsTable] exchangeRates:', exchangeRates);
  }, [displayCurrency, exchangeRates]);
  
  // 🆕 V2.0: Scope filter state
  const [scopeFilter, setScopeFilter] = useState<'all' | 'investment' | 'lifestyle'>('all');
  
  // 📝 Inline editing state
  // 📝 Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    notes: string;
    symbol: string;       // 🎯 NEW: Symbol for investment transactions  
    quantity: string;
    price: string;
    fee: string;
    date: string;
    category: string;
    assetClass: string;
    transactionType: string;
    accountId: string; // 🏦 Account reference
    currency: string; // 💱 Currency
    transferAccountId: string; // 🔄 Destination account for transfers
  }>({
    notes: '',
    symbol: '',           // 🎯 Default empty, shown for Buy/Sell only
    quantity: '',
    price: '',
    fee: '',
    date: '',
    category: 'General',
    assetClass: 'Stock',
    transactionType: 'expense',
    accountId: '', // 🏦 NEW: Account reference
    currency: 'AUD', // 💱 Default currency
    transferAccountId: '' // 🔄 Default empty
  });

  const [dateError, setDateError] = useState<string>('');

  // 🏷️ CATEGORY SYNC START
  const { categories: storeCategories, getCategoryIcon } = useCategoryStore();
  
  // Use store categories as source of truth, filtered by transaction type
  const allCategories = useMemo(() => {
    // If type is explicitly income or expense, filter accordingly
    const type = editForm.transactionType?.toLowerCase();
    
    // Safety check: if no type defined, show all
    if (!type) return storeCategories.map(c => c.name);

    return storeCategories
      .filter(c => {
        if (type === 'income') return c.type === 'income';
        if (type === 'expense') return c.type === 'expense';
        // 🔧 ADJUSTMENT: Use same categories as income type
        if (type === 'adjustment') return c.type === 'income';
        // For other types (e.g. buy, sell), show all for flexibility
        return true; 
      })
      .map(c => c.name);
  }, [storeCategories, editForm.transactionType]);

  // Helper to resolve emoji using store
  const getResolvedEmoji = (categoryName: string) => {
    return getCategoryIcon(categoryName);
  };
  // 🏷️ CATEGORY SYNC END

  // 🏦 ACCOUNT SYNC START
  const accountsRef = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, `users/${user.uid}/accounts`);
  }, [user, firestore]);

  const { data: accountsData } = useCollection<Account>(accountsRef);
  const accounts = useMemo(() => accountsData ?? [], [accountsData]);
  const defaultAccount = useMemo(() => accounts.find(a => a.isDefault), [accounts]);
  // 🏦 ACCOUNT SYNC END
  
  
  
  // 📦 Batch selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // ➕ NEW: Manual add transaction state
  const [isAddingNew, setIsAddingNew] = useState(false);

  // 🔍 Sorting State
  type SortKey = 'date' | 'type' | 'symbol' | 'class' | 'quantity' | 'price' | 'fee' | 'total';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ 
    key: 'date',
    direction: 'desc' 
  });



  // 📏 Column Resizing State
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);

  // 🔄 Load layout from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('transaction_table_layout_v3');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Merge with DEFAULT_WIDTHS to ensure new columns have default values
          setTimeout(() => setColWidths(prev => ({ ...DEFAULT_WIDTHS, ...parsed })), 0);
        } catch (e) {
          console.error('Failed to parse table layout', e);
        }
      }
    }
  }, []);

  // 💾 Save layout (Debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('transaction_table_layout_v3', JSON.stringify(colWidths));
    }, 500);
    return () => clearTimeout(timer);
  }, [colWidths]);

  const handleResizeStart = (e: React.MouseEvent, key: keyof typeof DEFAULT_WIDTHS) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key];

    const onMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [key]: Math.max(30, startWidth + delta)
      }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.cursor = 'col-resize';
  };

  // 📏 Dynamic Column Configuration
  const columns = [
    { id: 'select', label: '', width: `${colWidths.select}px`, visible: isSelectionMode },
    { id: 'edit', label: '', width: `${colWidths.edit}px`, visible: true },
    { id: 'date', label: 'Date', width: `${colWidths.date}px`, visible: true, sortable: true },
    { id: 'type', label: 'Type', width: `${colWidths.type}px`, visible: true, sortable: true },
    { id: 'symbol', label: 'Symbol', width: `${colWidths.symbol}px`, visible: true, sortable: true },
    { id: 'class', label: 'Asset Type', width: `${colWidths.class}px`, visible: true, sortable: true },
    { id: 'account', label: 'Account', width: `${colWidths.account}px`, visible: true }, // 🏦 Account column
    { id: 'id', label: 'ID', width: `${colWidths.id}px`, visible: true },
    { id: 'quantity', label: 'Quantity', width: `${colWidths.quantity}px`, visible: true, sortable: true, align: 'right' },
    { id: 'price', label: 'Price', width: `${colWidths.price}px`, visible: true, sortable: true, align: 'right' },
    { id: 'currency', label: 'Cur', width: `${colWidths.currency}px`, visible: true, align: 'center' },
    { id: 'fee', label: 'Fee', width: `${colWidths.fee}px`, visible: true, sortable: true, align: 'right' },
    { id: 'total', label: `Total (${displayCurrency})`, width: `${colWidths.total}px`, visible: true, sortable: true, align: 'right' }
  ];

  const visibleColumns = columns.filter(col => col.visible);
  const gridTemplateColumns = visibleColumns.map(col => col.width).join(' ');



  const handleSort = (key: SortKey) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' }; // Default to DESC for new cols (usually better for numbers/dates)
    });
  };

  const renderSortArrow = (key: SortKey) => {
    if (sortConfig.key !== key) return <div className="w-3 h-3 ml-1" />; // Placeholder
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const transactionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, `users/${user.uid}/transactions`),
      orderBy('createdAt', 'desc')
    );
  }, [user, firestore]);

  const {
    data: transactions,
    isLoading: isTransactionsLoading,
    error,
  } = useCollection(transactionsQuery);

  // 🆕 V2.0: Filter transactions by scope + Data sanitization
  const filteredTransactions = transactions?.filter((tx: Transaction) => {
    // 🔮 OPTIMISTIC DELETE: Hide items pending deletion
    if (optimisticDeletedIds && optimisticDeletedIds.has(tx.id)) return false;

    // 🧬 SCHEMA DRIFT DETECTION (DNA TEST)
    // Log the first 3 transactions to see their actual field names
    if (transactions && transactions.indexOf(tx) < 3) {
      console.log("🧬 DNA TEST - Transaction Schema:");
      console.log(" - ID:", tx.id);
      console.log(" - Keys:", Object.keys(tx as any));
      console.log(" - transactionDate:", (tx as any).transactionDate, `(Type: ${typeof (tx as any).transactionDate})`);
      console.log(" - date (legacy?):", (tx as any).date);
      console.log(" - createdAt:", (tx as any).createdAt);
    }
    
    // 🛡️ SANITIZE: Filter out invalid records
    if (!tx || !tx.id || !tx.transactionDate) return false;
    
    if (scopeFilter === 'all') return true;
    if (scopeFilter === 'investment') return !tx.scope || tx.scope === 'INVESTMENT';
    if (scopeFilter === 'lifestyle') return tx.scope === 'LIFESTYLE';
    return true;
  }).map(tx => {
      // 🔮 OPTIMISTIC UPDATE MERGE
      if (optimisticUpdates && optimisticUpdates[tx.id]) {
          return {
              ...tx,
              ...optimisticUpdates[tx.id],
              // Optional: Add visual marker for pending state if needed
              _isOptimistic: true 
          };
      }
      return tx;
  }) || [];

  // 🧮 MEMOIZED SORTING LOGIC
  const sortedTransactions = useMemoFirebase(() => {
    return [...filteredTransactions].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortConfig.key) {
        case 'date': 
          // Parse diverse date formats
          const getTime = (d: any) => {
            if (!d) return 0;
            if (d.toMillis) return d.toMillis(); // Firestore Timestamp
            if (d.getTime) return d.getTime();   // JS Date
            return new Date(d).getTime();        // String
          }
          valA = getTime(a.transactionDate);
          valB = getTime(b.transactionDate);
          break;
        case 'type': 
          valA = a.transactionType || ''; 
          valB = b.transactionType || ''; 
          break;
        case 'symbol': 
          valA = a.symbol || a.category || ''; 
          valB = b.symbol || b.category || ''; 
          break;
        case 'class':
          valA = a.assetClass || '';
          valB = b.assetClass || '';
          break;
        case 'quantity': 
          valA = Math.abs(a.quantity || 0); 
          valB = Math.abs(b.quantity || 0); 
          break;
        case 'price': 
          valA = a.price || 0; 
          valB = b.price || 0; 
          break;
        case 'fee': 
          valA = a.fee || 0; 
          valB = b.fee || 0; 
          break;
        case 'total':
          // Calculate total based on type to match display logic
          const calcTotal = (tx: Transaction) => {
            const q = tx.quantity || 0;
            const p = tx.price || 0;
            const f = tx.fee || 0;
            if (tx.transactionType === 'buy') return q * p + f;
            if (tx.transactionType === 'sell') return q * p - f;
            if (['income','expense','fx'].includes(tx.transactionType || '')) return q * p;
            if (tx.transactionType === 'equity_adjustment') return q;
            if (tx.transactionType === 'adjustment') return q * p;
            return 0;
          }
          valA = calcTotal(a);
          valB = calcTotal(b);
          break;
        default: return 0;
      }

      // String Comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      // Numeric Comparison
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTransactions, sortConfig]);

  const { currentData, ...pagination } = usePagination(sortedTransactions, 20);

  useEffect(() => {
    setPageName('transactions');
    setPageData(transactions);

    return () => {
      setPageName('transactions');
      setPageData(null);
    }
  }, [transactions, setPageName, setPageData]);

  const isLoading = isUserLoading || isTransactionsLoading;

  // 🔧 Start editing a row
  const handleStartEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setDateError('');
    
    // Format date for input
    let formattedDate = '';
    if (tx.transactionDate) {
      try {
        const dateValue = tx.transactionDate as any;
        let dateObj: Date;
        if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          dateObj = dateValue.toDate();
        } else {
          dateObj = new Date(dateValue);
        }
        formattedDate = dateObj.toISOString().split('T')[0];
      } catch (error) {
        console.error('Error formatting date:', error);
      }
    }
    
    setEditForm({
      notes: tx.notes || '',
      quantity: Math.abs(tx.quantity || 0).toString(),
      price: (tx.price || 0).toString(),
      fee: (tx.fee || 0).toString(),
      date: formattedDate,
      symbol: tx.symbol || '',       // 🎯 Load symbol for investment transactions
      category: tx.category || 'General',
      assetClass: (tx.assetClass as string) || 'Stock',
      transactionType: tx.transactionType || 'expense',
      accountId: tx.accountId || defaultAccount?.id || '',
      currency: tx.currency || 'AUD', // 💱 Load currency
      transferAccountId: tx.transferAccountId || '' // 🔄 Load transfer destination
    });
  };

  // 💾 Save inline edit
  const handleSaveEdit = async (txId: string) => {
    if (!user) return;
    
    try {
      // 🏦 Validate account selection
      if (!editForm.accountId || editForm.accountId.trim() === '') {
        toast({ title: 'Validation Error', description: 'Please select an account', variant: 'destructive' });
        return;
      }

      // 🔍 Validate quantity
      const numQuantity = parseFloat(editForm.quantity);
      if (isNaN(numQuantity) || numQuantity <= 0) {
        toast({ title: 'Error', description: 'Quantity must be a positive number', variant: 'destructive' });
        return;
      }

      // 🔍 Validate price
      const numPrice = parseFloat(editForm.price);
      if (isNaN(numPrice) || numPrice < 0) {
        toast({ title: 'Error', description: 'Price must be a non-negative number', variant: 'destructive' });
        return;
      }

      // 🔍 Validate fee
      const numFee = parseFloat(editForm.fee);
      if (isNaN(numFee) || numFee < 0) {
        toast({ title: 'Error', description: 'Fee must be a non-negative number', variant: 'destructive' });
        return;
      }

      // 🔄 Validate transfer-specific fields
      if (editForm.transactionType === 'transfer') {
        if (!editForm.transferAccountId || editForm.transferAccountId.trim() === '') {
          toast({ 
            title: 'Validation Error', 
            description: 'Please select a destination account for transfer', 
            variant: 'destructive' 
          });
          return;
        }
        
        // Prevent self-transfer
        if (editForm.accountId === editForm.transferAccountId) {
          toast({ 
            title: 'Validation Error', 
            description: 'Cannot transfer to the same account', 
            variant: 'destructive' 
          });
          return;
        }
      }

      // 🔍 Validate date
      let dateTimestamp: Timestamp;
      try {
        // Support both YYYY-MM-DD and YYYY/MM/DD formats
        const dateStr = editForm.date.trim().replace(/\//g, '-');
        const dateObj = new Date(dateStr);
        
        if (isNaN(dateObj.getTime())) {
          setDateError('Invalid date format. Please use YYYY-MM-DD (e.g., 2026-01-31)');
          toast({ 
            title: 'Validation Error', 
            description: 'Invalid date format. Please use YYYY-MM-DD', 
            variant: 'destructive' 
          });
          return;
        }
        
        // Check if date is reasonable (not in far future or past)
        const year = dateObj.getFullYear();
        if (year < 2000 || year > 2100) {
          setDateError('Date year must be between 2000 and 2100');
          toast({ 
            title: 'Validation Error', 
            description: 'Date year must be between 2000 and 2100', 
            variant: 'destructive' 
          });
          return;
        }
        
        dateTimestamp = Timestamp.fromDate(dateObj);
      } catch (error) {
        setDateError('Invalid date format. Please use YYYY-MM-DD');
        toast({ 
          title: 'Validation Error', 
          description: 'Invalid date format', 
          variant: 'destructive' 
        });
        return;
      }

      const txRef = doc(firestore, `users/${user.uid}/transactions/${txId}`);

      await updateDoc(txRef, {
        notes: editForm.notes.trim(),
        quantity: Math.abs(numQuantity),
        price: numPrice,
        fee: numFee,
        transactionDate: dateTimestamp,
        category: editForm.category,
        assetClass: editForm.assetClass,
        transactionType: editForm.transactionType,
        accountId: editForm.accountId || undefined, // 🏦 Save account
        transferAccountId: editForm.transactionType === 'transfer' 
          ? editForm.transferAccountId 
          : null, // 🔄 Save transfer destination or clear if not transfer
        currency: editForm.currency || 'AUD', // 💱 Save currency
        updatedAt: Timestamp.now()
      });

      setEditingId(null);
      setDateError('');

    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // ❌ Cancel inline edit
  const handleCancelEdit = () => {
    setEditingId(null);
    setIsAddingNew(false);
    setDateError('');
  };

  // ➕ NEW: Start adding a new transaction
  const handleStartAddNew = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditForm({
      notes: '',
      symbol: '',           // 🔧 FIX: Initialize symbol to prevent controlled/uncontrolled warning
      quantity: '1',
      price: '0',
      fee: '0',
      date: today,
      category: 'General',
      assetClass: 'Cash',
      transactionType: 'expense',
      accountId: defaultAccount?.id || '',
      currency: 'AUD', // 💱 Default currency
      transferAccountId: '' // 🔄 Default empty
    });
    setIsAddingNew(true);
    setEditingId(null);
    setDateError('');
  };

  // 💾 Save new transaction
  const handleSaveNew = async () => {
    if (!user) return;
    
    try {
      // 🏦 Validate account selection
      if (!editForm.accountId || editForm.accountId.trim() === '') {
        toast({ title: 'Validation Error', description: 'Please select an account', variant: 'destructive' });
        return;
      }

      // Validate quantity
      const numQuantity = parseFloat(editForm.quantity);
      if (isNaN(numQuantity) || numQuantity <= 0) {
        toast({ title: 'Error', description: 'Quantity must be a positive number', variant: 'destructive' });
        return;
      }

      // Validate price
      const numPrice = parseFloat(editForm.price);
      if (isNaN(numPrice) || numPrice < 0) {
        toast({ title: 'Error', description: 'Price must be a non-negative number', variant: 'destructive' });
        return;
      }

      // Validate fee
      const numFee = parseFloat(editForm.fee);
      if (isNaN(numFee) || numFee < 0) {
        toast({ title: 'Error', description: 'Fee must be a non-negative number', variant: 'destructive' });
        return;
      }

      // 🔄 Validate transfer-specific fields
      if (editForm.transactionType === 'transfer') {
        if (!editForm.transferAccountId || editForm.transferAccountId.trim() === '') {
          toast({ 
            title: 'Validation Error', 
            description: 'Please select a destination account for transfer', 
            variant: 'destructive' 
          });
          return;
        }
        
        // Prevent self-transfer
        if (editForm.accountId === editForm.transferAccountId) {
          toast({ 
            title: 'Validation Error', 
            description: 'Cannot transfer to the same account', 
            variant: 'destructive' 
          });
          return;
        }
      }

      // Validate date
      const dateStr = editForm.date.trim().replace(/\//g, '-');
      const dateObj = new Date(dateStr);
      
      if (isNaN(dateObj.getTime())) {
        setDateError('Invalid date format. Please use YYYY-MM-DD');
        toast({ title: 'Validation Error', description: 'Invalid date format', variant: 'destructive' });
        return;
      }

      const dateTimestamp = Timestamp.fromDate(dateObj);

      // Determine scope based on transaction type
      const isLifestyle = ['income', 'expense'].includes(editForm.transactionType);
      const scope = isLifestyle ? 'LIFESTYLE' : 'INVESTMENT';

      // Create new transaction document
      const newTxRef = doc(collection(firestore, `users/${user.uid}/transactions`));
      
      await setDoc(newTxRef, {
        id: newTxRef.id,
        userId: user.uid,
        notes: editForm.notes.trim(),
        symbol: isInvestmentType(editForm.transactionType) 
          ? editForm.symbol.toUpperCase()  // 🎯 Investment: use Symbol field
          : editForm.category,             // 🍽️ Lifestyle: use Category as symbol  
        quantity: Math.abs(numQuantity),
        price: numPrice,
        fee: numFee,
        transactionDate: dateTimestamp,
        transactionType: editForm.transactionType,
        assetClass: editForm.assetClass,
        category: editForm.category,
        scope: scope,
        currency: editForm.currency || 'AUD', // 💱 Use selected currency
        market: 'ASX',
        accountId: editForm.accountId || null,
        transferAccountId: editForm.transactionType === 'transfer' 
          ? (editForm.transferAccountId || null)
          : null, // 🔄 Save transfer destination (use null instead of undefined to satisfy Firestore)
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      setIsAddingNew(false);
      setDateError('');
      
      toast({
        title: 'Transaction Added',
        description: 'Your new transaction has been saved.',
        duration: 3000,
      });

    } catch (error: any) {
      console.error('Error adding transaction:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // ⌨️ Handle keyboard shortcuts for new transaction
  const handleKeyDownNew = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNew();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // ⌨️ Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent, txId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(txId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // ✅ Toggle selection
  const handleToggleSelect = (txId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(txId)) {
      newSelected.delete(txId);
    } else {
      newSelected.add(txId);
    }
    setSelectedIds(newSelected);
  };

  // 🗑️ Batch delete
  const handleBatchDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    
    if (!confirm(`Delete ${selectedIds.size} transactions? This cannot be undone.`)) {
      return;
    }

    try {
      const batch = writeBatch(firestore);
      selectedIds.forEach(id => {
        const txRef = doc(firestore, `users/${user.uid}/transactions/${id}`);
        batch.delete(txRef);
      });

      await batch.commit();
      
      toast({ 
        title: 'Success', 
        description: `Deleted ${selectedIds.size} transaction${selectedIds.size !== 1 ? 's' : ''}` 
      });
      
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (error: any) {
      console.error('Error deleting transactions:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // 🔄 Reset Layout to Default
  const handleResetLayout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('transaction_table_layout_v3');
      setColWidths(DEFAULT_WIDTHS);
      toast({ 
        title: 'Layout Reset', 
        description: 'Column widths restored to default values.' 
      });
    }
  };

  // 💱 Currency Conversion Helper
  const convertAmount = (amount: number, fromCurrency: string): number => {
    if (!fromCurrency || fromCurrency === displayCurrency) return amount;
    
    // 🛡️ Safety check: ensure getExchangeRate exists
    if (!getExchangeRate) {
      console.warn('getExchangeRate not available, using original amount');
      return amount;
    }
    
    // 🧠 Use PortfolioContext's smart rate lookup (supports inverse & USD bridging)
    const rate = getExchangeRate(fromCurrency, displayCurrency);
    
    // 🐛 DEBUG: Log conversion details
    console.log(`💱 Converting ${amount} ${fromCurrency} -> ${displayCurrency}:`, {
      rate,
      result: rate ? amount * rate : null
    });
    
    if (!rate || rate === null) {
      console.warn(`Missing FX rate for ${fromCurrency} -> ${displayCurrency}`);
      return amount; // Return original if rate not available
    }
    
    return amount * rate;
  };

  // 🛡️ SAFE DATE FORMATTING
  const formatDate = (dateValue: any): string => {
    if (!dateValue) return 'Invalid Date';
    try {
      if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate().toLocaleDateString();
      }
      return new Date(dateValue).toLocaleDateString();
    } catch (error) {
      return 'Invalid Date';
    }
  };
  
  // 📅 Date Helpers for Calendar
  const getDateObject = (dateStr: string): Date | undefined => {
    if (!dateStr) return undefined;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? undefined : date;
  };

  const handleDateSelect = (date: Date | undefined, isNew: boolean) => {
    if (!date) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    if (isNew) {
      setEditForm(prev => ({ ...prev, date: dateStr }));
    } else {
      setEditForm(prev => ({ ...prev, date: dateStr }));
      setDateError('');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">
            Failed to load transactions: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Transactions Yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            You haven&apos;t added any transactions. Get started by adding one.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ✅ Select All Logic
  const isAllSelected = filteredTransactions.length > 0 && selectedIds.size === filteredTransactions.length;
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
       const allIds = new Set(filteredTransactions.map(tx => tx.id));
       setSelectedIds(allIds);
    } else {
       setSelectedIds(new Set());
    }
  };

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0 pt-6 px-[5px]">
        {/* 🆕 V2.0: Scope Filter Tabs */}
        <Tabs value={scopeFilter} onValueChange={(value) => setScopeFilter(value as 'all' | 'investment' | 'lifestyle')} className="w-full">
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="investment">Investment</TabsTrigger>
              <TabsTrigger value="lifestyle">Lifestyle</TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <SmartCurrencyTabs />
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetLayout}
              >
                Reset Layout
              </Button>
              <Button
                variant={isSelectionMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedIds(new Set());
                }}
              >
                {isSelectionMode ? 'Done' : 'Select'}
              </Button>
              


              {/* ➕ Add Transaction Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartAddNew}
                disabled={isAddingNew}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Transaction
              </Button>
            </div>
          </div>
          
          <TabsContent value={scopeFilter} className="mt-0">
            {/* 📊 Batch Selection Action Bar */}
            {selectedIds.size > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 backdrop-blur-sm">
                <span className="text-sm font-medium">
                  {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            )}

            {/* 🛡️ SCROLLABLE TABLE CONTAINER */}
            <div className="w-fit max-w-full overflow-x-auto border rounded-md border-white/10">
              <div className="w-fit inline-block align-middle">
            {/* 🛡️ GRID TABLE HEADER (Glass Effect) */}
            <div 
              className="sticky top-0 z-20 flex items-center bg-zinc-900/95 backdrop-blur-md border-b border-white/10 text-xs font-medium text-muted-foreground select-none shadow-sm"
              style={{ display: 'grid', gridTemplateColumns }}
            >
              {visibleColumns.map((col, index) => (
                <div 
                  key={col.id}
                  className={`flex items-center h-12 relative group/head overflow-hidden ${
                    index !== visibleColumns.length - 1 ? 'border-r border-white/5' : ''
                  } ${
                    col.sortable ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''
                  } ${
                    col.align === 'right' ? 'justify-end' : ''
                  } ${
                    col.id !== 'spacer' ? 'px-3' : 'px-0'
                  }`}
                  onClick={() => col.sortable && handleSort(col.id as SortKey)}
                >
                  {col.id === 'select' ? (
                    <div className="pr-3 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                       <Checkbox 
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        aria-label="Select all"
                      />
                    </div>
                  ) : null}
                  
                  <span className="truncate">{col.label}</span>
                  
                  {col.sortable && renderSortArrow(col.id as SortKey)}
                  
                  {/* Resizer - Disable for last column */}
                  {index !== visibleColumns.length - 1 && (
                    <div 
                      className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize hover:bg-blue-500 active:bg-blue-500 transition-colors z-50 opacity-0 group-hover/head:opacity-100"
                      onMouseDown={(e) => handleResizeStart(e, col.id as keyof typeof DEFAULT_WIDTHS)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 🛡️ GRID TABLE BODY */}
            <div className="divide-y-0">
            {/* ➕ NEW: Add Transaction Row */}
            {isAddingNew && (
              <div 
                className="group transition-all duration-200 border-b border-white/5 flex items-center min-h-[3.5rem] bg-emerald-500/10"
                style={{ display: 'grid', gridTemplateColumns }}
              >
                {/* Select Checkbox placeholder */}
                {isSelectionMode && <div className="flex justify-center items-center px-2" />}
                
                {/* Edit Actions */}
                <div className="flex items-center justify-end gap-1 px-3 py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleSaveNew}
                  >
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCancelEdit}
                  >
                    <X className="h-4 w-4 text-zinc-400" />
                  </Button>
                </div>
                
                {/* Date */}
                <div className="flex items-center px-3 py-2">
                    <input
                      type="date"
                      aria-label="Transaction Date"
                      value={editForm.date ? format(new Date(editForm.date), "yyyy-MM-dd") : ""}
                      onChange={(e) => handleDateSelect(e.target.value ? new Date(e.target.value) : undefined, true)}
                      className="h-7 w-full bg-zinc-900/50 border border-zinc-700 focus:border-emerald-500 rounded px-2 text-xs text-white [color-scheme:dark]"
                    />
                </div>
                
                {/* Type */}
                <div className="flex items-center px-3 py-2">
                  <Select
                    value={editForm.transactionType}
                    onValueChange={(val) => setEditForm(prev => ({ 
                      ...prev, 
                      transactionType: val,
                      price: (['income', 'expense', 'adjustment'].includes(val)) ? '1' : prev.price,
                      category: val === 'income' ? 'Salary' : prev.category
                    }))}
                  >
                    <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                      {TRANSACTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Symbol (Investment) OR Category (Lifestyle) OR Transfer To Account - Conditional */}
                {!isTransferType(editForm.transactionType) ? (
                  // NON-TRANSFER: Show Symbol or Category
                  <div className="flex items-center px-3 py-2">
                    {isInvestmentType(editForm.transactionType) ? (
                      // 🎯 INVESTMENT: Show Symbol input (auto-uppercase)
                      <Input
                        value={editForm.symbol}
                        onChange={(e) => setEditForm(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                        className="h-7 w-full bg-transparent border-zinc-700 text-xs uppercase"
                        placeholder="AAPL, BTC, etc."
                      />
                    ) : (
                      // 🍽️ LIFESTYLE: Show Category selector
                      <Select
                        value={editForm.category}
                        onValueChange={(val) => setEditForm(prev => ({ ...prev, category: val }))}
                      >
                        <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100 max-h-[200px]">
                          {allCategories.map(cat => (
                            <SelectItem key={cat} value={cat} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">
                              {getCategoryEmoji(cat)} {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ) : (
                  // 🔄 TRANSFER: Show "Transfer To Account" in Symbol column
                  <div className="flex items-center px-3 py-2">
                    <Select
                      value={editForm.transferAccountId}
                      onValueChange={(val) => {
                        const destAccount = accounts.find(a => a.id === val);
                        const sourceAccount = accounts.find(a => a.id === editForm.accountId);
                        
                        // 💱 FX Logic:
                        // 1. Set Currency to Destination Currency
                        // 2. Calculate Rate (Source -> Destination)
                        let newPrice = editForm.price;
                        if (sourceAccount && destAccount && getExchangeRate) {
                          const rate = getExchangeRate(sourceAccount.currency, destAccount.currency);
                          if (rate) newPrice = rate.toString();
                        } else if (destAccount?.currency === sourceAccount?.currency) {
                          newPrice = '1';
                        }

                        setEditForm(prev => ({ 
                          ...prev, 
                          transferAccountId: val,
                          currency: destAccount?.currency || prev.currency, // Lock to Dest Currency
                          price: newPrice
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                        <SelectValue placeholder="To Account...">
                          {editForm.transferAccountId && (
                            <span className="flex items-center gap-2">
                              <span className="text-base">{accounts.find(a => a.id === editForm.transferAccountId)?.icon || '💰'}</span>
                              <span>{accounts.find(a => a.id === editForm.transferAccountId)?.name}</span>
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                        {accounts
                          .filter(a => a.id !== editForm.accountId) // Prevent self-transfer
                          .map(account => (
                            <SelectItem 
                              key={account.id} 
                              value={account.id} 
                              className="text-xs focus:bg-zinc-800 focus:text-zinc-100"
                            >
                              <span className="flex items-center gap-2">
                                <span className="text-base">{account.icon || '💰'}</span>
                                <span>{account.name}</span>
                              </span>
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Asset Type (Investment only) - Hidden for Transfer & Lifestyle */}
                {isInvestmentType(editForm.transactionType) ? (
                  <div className="flex items-center px-3 py-2">
                    <Select
                      value={editForm.assetClass}
                      onValueChange={(val) => setEditForm(prev => ({ ...prev, assetClass: val }))}
                    >
                      <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                        {ASSET_TYPES.map(c => (
                          <SelectItem key={c.value} value={c.value} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  // Empty placeholder for non-investment to maintain grid alignment
                  <div className="flex items-center px-3 py-2">
                    <span className="text-xs text-zinc-600">—</span>
                  </div>
                )}
                
                {/* 🏦 Account (FROM Account for Transfer) */}
                <div className="flex items-center px-3 py-2">
                  <Select
                    value={editForm.accountId}
                    onValueChange={(val) => {
                      const selectedAccount = accounts.find(a => a.id === val);
                      
                      setEditForm(prev => {
                        const isTransfer = isTransferType(prev.transactionType);
                        let targetCurrency = selectedAccount?.currency || prev.currency;
                        let newPrice = prev.price;

                        // 💱 FX Logic for Transfer
                        if (isTransfer) {
                           const destAccount = accounts.find(a => a.id === prev.transferAccountId);
                           // Currency stays as Dest Currency for Transfer
                           targetCurrency = destAccount?.currency || prev.currency;
                           
                           // Recalculate Rate (Source [New] -> Dest)
                           if (selectedAccount && destAccount && getExchangeRate) {
                              const rate = getExchangeRate(selectedAccount.currency, destAccount.currency);
                              if (rate) newPrice = rate.toString();
                           }
                        }

                        return { 
                          ...prev, 
                          accountId: val,
                          currency: targetCurrency,
                          price: newPrice
                        };
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                      <SelectValue placeholder={isTransferType(editForm.transactionType) ? "From Account..." : "Select account..."}>
                        {editForm.accountId && accounts.find(a => a.id === editForm.accountId) && (
                          <span className="flex items-center gap-1.5">
                            <span>{accounts.find(a => a.id === editForm.accountId)?.icon || '💰'}</span>
                            <span>{accounts.find(a => a.id === editForm.accountId)?.name}</span>
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                      {accounts.length === 0 ? (
                        <SelectItem value="no-accounts" disabled className="text-xs text-muted-foreground italic">
                          No accounts available
                        </SelectItem>
                      ) : (
                        accounts.map(account => (
                          <SelectItem 
                            key={account.id} 
                            value={account.id} 
                            className="text-xs focus:bg-zinc-800 focus:text-zinc-100"
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-base">{account.icon || '💰'}</span>
                              <span>{account.name}</span>
                              {account.isDefault && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1 py-0.5 rounded">
                                  Default
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* ID - Placeholder for new transaction */}
                <div className="flex items-center px-3 py-2">
                  <span className="text-xs text-muted-foreground italic">New</span>
                </div>
                
                {/* Quantity - Transfer Amount for Transfer, Quantity for Investment, Amount for Lifestyle */}
                <div className="flex items-center px-3 py-2">
                  {isInvestmentType(editForm.transactionType) || isTransferType(editForm.transactionType) || ['income', 'expense', 'adjustment'].includes(editForm.transactionType) ? (
                    <Input
                      value={editForm.quantity}
                      onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                      onKeyDown={(e) => handleKeyDownNew(e)}
                      className="h-7 w-full bg-transparent border-zinc-700 text-xs text-right"
                      placeholder={isTransferType(editForm.transactionType) ? "Amount" : "1"}
                    />
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </div>
                
                {/* Price - 1.00 for Lifestyle, FX Rate for Transfer */}
                <div className="flex items-center px-3 py-2">
                  {isTransferType(editForm.transactionType) ? (
                    <Input
                      value={editForm.price}
                      onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                      className="h-7 w-full bg-transparent border-zinc-700 text-xs text-right text-blue-400 font-medium"
                      placeholder="Rate"
                    />
                  ) : ['income', 'expense', 'adjustment'].includes(editForm.transactionType) ? (
                    <Input
                      value="1"
                      disabled
                      className="h-7 w-full bg-zinc-800/50 border-zinc-700 text-xs text-right text-zinc-400 cursor-not-allowed"
                    />
                  ) : isInvestmentType(editForm.transactionType) ? (
                    <Input
                      value={editForm.price}
                      onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                      onKeyDown={(e) => handleKeyDownNew(e)}
                      className="h-7 w-full bg-transparent border-zinc-700 text-xs text-right"
                      placeholder="0.00"
                    />
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </div>
                
                {/* Currency - Select */}
                <div className="flex items-center px-3 py-2">
                  <Select
                    value={editForm.currency}
                    disabled={isTransferType(editForm.transactionType)} // 🔒 Locked to Dest Account Currency for Transfer
                    onValueChange={(val) => setEditForm(prev => ({ ...prev, currency: val }))}
                  >
                    <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Fee */}
                <div className="flex items-center px-3 py-2">
                  <Input
                    value={editForm.fee}
                    onChange={(e) => setEditForm(prev => ({ ...prev, fee: e.target.value }))}
                    onKeyDown={(e) => handleKeyDownNew(e)}
                    className="h-7 w-full bg-transparent border-zinc-700 text-xs text-right"
                    placeholder="0.00"
                  />
                </div>
                
                {/* Total (calculated or transfer amount) */}
                <div className="flex items-center justify-end px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    {isTransferType(editForm.transactionType) || !isInvestmentType(editForm.transactionType)
                      ? formatCurrency(parseFloat(editForm.quantity || '0'), editForm.currency || 'AUD') // Transfer & Lifestyle: just show quantity as amount
                      : formatCurrency(parseFloat(editForm.quantity || '0') * parseFloat(editForm.price || '0'), editForm.currency || 'AUD') // Investment: quantity * price
                    }
                  </span>
                </div>
              </div>
            )}
            
            {currentData.map((tx) => {
              const isEditing = editingId === tx.id;
              const quantity = tx.quantity ?? 0;
              const price = tx.price ?? 0;
              const fee = tx.fee ?? 0;
              
              // 💱 Get native currency (fallback to AUD if not specified)
              const txCurrency = tx.currency || 'AUD';
              
              // 💱 Convert amounts to display currency
              const displayPrice = convertAmount(price, txCurrency);
              const displayFee = convertAmount(fee, txCurrency);
              
              let total;
              switch (tx.transactionType) {
                case 'buy':
                  total = quantity * price + fee;
                  break;
                case 'sell':
                  total = quantity * price - fee;
                  break;
                case 'income':
                case 'expense':
                  total = quantity * price;
                  break;
                case 'fx':
                  total = quantity * price;
                  break;
                case 'equity_adjustment':
                  total = quantity;
                  break;
                case 'adjustment':
                  total = quantity * price;
                  break;
                default:
                  total = 0;
              }
              
              // 💱 Convert total to display currency
              const displayTotal = convertAmount(total, txCurrency);


              const displayId = tx.id?.slice(-5) || 'N/A';

              const isSelected = selectedIds.has(tx.id);

              return (
                <div 
                  key={tx.id}
                  className={`group transition-all duration-200 border-b border-white/5 flex items-center min-h-[3.5rem] hover:bg-white/[0.02] ${
                    (tx as any)._isOptimistic ? 'animate-pulse bg-emerald-500/5' : ''
                  } ${
                    isSelectionMode ? 'cursor-pointer' : ''
                  } ${
                    isSelected ? 'bg-primary/10 hover:bg-primary/15' : ''
                  }`}
                  style={{ display: 'grid', gridTemplateColumns }}
                  onClick={() => {
                    if (isSelectionMode) {
                      handleToggleSelect(tx.id);
                    }
                  }}
                >
                  {visibleColumns.map((col, index) => {
                    // 🛡️ DYNAMIC CELL RENDERING
                    const renderCellContent = () => {
                      switch (col.id) {
                        case 'select':
                          return (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSelect(tx.id)}
                              className="w-4 h-4 border-muted-foreground/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                            />
                          );
                        case 'edit':
                          if (!isEditing) {
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(tx);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-all duration-200 text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-white/10"
                                title="Edit transaction"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            );
                          }
                          // Edit Actions
                          return (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button
                                size="sm"
                                className="h-6 w-6 p-0 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50"
                                onClick={() => handleSaveEdit(tx.id)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-zinc-400 hover:text-white hover:bg-white/10"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        case 'date':
                          if (isEditing) {
                            return (
                              <div className="w-full" onClick={e => e.stopPropagation()}>
                                <input
                                  type="date"
                                  aria-label="Transaction Date"
                                  value={editForm.date ? format(new Date(editForm.date), "yyyy-MM-dd") : ""}
                                  onChange={(e) => handleDateSelect(e.target.value ? new Date(e.target.value) : undefined, false)}
                                  className="h-7 w-full bg-zinc-900/50 border border-zinc-700 focus:border-emerald-500 rounded px-2 text-xs text-white [color-scheme:dark]"
                                />
                                {dateError && (
                                  <p className="text-[10px] text-red-400 absolute -bottom-3 left-0">{dateError}</p>
                                )}
                              </div>
                            );
                          }
                          return formatDate(tx.transactionDate);
                        case 'type':
                          if (isEditing) {
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="px-2 py-1 text-left hover:bg-zinc-800 rounded text-xs capitalize w-full border border-zinc-700 truncate">
                                      {editForm.transactionType}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48 p-0 bg-zinc-950/80 backdrop-blur-xl border-zinc-800" align="start">
                                    <Command className="bg-transparent">
                                      <CommandGroup>
                                        {TRANSACTION_TYPES.map((type) => (
                                          <CommandItem
                                            key={type.value}
                                            onSelect={() => {
                                              setEditForm(prev => ({ 
                                                ...prev, 
                                                transactionType: type.value,
                                                price: (['income', 'expense', 'adjustment'].includes(type.value)) ? '1' : prev.price,
                                                category: type.value === 'income' ? 'Salary' : prev.category
                                              }));
                                            }}
                                            className="cursor-pointer text-xs border border-transparent data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:border-primary/50 data-[selected=true]:shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                                          >
                                            {editForm.transactionType === type.value && (
                                              <Check className="mr-2 h-3 w-3 text-emerald-500" />
                                            )}
                                            <span className={editForm.transactionType !== type.value ? 'ml-5' : ''}>
                                              {type.label}
                                            </span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            );
                          }
                          return (
                            <Badge
                              variant="outline"
                              className={`capitalize px-2 py-0.5 border text-[10px] font-normal transition-colors truncate ${getTypeStyles(tx.transactionType || 'unknown')}`}
                            >
                              {tx.transactionType || 'unknown'}
                            </Badge>
                          );
                        case 'symbol':
                          if (isEditing) {
                            // 🔄 TRANSFER: Hide symbol/category field
                            // 🔄 TRANSFER: Show Destination Account Selector in Edit Mode
                            if (isTransferType(editForm.transactionType)) {
                              return (
                                <div onClick={e => e.stopPropagation()} className="w-full">
                                  <Select
                                    value={editForm.transferAccountId}
                                    onValueChange={(val) => {
                                      const destAccount = accounts.find(a => a.id === val);
                                      const sourceAccount = accounts.find(a => a.id === editForm.accountId);
                                      
                                      let newPrice = editForm.price;
                                      if (sourceAccount && destAccount && getExchangeRate) {
                                        const rate = getExchangeRate(sourceAccount.currency, destAccount.currency);
                                        if (rate) newPrice = rate.toString();
                                      } else if (destAccount?.currency === sourceAccount?.currency) {
                                        newPrice = '1';
                                      }

                                      setEditForm(prev => ({ 
                                        ...prev, 
                                        transferAccountId: val,
                                        currency: destAccount?.currency || prev.currency,
                                        price: newPrice
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                                      <SelectValue placeholder="To Account...">
                                        {editForm.transferAccountId && accounts.find(a => a.id === editForm.transferAccountId) && (
                                           <span className="flex items-center gap-1.5">
                                             <span>{accounts.find(a => a.id === editForm.transferAccountId)?.icon || '💰'}</span>
                                             <span>{accounts.find(a => a.id === editForm.transferAccountId)?.name}</span>
                                           </span>
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                                      {accounts
                                        .filter(a => a.id !== editForm.accountId)
                                        .map(account => (
                                          <SelectItem key={account.id} value={account.id} className="text-xs">
                                            {account.icon} {account.name}
                                          </SelectItem>
                                        ))
                                      }
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            }
                            
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                {isInvestmentType(editForm.transactionType) ? (
                                  // 🎯 INVESTMENT: Show Symbol input (auto-uppercase)
                                  <Input
                                    value={editForm.symbol}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                                    className="h-7 w-full bg-transparent border-zinc-700 text-xs uppercase"
                                    placeholder="AAPL, BTC, etc."
                                  />
                                ) : (
                                  // 🍽️ LIFESTYLE: Show Category selector
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="px-2 py-1 text-left hover:bg-zinc-800 rounded text-xs w-full border border-zinc-700 truncate">
                                        {editForm.category}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-0 bg-zinc-950/80 backdrop-blur-xl border-zinc-800" align="start">
                                      <Command className="bg-transparent">
                                        <CommandInput placeholder="Category..." className="h-8 text-xs border-b border-zinc-800 bg-transparent" />
                                        <CommandEmpty>No category.</CommandEmpty>
                                        <CommandGroup className="max-h-60 overflow-y-auto">
                                          {allCategories.map((cat) => (
                                            <CommandItem
                                              key={cat}
                                              onSelect={() => {
                                                setEditForm(prev => ({ ...prev, category: cat }));
                                              }}
                                              className="cursor-pointer text-xs border border-transparent data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:border-primary/50 data-[selected=true]:shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                                            >
                                              {editForm.category === cat && (
                                                <Check className="mr-2 h-3 w-3 text-emerald-500" />
                                              )}
                                              <span className={editForm.category !== cat ? 'ml-5' : ''}>
                                                {getCategoryEmoji(cat)} {cat}
                                              </span>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      </Command>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            );
                          }
                          
                          // Display mode: Show transfer destination for transfer transactions
                          if (tx.transactionType === 'transfer') {
                            const destAccount = accounts.find(a => a.id === tx.transferAccountId);
                            return (
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-xs text-zinc-500">→</span>
                                <span className="text-sm text-zinc-300 truncate">
                                  {destAccount ? `${destAccount.icon || '💰'} ${destAccount.name}` : 'Unknown Account'}
                                </span>
                              </div>
                            );
                          }
                          
                          return tx.scope === 'LIFESTYLE' ? (
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-xl shrink-0" role="img" aria-label={tx.category || 'transaction'}>
                                {getCategoryEmoji(tx.category || '')}
                              </span>
                              <span className="text-sm text-zinc-300 truncate">
                                {tx.category || 'Lifestyle'}
                              </span>
                            </div>
                          ) : (
                            <span className="font-semibold tracking-wide text-zinc-100 truncate">{tx.symbol || 'N/A'}</span>
                          );
                        case 'class':
                          if (isEditing) {
                            // 🎯 Only show Asset Type for investment transactions (buy/sell)
                            // Hide for transfer and lifestyle transactions
                            if (isTransferType(editForm.transactionType) || !isInvestmentType(editForm.transactionType)) {
                              return <div className="text-zinc-600 text-xs">—</div>;
                            }
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="px-2 py-1 text-left hover:bg-zinc-800 rounded text-xs w-full border border-zinc-700 truncate">
                                      {editForm.assetClass}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-40 p-0 bg-zinc-950/80 backdrop-blur-xl border-zinc-800" align="start">
                                    <Command className="bg-transparent">
                                      <CommandGroup>
                                        {ASSET_TYPES.map((cls) => (
                                          <CommandItem
                                            key={cls.value}
                                            onSelect={() => {
                                              setEditForm(prev => ({ ...prev, assetClass: cls.value }));
                                            }}
                                            className="cursor-pointer text-xs border border-transparent data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:border-primary/50 data-[selected=true]:shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                                          >
                                            {editForm.assetClass === cls.value && (
                                              <Check className="mr-2 h-3 w-3 text-emerald-500" />
                                            )}
                                            <span className={editForm.assetClass !== cls.value ? 'ml-5' : ''}>
                                              {cls.label}
                                            </span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </Command>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            );
                          }
                          return (
                            <span className="text-zinc-400 truncate text-xs">{tx.assetClass || '—'}</span>
                          );
                        case 'account':
                          // 🏦 Account Column
                          if (isEditing) {
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Select
                                  value={editForm.accountId}
                                  onValueChange={(val) => {
                                    const selectedAccount = accounts.find(a => a.id === val);
                                    
                                    setEditForm(prev => {
                                      const isTransfer = isTransferType(prev.transactionType);
                                      let targetCurrency = selectedAccount?.currency || prev.currency;
                                      let newPrice = prev.price;

                                      if (isTransfer) {
                                         const destAccount = accounts.find(a => a.id === prev.transferAccountId);
                                         targetCurrency = destAccount?.currency || prev.currency;
                                         
                                         if (selectedAccount && destAccount && getExchangeRate) {
                                            const rate = getExchangeRate(selectedAccount.currency, destAccount.currency);
                                            if (rate) newPrice = rate.toString();
                                         }
                                      }

                                      return { 
                                        ...prev, 
                                        accountId: val,
                                        currency: targetCurrency,
                                        price: newPrice
                                      };
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                                    <SelectValue placeholder="Select account...">
                                      {editForm.accountId && accounts.find(a => a.id === editForm.accountId) && (
                                        <span className="flex items-center gap-1.5">
                                          <span>{accounts.find(a => a.id === editForm.accountId)?.icon || '💰'}</span>
                                          <span>{accounts.find(a => a.id === editForm.accountId)?.name}</span>
                                        </span>
                                      )}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                                    {accounts.length === 0 ? (
                                      <SelectItem value="no-accounts" disabled className="text-xs text-muted-foreground italic">
                                        No accounts available
                                      </SelectItem>
                                    ) : (
                                      accounts.map(account => (
                                        <SelectItem 
                                          key={account.id} 
                                          value={account.id} 
                                          className="text-xs focus:bg-zinc-800 focus:text-zinc-100"
                                        >
                                          <span className="flex items-center gap-2">
                                            <span className="text-base">{account.icon || '💰'}</span>
                                            <span>{account.name}</span>
                                            {account.isDefault && (
                                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1 py-0.5 rounded">
                                                Default
                                              </span>
                                            )}
                                          </span>
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          // Display mode: Show account icon and name
                          const txAccount = accounts.find(a => a.id === tx.accountId);
                          return (
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-sm">{txAccount?.icon || '💰'}</span>
                              <span className="text-xs text-zinc-300 truncate">
                                {txAccount?.name || 'No Account'}
                              </span>
                            </div>
                          );
                        case 'id':
                          return <span className="truncate">{displayId}</span>;
                        case 'quantity':
                          if (isEditing) {
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editForm.quantity}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
                                  onKeyDown={(e) => handleKeyDown(e, tx.id)}
                                  className="h-8 w-full text-right bg-transparent border-zinc-700 focus:border-zinc-500 text-white p-1 text-xs"
                                  autoFocus
                                />
                              </div>
                            );
                          }
                          return <span className="truncate">{quantity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</span>;
                        case 'price':
                          if (isEditing) {
                            // 💱 TRANSFER: Editable FX Rate (Blue)
                            if (isTransferType(editForm.transactionType)) {
                              return (
                                <div className="w-full px-3 py-2">
                                  <Input
                                    value={editForm.price}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                                    className="h-7 w-full text-right bg-transparent border-zinc-700 text-blue-400 text-xs font-medium"
                                  />
                                </div>
                              );
                            }
                            
                            // 💰 LIFESTYLE: Fixed Price 1 (Disabled)
                            if (['income', 'expense', 'adjustment'].includes(editForm.transactionType)) {
                               return (
                                <div className="w-full px-3 py-2">
                                  <Input
                                    value="1"
                                    disabled
                                    className="h-7 w-full text-right bg-zinc-800/50 border-zinc-700 text-zinc-400 text-xs cursor-not-allowed"
                                  />
                                </div>
                              );
                            }

                            // 📝 Default Edit
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editForm.price}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                                  onKeyDown={(e) => handleKeyDown(e, tx.id)}
                                  className="h-8 w-full text-right bg-transparent border-zinc-700 focus:border-zinc-500 text-white p-1 text-xs"
                                />
                              </div>
                            );
                          }
                          // 👀 Display Mode
                          return <span className="truncate">{displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
                        case 'currency':
                          if (isEditing) {
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Select
                                  value={editForm.currency}
                                  onValueChange={(val) => setEditForm(prev => ({ ...prev, currency: val }))}
                                >
                                  <SelectTrigger className="h-7 text-xs bg-transparent border-zinc-700">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100">
                                    {CURRENCIES.map(c => (
                                      <SelectItem key={c} value={c} className="text-xs focus:bg-zinc-800 focus:text-zinc-100">{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          return (
                            <span className="truncate px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                              {txCurrency || 'N/A'}
                            </span>
                          );
                        case 'fee':
                          if (isEditing) {
                            return (
                              <div onClick={e => e.stopPropagation()} className="w-full">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editForm.fee}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, fee: e.target.value }))}
                                  onKeyDown={(e) => handleKeyDown(e, tx.id)}
                                  className="h-8 w-full text-right bg-transparent border-zinc-700 focus:border-zinc-500 text-white p-1 text-xs"
                                />
                              </div>
                            );
                          }
                          return <span className="truncate">{displayFee > 0 ? displayFee.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</span>;
                        case 'total':
                          return <span className="truncate">{displayTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
                        case 'spacer':
                          return null;
                        default:
                          return null;
                      }
                    };

                    return (
                      <div 
                        key={col.id}
                        className={`flex items-center h-full overflow-hidden whitespace-nowrap 
                          ${col.id !== 'spacer' ? 'px-3' : 'px-0'}
                          ${index !== visibleColumns.length - 1 ? 'border-r border-white/5' : ''}
                          ${col.align === 'right' ? 'justify-end font-mono' : ''}
                          ${col.id === 'select' || col.id === 'edit' ? 'justify-center' : ''}
                          ${col.id === 'date' || col.id === 'id' || col.id === 'fee' ? 'text-zinc-400' : 'text-zinc-200'}
                          ${col.id === 'symbol' ? 'font-medium' : ''}
                          ${col.id === 'total' ? (
                            total > 0 ? (tx.transactionType === 'income' || tx.transactionType === 'dividend' || tx.transactionType === 'sell' ? 'text-emerald-400' : 'text-zinc-200') : 
                            (total < 0 ? 'text-rose-400' : 'text-zinc-200')
                          ) : ''}
                          text-sm
                        `}
                        onClick={e => {
                          if (col.id === 'select') e.stopPropagation();
                        }}
                      >
                        {renderCellContent()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </div>
              </div>
            </div>
        
        {/* 🏭 Industrial-Grade Pagination System */}
        <TablePagination
          {...pagination}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          isLoading={isLoading}
        />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
