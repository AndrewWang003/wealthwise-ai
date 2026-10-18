
"use client";

import Sidebar from "./Sidebar";
// import Header from "./Header"; // Removed to reclaim vertical space
import { PortfolioProvider } from "@/contexts/PortfolioContext";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortfolioProvider>
      <div className="flex min-h-screen w-full bg-background group/sidebar-wrapper">
        <div className="hidden border-r bg-card md:block w-[280px] shrink-0">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col relative">
          {/* Mobile Sidebar Trigger (Header removed for desktop) */}
          <div className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-6">
            <Sidebar />
          </div>
          <div className="flex flex-1 flex-col">
            <main className="flex-1 w-full min-w-0 p-4 md:p-8">
              {children}
              {/* 
                Dynamic Bottom Spacer (垫片)
                - Mobile/Tablet: Height [180px] prevents floating dialog from obscuring content.
                - Desktop (lg): Height [0] as dialog moves to the sidebar.
              */}
              <div className="h-[180px] lg:h-0 w-full shrink-0 mt-4 pointer-events-none" aria-hidden="true" />
            </main>
          </div>
        </div>
      </div>
    </PortfolioProvider>
  );
}
