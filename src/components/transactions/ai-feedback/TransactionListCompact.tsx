import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, Calendar, Tag, CreditCard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface TransactionListCompactProps {
  data: any[];
  title?: string;
  summary?: { label: string; value: string };
  onItemClick?: (item: any) => void;
}

export function TransactionListCompact({ 
  data, 
  title = "Search Results",
  summary,
  onItemClick
}: TransactionListCompactProps) {

  // Helper: Format Currency
  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper: Format Date
  const formatDate = (dateVal: any) => {
    try {
      if (!dateVal) return '';
      const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      // Cyber style: MM/DD/YY
      return format(date, 'MM/dd/yy'); 
    } catch (e) {
      return String(dateVal);
    }
  };

  if (!data || data.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-sm bg-black/40 backdrop-blur-md border border-zinc-800 rounded-md overflow-hidden"
    >
      {/* HUD Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-black/20">
        <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
            {'//'} {title.replace(/\s+/g, '_').toUpperCase()}
        </div>
        <div className="font-mono text-[10px] text-zinc-600">
            [{data.length}]
        </div>
      </div>

      {/* Body List */}
      <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {data.map((tx, idx) => {
            const txType = tx.transactionType?.toLowerCase();
            const isSell = txType === 'sell' || txType === 'income';
            const isBuy = txType === 'buy' || txType === 'expense';
            
            const amount = tx.amount || tx.totalCost || tx.costBasis || (tx.price * tx.quantity) || 0;
            const displaySymbol = tx.symbol || tx.category || 'N/A';
            const displayDate = formatDate(tx.date || tx.timestamp || tx.transactionDate);
            
            // Format amount with proper sign
            const signPrefix = isSell ? '+' : isBuy ? '-' : '';
            
            return (
                <div 
                    key={tx.id || idx}
                    onClick={() => onItemClick && onItemClick(tx)}
                    className={cn(
                        "group flex items-center justify-between py-2 px-3 border-b border-white/5 last:border-0 transition-all",
                        "hover:bg-zinc-800/50 hover:border-l-2 hover:border-l-emerald-500 hover:pl-[10px] cursor-pointer"
                    )}
                >
                    {/* Left: Date & Symbol */}
                    <div className="flex items-center gap-3 overflow-hidden">
                        <span className="text-[10px] font-mono text-zinc-600 shrink-0">
                            {displayDate}
                        </span>
                        <span className="text-xs text-zinc-300 font-medium truncate">
                            {displaySymbol}
                        </span>
                    </div>

                    {/* Right: Amount */}
                    <div className={cn(
                        "text-xs font-mono font-bold shrink-0 ml-2",
                        isSell 
                            ? "text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.3)]" 
                            : "text-rose-400"
                    )}>
                        {signPrefix}{formatCurrency(amount, tx.currency)}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Footer Summary */}
      {summary && (
          <div className="px-3 py-2 border-t border-dashed border-zinc-800 bg-black/20 flex justify-between items-center">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  {summary.label}
              </span>
              <span className="font-mono text-xs font-bold text-zinc-200">
                  {summary.value}
              </span>
          </div>
      )}
    </motion.div>
  );
}
