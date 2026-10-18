'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UndoToastProps {
  count: number;
  onUndo: () => void;
  onConfirm: () => void;
  isOpen: boolean;
  duration?: number; // ms, default 5000
  message?: string; // Optional override for "Deleting X items..."
  actionType?: 'delete' | 'update'; // To style colors (red vs green/blue)
}

export function UndoToast({ 
  count, 
  onUndo, 
  onConfirm, 
  isOpen, 
  duration = 5000,
  message,
  actionType = 'delete'
}: UndoToastProps) {
  // Internal timer handling
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isOpen) {
      timer = setTimeout(() => {
        onConfirm();
      }, duration);
    }
    
    return () => clearTimeout(timer);
  }, [isOpen, duration, onConfirm]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="absolute bottom-24 left-4 right-4 z-[60] rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-900/90 backdrop-blur-xl shadow-2xl"
        >
          {/* Main Body */}
          <div className="flex items-center justify-between p-4 pb-5">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full mt-0.5 ${actionType === 'delete' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {actionType === 'delete' ? <Trash2 className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />} 
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-zinc-100">
                  {message || `Deleting ${count} items...`}
                </h4>
                <p className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Irreversible in 5s
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={onUndo}
              className="bg-white/10 hover:bg-white/20 text-white border-0 font-semibold h-8 px-4"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              UNDO
            </Button>
          </div>

          {/* Progress Bar (Countdown) */}
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: duration / 1000, ease: "linear" }}

            className={`absolute bottom-0 left-0 h-1 bg-gradient-to-r shadow-[0_-1px_6px_rgba(244,63,94,0.5)] ${actionType === 'delete' ? 'from-rose-500 to-rose-600' : 'from-emerald-500 to-emerald-600'}`}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
