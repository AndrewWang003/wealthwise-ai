import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ConfirmationCard } from './ai-feedback';

interface PendingConfirmation {
  action: any;
  expectedInput: string;
  message: string;
  timestamp: number;
  tier?: 1 | 2 | 3 | 4;
  affectedCount?: number;
  affectedRecords?: Array<{
    id: string;
    symbol: string;
    quantity: number;
    price: number;
    totalCost: number;
    transactionDate: string;
    displayId?: string;
  }>;
  totalAmount?: number;
  updateDiffs?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    displayName: string;
  }>;
  operationType?: 'delete' | 'update';
}

interface PendingActionHUDProps {
  pendingConfirmation: PendingConfirmation | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PendingActionHUD({ pendingConfirmation, onConfirm, onCancel, isLoading = false }: PendingActionHUDProps) {
  if (!pendingConfirmation) return null;

  const renderCard = () => {
    // Update operation - show Diff Preview
    if (pendingConfirmation.operationType === 'update' && pendingConfirmation.updateDiffs) {
      return (
        <div className="overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-500/5 backdrop-blur-md shadow-[0_0_15px_rgba(59,130,246,0.1)]">
          <div className="flex flex-col gap-4 p-4">
            {/* Header */}
            <div className="flex items-center gap-3 text-blue-400">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-blue-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <span className="font-bold tracking-tight">Update Preview</span>
            </div>

            {/* Target Info */}
            <div className="pl-11">
              <div className="text-xs text-white/40 mb-1">Updating Transaction</div>
              <div className="text-sm font-semibold text-blue-300">
                {pendingConfirmation.action.symbol} {pendingConfirmation.action.transactionId ? `(#${pendingConfirmation.action.transactionId})` : '(Latest)'}
              </div>
            </div>

            {/* Diff Table */}
            <div className="pl-11 space-y-2 max-h-48 overflow-y-auto">
              {pendingConfirmation.updateDiffs.map((diff, index) => (
                <div key={index} className="rounded-lg bg-white/5 p-3 border border-white/10">
                  <div className="text-xs font-semibold text-white/60 mb-2">{diff.displayName}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-white/40 mb-1">Old</div>
                      <div className="text-sm text-red-400 line-through">{String(diff.oldValue)}</div>
                    </div>
                    <div className="text-blue-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M5 12h14"/>
                        <path d="m12 5 7 7-7 7"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-white/40 mb-1">New</div>
                      <div className="text-sm font-semibold text-green-400">{String(diff.newValue)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Vertical Button Layout */}
            <div className="flex flex-col-reverse gap-2 pl-11 w-full">
              <Button onClick={onCancel} variant="outline" size="sm" className="w-full border-white/10 bg-white/5 hover:bg-white/10">
                Cancel
              </Button>
              <Button onClick={onConfirm} size="sm" className="w-full bg-blue-500/80 text-white hover:bg-blue-600 border border-blue-500/20">
                ✓ Apply Changes
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Tier 4: Batch Operation (New Phase 3)
    // Check if we have a 'transactions' array with > 1 item in the action payload
    const batchTransactions = pendingConfirmation.action.transactions as any[];
    if (batchTransactions && batchTransactions.length > 1) {
      const count = batchTransactions.length;
      // Determine operation type from action (check deleteScope or transactionType)
      const isDeleteOperation = !!pendingConfirmation.action.deleteScope;
      const actionType = isDeleteOperation ? 'DELETE' : 'CREATE';
      
      // Dynamic styling based on operation
      const borderColor = isDeleteOperation ? 'border-rose-500/30' : 'border-purple-500/30';
      const bgColor = isDeleteOperation ? 'bg-rose-500/5' : 'bg-purple-500/5';
      const shadowColor = isDeleteOperation ? 'rgba(244,63,94,0.1)' : 'rgba(168,85,247,0.1)';
      const iconBg = isDeleteOperation ? 'bg-rose-500/10 ring-rose-500/20' : 'bg-purple-500/10 ring-purple-500/20';
      const textColor = isDeleteOperation ? 'text-rose-400' : 'text-purple-400';
      const buttonBg = isDeleteOperation ? 'bg-rose-500/80 hover:bg-rose-600 border-rose-500/20' : 'bg-purple-500/80 hover:bg-purple-600 border-purple-500/20';
      const title = isDeleteOperation ? 'Batch Deletion' : 'Batch Processing';
      const description = isDeleteOperation 
        ? `About to permanently delete ${count} records from your database.`
        : `Ready to add ${count} records to your database.`;
      const confirmText = isDeleteOperation ? `⚠️ Delete ${count} Items` : `✓ Add ${count} Items`;

      return (
        <div className={`overflow-hidden rounded-2xl border ${borderColor} ${bgColor} backdrop-blur-md shadow-[0_0_15px_${shadowColor}]`}>
          <div className="flex flex-col gap-4 p-4">
             {/* Header */}
             <div className={`flex items-center gap-3 ${textColor}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconBg}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  {isDeleteOperation ? (
                    <><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6M14 11v6"/></>
                  ) : (
                    <><path d="M19 11v9H5v-9M5 5h14v2H5z"/><path d="M10 15h4"/></>
                  )}
                </svg>
              </div>
              <span className="font-bold tracking-tight">{title}</span>
            </div>

            {/* Summary Content */}
            <div className="pl-11">
              <div className="text-2xl font-bold text-white mb-1">{count} Transactions</div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            
            {/* Scrollable Preview List (First 10) */}
            <div className="pl-11 space-y-2 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700">
               {batchTransactions.slice(0, 10).map((tx, idx) => (
                  <div key={idx} className="flex flex-col gap-1 text-xs text-white/70 bg-white/5 p-2 rounded">
                     <div className="flex items-center justify-between">
                       <span className="font-semibold text-white truncate">{tx.notes || tx.description || 'Unknown Transaction'}</span>
                       <span className="font-mono text-red-400 font-bold flex-shrink-0">
                         ${Math.abs(tx.quantity || 0).toFixed(2)}
                       </span>
                     </div>
                     <div className="flex items-center justify-between text-white/50">
                       <span className="truncate">{tx.symbol || tx.category || 'General'}</span>
                       <span className="flex-shrink-0">
                         {tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString() : 'N/A'}
                       </span>
                     </div>
                  </div>
               ))}
               {count > 10 && (
                 <div className="text-center text-xs text-white/40 py-2">
                   ... and {count - 10} more records
                 </div>
               )}
            </div>

            {/* Vertical Button Layout */}
            <div className="flex flex-col-reverse gap-2 pl-11 w-full">
              <Button 
                onClick={onCancel} 
                disabled={isLoading}
                variant="outline" 
                size="sm" 
                className="w-full border-white/10 bg-white/5 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button 
                onClick={onConfirm} 
                disabled={isLoading}
                size="sm" 
                className={`w-full ${buttonBg} text-white disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  confirmText
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Tier 3: Detailed Audit (6+ records)
    if (pendingConfirmation.tier === 3) {
      return (
        <ConfirmationCard
          data={{
            affectedCount: pendingConfirmation.affectedCount || 0,
            message: pendingConfirmation.message,
            totalAmount: pendingConfirmation.totalAmount,
            operationType: 'delete',
          }}
          isFinalWarning={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
          isLoading={isLoading}
        />
      );
    }

    // Tier 2: Audit Preview (3-5 records)
    if (pendingConfirmation.tier === 2) {
      return (
        <ConfirmationCard
          data={{
            affectedCount: pendingConfirmation.affectedCount || 0,
            message: pendingConfirmation.message,
            totalAmount: pendingConfirmation.totalAmount,
            operationType: 'delete',
          }}
          isFinalWarning={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
          isLoading={isLoading}
        />
      );
    }

    // Tier 1: Simple Confirmation
    return (
      <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-red-500/5 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.1)]">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3 text-red-400">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <path d="M12 9v4"/><path d="M12 17h.01"/>
              </svg>
            </div>
            <span className="font-bold tracking-tight">Requires Confirmation</span>
          </div>

          <div className="pl-11">
            <p className="text-sm leading-relaxed text-muted-foreground">{pendingConfirmation.message}</p>
            <div className="mt-1 text-xs text-white/40">
              Type <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-red-300">{pendingConfirmation.expectedInput}</code> to proceed.
            </div>
          </div>

          {/* Vertical Button Layout */}
          <div className="flex flex-col-reverse gap-2 pl-11 w-full">
            <Button onClick={onCancel} variant="outline" size="sm" className="w-full border-white/10 bg-white/5 hover:bg-white/10">
              Cancel
            </Button>
            <Button onClick={onConfirm} size="sm" className="w-full bg-red-500/80 text-white hover:bg-red-600 border border-red-500/20">
              Confirm
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute bottom-full left-0 right-0 mb-2 mx-2"
      >
        {renderCard()}
      </motion.div>
    </AnimatePresence>
  );
}
