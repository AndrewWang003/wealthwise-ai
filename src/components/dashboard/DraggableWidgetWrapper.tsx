import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { GripHorizontal, X } from 'lucide-react';
import type { LayoutItem } from '@/stores/useDashboardStore';

interface DraggableWidgetWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  item?: LayoutItem; // Passed by RGL
  isEditMode: boolean;
  onRemove?: (id: string) => void;
  children: React.ReactNode;
  // RGL props that must be forwarded
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

export const DraggableWidgetWrapper = forwardRef<HTMLDivElement, DraggableWidgetWrapperProps>(
  ({ item, isEditMode, onRemove, children, style, className, onMouseDown, onMouseUp, onTouchEnd, ...props }, ref) => {
    
    // RGL passes specific props that we must allow to control the div's positioning.
    
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "relative h-full w-full transition-all duration-200", 
          isEditMode && "border-2 border-dashed border-violet-500/50 bg-violet-500/5 rounded-3xl",
          className
        )}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        {/* Edit Mode Controls */}
        {isEditMode && item && (
          <>
            {/* Drag Handle */}
            <div className="absolute top-2 right-2 z-50 p-1.5 bg-zinc-900/80 rounded-full text-white cursor-move hover:bg-violet-500 hover:text-white transition-colors draggable-handle">
              <GripHorizontal className="w-4 h-4" />
            </div>

            {/* Remove Button */}
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent drag start
                    onRemove(item.i);
                }}
                title="Remove Widget"
                aria-label="Remove Widget"
                className="absolute top-2 left-2 z-50 p-1.5 bg-red-500/10 text-red-400 rounded-full cursor-pointer hover:bg-red-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            {/* Widget ID Label (Optional debug / clarity) */}
             <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 px-2 py-0.5 bg-black/50 text-[10px] text-white/50 rounded-full font-mono uppercase">
                {item.i}
            </div>
          </>
        )}

        {/* Content */}
        <div className={cn("h-full w-full", isEditMode && "pointer-events-none opacity-80")}>
            {children}
        </div>
      </div>
    );
  }
);

DraggableWidgetWrapper.displayName = 'DraggableWidgetWrapper';
