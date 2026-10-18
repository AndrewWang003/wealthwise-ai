'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  // User authentication state
  user: User | null;
  isUserLoading: boolean; // True during initial auth check
  userError: Error | null; // Error from auth listener
  nickname: string | null; // 🆕 User's preferred nickname from Firestore
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  nickname: string | null;  // 🆕 From Firestore users/{uid}/settings/config
}

// Return type for useUser() - specific to user auth state + Firestore config
export interface UserHookResult {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  nickname: string | null;  // 🆕 User's preferred nickname from Firestore
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!auth) { // If no Auth service instance, cannot determine user state
      setTimeout(() => {
          setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Auth service not provided.") });
      }, 0);
      return;
    }

    setTimeout(() => {
      setUserAuthState({ user: null, isUserLoading: true, userError: null }); // Reset on auth instance change
    }, 0);

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => { // Auth state determined
        setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null });
      },
      (error) => { // Auth listener error
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserAuthState({ user: null, isUserLoading: false, userError: error });
      }
    );
    return () => unsubscribe(); // Cleanup
  }, [auth]); // Depends on the auth instance

  // 🆕 State for Firestore nickname
  const [nickname, setNickname] = useState<string | null>(null);

  // 🆕 Effect to subscribe to Firestore nickname changes
  useEffect(() => {
    if (!firestore || !userAuthState.user) {
      setTimeout(() => setNickname(null), 0);
      return;
    }

    const userId = userAuthState.user.uid;
    const configDocRef = doc(firestore, `users/${userId}/settings/config`);

    const unsubscribe = onSnapshot(
      configDocRef,
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setNickname(data.nickname || null);
        } else {
          // 🆕 Auto-initialize: First login, create config with Auth displayName
          const initialNickname = userAuthState.user?.displayName || null;
          try {
            await setDoc(configDocRef, {
              nickname: initialNickname,
              createdAt: new Date().toISOString(),
              theme: 'dark',
              language: 'zh-CN'
            });
            setNickname(initialNickname);
            console.log(`✨ [Firestore] Auto-initialized nickname for user ${userId}: ${initialNickname}`);
          } catch (error) {
            console.error('Failed to initialize user config:', error);
            setNickname(null);
          }
        }
      },
      (error) => {
        console.error('FirebaseProvider: nickname listener error:', error);
        setNickname(null);
      }
    );

    return () => unsubscribe();
  }, [firestore, userAuthState.user]);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      user: userAuthState.user,
      isUserLoading: userAuthState.isUserLoading,
      userError: userAuthState.userError,
      nickname: nickname,  // 🆕 Include Firestore nickname
    };
  }, [firebaseApp, firestore, auth, userAuthState, nickname]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth) {
    throw new Error('Firebase core services not available. Check FirebaseProvider props.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
    nickname: context.nickname,  // 🆕 Include Firestore nickname from context
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  return firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;
  
  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state + Firestore config.
 * This provides the User object, loading status, auth errors, and nickname from Firestore.
 * @returns {UserHookResult} Object with user, isUserLoading, userError, nickname.
 */
export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError, nickname } = useFirebase();
  return { user, isUserLoading, userError, nickname };  // 🆕 Include nickname
};
