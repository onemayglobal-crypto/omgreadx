import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { FileInfo } from './fileUtils';

const FILES_STORAGE_KEY = '@omgreadx_files';

// Get a storage path for JSON file, with fallback to AsyncStorage
const getStoragePath = (): string | null => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    return null;
  }
  return `${baseDir}files_metadata.json`;
};

// Save files list using FileSystem if available, otherwise AsyncStorage
// On web, always use AsyncStorage for persistence across sessions
export const saveFilesList = async (files: FileInfo[]): Promise<void> => {
  try {
    console.log('=== saveFilesList START ===');
    console.log('Saving', files.length, 'files');
    const filePath = getStoragePath();
    const filesJson = JSON.stringify(files);
    console.log('Files JSON length:', filesJson.length);
    
    // On web, always use AsyncStorage for persistence
    if (Platform.OS === 'web') {
      console.log('Web platform detected, using AsyncStorage for persistence');
      await AsyncStorage.setItem(FILES_STORAGE_KEY, filesJson);
      console.log('Files list saved to AsyncStorage (web)');
      
      // Verify it was saved
      const verify = await AsyncStorage.getItem(FILES_STORAGE_KEY);
      if (verify) {
        const parsed = JSON.parse(verify);
        console.log('Verification: AsyncStorage contains', parsed.length, 'files');
      } else {
        console.error('CRITICAL: AsyncStorage save verification failed - data not found!');
      }
    } else if (filePath) {
      // Use FileSystem if available (mobile)
      try {
        await FileSystem.writeAsStringAsync(filePath, filesJson);
        console.log('Files list saved to FileSystem:', filePath);
        // Also save to AsyncStorage as backup
        await AsyncStorage.setItem(FILES_STORAGE_KEY, filesJson);
        console.log('Files list also saved to AsyncStorage (backup)');
      } catch (fsError: any) {
        console.error('FileSystem save failed, falling back to AsyncStorage:', fsError);
        // Fallback to AsyncStorage if FileSystem fails
        await AsyncStorage.setItem(FILES_STORAGE_KEY, filesJson);
        console.log('Files list saved to AsyncStorage (fallback)');
      }
    } else {
      // Fallback to AsyncStorage
      console.log('No FileSystem path, using AsyncStorage');
      await AsyncStorage.setItem(FILES_STORAGE_KEY, filesJson);
      console.log('Files list saved to AsyncStorage');
      
      // Verify it was saved
      const verify = await AsyncStorage.getItem(FILES_STORAGE_KEY);
      if (verify) {
        const parsed = JSON.parse(verify);
        console.log('Verification: AsyncStorage contains', parsed.length, 'files');
      } else {
        console.error('CRITICAL: AsyncStorage save verification failed - data not found!');
      }
    }
    console.log('=== saveFilesList SUCCESS ===');
  } catch (error: any) {
    console.error('=== saveFilesList ERROR ===');
    console.error('Error saving files list:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    throw error;
  }
};

// Load files list from FileSystem or AsyncStorage
// On web, always load from AsyncStorage first for consistency
export const loadFilesList = async (): Promise<FileInfo[]> => {
  try {
    console.log('Loading files list...');
    const filePath = getStoragePath();
    console.log('Storage path:', filePath);
    
    // On web, always use AsyncStorage first
    if (Platform.OS === 'web') {
      console.log('Web platform detected, loading from AsyncStorage');
      try {
        const filesJson = await AsyncStorage.getItem(FILES_STORAGE_KEY);
        if (filesJson) {
          const files = JSON.parse(filesJson);
          console.log('Loaded', files.length, 'files from AsyncStorage (web)');
          return files.map((f: any) => ({
            ...f,
            uploadDate: new Date(f.uploadDate),
          }));
        } else {
          console.log('No files found in AsyncStorage (web)');
        }
      } catch (asError) {
        console.error('Error reading from AsyncStorage (web):', asError);
      }
      return [];
    }
    
    // Mobile: Try FileSystem first, then AsyncStorage
    if (filePath) {
      // Try FileSystem first
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          const filesJson = await FileSystem.readAsStringAsync(filePath);
          if (filesJson) {
            const files = JSON.parse(filesJson);
            console.log('Loaded', files.length, 'files from FileSystem');
            // Convert dates
            return files.map((f: any) => ({
              ...f,
              uploadDate: new Date(f.uploadDate),
            }));
          }
        } else {
          console.log('FileSystem metadata file does not exist');
        }
      } catch (fsError) {
        console.log('Error reading from FileSystem, trying AsyncStorage:', fsError);
      }
    }
    
    // Fallback to AsyncStorage
    try {
      const filesJson = await AsyncStorage.getItem(FILES_STORAGE_KEY);
      if (filesJson) {
        const files = JSON.parse(filesJson);
        console.log('Loaded', files.length, 'files from AsyncStorage');
        return files.map((f: any) => ({
          ...f,
          uploadDate: new Date(f.uploadDate),
        }));
      } else {
        console.log('No files found in AsyncStorage');
      }
    } catch (asError) {
      console.error('Error reading from AsyncStorage:', asError);
    }
    
    console.log('No files found in storage');
    return [];
  } catch (error) {
    console.error('Error loading files list:', error);
    return [];
  }
};

// Add a file to the list
export const addFileToList = async (file: FileInfo): Promise<void> => {
  try {
    console.log('=== addFileToList START ===');
    console.log('Adding file to list:', file.name, 'URI:', file.uri);
    const files = await loadFilesList();
    console.log('Current files in list:', files.length);
    
    // Check if file already exists (by URI or name)
    const existingIndex = files.findIndex(f => f.uri === file.uri || f.name === file.name);
    if (existingIndex >= 0) {
      // Update existing file
      console.log('Updating existing file at index:', existingIndex);
      files[existingIndex] = file;
    } else {
      // Add new file
      console.log('Adding new file to list');
      files.push(file);
    }
    
    console.log('Total files to save:', files.length);
    console.log('File details:', JSON.stringify(file, null, 2));
    
    await saveFilesList(files);
    
    // Verify it was saved
    const verifyFiles = await loadFilesList();
    console.log('Verification: Files in storage after save:', verifyFiles.length);
    console.log('=== addFileToList SUCCESS ===');
  } catch (error: any) {
    console.error('=== addFileToList ERROR ===');
    console.error('Error adding file to list:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    throw error;
  }
};

// Remove a file from the list
export const removeFileFromList = async (uri: string): Promise<void> => {
  const files = await loadFilesList();
  const filtered = files.filter(f => f.uri !== uri);
  await saveFilesList(filtered);
};

// Clear all files from the list
export const clearFilesList = async (): Promise<void> => {
  const filePath = getStoragePath();
  if (filePath) {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  }
  await AsyncStorage.removeItem(FILES_STORAGE_KEY);
};

