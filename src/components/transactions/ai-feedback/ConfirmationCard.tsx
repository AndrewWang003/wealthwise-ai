import React from 'react';
import { AlertTriangle, Trash2, X, Check, ShoppingCart, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface ConfirmationData {
  tier?: number;
  message?: string;
  affectedCount?: number;
  [key: string]: any;
}

interface ConfirmationCardProps {
  data: ConfirmationData; // The pending confirmation object
  isFinalWarning?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({ 
  data, 
  isFinalWarning = false, 
  isLoading = false,
  onConfirm, 
  onCancel 
}: ConfirmationCardProps) {
  
  // Determine Visual State based on IsFinalWarning or Tier
  const tier = data?.tier || 2;
  const isCritical = isFinalWarning || tier >= 3;

  // Theme Config
  const theme = isCritical 
    ? {
        border: 'border-red-500/50',
        bg: 'bg-red-950/20',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-500', 
        buttonSolid: 'bg-red-600 hover:bg-red-700 text-white',
        icon: AlertTriangle,
        title: isFinalWarning ? "Final Warning" : "High Impact Delete"
      }
    : {
        border: 'border-amber-500/50',
        bg: 'bg-amber-950/20',
        iconBg: 'bg-amber-500/20',
        iconColor: 'text-amber-500',
        buttonSolid: 'bg-amber-600 hover:bg-amber-700 text-white',
        icon: Info,
        title: "Confirmation Required"
      };

  const Icon = theme.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "w-full max-w-[360px] rounded-xl border p-4 shadow-xl backdrop-blur-md",
        "bg-zinc-900/90", 
        theme.border
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-3">
        <div className={cn("p-2 rounded-full shrink-0", theme.iconBg)}>
          <Icon className={cn("w-5 h-5", theme.iconColor)} />
        </div>
        <div>
          <h3 className={cn("font-bold text-sm uppercase tracking-wide", theme.iconColor)}>
            {theme.title}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            {data?.message || "Are you sure you want to proceed with this action?"}
          </p>
        </div>
      </div>

      {/* Details (Optional Context) */}
      {data?.affectedCount !== undefined && (
        <div className="mb-4 ml-[44px] bg-zinc-950/50 rounded-md p-2 border border-white/5 text-xs text-zinc-300">
           <span className="text-zinc-500 mr-2">Impact:</span>
           <span className="font-mono text-white">
             {data.affectedCount} item{data.affectedCount !== 1 ? 's' : ''}
           </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 mt-2">
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onCancel}
          className="h-8 text-xs text-zinc-400 hover:text-white hover:bg-white/10"
        >
          Cancel
        </Button>
        <Button 
          size="sm" 
          onClick={onConfirm}
          className={cn("h-8 text-xs font-semibold shadow-md transition-all", theme.buttonSolid)}
        >
          <Trash2 className="w-3 h-3 mr-1.5" />
          {isFinalWarning ? "Delete Everything" : "Confirm Delete"}
        </Button>
      </div>
    </motion.div>
  );
}
