import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X, Edit3, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DiffPreviewCardProps {
  original: any;
  modified: any;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function DiffPreviewCard({ 
  original, 
  modified, 
  onConfirm, 
  onCancel,
  isLoading = false
}: DiffPreviewCardProps) {

  // 1. ⚡ Calculate Diffs Dynamically
  const diffs = useMemo(() => {
    const changes: { key: string; oldValue: any; newValue: any }[] = [];
    
    // BLACKLIST: Hide internal fields or noisy data
    const IGNORED_KEYS = [
      'id', 'timestamp', 'updatedAt', 'userId', 'displayId', 'createdAt', 'impactsCash',
      'metadata', 'transactions', 'original', 'modified', 'action', 
      'transactionType', 'requiresConfirmation', 'category', 'assetClass'
    ];
    
    // Merge keys from both objects
    const allKeys = Array.from(new Set([...Object.keys(original || {}), ...Object.keys(modified || {})]));

    allKeys.forEach(key => {
      if (IGNORED_KEYS.includes(key)) return;

      const oldVal = original?.[key];
      const newVal = modified?.[key];

      // Strict inequality check
      if (oldVal != newVal) {
        // Filter out "noise" (e.g. undefined vs null)
        if (!oldVal && !newVal) return;
        
        // Filter out Object/Array differences (too complex to display in simple diff card)
        if (typeof newVal === 'object' && newVal !== null) return;
        
        changes.push({
          key,
          oldValue: oldVal,
          newValue: newVal
        });
      }
    });

    return changes;
  }, [original, modified]);

  // Helper to format values for display
  const formatValue = (val: any, key: string) => {
    if (val === undefined || val === null) return <span className="text-zinc-600 italic">empty</span>;
    
    // Currency / Numbers
    if (['price', 'amount', 'totalCost', 'quantity'].includes(key)) {
       return Number(val).toLocaleString();
    }
    
    // Dates
    if (key.toLowerCase().includes('date')) {
        try {
            return new Date(val).toLocaleDateString();
        } catch { return String(val); }
    }
    
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return ''; // Safety blank
    return String(val);
  };

  const displayId = original?.displayId || modified?.displayId || modified?.id || "Update";

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full rounded-xl border border-indigo-500/30 bg-indigo-950/20 backdrop-blur-md shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-indigo-500/20 bg-indigo-500/10">
        <div className="p-1.5 rounded-full bg-indigo-500/20 text-indigo-400">
           <Edit3 className="w-4 h-4" />
        </div>
        <div>
           <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wide">Review Changes</h3>
           <p className="text-xs text-indigo-400/70">
              Transaction #{displayId}
           </p>
        </div>
      </div>

      {/* Body: The Diffs */}
      <div className="p-4 space-y-3">
        {diffs.length === 0 ? (
           <div className="text-center py-4 text-zinc-400 text-sm italic flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5 opacity-50" />
              <span>No changes detected.</span>
           </div>
        ) : (
          diffs.map((diff) => (
            <div key={diff.key} className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center text-sm p-2 rounded-lg hover:bg-white/5 transition-colors">
              {/* Left: Original */}
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 uppercase font-medium mb-0.5">{diff.key}</div>
                <div className="text-zinc-500 line-through decoration-zinc-600 decoration-2">
                  {formatValue(diff.oldValue, diff.key)}
                </div>
              </div>

              {/* Center: Arrow */}
              <div className="flex justify-center text-zinc-600">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Right: New */}
              <div className="text-left">
                <div className="text-[10px] text-emerald-500/70 uppercase font-medium mb-0.5">New</div>
                <div className="text-emerald-400 font-bold">
                  {formatValue(diff.newValue, diff.key)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 p-3 border-t border-white/5 bg-black/20">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onCancel}
          className="text-zinc-400 hover:text-white hover:bg-white/10"
        >
          Cancel
        </Button>
        <Button 
          size="sm" 
          onClick={onConfirm}
          disabled={diffs.length === 0 || isLoading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/50"
        >
          {isLoading ? (
             <span className="flex items-center gap-2">Updating...</span>
          ) : (
             <>
               <Check className="w-4 h-4 mr-1.5" />
               Confirm Update
             </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
