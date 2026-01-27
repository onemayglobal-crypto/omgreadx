import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

// Some React Native Firebase Auth persistence exports are only available from the RN bundle.
// Metro cannot resolve `firebase/auth/react-native` in this Firebase package layout,
// so we pull the needed helpers via runtime requires.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const firebaseAuth = require('firebase/auth') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const firebaseAuthRn = require('@firebase/auth') as { getReactNativePersistence: (storage: any) => any };

const { getAuth, initializeAuth } = firebaseAuth as {
  getAuth: (app?: any) => any;
  initializeAuth: (app: any, deps?: any) => any;
};
const { getReactNativePersistence } = firebaseAuthRn;

/**
 * Firebase client config (shared across web + native).
 * Do NOT store tokens/UID manually. Firebase Auth persistence handles sessions.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyALvj9DdEGsOJGvlr9bE7a0Bnd69JbUn3s',
  authDomain: 'omgreadx.firebaseapp.com',
  projectId: 'omgreadx',
  storageBucket: 'omgreadx.firebasestorage.app',
  messagingSenderId: '740104261370',
  appId: '1:740104261370:web:008a2545bb4fedbe984343',
  measurementId: 'G-GBX7GE69LC',
  webClientId: '740104261370-9vaao58ttchjufiuu0chpknicoj6e7k9.apps.googleusercontent.com',
} as const;

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth: use native persistence on iOS/Android; default on web.
export const auth =
  Platform.OS === 'web'
    ? getAuth(firebaseApp)
    : initializeAuth(firebaseApp, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export const GOOGLE_WEB_CLIENT_ID = firebaseConfig.webClientId;