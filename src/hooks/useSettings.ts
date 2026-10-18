import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserSettings } from '@/lib/types';

export function useSettings() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset settings if user is not authenticated
  if (!user && (settings !== null || loading)) {
    setSettings(null);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;

    // Subscribe to the user document to get real-time settings updates
    const unsubscribe = onSnapshot(doc(firestore, 'users', user.uid), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        // Settings are stored in the 'settings' field of the user document
        setSettings(data.settings as UserSettings || null);
      } else {
        setSettings(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching user settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, firestore]);

  return { settings, loading };
}
