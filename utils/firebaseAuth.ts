import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { auth, GOOGLE_WEB_CLIENT_ID } from '@/utils/firebaseConfig';
import { ensureUserDoc } from '@/utils/firestoreUsers';
import { getFriendlyAuthErrorMessage } from '@/utils/authErrors';

export async function configureGoogleSignIn(): Promise<void> {
  // Dev-client native only. For web, you can implement AuthSession later.
  if (Platform.OS === 'web') return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
}

export async function signUpEmailPassword(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  const displayName = params.displayName.trim();

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }

    const uid = cred.user.uid;
    await ensureUserDoc({
      uid,
      email: cred.user.email || email,
      displayName: cred.user.displayName || displayName || 'User',
      photoURL: cred.user.photoURL,
    });
  } catch (e) {
    throw new Error(getFriendlyAuthErrorMessage(e, 'signUp'));
  }
}

export async function signInEmailPassword(params: { email: string; password: string }): Promise<void> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await ensureUserDoc({
      uid,
      email: cred.user.email || email,
      displayName: cred.user.displayName || 'User',
      photoURL: cred.user.photoURL,
    });
  } catch (e) {
    throw new Error(getFriendlyAuthErrorMessage(e, 'signIn'));
  }
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  try {
    await sendPasswordResetEmail(auth, normalized);
  } catch (e) {
    // Never reveal whether the account exists.
    const msg = getFriendlyAuthErrorMessage(e, 'resetPassword');
    // Always succeed with the same message unless email is invalid.
    if (msg === 'Please enter a valid email address.') throw new Error(msg);
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Google sign-in is not available on web in this build.');
  }

  try {
    await configureGoogleSignIn();

    // Force the account chooser by clearing any cached Google session first.
    // This ensures that after user signs out and taps Google sign-in again,
    // they are prompted to pick an account.
    try {
      await GoogleSignin.signOut();
    } catch {
      // ignore
    }

    const res = await GoogleSignin.signIn();
    const idToken = res.data?.idToken;

    if (!idToken) {
      throw new Error('Something went wrong. Please try again.');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    const userCred = await signInWithCredential(auth, credential);

    await ensureUserDoc({
      uid: userCred.user.uid,
      email: userCred.user.email || '',
      displayName: userCred.user.displayName || 'User',
      photoURL: userCred.user.photoURL,
    });
  } catch (e: any) {
    // Map Google native status codes
    const code = e?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) throw new Error('Sign-in cancelled');
    if (code === statusCodes.IN_PROGRESS) throw new Error('Sign-in is already in progress.');
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
      throw new Error('Google Play Services is not available. Please update and try again.');

    throw new Error(getFriendlyAuthErrorMessage(e, 'googleSignIn'));
  }
}

export async function firebaseSignOutUser(): Promise<void> {
  // Sign out of Firebase first.
  await firebaseSignOut(auth);

  // Also sign out of Google so next sign-in shows account chooser.
  if (Platform.OS !== 'web') {
    try {
      await GoogleSignin.signOut();
    } catch {
      // ignore
    }
  }
}

export async function getFirebaseIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return await user.getIdToken();
}

