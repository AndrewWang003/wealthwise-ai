"use client";

import { ClipboardList } from "lucide-react";
import Sidebar from "./Sidebar";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-6">
      <div className="md:hidden">
        <Sidebar />
      </div>

      <div className="w-full flex-1">
        {/* Can add search form here if needed */}
      </div>

      {/* 🆕 Global Ledger Entry - Clock/List Icon */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-10 w-10 transition-all duration-200 hover:bg-primary/10"
        onClick={() => router.push('/transactions')}
        title="View All Transactions"
      >
        <ClipboardList className="h-5 w-5" />
        <span className="sr-only">View Transactions</span>
      </Button>
    </header>
  );
}
