"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  memberSince: string;
  investorType: string[];
  bio: string;
}

interface UserContextType {
  user: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  isLoading: boolean;
}

const DEFAULT_USER: UserProfile = {
  displayName: "Crypto Whale",
  email: "whale@wisecoin.ai",
  photoURL: "",
  memberSince: "2024",
  investorType: ["🔥 High Risk", "💎 Crypto Native"],
  bio: "Building wealth with AI."
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialization to potentially avoid double render properties, but handling valid hydration
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 🛡️ Defer to avoid "synchronous setState in effect" lint warning
    const timer = setTimeout(() => {
        try {
            const storedUser = localStorage.getItem("wisecoin-user");
            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);
                if (parsedUser.photoURL?.startsWith('blob:')) {
                    parsedUser.photoURL = "";
                }
                setUser(parsedUser);
            } else {
                setUser(DEFAULT_USER);
            }
        } catch (error) {
            console.error("Failed to parse user from localStorage", error);
            setUser(DEFAULT_USER);
        }
        setIsLoading(false);
    }, 0);

    return () => clearTimeout(timer);
  }, []); 
  
  // Re-implementing correctly:
  // Since defaultUser is constant, I will define it outside.
  // const defaultUser = ... removed

  const updateUser = (updates: Partial<UserProfile>) => {
    setUser((prev) => {
      const newUser = prev ? { ...prev, ...updates } : { ...DEFAULT_USER, ...updates };
      
      // Persist to localStorage (omit blob URLs)
      const userToStore = { ...newUser };
      if (userToStore.photoURL?.startsWith('blob:')) {
          userToStore.photoURL = ""; 
          // Note: We keep the blob in component state (newUser) so the UI 
          // updates immediately, but we don't save the temporary URL to disk.
      }
      localStorage.setItem("wisecoin-user", JSON.stringify(userToStore));
      
      return newUser;
    });
  };

  return (
    <UserContext.Provider value={{ user, updateUser, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
