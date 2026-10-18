import React from 'react';
import { cn } from '@/lib/utils';

export type AuraCardVariant = 'gold' | 'rose' | 'indigo' | 'blue';

interface AuraCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: AuraCardVariant;
  className?: string;
}

const VARIANT_STYLES: Record<AuraCardVariant, string> = {
  gold: 'border-amber-500/20 hover:border-amber-500/50',
  rose: 'border-rose-500/20 hover:border-rose-500/50',
  indigo: 'border-violet-500/20 hover:border-violet-500/50',
  blue: 'border-blue-500/20 hover:border-blue-500/50',
};

const GLOW_STYLES: Record<AuraCardVariant, string> = {
  gold: 'from-amber-500/10',
  rose: 'from-rose-500/10',
  indigo: 'from-violet-500/10',
  blue: 'from-blue-500/10',
};

export function AuraCard({ 
  children, 
  variant = 'gold', 
  className,
  ...props 
}: AuraCardProps) {
  return (
    <div 
      className={cn(
        // Base
        "relative overflow-hidden bg-zinc-950/40 backdrop-blur-xl border transition-all duration-500 group flex flex-col rounded-3xl",
        // Variant Border & Hover
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    >
      {/* Inner Glow Element */}
      <div 
        className={cn(
          "absolute inset-0 bg-gradient-to-r via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
          GLOW_STYLES[variant]
        )} 
      />
      
      {/* Content */}
      <div className="relative z-10 w-full h-full flex flex-col">
          {children}
      </div>
    </div>
  );
}
