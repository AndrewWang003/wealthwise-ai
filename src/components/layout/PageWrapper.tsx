import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageWrapperProps {
    children: ReactNode;
    className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
    return (
        <div className={cn(
            "w-full max-w-full flex-1",
            "grid grid-cols-12 gap-6",
            "p-0 lg:p-0", // Padding is handled by MainLayout
            "auto-rows-min", // Ensure rows don't stretch unnecessarily
            className
        )}>
            {children}
        </div>
    );
}
