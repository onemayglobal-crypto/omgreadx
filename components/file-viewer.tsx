import { getFileExtension, getFileType } from '@/utils/fileUtils';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import mammoth from 'mammoth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Conditionally import WebView only for mobile platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('WebView not available:', e);
  }
}

interface FileViewerProps {
  fileUri: string;
  filename: string;
  onClose?: () => void;
}

export default function FileViewer({ fileUri, filename, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Safely get file extension and type
  let fileType = 'Unknown';
  let fileExt = '';
  try {
    fileExt = getFileExtension(filename || '');
    fileType = getFileType(filename || '');
  } catch (err) {
    console.error('[FileViewer] Error getting file info:', err);
  }

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const loadContent = async () => {
      try {
        // Add overall timeout to prevent hanging
        timeoutId = setTimeout(() => {
          if (isMounted) {
            console.error('[FileViewer] Overall timeout - file loading took too long');
            setError('File loading timed out. The file may be too large or corrupted.');
            setLoading(false);
          }
        }, 60000); // 60 second timeout
        
        await loadFileContent();
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } catch (error: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (isMounted) {
          console.error('[FileViewer] Unhandled error in useEffect:', error);
          setError(`Failed to load file: ${error?.message || 'Unknown error'}`);
          setLoading(false);
        }
      }
    };
    
    // Only load if we have valid inputs
    if (fileUri && filename) {
      loadContent();
    } else {
      setError('Invalid file information provided');
      setLoading(false);
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [fileUri, filename]);

  const loadFileContent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[FileViewer] Loading file:', filename, 'URI:', fileUri);
      
      // Validate file URI
      if (!fileUri || fileUri.trim() === '') {
        throw new Error('Invalid file URI');
      }
      
      // Check if file exists (non-blocking - just log warnings)
      // Don't block loading - try to load anyway and show error if it fails
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo || !fileInfo.exists) {
          console.warn('[FileViewer] File check says it does not exist, but continuing anyway');
          // Continue - file might still be accessible (DocumentPicker URIs, web files, etc.)
        } else {
          console.log('[FileViewer] File exists, size:', (fileInfo as any).size || 'unknown');
        }
      } catch (checkError: any) {
        // Verification failed, but continue anyway
        // File might still be accessible on different platforms or with different URI schemes
        console.warn('[FileViewer] File check failed, but continuing:', checkError.message);
      }

      // Handle different file types
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
        // Images are handled by Image component
        console.log('[FileViewer] Image file, skipping content load');
        setLoading(false);
        return;
      }

      if (['txt', 'md', 'json', 'xml', 'html', 'htm', 'csv'].includes(fileExt)) {
        // Text-based files
        console.log('[FileViewer] Loading text file...');
        try {
          // Add timeout for file reading (prevent hanging)
          const readPromise = FileSystem.readAsStringAsync(fileUri);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('File read timeout')), 30000)
          );
          
          const fileContent = await Promise.race([readPromise, timeoutPromise]) as string;
          
          if (!fileContent) {
            throw new Error('File is empty');
          }
          
          setContent(fileContent);
          setLoading(false);
          return;
        } catch (textError: any) {
          console.error('[FileViewer] Error loading text file:', textError);
          const errorMsg = textError.message || 'Unknown error';
          setError(`Failed to load text file: ${errorMsg}. Please try again or use a different file.`);
          setLoading(false);
          return;
        }
      }

      if (fileExt === 'pdf') {
        // For PDF on iOS, we need special handling
        try {
          console.log('[FileViewer] Loading PDF for iOS...');
          
          // On iOS, use FileSystem directly to avoid memory issues
          let fileBase64: string;
          
          try {
            // For iOS, always use FileSystem to avoid fetch/blob issues
            console.log('[FileViewer] Reading PDF as base64 from FileSystem...');
            
            // Add timeout for large file reads
            const readPromise = FileSystem.readAsStringAsync(fileUri, {
              encoding: 'base64',
            } as any);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('PDF read timeout - file may be too large')), 60000)
            );
            
            fileBase64 = await Promise.race([readPromise, timeoutPromise]) as string;
            
            if (!fileBase64 || fileBase64.length === 0) {
              throw new Error('PDF file is empty or could not be read');
            }
            
            // Check file size - warn if too large (iOS has memory limits)
            const fileSizeMB = (fileBase64.length * 3) / 4 / (1024 * 1024);
            if (fileSizeMB > 20) {
              console.warn(`[FileViewer] PDF is large (${fileSizeMB.toFixed(2)}MB), may cause performance issues on iOS`);
              setError(`PDF file is too large (${fileSizeMB.toFixed(2)}MB) to display. Please use a smaller file or an external PDF viewer.`);
              setLoading(false);
              return;
            }
            
            // Use data URI for WebView - this works on iOS
            const dataUri = `data:application/pdf;base64,${fileBase64}`;
            setContent(dataUri);
            setLoading(false);
            return;
          } catch (fsError: any) {
            console.error('[FileViewer] FileSystem read failed:', fsError);
            
            // Check if it's already a data URI
            if (fileUri.startsWith('data:')) {
              console.log('[FileViewer] File is already a data URI, using directly');
              setContent(fileUri);
              setLoading(false);
              return;
            }
            
            // Try fetch as fallback (only if FileSystem fails)
            if (Platform.OS === 'web') {
              try {
                // Add timeout for fetch operation
                const fetchController = new AbortController();
                const fetchTimeout = setTimeout(() => {
                  fetchController.abort();
                }, 30000); // 30 second timeout for fetch
                
                let response: Response;
                try {
                  response = await fetch(fileUri, { signal: fetchController.signal });
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
                
                const fileSizeMB = blob.size / (1024 * 1024);
                if (fileSizeMB > 20) {
                  throw new Error(`PDF file is too large (${fileSizeMB.toFixed(2)}MB)`);
                }
                
                // Convert blob to base64 (web only) with timeout
                fileBase64 = await Promise.race([
                  new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    let isResolved = false;
                    
                    reader.onloadend = () => {
                      if (!isResolved) {
                        isResolved = true;
                        const result = reader.result as string;
                        if (result) {
                          const base64String = result.split(',')[1];
                          if (base64String) {
                            resolve(base64String);
                          } else {
                            reject(new Error('Failed to extract base64 string from FileReader result'));
                          }
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
                        console.log(`[FileViewer] Base64 conversion progress: ${percent}%`);
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
                
                const dataUri = `data:application/pdf;base64,${fileBase64}`;
                setContent(dataUri);
                setLoading(false);
                return;
              } catch (fetchError: any) {
                console.error('[FileViewer] Error in fetch/convert process:', fetchError);
                const errorMsg = fetchError?.message || 'Unknown error';
                if (errorMsg.includes('timeout')) {
                  throw new Error(`File download or conversion timed out. The file may be too large. Please try a smaller file or check your internet connection.`);
                }
                throw new Error(`Failed to load PDF: ${errorMsg}`);
              }
            } else {
              throw new Error(`Failed to read PDF file: ${fsError.message || 'Unknown error'}`);
            }
          }
        } catch (err: any) {
          console.error('[FileViewer] Error loading PDF:', err);
          const errorMsg = err.message || 'Unknown error occurred';
          setError(`Failed to load PDF file "${filename}". ${errorMsg}. On iOS, large PDFs may not display. Try using an external PDF viewer app.`);
          setLoading(false);
          return;
        }
      }

      // Handle Word documents (DOCX) - extract text using mammoth
      if (fileExt === 'docx') {
        try {
          console.log('Starting DOCX extraction for:', filename);
          
          // Use fetch to get file as ArrayBuffer (works better with mammoth)
          let arrayBuffer: ArrayBuffer;
          
          try {
            // Try using fetch first (works on web and some platforms)
            const response = await fetch(fileUri);
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            arrayBuffer = await response.arrayBuffer();
          } catch (fetchError) {
            // Fallback: read as base64 and convert
            console.log('Fetch failed, trying base64 read...', fetchError);
            const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
              encoding: 'base64',
            } as any);
            
            if (!fileBase64 || fileBase64.length === 0) {
              throw new Error('File is empty or could not be read');
            }
            
            // Convert base64 to ArrayBuffer
            const binaryString = atob(fileBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
          }
          
          console.log('File loaded, converting DOCX to text using mammoth...');
          
          // Use mammoth to extract text from DOCX with proper spacing
          // Try convertToMarkdown first for better spacing preservation
          let extractedText = '';
          
          try {
            const markdownResult = await mammoth.convertToMarkdown({ arrayBuffer });
            if (markdownResult.value && markdownResult.value.trim().length > 0) {
              // Convert markdown to plain text while preserving spacing
              extractedText = markdownResult.value
                // Replace markdown headers with newlines
                .replace(/^#+\s+/gm, '')
                // Replace markdown bold/italic with plain text
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/__([^_]+)__/g, '$1')
                .replace(/_([^_]+)_/g, '$1')
                // Replace markdown links with just the text
                .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                // Remove forward slashes and backslashes
                .replace(/\//g, ' ')
                .replace(/\\/g, ' ')
                // Normalize whitespace: preserve line breaks, but normalize spaces within lines
                .split('\n')
                .map(line => line.trim().replace(/\s+/g, ' '))
                .join('\n')
                .trim();
            }
          } catch (markdownError) {
            console.warn('Markdown conversion failed, trying extractRawText...', markdownError);
          }
          
          // Fallback to extractRawText if markdown conversion failed
          if (!extractedText || extractedText.trim().length === 0) {
            const result = await mammoth.extractRawText({ arrayBuffer });
            if (result.value && result.value.trim().length > 0) {
              // Normalize whitespace in raw text extraction
              extractedText = result.value
                // Remove forward slashes and backslashes
                .replace(/\//g, ' ')
                .replace(/\\/g, ' ')
                .split('\n')
                .map(line => line.trim().replace(/\s+/g, ' '))
                .join('\n')
                .trim();
            }
          }
          
          // Final fallback to HTML conversion
          if (!extractedText || extractedText.trim().length === 0) {
            console.log('Raw text empty, trying HTML conversion...');
            const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
            if (htmlResult.value) {
              // Strip HTML tags to get plain text with proper spacing
              extractedText = htmlResult.value
                .replace(/<[^>]+>/g, ' ')
                // Remove forward slashes and backslashes
                .replace(/\//g, ' ')
                .replace(/\\/g, ' ')
                // Normalize whitespace: preserve line breaks, but normalize spaces within lines
                .split('\n')
                .map(line => line.trim().replace(/\s+/g, ' '))
                .join('\n')
                .trim();
            }
          }
          
          if (extractedText && extractedText.trim().length > 0) {
            console.log('Text extracted successfully, length:', extractedText.length);
            setContent(extractedText);
            setLoading(false);
            return;
          } else {
            throw new Error('No text content found in document. The file may be empty or contain only images.');
          }
        } catch (err: any) {
          console.error('Error extracting DOCX content:', err);
          console.error('Error details:', JSON.stringify(err, null, 2));
          const errorMsg = err.message || 'Unknown error occurred';
          setError(`Unable to extract text from Word document "${filename}". ${errorMsg}`);
          setLoading(false);
          return;
        }
      }
      
      // Handle old DOC format (binary, harder to parse)
      if (fileExt === 'doc') {
        setError('Old Word format (.doc) detected. This format is not supported. Please convert the file to .docx format or use a compatible app to view it.');
        setLoading(false);
        return;
      }

      // For other formats, try to read as text
      try {
        const fileContent = await FileSystem.readAsStringAsync(fileUri);
        if (fileContent && fileContent.length > 0) {
          setContent(fileContent);
        } else {
          setError(`Unable to display ${fileType} files directly. The file may be in a binary format. Please use a compatible app to view this file.`);
        }
      } catch {
        setError(`Unable to display ${fileType} files directly. Please use a compatible app to view this file.`);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading file:', err);
      setError('Failed to load file content.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading file...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
        <Text style={styles.errorTitle}>Unable to Display File</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>Back to Files</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Image viewer
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
    return (
      <View style={styles.imageContainer}>
        <ScrollView
          contentContainerStyle={styles.imageScrollContent}
          minimumZoomScale={1}
          maximumZoomScale={5}
        >
          <Image
            source={{ uri: fileUri }}
            style={styles.image}
            contentFit="contain"
          />
        </ScrollView>
      </View>
    );
  }

  // PDF viewer - use iframe for web, WebView for mobile
  if (fileExt === 'pdf') {
    // Handle both file:// URIs and data: URIs
    const pdfUri = content.startsWith('data:') || content.startsWith('file:') 
      ? content 
      : `file://${content}`;
    
    // For web platform, use embed/iframe instead of WebView
    if (Platform.OS === 'web') {
      // Use a web-specific approach - render iframe directly
      // react-native-web supports iframe as a web component
      return (
        <View style={styles.pdfContainer}>
          {/* @ts-ignore - web-specific HTML element supported by react-native-web */}
          <iframe
            src={pdfUri}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title={filename}
          />
        </View>
      );
    }
    
    // For iOS/Android, use WebView (only if available)
    if (!WebView) {
      setError('PDF viewer is not available on this platform. Please use an external PDF viewer.');
      setLoading(false);
      return null;
    }
    
    // Additional safety check for iOS
    if (Platform.OS === 'ios' && !pdfUri.startsWith('data:')) {
      setError('PDF URI format not supported on iOS. Please try a different file.');
      setLoading(false);
      return null;
    }
    
    return (
      <View style={styles.pdfContainer}>
        <WebView
          source={{ uri: pdfUri }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          // iOS-specific props
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          // iOS crash prevention - disable dangerous features
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          // Error handling
          onError={(syntheticEvent: any) => {
            try {
              const { nativeEvent } = syntheticEvent;
              console.error('[FileViewer] WebView error:', nativeEvent);
              setError('Failed to display PDF. The file may be too large, corrupted, or unsupported. On iOS, try using an external PDF viewer app.');
              setLoading(false);
            } catch (err) {
              console.error('[FileViewer] Error handling WebView error:', err);
              setError('PDF viewer encountered an error. Please try opening the file in an external PDF viewer.');
              setLoading(false);
            }
          }}
          onHttpError={(syntheticEvent: any) => {
            try {
              const { nativeEvent } = syntheticEvent;
              console.error('[FileViewer] WebView HTTP error:', nativeEvent);
              setError('Failed to load PDF. HTTP error occurred.');
              setLoading(false);
            } catch (err) {
              console.error('[FileViewer] Error handling HTTP error:', err);
              setLoading(false);
            }
          }}
          onLoadEnd={() => {
            console.log('[FileViewer] PDF loaded successfully');
            setLoading(false);
          }}
          onLoadStart={() => {
            console.log('[FileViewer] PDF loading started');
            setLoading(true);
          }}
          onMessage={(event: any) => {
            try {
              if (event?.nativeEvent?.data) {
                console.log('[FileViewer] WebView message:', event.nativeEvent.data);
              }
            } catch (err) {
              console.error('[FileViewer] Error handling WebView message:', err);
            }
          }}
          // iOS crash prevention
          onShouldStartLoadWithRequest={(request: any) => {
            try {
              // Only allow data URIs and file URIs
              const url = request?.url || '';
              const allowed = url.startsWith('data:') || url.startsWith('file:');
              if (!allowed) {
                console.warn('[FileViewer] Blocked navigation to:', url);
              }
              return allowed;
            } catch (err) {
              console.error('[FileViewer] Error in onShouldStartLoadWithRequest:', err);
              return false;
            }
          }}
        />
      </View>
    );
  }

  // Text viewer
  return (
    <View style={styles.textContainer}>
      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text style={styles.textContentText}>{content}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pdfContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webView: {
    flex: 1,
  },
  textContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  textScroll: {
    flex: 1,
  },
  textContent: {
    padding: 16,
  },
  textContentText: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'monospace',
  },
});

