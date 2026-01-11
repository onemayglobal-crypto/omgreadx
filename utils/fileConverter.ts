import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { getFileExtension } from './fileUtils';

export type FileType = 'pdf' | 'docx' | 'txt' | 'image' | 'unsupported';

/**
 * Detect file type by extension
 */
export function detectFileType(filename: string): FileType {
  const ext = getFileExtension(filename);
  
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (['txt', 'md', 'json', 'xml', 'html', 'htm', 'csv'].includes(ext)) return 'txt';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  
  return 'unsupported';
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
      throw new Error(`Unsupported file type: ${type}`);
  }
}

/**
 * Extract text from PDF using pdfjs-dist (for text PDFs)
 * Falls back to suggesting OCR for scanned PDFs
 */
async function extractTextFromPDF(fileUri: string): Promise<string> {
  // On mobile, try to use pdf-parse as a fallback
  if (Platform.OS !== 'web') {
    try {
      console.log('[FileConverter] Attempting PDF extraction on mobile using pdf-parse...');
      const pdfParse = (await import('pdf-parse')).default;
      
      // Read file as buffer
      let fileBuffer: Buffer;
      try {
        const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: 'base64',
        } as any);
        fileBuffer = Buffer.from(fileBase64, 'base64');
      } catch (readError: any) {
        throw new Error(`Failed to read PDF file: ${readError.message || 'Unknown error'}`);
      }
      
      const data = await pdfParse(fileBuffer);
      const extractedText = data.text.trim();
      
      if (!extractedText || extractedText.length < 50) {
        throw new Error('PDF appears to be scanned with no extractable text. Please convert to DOCX or TXT format.');
      }
      
      console.log(`[FileConverter] Successfully extracted ${extractedText.length} characters from PDF on mobile`);
      return extractedText;
    } catch (mobileError: any) {
      console.error('[FileConverter] Mobile PDF extraction failed:', mobileError);
      throw new Error(`PDF text extraction is not available on mobile: ${mobileError.message || 'Unknown error'}. Please convert PDF to DOCX or TXT format.`);
    }
  }
  
  try {
    console.log('[FileConverter] Extracting text from PDF using pdfjs-dist...');
    const pdfjsLib = await import('pdfjs-dist');
    
    // Configure worker for web
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    // Load PDF file
    let pdfData: ArrayBuffer;
    
    // Check if it's a data URI (base64 encoded)
    if (fileUri.startsWith('data:application/pdf;base64,')) {
      console.log('[FileConverter] Detected base64 data URI for PDF');
      const base64Data = fileUri.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      pdfData = bytes.buffer;
    } else if (fileUri.startsWith('data:')) {
      // Generic data URI - try to extract base64
      console.log('[FileConverter] Detected generic data URI, attempting to extract base64');
      const base64Match = fileUri.match(/data:[^;]*;base64,(.+)/);
      if (base64Match) {
        const base64Data = base64Match[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = bytes.buffer;
      } else {
        throw new Error('Invalid data URI format for PDF');
      }
    } else {
      try {
        const response = await fetch(fileUri);
        pdfData = await response.arrayBuffer();
      } catch {
        // Fallback: read as base64
        const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: 'base64',
        } as any);
        const binaryString = atob(fileBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = bytes.buffer;
      }
    }
    
    // Parse PDF
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfData, 
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    
    console.log(`[FileConverter] Extracting text from ${pdf.numPages} PDF pages...`);
    
    // Extract text from all pages
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    
    const extractedText = fullText.trim();
    
    // Check if we got meaningful text
    if (!extractedText || extractedText.length < 50) {
      throw new Error('PDF appears to be scanned with no extractable text. Please convert to DOCX or TXT format, or use a PDF with selectable text.');
    }
    
    console.log(`[FileConverter] Successfully extracted ${extractedText.length} characters from PDF`);
    return extractedText;
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
    
    // Load file as ArrayBuffer with timeout
    let arrayBuffer: ArrayBuffer;
    try {
      const timeoutDuration = Platform.OS === 'web' ? 30000 : 60000;
      const loadPromise = (async () => {
        // Check if it's a data URI (base64 encoded)
        if (fileUri.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,') ||
            fileUri.startsWith('data:application/msword;base64,')) {
          console.log('[FileConverter] Detected base64 data URI for DOCX');
          const base64Data = fileUri.split(',')[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        } else if (fileUri.startsWith('data:')) {
          // Generic data URI - try to extract base64
          console.log('[FileConverter] Detected generic data URI for DOCX, attempting to extract base64');
          const base64Match = fileUri.match(/data:[^;]*;base64,(.+)/);
          if (base64Match) {
            const base64Data = base64Match[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          } else {
            throw new Error('Invalid data URI format for DOCX');
          }
        } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
          // Mobile: Use FileSystem directly (more reliable)
          const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: 'base64',
          } as any);
          const binaryString = atob(fileBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        } else {
          // Web: Try fetch first
          try {
            const response = await fetch(fileUri);
            return await response.arrayBuffer();
          } catch {
            // Fallback to FileSystem
            const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
              encoding: 'base64',
            } as any);
            const binaryString = atob(fileBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
          }
        }
      })();
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`DOCX file load timeout after ${timeoutDuration / 1000} seconds`)), timeoutDuration)
      );
      
      arrayBuffer = await Promise.race([loadPromise, timeoutPromise]);
    } catch (loadError: any) {
      throw new Error(`Failed to load DOCX file: ${loadError.message || 'Unknown error'}. Please ensure the file is accessible.`);
    }
    
    // Extract text using mammoth with timeout
    // Use convertToMarkdown for better spacing preservation, fallback to extractRawText
    let extractedText = '';
    
    try {
      // Try convertToMarkdown first (preserves spacing better)
      const markdownPromise = mammoth.convertToMarkdown({ arrayBuffer });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DOCX text extraction timeout')), 30000)
      );
      
      const markdownResult = await Promise.race([markdownPromise, timeoutPromise]);
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
      console.warn('[FileConverter] Markdown conversion failed, trying extractRawText...', markdownError);
    }
    
    // Fallback to extractRawText if markdown conversion failed or produced empty result
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
      throw new Error('No text content found in DOCX file');
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
          const text = atob(base64Match[1]);
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
    const readPromise = FileSystem.readAsStringAsync(fileUri);
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
    console.log('[FileConverter] Extracting text from image using OCR...');
    
    // Check platform compatibility
    if (Platform.OS !== 'web') {
      console.warn('[FileConverter] OCR on mobile may be slow or unavailable');
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

