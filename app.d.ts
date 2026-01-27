/// <reference types="nativewind/types" />

// Firebase RN persistence type shim (Expo / TS sometimes can't resolve subpath types)
declare module 'firebase/auth/react-native' {
  import type { Persistence } from 'firebase/auth';
  export function getReactNativePersistence(storage: any): Persistence;
}

// Firebase RN persistence shim for TS (runtime export exists in RN bundle)
declare module '@firebase/auth' {
  import type { Persistence } from 'firebase/auth';
  export function getReactNativePersistence(storage: any): Persistence;
}


