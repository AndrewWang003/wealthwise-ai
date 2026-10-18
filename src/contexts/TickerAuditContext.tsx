'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface TickerAuditContextType {
    triggerTickerAudit: (ticker: string) => void;
    currentAuditTicker: string | null;
    clearAudit: () => void;
}

const TickerAuditContext = createContext<TickerAuditContextType | undefined>(undefined);

export function TickerAuditProvider({ children }: { children: ReactNode }) {
    const [currentAuditTicker, setCurrentAuditTicker] = useState<string | null>(null);

    const triggerTickerAudit = useCallback((ticker: string) => {
        setCurrentAuditTicker(ticker);

        // Dispatch custom event for GlobalTransactionInput to listen
        const event = new CustomEvent('ticker-audit-requested', {
            detail: { ticker }
        });
        window.dispatchEvent(event);
    }, []);

    const clearAudit = useCallback(() => {
        setCurrentAuditTicker(null);
    }, []);

    return (
        <TickerAuditContext.Provider value={{ triggerTickerAudit, currentAuditTicker, clearAudit }}>
            {children}
        </TickerAuditContext.Provider>
    );
}

export function useTickerAudit() {
    const context = useContext(TickerAuditContext);
    if (!context) {
        throw new Error('useTickerAudit must be used within TickerAuditProvider');
    }
    return context;
}
