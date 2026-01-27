import { db } from '@/utils/firebaseConfig';
import { doc, increment, serverTimestamp, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

export type DashboardSummary = {
  // required by schema
  name: string;
  email: string;
  uid: string;
  filesUploaded: number;
  readingSessions: number;
  wordsRead: number;
  totalReadingTimeSec: number;
  updatedAt: any;
};

export async function bumpDashboardSummary(params: {
  uid: string;
  name: string;
  email: string;
  filesUploadedDelta?: number;
  readingSessionsDelta?: number;
  wordsReadDelta?: number;
  totalReadingTimeSecDelta?: number;
}): Promise<void> {
  const ref = doc(db, 'users', params.uid, 'dashboard', 'summary');
  await setDoc(
    ref,
    {
      name: params.name,
      email: params.email,
      uid: params.uid,
      filesUploaded: increment(params.filesUploadedDelta ?? 0),
      readingSessions: increment(params.readingSessionsDelta ?? 0),
      wordsRead: increment(params.wordsReadDelta ?? 0),
      totalReadingTimeSec: increment(params.totalReadingTimeSecDelta ?? 0),
      updatedAt: serverTimestamp(),
    } as any,
    { merge: true }
  );
}

export function listenDashboardSummary(
  uid: string,
  onChange: (summary: DashboardSummary | null) => void,
  onError?: () => void
): Unsubscribe {
  const ref = doc(db, 'users', uid, 'dashboard', 'summary');
  return onSnapshot(
    ref,
    (snap) => {
      onChange(snap.exists() ? (snap.data() as any as DashboardSummary) : null);
    },
    () => onError?.()
  );
}

