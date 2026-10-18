import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading?: boolean;
}

export function TablePagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: TablePaginationProps) {
  // If no items, show simplified empty state or just nothing? 
  // Probably better to show empty summary if not loading.
  if (totalItems === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-between p-4 bg-transparent border-t border-white/5 text-sm text-muted-foreground">
        <div>No records found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-transparent border-t border-white/5 rounded-b-lg">
      
      {/* 📊 Data Summary Label */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium order-2 sm:order-1">
        <span>
          Showing <span className="text-primary font-bold">{Math.min(startIndex + 1, totalItems)}</span> to{' '}
          <span className="text-primary font-bold">{endIndex}</span> of{' '}
          <span className="text-primary font-bold">{totalItems}</span> records
        </span>
      </div>

      {/* 🎮 Controls */}
      <div className="flex items-center gap-2 lg:gap-6 order-1 sm:order-2 w-full sm:w-auto justify-between sm:justify-end">
        
        {/* Page Size Switcher */}
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-muted-foreground hidden sm:block">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
            disabled={isLoading}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[20, 50, 100].map((pageSizeOption) => (
                <SelectItem key={pageSizeOption} value={`${pageSizeOption}`}>
                  {pageSizeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* First Page */}
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1 || isLoading}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          
          {/* Previous Page */}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page Info (Mobile/Compact) */}
          <div className="flex w-[100px] items-center justify-center text-sm font-medium text-zinc-400 whitespace-nowrap">
             Page {currentPage} / {totalPages}
          </div>

          {/* Next Page */}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Last Page */}
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages || isLoading}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
