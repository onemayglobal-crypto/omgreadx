import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getFileExtension } from './fileUtils';
import { getFirebaseIdToken } from '@/utils/firebaseAuth';
import { auth, storage } from '@/utils/firebaseConfig';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { base64ToUint8Array, base64ToUtf8String, uint8ArrayToBase64 } from '@/utils/base64';

export type FileType = 'pdf' | 'docx' | 'txt' | 'image' | 'unsupported';

/**
 * Detect file type by extension
 */
export function detectFileType(filename: string): FileType {
  const ext = getFileExtension(filename);
  
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc') return 'unsupported';
  if (ext === 'docx') return 'docx';
  if (['txt', 'md', 'json', 'xml', 'html', 'htm', 'csv'].includes(ext)) return 'txt';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  
  // For any other file format, try to read as text
  return 'txt';
}

/**
 * Convert file to plain text
 * Works with React Native file URIs (not file paths)
 */
export async function convertFileToText(fileUri: string, filename: string): Promise<string> {
  const type = detectFileType(filename);
  
  console.log(`[FileConverter] Converting ${type} file: ${filename}`);
  
  switch (type) {
    case 'pdf': {
      return await extractTextFromPDF(fileUri);
    }
    
    case 'docx': {
      return await extractTextFromDOCX(fileUri);
    }
    
    case 'txt': {
      return await extractTextFromTXT(fileUri);
    }
    
    case 'image': {
      return await extractTextFromImage(fileUri);
    }
    
    default:
      if (type === 'unsupported') {
        throw new Error('DOC files are not supported. Please save as DOCX and try again.');
      }
      // For any unknown file type, try to read as plain text
      console.log(`[FileConverter] Unknown file type "${type}", attempting to read as text...`);
      return await extractTextFromTXT(fileUri);
  }
}

/**
 * Extract text from PDF using backend API
 * Falls back to local extraction if backend is unavailable
 */
async function extractTextFromPDF(fileUri: string): Promise<string> {
  const BACKEND_URL = 'https://readx-backend-740104261370.asia-south1.run.app';
  
  try {
    console.log('[FileConverter] Attempting PDF extraction using backend API...');
    
    // Send PDF to backend API
    const formData = new FormData();
    let tempFileUri: string | null = null;
    let useDirectUri = false;
    
    if (Platform.OS === 'web') {
      // Web: Convert to base64 then to Blob
      let pdfBase64: string;
      
      if (fileUri.startsWith('data:application/pdf;base64,')) {
        console.log('[FileConverter] Detected base64 data URI for PDF');
        pdfBase64 = fileUri.split(',')[1];
      } else if (fileUri.startsWith('data:')) {
        // Generic data URI - try to extract base64
        console.log('[FileConverter] Detected generic data URI, attempting to extract base64');
        const base64Match = fileUri.match(/data:[^;]*;base64,(.+)/);
        if (base64Match) {
          pdfBase64 = base64Match[1];
        } else {
          throw new Error('Invalid data URI format for PDF');
        }
      } else {
        // Try fetch for web
        try {
          const response = await fetch(fileUri);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          pdfBase64 = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
        } catch (fetchError: any) {
          throw new Error(`Failed to read PDF file: ${fetchError.message || 'Unknown error'}`);
        }
      }
      
      // Create Blob from base64
      const bytes = base64ToUint8Array(pdfBase64);
      const blob = new Blob([bytes.buffer as any], { type: 'application/pdf' });
      formData.append('file', blob, 'document.pdf');
    } else {
      // React Native: Use file URI directly if it's a file path, otherwise convert from base64
      if (fileUri.startsWith('data:')) {
        // Data URI: Convert to temp file
        let pdfBase64: string;
        
        if (fileUri.startsWith('data:application/pdf;base64,')) {
          pdfBase64 = fileUri.split(',')[1];
        } else {
          const base64Match = fileUri.match(/data:[^;]*;base64,(.+)/);
          if (base64Match) {
            pdfBase64 = base64Match[1];
          } else {
            throw new Error('Invalid data URI format for PDF');
          }
        }
        
        // Write base64 to temp file
        const tempFileName = `temp_pdf_${Date.now()}.pdf`;
        tempFileUri = `${FileSystem.cacheDirectory}${tempFileName}`;
        
        await FileSystem.writeAsStringAsync(tempFileUri, pdfBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        formData.append('file', {
          uri: tempFileUri,
          type: 'application/pdf',
          name: 'document.pdf',
        } as any);
      } else {
        // File URI: Use directly
        console.log('[FileConverter] Using file URI directly for React Native');
        useDirectUri = true;
        formData.append('file', {
          uri: fileUri,
          type: 'application/pdf',
          name: 'document.pdf',
        } as any);
      }
    }
    
    // Call backend API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    try {
      const idToken = await getFirebaseIdToken();
      const response = await fetch(`${BACKEND_URL}/extract/pdf`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Clean up temp file if created (only temp files, not original file URIs)
      if (tempFileUri && !useDirectUri) {
        try {
          await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('[FileConverter] Failed to cleanup temp file:', cleanupError);
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.error || errorJson.message || errorText;
        } catch {
          // Not JSON, use as-is
        }
        // Include status code in error message for better error handling
        throw new Error(`Backend API error: ${response.status} - ${errorDetails}`);
      }

      // Backend returns metadata: { fileId, pages, method }
      const result = await response.json().catch(async () => {
        const raw = await response.text();
        throw new Error(`Backend returned invalid response. ${raw ? `Response: ${raw}` : ''}`.trim());
      });

      const fileId: string | undefined = result?.fileId;
      if (!fileId) {
        throw new Error('Backend returned invalid response. Missing fileId.');
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error('Please sign in to continue.');
      }

      // Download processed JSON from Firebase Storage (written by backend)
      const processedPath = `users/${uid}/processed/${fileId}.json`;
      const url = await getDownloadURL(storageRef(storage, processedPath));
      const processedResp = await fetch(url);
      if (!processedResp.ok) {
        throw new Error('Failed to download processed content. Please try again.');
      }

      const processedJson = await processedResp.json().catch(() => null);
      const extractedText = typeof processedJson?.text === 'string' ? processedJson.text : '';
      const text = extractedText.trim();

      if (!text) {
        throw new Error('No text detected in this PDF. Please upload a text-based PDF (not images).');
      }

      console.log(`[FileConverter] Successfully extracted ${text.length} characters from PDF via backend+Storage`);
      return text;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Clean up temp file on error (only temp files, not original file URIs)
      if (tempFileUri && !useDirectUri) {
        try {
          await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
        } catch (cleanupError) {
          console.warn('[FileConverter] Failed to cleanup temp file on error:', cleanupError);
        }
      }
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Backend API request timeout after 60 seconds. The file may be too large or the backend is not responding. Please check your connection and try again.');
      }
      
      // If backend fails, throw error (don't fallback to local extraction)
      console.error('[FileConverter] Backend API error:', fetchError);
      
      // Check for network/connection errors
      if (fetchError.message?.includes('Network request failed') || 
          fetchError.message?.includes('Failed to connect') ||
          fetchError.message?.includes('ECONNREFUSED') ||
          fetchError.message?.includes('ENOTFOUND')) {
        throw new Error(`Cannot connect to backend server at ${BACKEND_URL}. Please ensure the backend is running and accessible on your network.`);
      }
      
      throw new Error(`Backend PDF extraction failed: ${fetchError.message || 'Unknown error'}. Please ensure the backend is running at ${BACKEND_URL}`);
    }
  } catch (error: any) {
    console.error('[FileConverter] PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX using mammoth.js
 */
async function extractTextFromDOCX(fileUri: string): Promise<string> {
  try {
    console.log('[FileConverter] Extracting text from DOCX using mammoth...');
    const mammoth = (await import('mammoth')).default;
    
    // Verify file exists first (especially important on mobile)
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo || !fileInfo.exists) {
        console.warn('[FileConverter] File check says it does not exist, but continuing anyway');
      }
    } catch (checkError: any) {
      console.warn('[FileConverter] File check failed, continuing anyway:', checkError.message);
    }
    
    // Load file as ArrayBuffer/base64 with timeout
    let arrayBuffer: ArrayBuffer | null = null;
    let base64Data: string | null = null;
    try {
      const timeoutDuration = Platform.OS === 'web' ? 30000 : 60000;
      const loadPromise = (async () => {
        // Check if it's a data URI (base64 encoded)
        if (fileUri.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,') ||
            fileUri.startsWith('data:application/msword;base64,')) {
          console.log('[FileConverter] Detected base64 data URI for DOCX');
          base64Data = fileUri.split(',')[1];
          return base64ToUint8Array(base64Data).buffer;
        } else if (fileUri.startsWith('data:')) {
          // Generic data URI - try to extract base64
          console.log('[FileConverter] Detected generic data URI for DOCX, attempting to extract base64');
          const base64Match = fileUri.match(/data:[^;]*;base64,(.+)/);
          if (base64Match) {
            base64Data = base64Match[1];
            return base64ToUint8Array(base64Data).buffer;
          } else {
            throw new Error('Invalid data URI format for DOCX');
          }
        } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
          // Mobile: read base64 (stable for local file:// URIs)
          base64Data = await FileSystem.readAsStringAsync(fileUri, {
            encoding: 'base64',
          } as any);
          return base64ToUint8Array(base64Data).buffer;
        } else {
          // Web: Try fetch first
          try {
            const response = await fetch(fileUri);
            return await response.arrayBuffer();
          } catch {
            // Fallback to FileSystem
            base64Data = await FileSystem.readAsStringAsync(fileUri, {
              encoding: 'base64',
            } as any);
            return base64ToUint8Array(base64Data).buffer;
          }
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`DOCX file load timeout after ${timeoutDuration / 1000} seconds`)), timeoutDuration)
      );
      
      arrayBuffer = (await Promise.race([loadPromise, timeoutPromise])) as ArrayBuffer;
    } catch (loadError: any) {
      throw new Error(`Failed to load DOCX file: ${loadError.message || 'Unknown error'}. Please ensure the file is accessible.`);
    }
    
    // Try ZIP XML extraction first (more stable on mobile)
    let extractedText = '';
    try {
      const JSZip = (await import('jszip')).default;
      // On mobile, prefer base64 load (avoids arrayBuffer issues)
      const zip =
        Platform.OS !== 'web' && base64Data
          ? await JSZip.loadAsync(base64Data, { base64: true })
          : await JSZip.loadAsync(arrayBuffer as ArrayBuffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        extractedText = docXml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    } catch (zipError: any) {
      console.warn('[FileConverter] DOCX zip extraction failed:', zipError);
    }

    // If ZIP extraction succeeded, return early (fast path on mobile too).
    if (extractedText.trim().length > 0) {
      console.log(`[FileConverter] Extracted ${extractedText.length} characters from DOCX (zip)`);
      return extractedText;
    }

    // Extract text using mammoth with timeout (web or fallback)
    // Use convertToHtml for better formatting preservation, fallback to extractRawText
    
    try {
      // Try convertToHtml first (preserves formatting better)
      const htmlPromise = mammoth.convertToHtml({ arrayBuffer });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DOCX text extraction timeout')), 30000)
      );
      
      const htmlResult = await Promise.race([htmlPromise, timeoutPromise]);
      if (htmlResult.value && htmlResult.value.trim().length > 0) {
        // Convert HTML to plain text while preserving spacing
        extractedText = htmlResult.value
          // Remove HTML tags
          .replace(/<[^>]+>/g, ' ')
          // Replace HTML entities
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          // Remove forward slashes and backslashes
          .replace(/\//g, ' ')
          .replace(/\\/g, ' ')
          // Normalize whitespace: preserve line breaks, but normalize spaces within lines
          .split('\n')
          .map((line: string) => line.trim().replace(/\s+/g, ' '))
          .join('\n')
          .trim();
      }
    } catch (htmlError) {
      console.warn('[FileConverter] HTML conversion failed, trying extractRawText...', htmlError);
    }
    
    // Fallback to extractRawText if HTML conversion failed or produced empty result
    if (!extractedText || extractedText.trim().length === 0) {
      const extractPromise = mammoth.extractRawText({ arrayBuffer });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DOCX text extraction timeout')), 30000)
      );
      
      const result = await Promise.race([extractPromise, timeoutPromise]);
      extractedText = result.value || '';
      
      // Normalize whitespace in raw text extraction
      if (extractedText) {
        extractedText = extractedText
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
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text content found in DOCX file. Please save as DOCX (not DOC) and try again.');
    }
    
    console.log(`[FileConverter] Successfully extracted ${extractedText.length} characters from DOCX`);
    return extractedText;
  } catch (error: any) {
    console.error('[FileConverter] DOCX extraction error:', error);
    throw new Error(`DOCX extraction failed: ${error.message || 'Unknown error'}. Please ensure the file is not corrupted.`);
  }
}

/**
 * Extract text from TXT files (direct reading)
 */
async function extractTextFromTXT(fileUri: string): Promise<string> {
  try {
    console.log('[FileConverter] Reading text file...');
    console.log('[FileConverter] File URI:', fileUri.substring(0, 100));
    
    // Check if it's an AsyncStorage URI (fallback when FileSystem unavailable)
    if (fileUri.startsWith('asyncstorage://')) {
      console.log('[FileConverter] Detected AsyncStorage URI, reading from AsyncStorage...');
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const storageKey = fileUri.replace('asyncstorage://', '');
        const text = await AsyncStorage.getItem(storageKey);
        
        if (!text) {
          throw new Error('Text not found in AsyncStorage');
        }
        
        console.log(`[FileConverter] Extracted ${text.length} characters from AsyncStorage`);
        return text;
      } catch (asyncError: any) {
        console.error('[FileConverter] Error reading from AsyncStorage:', asyncError);
        throw new Error(`Failed to read from AsyncStorage: ${asyncError.message}`);
      }
    }
    
    // Check if it's a data URI (for web or when FileSystem is unavailable)
    if (fileUri.startsWith('data:text/plain') || fileUri.startsWith('data:')) {
      console.log('[FileConverter] Detected data URI, extracting text...');
      try {
        // Extract text from data URI
        const base64Match = fileUri.match(/data:text\/plain[^,]*base64,(.+)/);
        if (base64Match) {
          // Base64 encoded
          const text = base64ToUtf8String(base64Match[1]);
          console.log(`[FileConverter] Extracted ${text.length} characters from base64 data URI`);
          return text;
        } else {
          // URL encoded
          const textMatch = fileUri.match(/data:text\/plain[^,]*,(.+)/);
          if (textMatch) {
            const text = decodeURIComponent(textMatch[1]);
            console.log(`[FileConverter] Extracted ${text.length} characters from URL-encoded data URI`);
            return text;
          }
        }
      } catch (dataError: any) {
        console.error('[FileConverter] Error extracting from data URI:', dataError);
        throw new Error(`Failed to extract text from data URI: ${dataError.message}`);
      }
    }
    
    // Verify file exists first (especially important on mobile)
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo || !fileInfo.exists) {
        console.warn('[FileConverter] File check says it does not exist, but continuing anyway');
        // Continue - file might still be accessible from cache
      }
    } catch (checkError: any) {
      console.warn('[FileConverter] File check failed, continuing anyway:', checkError.message);
      // Continue anyway - file might still be accessible
    }
    
    // Add timeout for file reading (longer timeout on mobile)
    const timeoutDuration = Platform.OS === 'web' ? 30000 : 60000;
    const readPromise = (async () => {
      if (Platform.OS === 'web') {
        const resp = await fetch(fileUri);
        if (resp.ok) {
          return await resp.text();
        }
      }
      return await FileSystem.readAsStringAsync(fileUri);
    })();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`File read timeout after ${timeoutDuration / 1000} seconds`)), timeoutDuration)
    );
    
    const textContent = await Promise.race([readPromise, timeoutPromise]);
    
    if (!textContent || textContent.trim().length === 0) {
      throw new Error('File is empty or contains no readable content');
    }
    
    console.log(`[FileConverter] Successfully read ${textContent.length} characters from text file`);
    return textContent;
  } catch (error: any) {
    console.error('[FileConverter] Text file read error:', error);
    const errorMessage = error.message || 'Unknown error';
    throw new Error(`Text file read failed: ${errorMessage}. Please ensure the file is accessible and not corrupted.`);
  }
}

/**
 * Extract text from images using Tesseract.js OCR
 */
async function extractTextFromImage(fileUri: string): Promise<string> {
  try {
    console.log('[FileConverter] Extracting text from image');
    
    // Check platform compatibility
    if (Platform.OS !== 'web') {
      console.warn('[FileConverter] file conversion on mobile may be slow or unavailable');
    }
    
    const tesseract = await import('tesseract.js');
    const worker = await tesseract.createWorker('eng');
    
    // Load image
    let imageSource: any = fileUri;
    try {
      if (Platform.OS === 'web') {
        // On web, try to fetch as ArrayBuffer
        try {
          const response = await fetch(fileUri);
          const blob = await response.blob();
          imageSource = await blob.arrayBuffer();
        } catch {
          imageSource = fileUri;
        }
      }
    } catch (loadError) {
      console.warn('[FileConverter] Using image URI directly');
      imageSource = fileUri;
    }
    
    // Perform OCR
    console.log('[FileConverter] Performing OCR recognition...');
    const result = await worker.recognize(imageSource);
    await worker.terminate();
    
    const { text, confidence } = result.data;
    const extractedText = text.trim();
    
    if (!extractedText || extractedText.length === 0) {
      throw new Error('No text found in image. The image may not contain readable text.');
    }
    
    if (confidence < 60) {
      console.warn(`[FileConverter] Low OCR confidence (${confidence}%) - text may contain errors`);
    }
    
    console.log(`[FileConverter] Successfully extracted ${extractedText.length} characters from image (confidence: ${confidence}%)`);
    return extractedText;
  } catch (error: any) {
    console.error('[FileConverter] OCR extraction error:', error);
    
    if (Platform.OS !== 'web') {
      throw new Error(`OCR is not fully supported on mobile. Please convert the image to text or use a text-based file. Error: ${error.message || 'Unknown error'}`);
    }
    
    throw new Error(`OCR extraction failed: ${error.message || 'Unknown error'}. Make sure the image contains clear, readable text.`);
  }
}

