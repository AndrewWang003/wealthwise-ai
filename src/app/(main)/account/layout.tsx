"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shield, LogOut } from "lucide-react";
import { useFirebase } from "@/firebase";
import { getAuth, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useFirebase();
  const router = useRouter();

  const handleLogout = async () => {
    const auth = getAuth();
    await signOut(auth);
    router.push("/login");
  };

  const menuItems = [
    {
      href: "/account/profile",
      label: "Profile",
      icon: User,
      description: "Manage your personal info",
    },
    {
      href: "/account/security",
      label: "Security",
      icon: Shield,
      description: "Password & authentication",
    },
  ];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="w-full border-r bg-black/20 lg:w-1/4 lg:min-w-[280px]">
        <div className="p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Account</h2>
          <p className="text-sm text-muted-foreground">Manage your profile and security</p>
        </div>
        <nav className="space-y-1 px-4">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 rounded-lg p-3 transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className={`mt-0.5 h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground/70">{item.description}</span>
                </div>
              </Link>
            );
          })}

          <button
            onClick={handleLogout}
            className="flex w-full items-start gap-3 rounded-lg p-3 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-400 group mt-6"
          >
            <LogOut className="mt-0.5 h-5 w-5 text-muted-foreground group-hover:text-red-400 transition-colors" />
            <div className="flex flex-col gap-0.5 items-start">
              <span className="text-sm font-medium">Log out</span>
              <span className="text-xs text-muted-foreground/70 group-hover:text-red-400/70">Sign out of your account</span>
            </div>
          </button>
        </nav>
      </aside>
      <div className="flex-1 lg:max-w-4xl">
        <div className="h-full px-4 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
