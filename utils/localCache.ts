import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clears local caches that must never leak across users.
 * This does NOT affect Firestore/Storage; it's UI/cache only.
 */
export async function clearLocalUserCaches(): Promise<void> {
  const keys = [
    '@omgreadx_files', // utils/fileStorage.ts
    'reading_sessions', // utils/readingStorage.ts
    'reading_progress', // utils/readingStorage.ts
    'completed_files', // utils/readingStorage.ts
    'user_profile', // utils/profileStorage.ts (legacy local profile)
  ];
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore cache clear errors
  }
}

