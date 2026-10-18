
'use client';

import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback } from 'react';
import { PageContextType } from '@/lib/types';

const PageContext = createContext<PageContextType | undefined>(undefined);

export const PageContextProvider = ({ children }: { children: ReactNode }) => {
  const [pageName, setPageName] = useState<string>('dashboard');
  const [pageData, setPageData] = useState<any>(null);

  // 🔮 Optimistic State
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, any>>({}); // ID -> Partial<Transaction>

  const addOptimisticDelete = useCallback((ids: string[]) => {
      setOptimisticDeletedIds(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.add(id));
          return next;
      });
  }, []);

  const clearOptimisticDelete = useCallback(() => {
      setOptimisticDeletedIds(new Set());
  }, []);

  const addOptimisticUpdate = useCallback((updates: Record<string, any>) => {
      setOptimisticUpdates(prev => ({
          ...prev,
          ...updates
      }));
  }, []);

  const clearOptimisticUpdate = useCallback(() => {
      setOptimisticUpdates({});
  }, []);

  const stableSetPageName = useCallback((name: string) => {
    setPageName(name);
  }, []);

  const stableSetPageData = useCallback((data: any) => {
    setPageData(data);
  }, []);


  const value = useMemo(() => ({
    pageName,
    pageData,
    setPageName: stableSetPageName,
    setPageData: stableSetPageData,
    optimisticDeletedIds,
    addOptimisticDelete,
    clearOptimisticDelete,
    optimisticUpdates,
    addOptimisticUpdate,
    clearOptimisticUpdate
  }), [pageName, pageData, stableSetPageName, stableSetPageData, optimisticDeletedIds, addOptimisticDelete, clearOptimisticDelete, optimisticUpdates, addOptimisticUpdate, clearOptimisticUpdate]);

  return (
    <PageContext.Provider value={value}>
      {children}
    </PageContext.Provider>
  );
};

export const usePageContext = () => {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error('usePageContext must be used within a PageContextProvider');
  }
  return context;
};
