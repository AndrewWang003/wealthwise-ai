import { useState, useMemo } from 'react';

interface UsePaginationReturn<T> {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalItems: number;
  totalPages: number;
  currentData: T[];
  startIndex: number;
  endIndex: number;
}

export function usePagination<T>(data: T[], defaultPageSize = 20): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalItems = data.length;
  // If no data, pages is 0, but we usually want at least page 1 to show
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Auto-correction: if current page exceeds total pages, reset to last page
  // Auto-correction: if current page exceeds total pages, reset to last page
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(totalPages);
  }

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  
  const currentData = useMemo(() => {
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    currentData,
    startIndex,
    endIndex
  };
}
