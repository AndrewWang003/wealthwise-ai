"use client";
import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Settings,
  PanelLeft,
  TrendingUp,
  Wallet,
  BarChart3,
  User as UserIcon,
  ScrollText
} from "lucide-react";
import Image from "next/image";
import logo from "@/app/logo.png";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/transactions", icon: ScrollText, label: "Transactions" },
  { href: "/wealth", icon: Wallet, label: "Wealth" },
  { href: "/cash-flow", icon: TrendingUp, label: "Cash & Flow" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/account", icon: UserIcon, label: "Account" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { useFirebase } from "@/firebase";
import { useUser } from "@/contexts/UserContext";

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.slice(0, 2).toUpperCase();
  };

  const navContent = (
    <nav className="grid items-start gap-2 px-4 text-sm font-medium">
      {navItems.map(({ href, icon: Icon, label }) => {
        const isActive = pathname.startsWith(href);
        const isAccount = label === "Account";
        const showAvatar = isAccount && user?.photoURL;

        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all group ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-primary"
            }`}
          >
            {showAvatar ? (
               <Avatar className={`h-5 w-5 border border-violet-500/50 shadow-[0_0_10px_rgba(139,92,246,0.2)] transition-transform group-hover:scale-105`}>
                 <AvatarImage src={user?.photoURL || ""} className="object-cover" />
                 <AvatarFallback className="text-[8px] bg-violet-900 text-violet-200">
                   {getInitials(user?.displayName)}
                 </AvatarFallback>
               </Avatar>
            ) : (
               <Icon className="h-4 w-4" />
            )}
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="hidden border-r bg-card md:block">
        <div className="flex h-full max-h-screen flex-col">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <div className="relative w-8 h-8">
                <Image 
                  src={logo} 
                  alt="WealthWise AI" 
                  fill
                  sizes="32px"
                  className="object-contain drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                />
              </div>
              <span className="">WealthWise AI</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-4">
            {navContent}
          </div>
        </div>
      </div>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <div className="flex h-16 items-center border-b px-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-6 w-6 text-primary" />
                <span className="">WealthWise AI</span>
              </Link>
            </div>
            <div className="flex-1 py-4">
               {navContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
