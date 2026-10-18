'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TickerLinkProps {
    ticker: string;
    market?: string;
    plPercent?: number;
    onClick?: (ticker: string) => void;
    className?: string;
    variant?: 'default' | 'compact' | 'inline';
}

export function TickerLink({
    ticker,
    market,
    plPercent,
    onClick,
    className,
    variant = 'default'
}: TickerLinkProps) {
    const [isPressed, setIsPressed] = useState(false);

    const handleClick = () => {
        if (onClick) {
            onClick(ticker);
            // Haptic feedback
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(10);
            }
        }
    };

    const isPositive = plPercent !== undefined && plPercent >= 0;
    const showPL = plPercent !== undefined;

    if (variant === 'inline') {
        return (
            <span
                onClick={handleClick}
                className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-semibold cursor-pointer transition-all hover:scale-105 active:scale-95",
                    "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20",
                    className
                )}
            >
                {ticker}
            </span>
        );
    }

    if (variant === 'compact') {
        return (
            <Badge
                variant="outline"
                onClick={handleClick}
                className={cn(
                    "cursor-pointer transition-all hover:scale-105 active:scale-95 font-mono",
                    "hover:bg-accent",
                    className
                )}
            >
                {ticker}
            </Badge>
        );
    }

    return (
        <motion.div
            whileTap={{ scale: 0.95 }}
            onTapStart={() => setIsPressed(true)}
            onTap={() => setIsPressed(false)}
            onTapCancel={() => setIsPressed(false)}
        >
            <Badge
                variant="outline"
                onClick={handleClick}
                className={cn(
                    "cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm",
                    "flex items-center gap-1.5 px-3 py-1.5 font-mono text-sm",
                    showPL && isPositive && "bg-green-500/10 text-green-700 border-green-500/30 hover:bg-green-500/20",
                    showPL && !isPositive && "bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20",
                    !showPL && "hover:bg-accent",
                    className
                )}
            >
                <span className="font-bold">{ticker}</span>
                {market && <span className="text-xs opacity-60">({market})</span>}
                {showPL && (
                    <>
                        {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        <span className="text-xs font-semibold">
                            {isPositive ? '+' : ''}{plPercent.toFixed(2)}%
                        </span>
                    </>
                )}
            </Badge>
        </motion.div>
    );
}

/**
 * Generates the AI audit query for a ticker
 */
export function generateTickerAuditQuery(ticker: string, userId?: string, baseCurrency?: string) {
    return {
        naturalLanguageInput: `展示我在 ${ticker} 的账务详情`,
        context: {
            userId,
            baseCurrency: baseCurrency || 'AUD',
            ticker,
            queryType: 'ticker_audit',
            requestedFields: [
                'totalQuantity',
                'averageCost',
                'totalInvestment',
                'currentValue',
                'unrealizedPL',
                'plPercent',
                'transactionHistory'
            ]
        }
    };
}
