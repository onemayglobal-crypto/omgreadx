import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/utils/firebaseConfig';

// Firestore role values:
// - "personal" for a personal user
// - "parent" for "For Child" mode
export type UserRole = 'parent' | 'personal';

export type UserDoc = {
  email: string;
  uid: string;
  displayName: string;
  role: UserRole;
  photoURL?: string | null;
  provider: 'password' | 'google' | 'unknown';
  createdAt: any;
  lastLoginAt: any;
};

function getProvider(): UserDoc['provider'] {
  const providerId = auth.currentUser?.providerData?.[0]?.providerId;
  if (providerId === 'password') return 'password';
  if (providerId === 'google.com') return 'google';
  return 'unknown';
}

/**
 * Ensure `/users/{uid}` exists and is updated on login.
 * UID always comes from Firebase Auth.
 */
export async function ensureUserDoc(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}): Promise<void> {
  const ref = doc(db, 'users', params.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const newDoc: Omit<UserDoc, 'createdAt' | 'lastLoginAt'> & {
      createdAt: any;
      lastLoginAt: any;
    } = {
      uid: params.uid,
      email: params.email,
      displayName: params.displayName,
      role: 'personal',
      photoURL: params.photoURL ?? null,
      provider: getProvider(),
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await setDoc(ref, newDoc);
    return;
  }

  // Update lastLoginAt and keep profile fields fresh (do not overwrite role).
  await updateDoc(ref, {
    email: params.email,
    uid: params.uid,
    displayName: params.displayName,
    photoURL: params.photoURL ?? null,
    provider: getProvider(),
    lastLoginAt: serverTimestamp(),
  });
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { role });
}

