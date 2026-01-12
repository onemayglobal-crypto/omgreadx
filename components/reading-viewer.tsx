import { saveReadingSession, getFileReadingProgress, saveReadingProgress, markFileAsCompleted } from '@/utils/readingStorage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { EyeTrackingService, GazePoint } from '@/utils/eyeTrackingService';
import { TextLineMapper, LineBounds } from '@/utils/textLineMapper';
import { ReadingProgressTracker, ReadingProgress } from '@/utils/readingProgressTracker';
import EyeTrackingCamera from '@/components/eyeTrackingCamera';
import EyeTrackingServiceComponent from '@/components/EyeTrackingServiceComponent';

interface ReadingViewerProps {
  fileUri: string;
  filename: string;
  onClose?: () => void;
  onComplete?: (stats: ReadingStats) => void;
}

interface ReadingStats {
  totalWords: number;
  totalParagraphs: number;
  completedParagraphs: number;
  readingTime: number;
  completionPercentage: number;
}

interface Paragraph {
  id: number;
  text: string;
  wordCount: number;
  isCompleted: boolean;
  readingStartTime?: number;
  readingDuration?: number;
  lines?: LineReadingState[];
  currentLineIndex?: number;
}

interface LineReadingState {
  lineIndex: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  gazePoints: Array<{ x: number; y: number; timestamp: number }>;
  startTime: number;
  isComplete: boolean;
  completionPercentage: number;
}

type TextSize = 'small' | 'medium' | 'large';

export default function ReadingViewer({ fileUri, filename, onClose, onComplete }: ReadingViewerProps) {
  const { theme, toggleTheme } = useTheme();
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>('medium');
  const [readingStats, setReadingStats] = useState<ReadingStats>({
    totalWords: 0,
    totalParagraphs: 0,
    completedParagraphs: 0,
    readingTime: 0,
    completionPercentage: 0,
  });
  const [startTime] = useState(Date.now());
  // Use a stable id per viewer instance so periodic saves update (not append).
  const sessionIdRef = useRef<string>(`${filename}-${Date.now()}`);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const paragraphPositions = useRef<Map<number, number>>(new Map());
  const readingCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const [eyeTrackingEnabled, setEyeTrackingEnabled] = useState(true);
  const paragraphTextRefs = useRef<Map<number, { x: number; y: number; width: number; height: number }>>(new Map());
  const gazeHistory = useRef<GazePoint[]>([]);
  const completionTriggeredRef = useRef(false);
  const eyeTrackingService = useRef<EyeTrackingService | null>(null);
  const progressTrackers = useRef<Map<number, ReadingProgressTracker>>(new Map());
  
  const isDark = theme === 'dark';

  useEffect(() => {
    loadAndParseFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUri, filename]);

  // Initialize line bounds for paragraphs when they're loaded or text size changes
  useEffect(() => {
    if (paragraphs.length === 0) return;

    const screenData = Dimensions.get('window');
    const fontSize = textSize === 'small' ? 16 : textSize === 'medium' ? 20 : 24;
    const lineHeight = textSize === 'small' ? 28 : textSize === 'medium' ? 36 : 42;
    const containerWidth = screenData.width - 40;

    setParagraphs(prev => prev.map(para => {
      if (para.lines && para.lines.length > 0) return para; // Already initialized

      const textBounds = paragraphTextRefs.current.get(para.id);
      if (!textBounds) return para;

      // Use TextLineMapper to calculate line bounds
      const textMapper = new TextLineMapper({
        fontSize,
        lineHeight,
        containerWidth: textBounds.width,
        containerX: textBounds.x,
        containerY: textBounds.y,
        padding: 24,
      });

      const lineBounds = textMapper.mapTextToLines(para.text);

      const lines: LineReadingState[] = lineBounds.map((bounds, index) => ({
        lineIndex: index,
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        gazePoints: [],
        startTime: Date.now(),
        isComplete: false,
        completionPercentage: 0,
      }));

      return {
        ...para,
        lines,
        currentLineIndex: 0,
      };
    }));
  }, [paragraphs.length, textSize]);

  // Initialize eye-tracking service
  useEffect(() => {
    const initEyeTracking = async () => {
      if (!eyeTrackingService.current) {
        eyeTrackingService.current = new EyeTrackingService({
          useWebcam: true,
          useTobii: false,
          fallbackToSimulation: true,
        });
        await eyeTrackingService.current.initialize();
      }
    };
    
    if (eyeTrackingEnabled) {
      initEyeTracking();
    }

    return () => {
      if (eyeTrackingService.current) {
        eyeTrackingService.current.stopTracking();
      }
    };
  }, [eyeTrackingEnabled]);

  // Define markParagraphComplete before handleGazeDetected
  const markParagraphComplete = useCallback((index: number) => {
    setParagraphs(prev => {
      const updated = [...prev];
      if (updated[index] && !updated[index].isCompleted) {
        updated[index] = {
          ...updated[index],
          isCompleted: true,
          readingDuration: updated[index].readingStartTime
            ? Date.now() - updated[index].readingStartTime
            : undefined,
        };
        
        // Check if all paragraphs are now complete
        const allComplete = updated.every(p => p.isCompleted);
        const completedCount = updated.filter(p => p.isCompleted).length;
        console.log(`Paragraph ${index + 1} marked complete. Progress: ${completedCount}/${updated.length} paragraphs`);
        
        if (allComplete && onComplete && !completionTriggeredRef.current) {
          completionTriggeredRef.current = true;
          console.log('All paragraphs complete! Triggering completion callback...');
          // Use setTimeout to ensure state is updated
          setTimeout(() => {
            const finalStats = {
              totalWords: updated.reduce((sum, p) => sum + (p.isCompleted ? p.wordCount : 0), 0),
              totalParagraphs: updated.length,
              completedParagraphs: completedCount,
              readingTime: Math.floor((Date.now() - startTime) / 1000),
              completionPercentage: 100,
            };
            console.log('Final stats:', finalStats);
            onComplete(finalStats);
          }, 300);
        }
      }
      return updated;
    });
  }, [onComplete, startTime]);

  // Handle gaze detection
  const handleGazeDetected = useCallback((gaze: GazePoint) => {
    if (!eyeTrackingEnabled || paragraphs.length === 0) return;

    const currentPara = paragraphs[currentParagraphIndex];
    if (!currentPara || currentPara.isCompleted) return;

    // Get or create progress tracker for current paragraph
    let tracker = progressTrackers.current.get(currentParagraphIndex);
    if (!tracker) {
      const textBounds = paragraphTextRefs.current.get(currentPara.id);
      if (!textBounds) return;

      const screenData = Dimensions.get('window');
      const fontSize = textSize === 'small' ? 16 : textSize === 'medium' ? 20 : 24;
      const lineHeight = textSize === 'small' ? 28 : textSize === 'medium' ? 36 : 42;

      const textMapper = new TextLineMapper({
        fontSize,
        lineHeight,
        containerWidth: textBounds.width,
        containerX: textBounds.x,
        containerY: textBounds.y,
        padding: 24,
      });

      tracker = new ReadingProgressTracker(textMapper);
      tracker.initializeLines(currentPara.text, textBounds.x, textBounds.y);
      progressTrackers.current.set(currentParagraphIndex, tracker);
    }

    // Process gaze and track left-to-right movement
    const progress = tracker.processGaze(gaze);
    const currentLine = tracker.getCurrentLine();

    // Check if current line is complete (gaze passed right boundary)
    if (currentLine && currentLine.isComplete) {
      // Line completed - advance to next line
      const hasAdvanced = tracker.advanceToNextLine();
      
      if (!hasAdvanced) {
        // All lines in paragraph complete - mark paragraph as complete
        markParagraphComplete(currentParagraphIndex);
        
        // Auto-advance to next paragraph
        if (currentParagraphIndex < paragraphs.length - 1) {
          setTimeout(() => {
            const nextIndex = currentParagraphIndex + 1;
            setCurrentParagraphIndex(nextIndex);
            
            setTimeout(() => {
              const nextPosition = paragraphPositions.current.get(nextIndex);
              if (nextPosition !== undefined) {
                scrollViewRef.current?.scrollTo({
                  y: nextPosition - 20,
                  animated: true,
                });
              } else {
                scrollViewRef.current?.scrollTo({
                  y: nextIndex * 350,
                  animated: true,
                });
              }
            }, 100);
          }, 500);
        } else {
          // Last paragraph - completion handled by markParagraphComplete
          console.log('Last line of last paragraph completed - checking for full completion...');
        }
      } else {
        // Advanced to next line - log progress
        const nextLine = tracker.getCurrentLine();
        if (nextLine) {
          console.log(`Line ${nextLine.lineIndex + 1} - Reading progress: ${Math.round(nextLine.completionPercentage)}%`);
        }
      }
    }
  }, [
    eyeTrackingEnabled,
    paragraphs,
    currentParagraphIndex,
    startTime,
    onComplete,
    markParagraphComplete,
  ]);

  // Save progress periodically and when component unmounts
  useEffect(() => {
    if (paragraphs.length > 0 && currentParagraphIndex >= 0) {
      const saveProgress = async () => {
        try {
          const completedIndices = paragraphs
            .map((p, idx) => p.isCompleted ? idx : -1)
            .filter(idx => idx >= 0);
          
          await saveReadingProgress({
            filename: filename,
            fileUri: fileUri,
            currentParagraphIndex: currentParagraphIndex,
            completedParagraphs: completedIndices,
            lastUpdated: new Date(),
            totalParagraphs: paragraphs.length,
          });
        } catch (error) {
          console.error('Error saving reading progress:', error);
        }
      };

      // Save progress after a delay to avoid too frequent saves
      const timeoutId = setTimeout(saveProgress, 2000);
      
      return () => {
        clearTimeout(timeoutId);
        // Save on unmount
        saveProgress();
      };
    }
  }, [currentParagraphIndex, paragraphs, filename, fileUri]);

  // Save reading session when a paragraph is completed or periodically (every 60 seconds)
  const lastSessionSaveTime = useRef<number>(0);
  const lastCompletedCount = useRef<number>(0);
  
  const saveSessionIfNeeded = useCallback(async () => {
    try {
      const completedParagraphs = paragraphs.filter(p => p.isCompleted).length;
      const wordsRead = paragraphs
        .filter(p => p.isCompleted)
        .reduce((sum, p) => sum + p.wordCount, 0);
      const currentTime = Date.now();
      const readingTime = Math.floor((currentTime - startTime) / 1000);
      
      // Save session if:
      // 1. A new paragraph was completed, OR
      // 2. At least 60 seconds have passed since last save AND there's some progress
      const timeSinceLastSave = (currentTime - lastSessionSaveTime.current) / 1000;
      const hasNewCompletion = completedParagraphs > lastCompletedCount.current;
      const shouldSavePeriodically = timeSinceLastSave >= 60 && (completedParagraphs > 0 || readingTime >= 60);
      
      if (hasNewCompletion || shouldSavePeriodically) {
        await saveReadingSession({
          id: sessionIdRef.current,
          filename: filename,
          totalParagraphs: paragraphs.length,
          completedParagraphs: completedParagraphs,
          totalWords: wordsRead,
          readingTime: readingTime,
          completionPercentage: paragraphs.length > 0
            ? Math.round((completedParagraphs / paragraphs.length) * 100)
            : 0,
          date: new Date(),
        });
        lastSessionSaveTime.current = currentTime;
        lastCompletedCount.current = completedParagraphs;
        console.log('Reading session saved');
      }
    } catch (error) {
      console.error('Error saving reading session:', error);
    }
  }, [paragraphs, filename, startTime]);

  // Save session periodically
  useEffect(() => {
    if (paragraphs.length > 0) {
      const sessionInterval = setInterval(() => {
        saveSessionIfNeeded();
      }, 60000); // Check every 60 seconds

      return () => clearInterval(sessionInterval);
    }
  }, [paragraphs.length, saveSessionIfNeeded]);

  // Save session when paragraphs change and check for completion
  useEffect(() => {
    if (paragraphs.length > 0) {
      const completedCount = paragraphs.filter(p => p.isCompleted).length;
      const allComplete = completedCount === paragraphs.length && paragraphs.length > 0;
      
      // Save session if a new paragraph was completed
      if (completedCount > lastCompletedCount.current) {
        setTimeout(() => {
          saveSessionIfNeeded();
        }, 1000); // Wait a bit for state to settle
      }
      
      // Check if all paragraphs are complete and trigger completion callback
      if (allComplete && onComplete && !completionTriggeredRef.current) {
        completionTriggeredRef.current = true;
        setTimeout(() => {
          const finalStats = {
            totalWords: paragraphs.reduce((sum, p) => sum + (p.isCompleted ? p.wordCount : 0), 0),
            totalParagraphs: paragraphs.length,
            completedParagraphs: completedCount,
            readingTime: Math.floor((Date.now() - startTime) / 1000),
            completionPercentage: 100,
          };
          onComplete(finalStats);
        }, 500);
      }
    }
  }, [paragraphs, saveSessionIfNeeded, onComplete, startTime]);

  // Save session when component unmounts
  useEffect(() => {
    return () => {
      if (paragraphs.length > 0) {
        saveSessionIfNeeded();
      }
    };
  }, [paragraphs.length, saveSessionIfNeeded]);

  // Wrapper for onClose that saves session before closing
  const handleClose = async () => {
    if (paragraphs.length > 0) {
      await saveSessionIfNeeded();
    }
    if (onClose) {
      onClose();
    }
  };

  const updateStats = useCallback(() => {
    // Calculate words read from completed paragraphs only
    const wordsRead = paragraphs
      .filter(p => p.isCompleted)
      .reduce((sum, p) => sum + p.wordCount, 0);
    const totalWords = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);
    const completedParagraphs = paragraphs.filter(p => p.isCompleted).length;
    const readingTime = Math.floor((Date.now() - startTime) / 1000);
    const completionPercentage = paragraphs.length > 0
      ? Math.round((completedParagraphs / paragraphs.length) * 100)
      : 0;

    setReadingStats({
      totalWords: wordsRead, // Show words actually read, not total words
      totalParagraphs: paragraphs.length,
      completedParagraphs,
      readingTime,
      completionPercentage,
    });
  }, [paragraphs, startTime]);

  useEffect(() => {
    updateStats();
  }, [updateStats]);

  // Update stats periodically to show real-time reading time
  useEffect(() => {
    if (paragraphs.length > 0) {
      const interval = setInterval(() => {
        updateStats();
      }, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [paragraphs.length, updateStats]);

  const loadAndParseFile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[ReadingViewer] Loading file for reading:', filename, 'URI:', fileUri);
      
      // Validate file URI
      if (!fileUri || fileUri.trim() === '') {
        throw new Error('Invalid file URI');
      }

      // Verify file exists (non-blocking - just log warnings)
      // Don't block loading - try to load anyway and show error if it fails
      if (!fileUri.startsWith('asyncstorage://') && !fileUri.startsWith('data:')) {
        try {
          const FileSystem = await import('expo-file-system/legacy');
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          
          if (!fileInfo || !fileInfo.exists) {
            console.warn('[ReadingViewer] File does not exist at URI, but continuing anyway:', fileUri);
            // Don't throw - try to load anyway, might still work
          } else {
            console.log('[ReadingViewer] File verified, exists');
          }
        } catch (verifyError: any) {
          // Verification failed, but continue anyway
          // File might still be accessible (e.g., DocumentPicker URIs, web files)
          console.warn('[ReadingViewer] Could not verify file, but continuing:', verifyError.message);
        }
      }

      // Load previous reading progress
      let savedProgress = null;
      try {
        savedProgress = await getFileReadingProgress(filename, fileUri);
        if (savedProgress) {
          console.log('[ReadingViewer] Found saved progress:', savedProgress);
        }
      } catch (progressError) {
        console.warn('[ReadingViewer] Could not load saved progress:', progressError);
      }

      // Validate file format before attempting conversion
      const { getFileExtension } = await import('@/utils/fileUtils');
      const fileExt = getFileExtension(filename).toLowerCase();
      const supportedFormats = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
      
      if (!supportedFormats.includes(fileExt)) {
        const ext = fileExt.toUpperCase() || 'Unknown';
        setError(`Unsupported file format: "${ext}".\n\nSupported formats: PDF, DOC, DOCX, TXT, RTF only.\n\nPlease upload a file in one of these formats.`);
        setLoading(false);
        return;
      }

      // Use the centralized file converter utility
      const { convertFileToText, detectFileType } = await import('@/utils/fileConverter');
      
      const fileType = detectFileType(filename);
      console.log(`[ReadingViewer] Detected file type: ${fileType}`);
      
      // Convert file to text using the utility with timeout
      let textContent: string;
      try {
        // Add overall timeout for file conversion (important for mobile)
        const conversionPromise = convertFileToText(fileUri, filename);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('File conversion timeout - the file may be too large or corrupted')), 60000)
        );
        
        textContent = await Promise.race([conversionPromise, timeoutPromise]);
        
        if (!textContent || textContent.trim().length === 0) {
          throw new Error('No text content extracted from file. The file may be empty or contain only images.');
        }
      } catch (conversionError: any) {
        console.error('[ReadingViewer] File conversion error:', conversionError);
        const errorMessage = conversionError?.message || 'Failed to extract text from file';
        
        // Check if it's a backend API error with 500 status (PDF extraction failed)
        if (errorMessage.includes('Backend API error: 500') || 
            (errorMessage.includes('Backend API error') && errorMessage.includes('PDF extraction failed'))) {
          // Show user-friendly format error message
          setError('This file format is not supported. Upload a correct PDF format without images.');
        } else if (errorMessage.includes('Backend API request timeout') ||
                   errorMessage.includes('Cannot connect to backend server') ||
                   (errorMessage.includes('Backend PDF extraction failed') && !errorMessage.includes('500'))) {
          // Show backend connection error for timeouts and connection issues
          setError(`Backend connection failed.\n\n${errorMessage}\n\nPlease ensure:\n• The backend server is running at https://readx-backend-360873415676.asia-south1.run.app\n• Your device has internet connectivity\n• The backend service is accessible`);
        } else if (errorMessage.includes('Unsupported file format') || errorMessage.includes('format is not supported')) {
          // Format validation error (already handled)
          setError(errorMessage);
        } else {
          // Other file reading errors
          setError(`File reading error: ${errorMessage}. Please ensure the file is not corrupted and try again.`);
        }
        setLoading(false);
        return;
      }

      // Parse text into paragraphs
      try {
        const parsedParagraphs = parseTextIntoParagraphs(textContent);
        if (parsedParagraphs.length === 0) {
          setError('No readable paragraphs found in the file. The file may be empty or improperly formatted.');
          setLoading(false);
          return;
        }
        
        // Restore saved progress if available
        if (savedProgress && savedProgress.totalParagraphs === parsedParagraphs.length) {
          console.log('[ReadingViewer] Restoring saved progress...');
          // Mark completed paragraphs
          savedProgress.completedParagraphs.forEach((idx: number) => {
            if (idx >= 0 && idx < parsedParagraphs.length) {
              parsedParagraphs[idx].isCompleted = true;
            }
          });
          // Set current paragraph index
          const resumeIndex = Math.min(savedProgress.currentParagraphIndex, parsedParagraphs.length - 1);
          setCurrentParagraphIndex(resumeIndex);
          console.log(`[ReadingViewer] Resuming from paragraph ${resumeIndex + 1}`);
        }
        
        setParagraphs(parsedParagraphs);
        console.log(`[ReadingViewer] Successfully parsed ${parsedParagraphs.length} paragraphs`);
        setLoading(false);
        
        // Scroll to current paragraph after a short delay
        if (savedProgress && savedProgress.currentParagraphIndex >= 0) {
          setTimeout(() => {
            scrollViewRef.current?.scrollTo({
              y: savedProgress!.currentParagraphIndex * 300,
              animated: true,
            });
          }, 300);
        }
      } catch (parseError: any) {
        console.error('[ReadingViewer] Error parsing paragraphs:', parseError);
        setError(`Failed to parse file content: ${parseError.message || 'Unknown error'}`);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error loading file:', err);
      setError(`Failed to load file: ${err.message || 'Unknown error'}. Please try again or check if the file is accessible.`);
      setLoading(false);
    }
  };

  const parseTextIntoParagraphs = (text: string): Paragraph[] => {
    // Get screen dimensions
    const screenData = Dimensions.get('window');
    const screenHeight = screenData.height;
    
    // Calculate available height for text
    // Header: ~80px, Progress bar: ~8px, Padding: 40px (20px top + 20px bottom)
    // Container padding: 48px (24px top + 24px bottom)
    const headerHeight = 80;
    const progressBarHeight = 8;
    const scrollPadding = 40; // 20px top + 20px bottom
    const containerPadding = 48; // 24px top + 24px bottom
    const availableHeight = screenHeight - headerHeight - progressBarHeight - scrollPadding - containerPadding;
    
    // Text styling constants (matching currentParagraphText for active paragraph)
    const fontSize = 24;
    const lineHeight = 42;
    const containerPaddingHorizontal = 24; // Left + right padding
    const estimatedContainerWidth = screenData.width - scrollPadding - containerPaddingHorizontal;
    
    // Calculate lines per screen
    const linesPerScreen = Math.floor(availableHeight / lineHeight);
    
    // Estimate characters per line (average character width ~12px for serif font at 24px)
    const avgCharWidth = 12;
    const charsPerLine = Math.floor(estimatedContainerWidth / avgCharWidth);
    
    // Estimate words per screen (average word length ~5 characters + 1 space)
    const avgWordLength = 5;
    const wordsPerLine = Math.floor(charsPerLine / (avgWordLength + 1));
    const estimatedWordsPerScreen = linesPerScreen * wordsPerLine;
    
    // Split text into words
    const allWords = text.split(/\s+/).filter(w => w.length > 0);
    
    // Split into screen-sized chunks
    const processedParagraphs: Paragraph[] = [];
    let globalIndex = 0;
    let currentChunk: string[] = [];
    let currentChunkWordCount = 0;
    
    for (const word of allWords) {
      currentChunk.push(word);
      currentChunkWordCount++;
      
      // If we've reached approximately one screen worth of words, create a paragraph
      // Use 90% of estimated to ensure it fits comfortably
      if (currentChunkWordCount >= Math.floor(estimatedWordsPerScreen * 0.9)) {
        const chunkText = currentChunk.join(' ');
        processedParagraphs.push({
          id: globalIndex++,
          text: chunkText,
          wordCount: currentChunkWordCount,
          isCompleted: false,
        });
        
        // Reset for next chunk
        currentChunk = [];
        currentChunkWordCount = 0;
      }
    }
    
    // Add any remaining words as the last paragraph
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ');
      processedParagraphs.push({
        id: globalIndex++,
        text: chunkText,
        wordCount: currentChunkWordCount,
        isCompleted: false,
      });
    }
    
    // If no paragraphs were created (empty text), create at least one empty paragraph
    if (processedParagraphs.length === 0) {
      processedParagraphs.push({
        id: 0,
        text: text.trim() || ' ',
        wordCount: 0,
        isCompleted: false,
      });
    }
    
    return processedParagraphs;
  };

  /**
   * Split a long paragraph into smaller chunks of 45-55 words
   * Splits at full stops (periods) within the target range
   */
  const splitLongParagraph = (text: string): string[] => {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // If paragraph is 55 words or less, return as-is
    if (wordCount <= 55) {
      return [text];
    }

    const result: string[] = [];
    let remainingText = text;

    while (remainingText.trim().length > 0) {
      const remainingWords = remainingText.split(/\s+/).filter(w => w.length > 0);
      
      // If remaining text is 55 words or less, add it and finish
      if (remainingWords.length <= 55) {
        result.push(remainingText.trim());
        break;
      }

      // Split text into sentences (by full stops)
      const sentences: string[] = [];
      let currentSentence = '';
      
      for (let i = 0; i < remainingText.length; i++) {
        const char = remainingText[i];
        currentSentence += char;
        
        // Check for full stop (end of sentence)
        if (char === '.' || char === '。') {
          const nextChar = i + 1 < remainingText.length ? remainingText[i + 1] : '';
          // Check if it's actually the end of a sentence (followed by whitespace or end)
          if (nextChar === ' ' || nextChar === '\n' || nextChar === '\t' || nextChar === '' || nextChar === '\r') {
            sentences.push(currentSentence.trim());
            currentSentence = '';
            i++; // Skip the space after period
          }
        }
      }
      
      // Add any remaining text as a sentence
      if (currentSentence.trim().length > 0) {
        sentences.push(currentSentence.trim());
      }

      // Find the best split point: accumulate sentences until we're in the 45-55 word range
      let accumulatedText = '';
      let accumulatedWordCount = 0;
      let bestSplitText = '';
      let bestWordCount = 0;

      for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/).filter(w => w.length > 0);
        const sentenceWordCount = sentenceWords.length;
        const newWordCount = accumulatedWordCount + sentenceWordCount;
        
        // If adding this sentence keeps us in the target range, it's a candidate
        if (newWordCount >= 45 && newWordCount <= 55) {
          bestSplitText = accumulatedText + sentence;
          bestWordCount = newWordCount;
        }
        
        // If we've exceeded 55, use the last good split point
        if (newWordCount > 55) {
          break;
        }

        accumulatedText += sentence + ' ';
        accumulatedWordCount = newWordCount;
      }

      // If we found a good split point, use it
      if (bestSplitText.length > 0 && bestWordCount >= 45) {
        result.push(bestSplitText.trim());
        // Remove the split portion from remaining text
        const splitLength = bestSplitText.length;
        remainingText = remainingText.substring(splitLength).trim();
      } else {
        // No good split point found - force split at 55 words
        const words = remainingText.split(/\s+/).filter(w => w.length > 0);
        if (words.length > 55) {
          // Try to find a full stop near the 55-word mark (look backwards from 55th word)
          let wordIndex = 0;
          let charIndex = 0;
          
          // Find position of 55th word
          for (let i = 0; i < remainingText.length && wordIndex < 55; i++) {
            if (remainingText[i] === ' ' || remainingText[i] === '\n' || remainingText[i] === '\t') {
              if (i > 0 && /\S/.test(remainingText[i - 1])) {
                wordIndex++;
                if (wordIndex === 55) {
                  charIndex = i;
                  break;
                }
              }
            }
          }

          // Look backwards for a full stop within reasonable distance (up to 200 chars back)
          let splitPos = charIndex;
          for (let j = charIndex; j >= Math.max(0, charIndex - 200); j--) {
            if (remainingText[j] === '.' || remainingText[j] === '。') {
              const nextChar = j + 1 < remainingText.length ? remainingText[j + 1] : '';
              if (nextChar === ' ' || nextChar === '\n' || nextChar === '\t' || nextChar === '' || nextChar === '\r') {
                splitPos = j + 1;
                break;
              }
            }
          }

          const chunk = remainingText.substring(0, splitPos).trim();
          result.push(chunk);
          remainingText = remainingText.substring(splitPos).trim();
        } else {
          result.push(remainingText.trim());
          break;
        }
      }
    }

    return result;
  };

  const handleParagraphFocus = (index: number) => {
    setParagraphs(prev => {
      const updated = [...prev];
      if (updated[index] && !updated[index].readingStartTime) {
        updated[index].readingStartTime = Date.now();
      }
      return updated;
    });
  };

  const jumpToParagraph = (index: number) => {
    if (index >= 0 && index < paragraphs.length) {
      setCurrentParagraphIndex(index);
      // Scroll to paragraph using measured position or fallback
      setTimeout(() => {
        const position = paragraphPositions.current.get(index);
        if (position !== undefined) {
          scrollViewRef.current?.scrollTo({
            y: position - 20, // Offset to show paragraph nicely
            animated: true,
          });
        } else {
          // Fallback: use estimated position
          scrollViewRef.current?.scrollTo({
            y: index * 350,
            animated: true,
          });
        }
      }, 100);
    }
  };

  const handleNextParagraph = async () => {
    // Move to next paragraph (no longer requires completion)
    if (currentParagraphIndex < paragraphs.length - 1) {
      const nextIndex = currentParagraphIndex + 1;
      setCurrentParagraphIndex(nextIndex);
      // Scroll to next paragraph using measured position or fallback
      setTimeout(() => {
        const nextPosition = paragraphPositions.current.get(nextIndex);
        if (nextPosition !== undefined) {
          scrollViewRef.current?.scrollTo({
            y: nextPosition - 20, // Offset to show paragraph nicely
            animated: true,
          });
        } else {
          // Fallback: use estimated position
          scrollViewRef.current?.scrollTo({
            y: nextIndex * 350,
            animated: true,
          });
        }
      }, 100);
    } else {
      // All paragraphs completed - save session
      const finalStats = {
        ...readingStats,
        readingTime: Math.floor((Date.now() - startTime) / 1000),
        completionPercentage: 100,
      };
      
      // Save reading session
      try {
        await saveReadingSession({
          id: sessionIdRef.current,
          filename: filename,
          totalParagraphs: finalStats.totalParagraphs,
          completedParagraphs: finalStats.completedParagraphs,
          totalWords: finalStats.totalWords,
          readingTime: finalStats.readingTime,
          completionPercentage: finalStats.completionPercentage,
          date: new Date(),
        });
        console.log('Reading session saved successfully');
      } catch (error) {
        console.error('Error saving reading session:', error);
      }
      
      if (onComplete) {
        onComplete(finalStats);
      }
    }
  };

  const handleMarkComplete = () => {
    markParagraphComplete(currentParagraphIndex);
    
    // Auto-advance to next paragraph immediately if not the last paragraph
    if (currentParagraphIndex < paragraphs.length - 1) {
      const nextIndex = currentParagraphIndex + 1;
      setCurrentParagraphIndex(nextIndex);
      
      // Scroll to next paragraph using measured position or fallback calculation
      setTimeout(() => {
        const nextPosition = paragraphPositions.current.get(nextIndex);
        if (nextPosition !== undefined) {
          scrollViewRef.current?.scrollTo({
            y: nextPosition - 20, // Offset to show paragraph nicely
            animated: true,
          });
        } else {
          // Fallback: use estimated position
          scrollViewRef.current?.scrollTo({
            y: nextIndex * 350, // Slightly larger to account for margins/padding
            animated: true,
          });
        }
      }, 150);
    }
  };

  const handleUnlockParagraph = (index: number) => {
    // Jump to the selected paragraph (unlocks it by making it current)
    jumpToParagraph(index);
  };

  const decreaseTextSize = () => {
    setTextSize(prev => {
      if (prev === 'large') return 'medium';
      if (prev === 'medium') return 'small';
      return 'small'; // Already at smallest
    });
  };

  const increaseTextSize = () => {
    setTextSize(prev => {
      if (prev === 'small') return 'medium';
      if (prev === 'medium') return 'large';
      return 'large'; // Already at largest
    });
  };

  const handleMarkAsFullyCompleted = async () => {
    try {
      const wordsRead = paragraphs
        .filter(p => p.isCompleted)
        .reduce((sum, p) => sum + p.wordCount, 0);
      const finalStats = {
        ...readingStats,
        readingTime: Math.floor((Date.now() - startTime) / 1000),
        completionPercentage: 100,
      };

      // Save final reading session
      await saveReadingSession({
        id: sessionIdRef.current,
        filename: filename,
        totalParagraphs: finalStats.totalParagraphs,
        completedParagraphs: finalStats.completedParagraphs,
        totalWords: wordsRead,
        readingTime: finalStats.readingTime,
        completionPercentage: 100,
        date: new Date(),
      });

      // Mark file as fully completed
      await markFileAsCompleted({
        filename: filename,
        fileUri: fileUri,
        completedDate: new Date(),
        completionPercentage: 100,
        totalWords: wordsRead,
        readingTime: finalStats.readingTime,
      });

      // Call onComplete callback
      if (onComplete) {
        onComplete(finalStats);
      }
      
      // Close the viewer after a short delay to ensure save completes
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 300);
    } catch (error) {
      console.error('Error marking file as fully completed:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={[styles.header, isDark && styles.headerDark]}>
          {onClose && (
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
              <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Back</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={isDark ? '#60A5FA' : '#2563EB'} />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>Preparing your reading material...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={[styles.header, isDark && styles.headerDark]}>
          {onClose && (
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
              <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Back</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (paragraphs.length === 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={[styles.header, isDark && styles.headerDark]}>
          {onClose && (
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
              <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Back</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>No readable content found in this file.</Text>
        </View>
      </View>
    );
  }

  const currentPara = paragraphs[currentParagraphIndex];
  // Allow proceeding even if not completed - removed the lock requirement
  const canProceed = true;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header with stats */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <View style={styles.headerLeft}>
          {onClose && (
            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
            </TouchableOpacity>
          )}
          <View style={styles.statsContainer}>
            <Text style={[styles.statsText, isDark && styles.statsTextDark]}>
              {readingStats.completedParagraphs}/{readingStats.totalParagraphs} paragraphs
            </Text>
            <Text style={[styles.statsSubtext, isDark && styles.statsSubtextDark]}>
              {readingStats.completionPercentage}% complete
            </Text>
            <View style={[styles.wordCountBadge, isDark && styles.wordCountBadgeDark, styles.wordCountBadgeInStats]}>
              <Ionicons name="text" size={16} color={isDark ? '#A78BFA' : '#8B5CF6'} />
              <Text style={[styles.wordCount, isDark && styles.wordCountDark, styles.wordCountInStats]}>{readingStats.totalWords.toLocaleString()}</Text>
              <Text style={[styles.wordCountLabel, isDark && styles.wordCountLabelDark, styles.wordCountLabelInStats]}>words</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.themeToggle}
            onPress={toggleTheme}
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Ionicons 
              name={isDark ? 'sunny' : 'moon'} 
              size={20} 
              color={isDark ? '#FBBF24' : '#6B7280'} 
            />
          </TouchableOpacity>
          <View style={[styles.textSizeButton, isDark && styles.textSizeButtonDark]}>
            <TouchableOpacity
              style={styles.textSizeControlButton}
              onPress={decreaseTextSize}
              accessibilityLabel="Decrease text size"
            >
              <Ionicons 
                name="remove" 
                size={14} 
                color={isDark ? '#60A5FA' : '#2563EB'} 
              />
            </TouchableOpacity>
            <Text style={[styles.textSizeButtonText, isDark && styles.textSizeButtonTextDark]}>
              Text Size
            </Text>
            <Text style={[styles.textSizeIndicator, isDark && styles.textSizeIndicatorDark]}>
              {textSize === 'small' ? 'S' : textSize === 'medium' ? 'M' : 'L'}
            </Text>
            <TouchableOpacity
              style={styles.textSizeControlButton}
              onPress={increaseTextSize}
              accessibilityLabel="Increase text size"
            >
              <Ionicons 
                name="add" 
                size={14} 
                color={isDark ? '#60A5FA' : '#2563EB'} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBarContainer, isDark && styles.progressBarContainerDark]}>
        <View
          style={[
            styles.progressBar,
            { width: `${readingStats.completionPercentage}%` },
          ]}
        />
      </View>

      {/* Eye tracking camera (hidden, for gaze detection) */}
      <EyeTrackingCamera 
        onGazeDetected={handleGazeDetected}
        enabled={eyeTrackingEnabled}
      />
      
      {/* Start eye-tracking service when enabled */}
      {eyeTrackingEnabled && eyeTrackingService.current && (
        <EyeTrackingServiceComponent
          service={eyeTrackingService.current}
          onGazeDetected={handleGazeDetected}
        />
      )}

      {/* Reading area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {paragraphs.map((para, index) => {
          const isCurrent = index === currentParagraphIndex;
          const isPast = index < currentParagraphIndex;
          const isLocked = index > currentParagraphIndex;

          return (
            <Animated.View
              key={para.id}
              style={[
                styles.paragraphContainer,
                isDark && styles.paragraphContainerDark,
                isCurrent && (isDark ? styles.currentParagraphDark : styles.currentParagraph),
                isLocked && (isDark ? styles.lockedParagraphDark : styles.lockedParagraph),
                isPast && para.isCompleted && (isDark ? styles.completedParagraphDark : styles.completedParagraph),
                isPast && !para.isCompleted && (isDark ? styles.incompleteParagraphDark : styles.incompleteParagraph),
                { opacity: isCurrent ? fadeAnim : 1 },
              ]}
              onLayout={(event) => {
                // Store the Y position of this paragraph for accurate scrolling
                const { y } = event.nativeEvent.layout;
                paragraphPositions.current.set(index, y);
                
                if (isCurrent) {
                  handleParagraphFocus(index);
                }
              }}
            >
              {/* Paragraph status indicator */}
              <View style={styles.paragraphHeader}>
                <Text style={[styles.paragraphNumber, isDark && styles.paragraphNumberDark]}>
                  Paragraph {index + 1} of {paragraphs.length}
                </Text>
                {para.isCompleted ? (
                  <View style={styles.statusBadge}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.statusText}>Complete</Text>
                  </View>
                ) : isPast ? (
                  <View style={[styles.statusBadge, styles.incompleteBadge]}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                    <Text style={[styles.statusText, styles.incompleteText]}>Incomplete</Text>
                  </View>
                ) : isLocked ? (
                  <TouchableOpacity
                    style={[styles.statusBadge, styles.lockedBadge]}
                    onPress={() => handleUnlockParagraph(index)}
                  >
                    <Ionicons name="lock-open" size={20} color="#6B7280" />
                    <Text style={[styles.statusText, styles.lockedText]}>Tap to unlock</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.statusBadge, styles.activeBadge]}>
                    <Ionicons name="eye" size={20} color="#2563EB" />
                    <Text style={[styles.statusText, styles.activeText]}>Reading...</Text>
                  </View>
                )}
              </View>

              {/* Paragraph text */}
              <TouchableOpacity
                activeOpacity={isLocked ? 0.7 : 1}
                onPress={() => {
                  if (isLocked) {
                    handleUnlockParagraph(index);
                  }
                }}
                disabled={!isLocked}
                onLayout={(event) => {
                  // Store text bounds for gaze mapping
                  const { x, y, width, height } = event.nativeEvent.layout;
                  paragraphTextRefs.current.set(para.id, { x, y, width, height });
                  
                  // Initialize line bounds if not already done
                  if (isCurrent && (!para.lines || para.lines.length === 0)) {
                    const screenData = Dimensions.get('window');
                    const fontSize = textSize === 'small' ? 16 : textSize === 'medium' ? 20 : 24;
                    const lineHeight = textSize === 'small' ? 28 : textSize === 'medium' ? 36 : 42;
                    
                    // Use TextLineMapper to calculate line bounds
                    const textMapper = new TextLineMapper({
                      fontSize,
                      lineHeight,
                      containerWidth: width,
                      containerX: x,
                      containerY: y,
                      padding: 24,
                    });

                    const lineBounds = textMapper.mapTextToLines(para.text);

                    const lines: LineReadingState[] = lineBounds.map((bounds, lineIndex) => ({
                      lineIndex,
                      bounds: {
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                      },
                      gazePoints: [],
                      startTime: Date.now(),
                      isComplete: false,
                      completionPercentage: 0,
                    }));

                    setParagraphs(prev => prev.map((p, pIdx) => {
                      if (pIdx !== index) return p;
                      return {
                        ...p,
                        lines,
                        currentLineIndex: 0,
                      };
                    }));
                  }
                }}
              >
                <Text
                  style={[
                    styles.paragraphText,
                    isDark && styles.paragraphTextDark,
                    isCurrent && (isDark ? styles.currentParagraphTextDark : styles.currentParagraphText),
                    isLocked && (isDark ? styles.lockedParagraphTextDark : styles.lockedParagraphText),
                    textSize === 'small' && (isCurrent ? styles.currentParagraphTextSmall : styles.paragraphTextSmall),
                    textSize === 'medium' && (isCurrent ? styles.currentParagraphTextMedium : styles.paragraphTextMedium),
                    textSize === 'large' && (isCurrent ? styles.currentParagraphTextLarge : styles.paragraphTextLarge),
                  ]}
                >
                  {para.text}
                </Text>
              </TouchableOpacity>

              {/* Word count for paragraph */}
              <Text style={[styles.paragraphWordCount, isDark && styles.paragraphWordCountDark]}>
                {para.wordCount} {para.wordCount === 1 ? 'word' : 'words'}
              </Text>

              {/* Action button for current paragraph */}
              {isCurrent && (
                <TouchableOpacity
                  style={[
                    styles.completeButton,
                    isDark && styles.completeButtonDark,
                    currentPara.isCompleted && styles.completeButtonActive,
                  ]}
                  onPress={handleMarkComplete}
                >
                  <Ionicons
                    name={currentPara.isCompleted ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={24}
                    color={currentPara.isCompleted ? '#ffffff' : (isDark ? '#60A5FA' : '#2563EB')}
                  />
                  <Text
                    style={[
                      styles.completeButtonText,
                      isDark && !currentPara.isCompleted && styles.completeButtonTextDark,
                      currentPara.isCompleted && styles.completeButtonTextActive,
                      !currentPara.isCompleted && styles.completeButtonTextIncomplete,
                    ]}
                  >
                    {currentPara.isCompleted ? 'Completed' : 'Mark as Read'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {/* Unlock button for locked paragraphs */}
              {isLocked && (
                <TouchableOpacity
                  style={[styles.unlockButton, isDark && styles.unlockButtonDark]}
                  onPress={() => handleUnlockParagraph(index)}
                >
                  <Ionicons name="lock-open" size={20} color={isDark ? '#60A5FA' : '#2563EB'} />
                  <Text style={[styles.unlockButtonText, isDark && styles.unlockButtonTextDark]}>Tap to unlock and read</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Navigation footer */}
      <View style={[styles.footer, isDark && styles.footerDark]}>
        {/* Show "Mark as Fully Completed" button when all paragraphs are completed */}
        {readingStats.completionPercentage === 100 && paragraphs.every(p => p.isCompleted) ? (
          <TouchableOpacity
            style={[styles.fullyCompleteButton, isDark && styles.fullyCompleteButtonDark]}
            onPress={handleMarkAsFullyCompleted}
          >
            <Ionicons name="checkmark-done-circle" size={28} color="#ffffff" />
            <Text style={styles.fullyCompleteButtonText}>Mark as Fully Completed</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.navButton,
                currentParagraphIndex === 0 && styles.navButtonDisabled,
              ]}
              onPress={() => {
                if (currentParagraphIndex > 0) {
                  setCurrentParagraphIndex(currentParagraphIndex - 1);
                }
              }}
              disabled={currentParagraphIndex === 0}
            >
              <Ionicons
                name="chevron-back"
                size={19}
                color={currentParagraphIndex === 0 ? '#9CA3AF' : (isDark ? '#60A5FA' : '#2563EB')}
              />
              <Text
                style={[
                  styles.navButtonText,
                  isDark && styles.navButtonTextDark,
                  currentParagraphIndex === 0 && styles.navButtonTextDisabled,
                ]}
              >
                Previous
              </Text>
            </TouchableOpacity>

            <View style={styles.footerCenter}>
              <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
                {currentParagraphIndex + 1} of {paragraphs.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.navButton,
                isDark && styles.navButtonDark,
                currentParagraphIndex === paragraphs.length - 1 &&
                  styles.navButtonDisabled,
              ]}
              onPress={handleNextParagraph}
              disabled={currentParagraphIndex === paragraphs.length - 1}
            >
              <Text
                style={[
                  styles.navButtonText,
                  isDark && styles.navButtonTextDark,
                  currentParagraphIndex === paragraphs.length - 1 &&
                    styles.navButtonTextDisabled,
                ]}
              >
                Next
              </Text>
              <Ionicons
                name="chevron-forward"
                size={19}
                color={
                  currentParagraphIndex === paragraphs.length - 1
                    ? '#9CA3AF'
                    : (isDark ? '#60A5FA' : '#2563EB')
                }
              />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 18, // Increased from 16 (10% increase)
    color: '#2563EB',
    marginLeft: 4,
    fontWeight: '600',
  },
  statsContainer: {
    marginLeft: 8,
  },
  statsText: {
    fontSize: 15, // Increased from 14 (10% increase)
    fontWeight: '700',
    color: '#111827',
  },
  statsSubtext: {
    fontSize: 13, // Increased from 12 (10% increase)
    color: '#6B7280',
    marginTop: 2,
  },
  wordCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  wordCount: {
    fontSize: 20, // Increased from 18 (10% increase)
    color: '#8B5CF6',
    fontWeight: '700',
  },
  wordCountLabel: {
    fontSize: 13, // Increased from 12 (10% increase)
    color: '#8B5CF6',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wordCountBadgeInStats: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wordCountInStats: {
    fontSize: 14,
  },
  wordCountLabelInStats: {
    fontSize: 11,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#E5E7EB',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  textSizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 0,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  textSizeButtonDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#3B82F6',
  },
  textSizeControlButton: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSizeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  textSizeButtonTextDark: {
    color: '#60A5FA',
  },
  textSizeIndicator: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    minWidth: 13,
    textAlign: 'center',
  },
  textSizeIndicatorDark: {
    color: '#60A5FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  paragraphContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    minHeight: Dimensions.get('window').height - 180, // Full screen minus header/progress/padding
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  currentParagraph: {
    borderWidth: 2,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  lockedParagraph: {
    opacity: 0.7,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
  },
  completedParagraph: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  incompleteParagraph: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  paragraphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  paragraphNumber: {
    fontSize: 13, // Increased from 12 (10% increase)
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
  },
  incompleteBadge: {
    backgroundColor: '#FEE2E2',
  },
  lockedBadge: {
    backgroundColor: '#F3F4F6',
  },
  activeBadge: {
    backgroundColor: '#DBEAFE',
  },
  statusText: {
    fontSize: 13, // Increased from 12 (10% increase)
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },
  incompleteText: {
    color: '#EF4444',
  },
  lockedText: {
    color: '#6B7280',
  },
  activeText: {
    color: '#2563EB',
  },
  paragraphText: {
    fontSize: 20, // Medium size (default)
    lineHeight: 36, // Proportional to font size
    color: '#111827',
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      web: "Georgia, 'Times New Roman', 'Merriweather', 'Lora', serif",
      default: 'serif',
    }),
    letterSpacing: 0.3,
    fontWeight: '400',
  },
  currentParagraphText: {
    fontSize: 20, // Medium size (default)
    fontWeight: '400',
    color: '#1F2937',
    lineHeight: 36, // Proportional to font size
    letterSpacing: 0.4,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      web: "Georgia, 'Times New Roman', 'Merriweather', 'Lora', serif",
      default: 'serif',
    }),
  },
  paragraphTextSmall: {
    fontSize: 16,
    lineHeight: 28,
  },
  currentParagraphTextSmall: {
    fontSize: 16,
    lineHeight: 28,
  },
  paragraphTextMedium: {
    fontSize: 20,
    lineHeight: 36,
  },
  currentParagraphTextMedium: {
    fontSize: 20,
    lineHeight: 36,
  },
  paragraphTextLarge: {
    fontSize: 24,
    lineHeight: 42,
  },
  currentParagraphTextLarge: {
    fontSize: 24,
    lineHeight: 42,
  },
  lockedParagraphText: {
    color: '#9CA3AF',
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      web: "Georgia, 'Times New Roman', 'Merriweather', 'Lora', serif",
      default: 'serif',
    }),
  },
  paragraphWordCount: {
    fontSize: 13, // Increased from 12 (10% increase)
    color: '#9CA3AF',
    marginTop: 12,
    fontStyle: 'italic',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  completeButtonDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#60A5FA',
  },
  completeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  completeButtonText: {
    fontSize: 18, // Increased from 16 (10% increase)
    fontWeight: '600',
    color: '#2563EB',
    marginLeft: 8,
  },
  completeButtonTextDark: {
    color: '#60A5FA',
  },
  completeButtonTextActive: {
    color: '#ffffff',
  },
  completeButtonTextIncomplete: {
    color: '#2563EB',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
  },
  unlockButtonDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#60A5FA',
  },
  unlockButtonText: {
    fontSize: 15, // Increased from 14 (10% increase)
    fontWeight: '600',
    color: '#2563EB',
    marginLeft: 8,
  },
  unlockButtonTextDark: {
    color: '#60A5FA',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  navButtonDark: {
    backgroundColor: '#374151',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    marginHorizontal: 6,
  },
  navButtonTextDark: {
    color: '#60A5FA',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  footerCenter: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18, // Increased from 16 (10% increase)
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18, // Increased from 16 (10% increase)
    color: '#EF4444',
    textAlign: 'center',
  },
  // Dark mode styles
  containerDark: {
    backgroundColor: '#111827',
  },
  headerDark: {
    backgroundColor: '#1F2937',
    borderBottomColor: '#374151',
  },
  backButtonTextDark: {
    color: '#60A5FA',
  },
  statsTextDark: {
    color: '#F9FAFB',
  },
  statsSubtextDark: {
    color: '#9CA3AF',
  },
  wordCountBadgeDark: {
    backgroundColor: '#4C1D95',
  },
  wordCountDark: {
    color: '#A78BFA',
  },
  wordCountLabelDark: {
    color: '#A78BFA',
  },
  progressBarContainerDark: {
    backgroundColor: '#374151',
  },
  autoReadingToggle: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  autoReadingToggleDark: {
    backgroundColor: '#1F2937',
    borderBottomColor: '#374151',
  },
  autoReadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  autoReadingButtonActive: {
    backgroundColor: '#10B981',
  },
  autoReadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  autoReadingTextActive: {
    color: '#ffffff',
  },
  autoReadingTextDark: {
    color: '#9CA3AF',
  },
  themeToggle: {
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
  },
  paragraphContainerDark: {
    backgroundColor: '#1F2937',
  },
  currentParagraphDark: {
    borderColor: '#60A5FA',
    backgroundColor: '#1E3A5F',
  },
  lockedParagraphDark: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  completedParagraphDark: {
    borderLeftColor: '#10B981',
  },
  incompleteParagraphDark: {
    borderLeftColor: '#EF4444',
  },
  paragraphNumberDark: {
    color: '#9CA3AF',
  },
  paragraphTextDark: {
    color: '#E0E0E0', // Off-white for better readability (85-90% opacity equivalent)
  },
  currentParagraphTextDark: {
    color: '#E8E8E8', // Slightly brighter for current paragraph but still off-white
  },
  lockedParagraphTextDark: {
    color: '#6B7280',
  },
  paragraphWordCountDark: {
    color: '#6B7280',
  },
  footerDark: {
    backgroundColor: '#1F2937',
    borderTopColor: '#374151',
  },
  footerTextDark: {
    color: '#9CA3AF',
  },
  loadingTextDark: {
    color: '#9CA3AF',
  },
  errorTextDark: {
    color: '#FCA5A5',
  },
  fullyCompleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
    gap: 8,
  },
  fullyCompleteButtonDark: {
    backgroundColor: '#059669',
  },
  fullyCompleteButtonText: {
    fontSize: 20, // Increased from 18 (10% increase)
    fontWeight: '700',
    color: '#ffffff',
  },
});

