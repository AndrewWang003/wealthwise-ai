'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Transaction } from '@/lib/types';

interface EditTransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const CATEGORIES = [
  'General',
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Travel',
  'Groceries',
  'Personal Care',
  'Gifts & Donations',
  'Other'
];

export function EditTransactionModal({ transaction, isOpen, onClose, userId }: EditTransactionModalProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form state
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('General');
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');

  // Initialize form when transaction changes
  useEffect(() => {
    if (transaction) {
      setNotes(transaction.notes || '');
      setAmount(Math.abs(transaction.quantity || 0).toString());
      
      // Format date for input (YYYY-MM-DD)
      if (transaction.transactionDate) {
        try {
          let dateObj: Date;
          const dateValue = transaction.transactionDate as any;
          
          // Check if it's a Firestore Timestamp
          if (dateValue.toDate && typeof dateValue.toDate === 'function') {
            dateObj = dateValue.toDate();
          } else if (typeof dateValue === 'string') {
            dateObj = new Date(dateValue);
          } else {
            dateObj = new Date(dateValue);
          }
          
          const formatted = dateObj.toISOString().split('T')[0];
          setDate(formatted);
        } catch (error) {
          console.error('Error formatting date:', error);
          setDate('');
        }
      }
      
      setCategory(transaction.category || 'General');
      setTransactionType(transaction.transactionType as 'income' | 'expense' || 'expense');
    }
  }, [transaction]);

  const handleSave = async () => {
    if (!transaction) return;
    
    setIsLoading(true);
    try {
      const txRef = doc(firestore, `users/${userId}/transactions/${transaction.id}`);
      
      // Parse amount
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) {
        throw new Error('Invalid amount');
      }
      
      // Parse date
      let dateTimestamp: Timestamp;
      try {
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
          throw new Error('Invalid date');
        }
        dateTimestamp = Timestamp.fromDate(dateObj);
      } catch (error) {
        throw new Error('Invalid date format');
      }

      await updateDoc(txRef, {
        notes: notes.trim(),
        quantity: Math.abs(numAmount),
        transactionDate: dateTimestamp,
        category,
        transactionType,
        updatedAt: Timestamp.now()
      });

      toast({
        title: 'Success',
        description: 'Transaction updated successfully',
        variant: 'default'
      });

      onClose();
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update transaction',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const txRef = doc(firestore, `users/${userId}/transactions/${transaction.id}`);
      await deleteDoc(txRef);

      toast({
        title: 'Success',
        description: 'Transaction deleted successfully',
        variant: 'default'
      });

      onClose();
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete transaction',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="notes">Description</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter description"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={transactionType} onValueChange={(value) => setTransactionType(value as 'income' | 'expense')}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
                <SelectItem value="dividend">💰 Dividend</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || isLoading}
            className="w-full sm:w-auto"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading || isDeleting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isDeleting}
            className="w-full sm:w-auto"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
