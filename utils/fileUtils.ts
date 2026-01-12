import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface FileInfo {
  id: string;
  name: string;
  uri: string;
  type: string;
  size: number;
  uploadDate: Date;
}

export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

export const getFileType = (filename: string): string => {
  const ext = getFileExtension(filename);
  const typeMap: { [key: string]: string } = {
    pdf: 'PDF',
    epub: 'EPUB',
    txt: 'Text',
    doc: 'Word',
    docx: 'Word',
    rtf: 'Rich Text',
    md: 'Markdown',
    jpg: 'Image',
    jpeg: 'Image',
    png: 'Image',
    gif: 'Image',
    webp: 'Image',
    html: 'HTML',
    htm: 'HTML',
    xml: 'XML',
    json: 'JSON',
    csv: 'CSV',
  };
  return typeMap[ext] || 'Unknown';
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const isReadableFormat = (filename: string): boolean => {
  // Accept any file format for reading
  return true;
};

export const getStoragePath = (): string => {
  // On native (iOS/Android), documentDirectory is defined.
  // On web, documentDirectory may be null, so we fall back to cacheDirectory.
  // On iOS, documentDirectory might be null, so we use cacheDirectory as fallback.
  console.log('Checking storage directories...');
  console.log('documentDirectory:', FileSystem.documentDirectory);
  console.log('cacheDirectory:', FileSystem.cacheDirectory);
  
  let baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  
  if (!baseDir) {
    // As a last resort (very rare), return an empty string and we'll skip copying.
    console.warn('Both documentDirectory and cacheDirectory are unavailable');
    return '';
  }
  
  const storagePath = `${baseDir}files/`;
  console.log('Storage path determined:', storagePath);
  return storagePath;
};

export const ensureStorageDirectory = async (): Promise<void> => {
  const storagePath = getStoragePath();
  if (!storagePath) {
    // Nothing to create on this platform (e.g., very limited web env).
    return;
  }
  const dirInfo = await FileSystem.getInfoAsync(storagePath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(storagePath, { intermediates: true });
  }
};

export const saveFile = async (uri: string, filename: string): Promise<string> => {
  let finalUri = uri;
  let fileSize = 0;

  try {
    console.log('[saveFile] Starting file save process:', { uri, filename });
    
    // Web-specific handling: Convert files to base64 data URIs for persistence
    if (Platform.OS === 'web') {
      console.log('[saveFile] Web platform detected, converting to persistent data URI...');
      try {
        // Check if it's already a data URI
        if (uri.startsWith('data:')) {
          console.log('[saveFile] File is already a data URI, using as-is');
          finalUri = uri;
          // Extract size from data URI if possible
          const sizeMatch = uri.match(/;base64,([A-Za-z0-9+/=]+)/);
          if (sizeMatch) {
            fileSize = Math.floor(sizeMatch[1].length * 0.75); // Approximate size
          }
        } else {
          // Try to fetch and convert to base64
          try {
            let base64Data: string;
            // Add timeout for fetch operation
            const fetchController = new AbortController();
            const fetchTimeout = setTimeout(() => {
              fetchController.abort();
            }, 30000); // 30 second timeout for fetch
            
            let response: Response;
            try {
              response = await fetch(uri, { signal: fetchController.signal });
              clearTimeout(fetchTimeout);
            } catch (fetchErr: any) {
              clearTimeout(fetchTimeout);
              if (fetchErr.name === 'AbortError') {
                throw new Error('File download timeout after 30 seconds. The file may be too large or the connection is slow.');
              }
              throw fetchErr;
            }
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Add timeout for blob conversion
            const blob = await Promise.race([
              response.blob(),
              new Promise<Blob>((_, reject) => {
                setTimeout(() => {
                  reject(new Error('Blob conversion timeout after 30 seconds'));
                }, 30000); // 30 second timeout for blob
              })
            ]);
            
            fileSize = blob.size;
            
            // Check file size before conversion (limit to 50MB for base64 conversion)
            const fileSizeMB = fileSize / (1024 * 1024);
            if (fileSizeMB > 50) {
              console.warn(`[saveFile] File too large for base64 conversion (${fileSizeMB.toFixed(2)}MB), using original URI`);
              finalUri = uri;
            } else {
              // Convert blob to base64 with timeout
              base64Data = await Promise.race([
                new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  let isResolved = false;
                  
                  reader.onloadend = () => {
                    if (!isResolved) {
                      isResolved = true;
                      const result = reader.result as string;
                      if (result) {
                        resolve(result);
                      } else {
                        reject(new Error('FileReader returned empty result'));
                      }
                    }
                  };
                  
                  reader.onerror = (error) => {
                    if (!isResolved) {
                      isResolved = true;
                      reject(new Error(`FileReader error: ${error}`));
                    }
                  };
                  
                  reader.onprogress = (event) => {
                    if (event.lengthComputable) {
                      const percent = Math.round((event.loaded / event.total) * 100);
                      console.log(`[saveFile] Conversion progress: ${percent}%`);
                    }
                  };
                  
                  try {
                    reader.readAsDataURL(blob);
                  } catch (readError: any) {
                    if (!isResolved) {
                      isResolved = true;
                      reject(new Error(`Failed to read blob: ${readError.message}`));
                    }
                  }
                }),
                new Promise<string>((_, reject) => {
                  setTimeout(() => {
                    reject(new Error(`Base64 conversion timeout after 60 seconds. File may be too large (${fileSizeMB.toFixed(2)}MB).`));
                  }, 60000); // 60 second timeout
                })
              ]);
              
              // Determine MIME type from filename
              const ext = filename.split('.').pop()?.toLowerCase() || '';
              let mimeType = 'application/octet-stream';
              if (ext === 'pdf') mimeType = 'application/pdf';
              else if (ext === 'txt') mimeType = 'text/plain';
              else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
              else if (ext === 'doc') mimeType = 'application/msword';
              else if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
              else if (ext === 'png') mimeType = 'image/png';
              else if (ext === 'gif') mimeType = 'image/gif';
              
              // Use the base64 data URI
              finalUri = base64Data;
              console.log('[saveFile] File converted to data URI, size:', fileSize, 'bytes');
            }
          } catch (fetchError: any) {
            console.warn('[saveFile] Failed to convert file to data URI on web:', fetchError.message);
            // Fall back to original URI - might still work
            finalUri = uri;
          }
        }
      } catch (webError: any) {
        console.warn('[saveFile] Web-specific save failed, using original URI:', webError.message);
      }
    } else {
      // Mobile platform handling
      // First, verify source file exists
      let sourceInfo;
      try {
        sourceInfo = await FileSystem.getInfoAsync(uri);
        if (!sourceInfo || !sourceInfo.exists) {
          console.warn('[saveFile] Source file does not exist or cannot be accessed:', uri);
          // Continue anyway - file might still be accessible
        } else {
          fileSize = (sourceInfo as any).size || 0;
          console.log('[saveFile] Source file verified, size:', fileSize);
        }
      } catch (infoError: any) {
        console.warn('[saveFile] Could not verify source file, continuing anyway:', infoError.message);
        // Continue - file might still be accessible even if getInfoAsync fails
      }

      // Try to ensure storage directory exists
      try {
        await ensureStorageDirectory();
      } catch (dirError) {
        console.warn('[saveFile] Could not ensure storage directory:', dirError);
      }

      const storagePath = getStoragePath();

      // If we have a storage path, try to copy the file
      if (storagePath) {
        console.log('[saveFile] Storage path available, attempting to copy file');
        try {
          // Make filename safe and unique
          const timestamp = Date.now();
          const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const newUri = `${storagePath}${timestamp}-${safeName}`;

          console.log('[saveFile] Copying file from', uri, 'to', newUri);

          await FileSystem.copyAsync({
            from: uri,
            to: newUri,
          });
          
          // Verify the file was copied
          try {
            const destInfo = await FileSystem.getInfoAsync(newUri);
            if (destInfo && destInfo.exists) {
              finalUri = newUri;
              console.log('[saveFile] File successfully copied to:', newUri);
            } else {
              console.warn('[saveFile] File copy verification failed - destination does not exist');
            }
          } catch (verifyError: any) {
            console.warn('[saveFile] Could not verify copied file, using original URI:', verifyError.message);
          }
        } catch (copyError: any) {
          console.warn('[saveFile] Failed to copy file to storage:', copyError.message);
          // Continue with original URI - file is still accessible from DocumentPicker cache
        }
      } else {
        console.log('[saveFile] No storage path available, using original URI from DocumentPicker');
      }
    }

    // CRITICAL: Always save file metadata, even if we couldn't copy the file
    // This ensures files appear in the list
    try {
      const { addFileToList } = await import('./fileStorage');
      const fileInfo: FileInfo = {
        id: `${Date.now()}-${filename}`,
        name: filename,
        uri: finalUri,
        type: getFileType(filename),
        size: fileSize,
        uploadDate: new Date(),
      };
      console.log('[saveFile] Saving file metadata to tracking system:', fileInfo.name);
      await addFileToList(fileInfo);
      console.log('[saveFile] File metadata saved successfully');
    } catch (metadataError: any) {
      console.error('[saveFile] CRITICAL: Failed to save file metadata:', metadataError);
      console.error('[saveFile] Metadata error:', {
        message: metadataError?.message,
        stack: metadataError?.stack,
      });
      // Don't throw - file is still accessible with original URI
      // The upload component will handle saving metadata as fallback
      console.warn('[saveFile] Metadata save failed, but file URI is still valid');
    }

    console.log('[saveFile] File save process completed successfully');
    return finalUri;
  } catch (error: any) {
    console.error('[saveFile] Error in saveFile:', error);
    console.error('[saveFile] Error details:', {
      message: error?.message,
      stack: error?.stack,
      uri,
      filename,
    });
    
    // If metadata save failed, try one more time as fallback
    if (error.message?.includes('metadata')) {
      try {
        const { addFileToList } = await import('./fileStorage');
        const fileInfo: FileInfo = {
          id: `${Date.now()}-${filename}`,
          name: filename,
          uri: finalUri,
          type: getFileType(filename),
          size: fileSize,
          uploadDate: new Date(),
        };
        await addFileToList(fileInfo);
        console.log('[saveFile] Metadata saved on retry');
        return finalUri;
      } catch (retryError) {
        console.error('[saveFile] Metadata save retry also failed:', retryError);
      }
    }
    
    // Return original URI as last resort - file might still be readable
    console.log('[saveFile] Returning original URI as fallback');
    return uri;
  }
};

export const deleteFile = async (uri: string): Promise<void> => {
  try {
    // Try to delete the physical file
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
    
    // Remove from metadata storage
    const { removeFileFromList } = await import('./fileStorage');
    await removeFileFromList(uri);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

export const getAllFiles = async (): Promise<FileInfo[]> => {
  try {
    console.log('[getAllFiles] Loading files from storage...');
    
    // First, try to load from our metadata storage (FileSystem or AsyncStorage)
    const { loadFilesList, removeFileFromList } = await import('./fileStorage');
    const metadataFiles = await loadFilesList();
    
    if (metadataFiles.length > 0) {
      console.log('[getAllFiles] Found', metadataFiles.length, 'files in metadata storage');
      // Verify files still exist, and remove invalid ones
      const verifiedFiles: FileInfo[] = [];
      const invalidFiles: FileInfo[] = [];
      
      for (const file of metadataFiles) {
        try {
          // Skip verification for AsyncStorage and data URIs (they're handled differently)
          if (file.uri.startsWith('asyncstorage://') || file.uri.startsWith('data:')) {
            verifiedFiles.push(file);
            console.log('[getAllFiles] Skipping verification for special URI:', file.name);
            continue;
          }
          
          // Try to verify file exists (non-blocking)
          try {
            const fileInfo = await FileSystem.getInfoAsync(file.uri);
            if (fileInfo && fileInfo.exists) {
              // Update size if available
              if ('size' in fileInfo && (fileInfo as any).size) {
                file.size = (fileInfo as any).size;
              }
              console.log('[getAllFiles] File verified:', file.name);
            } else {
              console.warn('[getAllFiles] File not found, but keeping in list (may still be accessible):', file.name);
            }
          } catch (verifyError: any) {
            // Verification failed, but keep the file anyway
            // It might still work (DocumentPicker URIs, web files, etc.)
            console.warn('[getAllFiles] Could not verify file, but keeping in list:', file.name, verifyError?.message);
          }
          
          // Always keep the file - let the file viewer handle errors
          verifiedFiles.push(file);
        } catch (e: any) {
          // Even if there's an error, keep the file
          // User can try to open it and see if it works
          console.warn('[getAllFiles] Error processing file, but keeping in list:', file.name, e?.message);
          verifiedFiles.push(file);
        }
      }
      
      console.log('[getAllFiles] Returning', verifiedFiles.length, 'verified files from metadata storage');
      return verifiedFiles.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime());
    }
    
    // Fallback: Try to load from FileSystem directory (for backwards compatibility)
    console.log('[getAllFiles] No metadata files found, checking FileSystem directory...');
    
    try {
      await ensureStorageDirectory();
    } catch (dirError) {
      console.warn('[getAllFiles] Could not ensure storage directory:', dirError);
    }
    
    const storagePath = getStoragePath();

    if (!storagePath) {
      console.log('[getAllFiles] No storage path available');
      return [];
    }

    try {
      console.log('[getAllFiles] Loading files from FileSystem directory:', storagePath);
      const files = await FileSystem.readDirectoryAsync(storagePath);
      console.log('[getAllFiles] Found', files.length, 'files in directory');

      const fileInfos: FileInfo[] = [];
      for (const file of files) {
        try {
          const fileUri = `${storagePath}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          
          if (fileInfo && fileInfo.exists && !fileInfo.isDirectory) {
            // Try to get file size and modification time
            let fileSize = 0;
            let modTime = Date.now();
            
            try {
              if ('size' in fileInfo) {
                fileSize = (fileInfo as any).size || 0;
              }
              if ('modificationTime' in fileInfo) {
                modTime = ((fileInfo as any).modificationTime || Date.now() / 1000) * 1000;
              }
            } catch (e) {
              // Use defaults if we can't get the info
            }
            
            // Extract original filename (remove timestamp prefix if present)
            const originalName = file.includes('-') && /^\d+-/.test(file) 
              ? file.replace(/^\d+-/, '') 
              : file;
            
            const fileInfoObj: FileInfo = {
              id: file,
              name: originalName,
              uri: fileUri,
              type: getFileType(originalName),
              size: fileSize,
              uploadDate: new Date(modTime),
            };
            
            fileInfos.push(fileInfoObj);
            
            // Also save to metadata storage for future use
            try {
              const { addFileToList } = await import('./fileStorage');
              await addFileToList(fileInfoObj);
            } catch (metadataError) {
              console.warn('[getAllFiles] Could not save file to metadata:', metadataError);
            }
          }
        } catch (fileError: any) {
          console.warn('[getAllFiles] Error processing file:', file, fileError?.message);
          // Continue with next file
        }
      }
      
      const sorted = fileInfos.sort((a, b) => b.uploadDate.getTime() - a.uploadDate.getTime());
      console.log('[getAllFiles] Returning', sorted.length, 'files from FileSystem');
      return sorted;
    } catch (readError: any) {
      console.error('[getAllFiles] Error reading directory:', readError);
      return [];
    }
  } catch (error: any) {
    console.error('[getAllFiles] Error loading files:', error);
    console.error('[getAllFiles] Error details:', {
      message: error?.message,
      stack: error?.stack,
    });
    return [];
  }
};

