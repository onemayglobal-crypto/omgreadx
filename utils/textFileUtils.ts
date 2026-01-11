import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveFile } from './fileUtils';
import { addTextDocument, TextDocument } from './textDocumentsStorage';

/**
 * Save pasted/typed text as a file that can be read with ReadingViewer
 */
export async function saveTextAsFile(text: string, title: string): Promise<{ uri: string; filename: string }> {
  try {
    console.log('[TextFileUtils] ===== START saveTextAsFile =====');
    console.log('[TextFileUtils] Platform:', Platform.OS);
    console.log('[TextFileUtils] Title:', title);
    console.log('[TextFileUtils] Text length:', text.length);
    
    // Check FileSystem availability
    console.log('[TextFileUtils] Checking FileSystem availability...');
    console.log('[TextFileUtils] documentDirectory:', FileSystem.documentDirectory);
    console.log('[TextFileUtils] cacheDirectory:', FileSystem.cacheDirectory);
    
    // Try to get storage path
    let storagePath: string | null = null;
    
    // Method 1: Use getStoragePath from fileUtils
    try {
      const { getStoragePath, ensureStorageDirectory } = await import('./fileUtils');
      console.log('[TextFileUtils] Ensuring storage directory exists...');
      await ensureStorageDirectory();
      storagePath = getStoragePath();
      console.log('[TextFileUtils] Storage path from getStoragePath:', storagePath);
    } catch (error: any) {
      console.warn('[TextFileUtils] getStoragePath failed:', error);
    }
    
    // Method 2: Direct access to FileSystem directories
    if (!storagePath) {
      console.log('[TextFileUtils] Trying direct FileSystem access...');
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      console.log('[TextFileUtils] baseDir:', baseDir);
      
      if (baseDir) {
        storagePath = `${baseDir}files/`;
        console.log('[TextFileUtils] Using direct storage path:', storagePath);
        // Ensure directory exists
        try {
          const dirInfo = await FileSystem.getInfoAsync(storagePath);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(storagePath, { intermediates: true });
            console.log('[TextFileUtils] Created storage directory');
          }
        } catch (dirError: any) {
          console.warn('[TextFileUtils] Could not ensure directory:', dirError);
          // Try without the files/ subdirectory
          storagePath = baseDir;
          console.log('[TextFileUtils] Trying root directory:', storagePath);
        }
      }
    }
    
    // Method 3: For web or when FileSystem is unavailable, use AsyncStorage (same as mobile)
    if (!storagePath) {
      console.log('[TextFileUtils] No storage path available, using AsyncStorage (same for web and mobile)...');
      
      // Use AsyncStorage for both web and mobile (consistent behavior)
      const timestamp = Date.now();
      const safeTitle = title.replace(/[^a-zA-Z0-9.\-_]/g, '_').substring(0, 50);
      const filename = `${safeTitle}_${timestamp}.txt`;
      const storageKey = `text_doc_${timestamp}`;
      
      try {
        // Store text in AsyncStorage (works on both web and mobile)
        await AsyncStorage.setItem(storageKey, text);
        console.log('[TextFileUtils] Text stored in AsyncStorage with key:', storageKey);
        
        const asyncStorageUri = `asyncstorage://${storageKey}`;
        
        // Store document metadata in dedicated text documents list
        const wordCount = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;
        const doc: TextDocument = {
          id: `${timestamp}`,
          title: title,
          storageKey,
          uri: asyncStorageUri,
          createdAt: new Date(timestamp).toISOString(),
          wordCount,
        };
        await addTextDocument(doc);
        
        console.log('[TextFileUtils] Using AsyncStorage (consistent for web and mobile)');
        return {
          uri: asyncStorageUri,
          filename: filename,
        };
      } catch (asyncError: any) {
        console.error('[TextFileUtils] AsyncStorage failed:', asyncError);
        // Last resort: use data URI
        const dataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
        console.log('[TextFileUtils] Using data URI as last resort');
        return {
          uri: dataUri,
          filename: filename,
        };
      }
    }
    
    console.log('[TextFileUtils] Final storage path:', storagePath);
    
    // Create a safe filename
    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-zA-Z0-9.\-_]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_${timestamp}.txt`;
    const fileUri = `${storagePath}${filename}`;
    
    console.log('[TextFileUtils] Created filename:', filename);
    console.log('[TextFileUtils] Full file URI:', fileUri);
    
    // Write text to file
    console.log('[TextFileUtils] Writing text to file...');
    await FileSystem.writeAsStringAsync(fileUri, text, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log('[TextFileUtils] File written successfully');
    
    // Verify file was created
    console.log('[TextFileUtils] Verifying file exists...');
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    console.log('[TextFileUtils] File info:', fileInfo);
    
    if (!fileInfo || !fileInfo.exists) {
      throw new Error('Failed to create text file - file does not exist after write');
    }
    
    // Get file size
    const fileSize = (fileInfo as any).size || text.length;
    console.log('[TextFileUtils] File size:', fileSize);
    
    // Add file to metadata directly (since file is already in storage path)
    // This ensures it appears in the file list
    // Skip if using AsyncStorage or data URI (they're temporary)
    if (!fileUri.startsWith('asyncstorage://') && !fileUri.startsWith('data:')) {
      console.log('[TextFileUtils] Adding file to metadata list...');
      try {
        const { addFileToList } = await import('./fileStorage');
        const { FileInfo, getFileType } = await import('./fileUtils');
        
        const fileInfoObj: FileInfo = {
          id: `${timestamp}-${filename}`,
          name: filename,
          uri: fileUri,
          type: getFileType(filename),
          size: fileSize,
          uploadDate: new Date(),
        };
        
        console.log('[TextFileUtils] FileInfo object:', JSON.stringify(fileInfoObj, null, 2));
        
        await addFileToList(fileInfoObj);
        console.log('[TextFileUtils] File metadata added to list successfully');
      } catch (metadataError: any) {
        console.warn('[TextFileUtils] Could not add metadata, but file is saved:', metadataError);
        console.warn('[TextFileUtils] Metadata error details:', {
          message: metadataError?.message,
          stack: metadataError?.stack,
        });
        // File is still saved and can be read, just won't appear in list
        // Don't throw - file can still be used for reading
      }
    } else {
      console.log('[TextFileUtils] Skipping metadata (using AsyncStorage or data URI fallback)');
    }
    
    console.log('[TextFileUtils] ===== SUCCESS saveTextAsFile =====');
    console.log('[TextFileUtils] Returning:', { uri: fileUri, filename });
    
    return {
      uri: fileUri,
      filename: filename,
    };
  } catch (error: any) {
    console.error('[TextFileUtils] ===== ERROR saveTextAsFile =====');
    console.error('[TextFileUtils] Error type:', error?.constructor?.name);
    console.error('[TextFileUtils] Error message:', error?.message);
    console.error('[TextFileUtils] Error stack:', error?.stack);
    throw new Error(`Failed to save text file: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Check if a file is a text input file (created from paste/type)
 */
export function isTextInputFile(filename: string): boolean {
  // Text input files have a specific naming pattern
  // They end with .txt and have a timestamp
  return filename.endsWith('.txt') && /_\d+\.txt$/.test(filename);
}

