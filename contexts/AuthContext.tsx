import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/utils/firebaseConfig';
import { clearLocalUserCaches } from '@/utils/localCache';
import { firebaseSignOutUser } from '@/utils/firebaseAuth';
import type { UserDoc } from '@/utils/firestoreUsers';

type AuthContextValue = {
  firebaseUser: FirebaseUser | null;
  uid: string | null;
  userDoc: UserDoc | null;
  authLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUserDoc(null);
      return;
    }
    const ref = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setUserDoc(null);
          return;
        }
        setUserDoc(snap.data() as any);
      },
      () => {
        // silently ignore; UI can continue with auth user
        setUserDoc(null);
      }
    );
    return () => unsub();
  }, [firebaseUser?.uid]);

  const signOut = async () => {
    // Prevent UI flicker by clearing in-memory user state immediately.
    // Firebase will still complete its own sign-out and emit onAuthStateChanged(null).
    setFirebaseUser(null);
    setUserDoc(null);
    try {
      await firebaseSignOutUser();
    } finally {
      await clearLocalUserCaches();
    }
  };

  const value = useMemo<AuthContextValue>(() => {
    return {
      firebaseUser,
      uid: firebaseUser?.uid ?? null,
      userDoc,
      authLoading,
      signOut,
    };
  }, [firebaseUser, userDoc, authLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

