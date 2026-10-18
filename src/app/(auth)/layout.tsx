'use client';

import { useUser, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isOnboardingChecking, setIsOnboardingChecking] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    async function checkOnboarding() {
      if (!isUserLoading) {
        if (!user) {
          router.replace('/login');
        } else {
          try {
            const profileRef = doc(firestore, `users/${user.uid}/profile/main`);
            const profileDoc = await getDoc(profileRef);

            if (!profileDoc.exists() || !profileDoc.data()?.onboardingComplete) {
              router.replace('/onboarding');
            } else {
              setIsOnboardingChecking(false);
            }
          } catch (error) {
            console.error("Error checking onboarding status:", error);
            // Fallback to allowing access if check fails to prevent blocking user indefinitely
            setIsOnboardingChecking(false);
          }
        }
      }
    }
    checkOnboarding();
  }, [user, isUserLoading, router, firestore]);

  if (isUserLoading || (user && isOnboardingChecking)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {isUserLoading ? "Loading authentication..." : "Checking account status..."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
