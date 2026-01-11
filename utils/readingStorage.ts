import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReadingSession {
  id: string;
  filename: string;
  totalParagraphs: number;
  completedParagraphs: number;
  totalWords: number;
  readingTime: number;
  completionPercentage: number;
  date: Date;
}

export interface ReadingProgress {
  filename: string;
  fileUri: string;
  currentParagraphIndex: number;
  completedParagraphs: number[];
  lastUpdated: Date;
  totalParagraphs: number;
}

export interface CompletedFile {
  filename: string;
  fileUri: string;
  completedDate: Date;
  completionPercentage: number;
  totalWords: number;
  readingTime: number;
}

const SESSIONS_STORAGE_KEY = 'reading_sessions';
const PROGRESS_STORAGE_KEY = 'reading_progress';
const COMPLETED_FILES_STORAGE_KEY = 'completed_files';

const getSessionsFilePath = (): string => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    return '';
  }
  return `${baseDir}reading_sessions.json`;
};

const getProgressFilePath = (): string => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    return '';
  }
  return `${baseDir}reading_progress.json`;
};

const getCompletedFilesFilePath = (): string => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    return '';
  }
  return `${baseDir}completed_files.json`;
};

export const saveReadingSession = async (session: ReadingSession): Promise<void> => {
  try {
    console.log('Saving reading session:', session);
    const existingSessions = await getReadingSessions();
    console.log('Existing sessions:', existingSessions.length);
    // Upsert by id so periodic saves update the same session instead of inflating totals.
    const updatedSessions = [...existingSessions.filter(s => s.id !== session.id), session];
    const sessionsJson = JSON.stringify(updatedSessions);
    
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, sessionsJson);
      console.log('Reading session saved to AsyncStorage (web)');
    } else {
      const filePath = getSessionsFilePath();
      if (!filePath) {
        console.warn('Cannot save reading sessions: no storage path available');
        // Fallback to AsyncStorage on mobile if FileSystem fails
        await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, sessionsJson);
        console.log('Reading session saved to AsyncStorage (fallback)');
        return;
      }
      console.log('Writing to:', filePath);
      await FileSystem.writeAsStringAsync(filePath, sessionsJson);
      console.log('Reading session saved successfully');
    }
  } catch (error) {
    console.error('Error saving reading session:', error);
    throw error;
  }
};

export const getReadingSessions = async (): Promise<ReadingSession[]> => {
  try {
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      const sessionsJson = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      if (sessionsJson) {
        const sessions = JSON.parse(sessionsJson);
        console.log('Loaded reading sessions from AsyncStorage (web):', sessions.length);
        return sessions.map((s: any) => ({
          ...s,
          date: new Date(s.date),
        }));
      }
      return [];
    } else {
      const filePath = getSessionsFilePath();
      if (!filePath) {
        console.log('No storage path available for reading sessions, trying AsyncStorage...');
        // Fallback to AsyncStorage
        const sessionsJson = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
        if (sessionsJson) {
          const sessions = JSON.parse(sessionsJson);
          console.log('Loaded reading sessions from AsyncStorage (fallback):', sessions.length);
          return sessions.map((s: any) => ({
            ...s,
            date: new Date(s.date),
          }));
        }
        return [];
      }
      
      console.log('Loading reading sessions from:', filePath);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('Reading sessions file does not exist yet');
        return [];
      }
      
      const sessionsJson = await FileSystem.readAsStringAsync(filePath);
      if (sessionsJson) {
        const sessions = JSON.parse(sessionsJson);
        console.log('Loaded reading sessions:', sessions.length);
        return sessions.map((s: any) => ({
          ...s,
          date: new Date(s.date),
        }));
      }
      return [];
    }
  } catch (error) {
    console.error('Error loading reading sessions:', error);
    return [];
  }
};

export const clearReadingSessions = async (): Promise<void> => {
  try {
    const filePath = getSessionsFilePath();
    if (filePath) {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    }
    // Also clear from AsyncStorage
    await AsyncStorage.removeItem(SESSIONS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing reading sessions:', error);
  }
};

// Delete only today's reading sessions
export const clearTodayReadingSessions = async (): Promise<void> => {
  try {
    const allSessions = await getReadingSessions();
    
    // Calculate today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Filter out today's sessions
    const remainingSessions = allSessions.filter(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() !== today.getTime();
    });
    
    // Save the remaining sessions
    const sessionsJson = JSON.stringify(remainingSessions);
    
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, sessionsJson);
    } else {
      const filePath = getSessionsFilePath();
      if (!filePath) {
        await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, sessionsJson);
        return;
      }
      await FileSystem.writeAsStringAsync(filePath, sessionsJson);
    }
    
    console.log('Today\'s reading sessions cleared. Remaining sessions:', remainingSessions.length);
  } catch (error) {
    console.error('Error clearing today\'s reading sessions:', error);
    throw error;
  }
};

// Delete only today's completed files
export const clearTodayCompletedFiles = async (): Promise<void> => {
  try {
    const allCompleted = await getCompletedFiles();
    
    // Calculate today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Filter out today's completed files
    const remainingCompleted = allCompleted.filter(file => {
      const completedDate = new Date(file.completedDate);
      completedDate.setHours(0, 0, 0, 0);
      return completedDate.getTime() !== today.getTime();
    });
    
    // Save the remaining completed files
    const completedJson = JSON.stringify(remainingCompleted);
    
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(COMPLETED_FILES_STORAGE_KEY, completedJson);
    } else {
      const filePath = getCompletedFilesFilePath();
      if (!filePath) {
        await AsyncStorage.setItem(COMPLETED_FILES_STORAGE_KEY, completedJson);
        return;
      }
      await FileSystem.writeAsStringAsync(filePath, completedJson);
    }
    
    console.log('Today\'s completed files cleared. Remaining files:', remainingCompleted.length);
  } catch (error) {
    console.error('Error clearing today\'s completed files:', error);
    throw error;
  }
};

// Save reading progress for a specific file
export const saveReadingProgress = async (progress: ReadingProgress): Promise<void> => {
  try {
    console.log('Saving reading progress:', progress);
    const existingProgress = await getReadingProgress();
    const updatedProgress = existingProgress.filter(p => p.filename !== progress.filename);
    updatedProgress.push(progress);
    const progressJson = JSON.stringify(updatedProgress);
    
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(PROGRESS_STORAGE_KEY, progressJson);
      console.log('Reading progress saved to AsyncStorage (web)');
    } else {
      const filePath = getProgressFilePath();
      if (!filePath) {
        console.warn('Cannot save reading progress: no storage path available');
        // Fallback to AsyncStorage
        await AsyncStorage.setItem(PROGRESS_STORAGE_KEY, progressJson);
        console.log('Reading progress saved to AsyncStorage (fallback)');
        return;
      }
      console.log('Writing progress to:', filePath);
      await FileSystem.writeAsStringAsync(filePath, progressJson);
      console.log('Reading progress saved successfully');
    }
  } catch (error) {
    console.error('Error saving reading progress:', error);
    throw error;
  }
};

// Get reading progress for a specific file
export const getReadingProgress = async (): Promise<ReadingProgress[]> => {
  try {
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      const progressJson = await AsyncStorage.getItem(PROGRESS_STORAGE_KEY);
      if (progressJson) {
        const progress = JSON.parse(progressJson);
        console.log('Loaded reading progress from AsyncStorage (web):', progress.length, 'files');
        return progress.map((p: any) => ({
          ...p,
          lastUpdated: new Date(p.lastUpdated),
        }));
      }
      return [];
    } else {
      const filePath = getProgressFilePath();
      if (!filePath) {
        console.log('No storage path available for reading progress, trying AsyncStorage...');
        // Fallback to AsyncStorage
        const progressJson = await AsyncStorage.getItem(PROGRESS_STORAGE_KEY);
        if (progressJson) {
          const progress = JSON.parse(progressJson);
          console.log('Loaded reading progress from AsyncStorage (fallback):', progress.length, 'files');
          return progress.map((p: any) => ({
            ...p,
            lastUpdated: new Date(p.lastUpdated),
          }));
        }
        return [];
      }
      
      console.log('Loading reading progress from:', filePath);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('Reading progress file does not exist yet');
        return [];
      }
      
      const progressJson = await FileSystem.readAsStringAsync(filePath);
      if (progressJson) {
        const progress = JSON.parse(progressJson);
        console.log('Loaded reading progress for', progress.length, 'files');
        return progress.map((p: any) => ({
          ...p,
          lastUpdated: new Date(p.lastUpdated),
        }));
      }
      return [];
    }
  } catch (error) {
    console.error('Error loading reading progress:', error);
    return [];
  }
};

// Get reading progress for a specific file by filename or URI
export const getFileReadingProgress = async (filename: string, fileUri?: string): Promise<ReadingProgress | null> => {
  try {
    const allProgress = await getReadingProgress();
    // Try to find by filename first, then by URI
    const progress = allProgress.find(p => 
      p.filename === filename || (fileUri && p.fileUri === fileUri)
    );
    return progress || null;
  } catch (error) {
    console.error('Error getting file reading progress:', error);
    return null;
  }
};

// Clear reading progress for a specific file
export const clearFileReadingProgress = async (filename: string): Promise<void> => {
  try {
    const existingProgress = await getReadingProgress();
    const updatedProgress = existingProgress.filter(p => p.filename !== filename);
    const progressJson = JSON.stringify(updatedProgress);
    const filePath = getProgressFilePath();
    
    if (filePath) {
      await FileSystem.writeAsStringAsync(filePath, progressJson);
    }
  } catch (error) {
    console.error('Error clearing file reading progress:', error);
  }
};

// Save a file as fully completed
export const markFileAsCompleted = async (completedFile: CompletedFile): Promise<void> => {
  try {
    console.log('Marking file as completed:', completedFile.filename);
    const existingCompleted = await getCompletedFiles();
    // Remove any existing entry for this file
    const updatedCompleted = existingCompleted.filter(f => f.filename !== completedFile.filename);
    updatedCompleted.push(completedFile);
    const completedJson = JSON.stringify(updatedCompleted);
    
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(COMPLETED_FILES_STORAGE_KEY, completedJson);
      console.log('File marked as completed in AsyncStorage (web)');
    } else {
      const filePath = getCompletedFilesFilePath();
      if (!filePath) {
        console.warn('Cannot save completed files: no storage path available');
        // Fallback to AsyncStorage
        await AsyncStorage.setItem(COMPLETED_FILES_STORAGE_KEY, completedJson);
        console.log('File marked as completed in AsyncStorage (fallback)');
        return;
      }
      console.log('Writing completed files to:', filePath);
      await FileSystem.writeAsStringAsync(filePath, completedJson);
      console.log('File marked as completed successfully');
    }
  } catch (error) {
    console.error('Error marking file as completed:', error);
    throw error;
  }
};

// Get all completed files
export const getCompletedFiles = async (): Promise<CompletedFile[]> => {
  try {
    // Use AsyncStorage on web (same as mobile), FileSystem on mobile
    if (Platform.OS === 'web') {
      const completedJson = await AsyncStorage.getItem(COMPLETED_FILES_STORAGE_KEY);
      if (completedJson) {
        const completed = JSON.parse(completedJson);
        console.log('Loaded completed files from AsyncStorage (web):', completed.length);
        return completed.map((f: any) => ({
          ...f,
          completedDate: new Date(f.completedDate),
        }));
      }
      return [];
    } else {
      const filePath = getCompletedFilesFilePath();
      if (!filePath) {
        console.log('No storage path available for completed files, trying AsyncStorage...');
        // Fallback to AsyncStorage
        const completedJson = await AsyncStorage.getItem(COMPLETED_FILES_STORAGE_KEY);
        if (completedJson) {
          const completed = JSON.parse(completedJson);
          console.log('Loaded completed files from AsyncStorage (fallback):', completed.length);
          return completed.map((f: any) => ({
            ...f,
            completedDate: new Date(f.completedDate),
          }));
        }
        return [];
      }
      
      console.log('Loading completed files from:', filePath);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('Completed files file does not exist yet');
        return [];
      }
      
      const completedJson = await FileSystem.readAsStringAsync(filePath);
      if (completedJson) {
        const completed = JSON.parse(completedJson);
        console.log('Loaded completed files:', completed.length);
        return completed.map((f: any) => ({
          ...f,
          completedDate: new Date(f.completedDate),
        }));
      }
      return [];
    }
  } catch (error) {
    console.error('Error loading completed files:', error);
    return [];
  }
};

// Check if a file is completed
export const isFileCompleted = async (filename: string): Promise<boolean> => {
  try {
    const completedFiles = await getCompletedFiles();
    return completedFiles.some(f => f.filename === filename);
  } catch (error) {
    console.error('Error checking if file is completed:', error);
    return false;
  }
};

