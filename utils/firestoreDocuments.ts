import { auth, db } from '@/utils/firebaseConfig';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  getDoc,
} from 'firebase/firestore';

export type DocumentType = 'pdf' | 'docx' | 'txt' | 'paste';
export type DocumentStatus = 'processing' | 'ready' | 'error';

export type UserDocument = {
  // required by schema
  name: string;
  email: string;
  uid: string;
  type: DocumentType;
  title: string;
  pages: number;
  status: DocumentStatus;
  storagePath: string; // users/{uid}/files/{docId}/original.{ext}
  processedPath: string; // users/{uid}/processed/{docId}.json OR users/{uid}/paste/{docId}.json
  createdAt: any;

  // optional convenience
  errorMessage?: string;
};

export function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in to continue.');
  return uid;
}

export function requireEmail(): string {
  return auth.currentUser?.email || '';
}

export function requireName(): string {
  return auth.currentUser?.displayName || auth.currentUser?.email || 'User';
}

export async function upsertUserDocument(params: {
  uid: string;
  docId: string;
  data: Omit<UserDocument, 'uid' | 'email' | 'name' | 'createdAt'> & Partial<Pick<UserDocument, 'createdAt'>>;
}): Promise<void> {
  const ref = doc(db, 'users', params.uid, 'documents', params.docId);
  await setDoc(
    ref,
    {
      name: requireName(),
      email: requireEmail(),
      uid: params.uid,
      createdAt: params.data.createdAt ?? serverTimestamp(),
      ...params.data,
    },
    { merge: true }
  );
}

export async function getUserDocument(uid: string, docId: string): Promise<UserDocument | null> {
  const ref = doc(db, 'users', uid, 'documents', docId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as any as UserDocument) : null;
}

export function listenUserDocuments(
  uid: string,
  onChange: (docs: Array<{ id: string; data: UserDocument }>) => void,
  onError?: () => void
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'documents'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as any as UserDocument }));
      onChange(docs);
    },
    () => {
      onError?.();
    }
  );
}

export function listenUserDocumentsByType(
  uid: string,
  type: DocumentType,
  onChange: (docs: Array<{ id: string; data: UserDocument }>) => void,
  onError?: () => void
): Unsubscribe {
  const q = query(
    collection(db, 'users', uid, 'documents'),
    where('type', '==', type),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as any as UserDocument }));
      onChange(docs);
    },
    () => onError?.()
  );
}

