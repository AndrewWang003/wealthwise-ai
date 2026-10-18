import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
// import { Responsive } from 'react-grid-layout';

/**
 * A simple HOC that provides width to the wrapped component.
 * Replaces the missing WidthProvider from react-grid-layout v2.x ESM build.
 */
export function withWidth(WrappedComponent: React.ComponentType<any>) {
  return function WithWidthComponent(props: any) {
    const [width, setWidth] = useState(1200);
    const containerRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(false);

    useEffect(() => {
      mountedRef.current = true;
      const container = containerRef.current;
      
      if (!container) return;

      // Initial measure
      setWidth(container.offsetWidth);

      const resizeObserver = new ResizeObserver((entries) => {
        if (!mountedRef.current) return;
        
        for (const entry of entries) {
           // Use contentRect.width or offsetWidth
           // offsetWidth includes padding which might be desired if RGL expects full container width
           // entry.contentRect is standard but excludes padding.
           // Usually RGL WidthProvider uses element.offsetWidth
           if (entry.target instanceof HTMLElement) {
             setWidth(entry.target.offsetWidth);
           }
        }
      });

      resizeObserver.observe(container);

      return () => {
        mountedRef.current = false;
        resizeObserver.disconnect();
      };
    }, []);

    return (
      <div 
        ref={containerRef} 
        className={cn("w-full h-full", props.className)} 
        style={props.style}
      >
        <WrappedComponent 
          {...props} 
          width={width} 
        />
      </div>
    );
  };
}
