import { db } from '@/utils/firebaseConfig';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe, updateDoc } from 'firebase/firestore';

export type UserProgress = {
  // required by schema
  name: string;
  email: string;
  uid: string;
  currentPage: number;
  completed: boolean;
  lastReadAt: any;
};

export function listenUserProgress(
  uid: string,
  onChange: (items: Array<{ id: string; data: UserProgress }>) => void,
  onError?: () => void
): Unsubscribe {
  const ref = collection(db, 'users', uid, 'progress');
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, data: d.data() as any as UserProgress }));
      onChange(items);
    },
    () => onError?.()
  );
}

export async function getProgress(uid: string, docId: string): Promise<UserProgress | null> {
  const ref = doc(db, 'users', uid, 'progress', docId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as any as UserProgress) : null;
}

export async function upsertProgress(params: {
  uid: string;
  docId: string;
  name: string;
  email: string;
  currentPage: number;
  completed: boolean;
}): Promise<void> {
  const ref = doc(db, 'users', params.uid, 'progress', params.docId);
  const payload: UserProgress = {
    name: params.name,
    email: params.email,
    uid: params.uid,
    currentPage: params.currentPage,
    completed: params.completed,
    lastReadAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
}

export async function markCompleted(params: {
  uid: string;
  docId: string;
  name: string;
  email: string;
  currentPage: number;
}): Promise<void> {
  const ref = doc(db, 'users', params.uid, 'progress', params.docId);
  await updateDoc(ref, {
    name: params.name,
    email: params.email,
    uid: params.uid,
    currentPage: params.currentPage,
    completed: true,
    lastReadAt: serverTimestamp(),
  } as any);
}

