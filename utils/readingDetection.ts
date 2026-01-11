import { Dimensions } from 'react-native';

export interface LineReadingState {
  lineIndex: number;
  startTime: number;
  readingTime: number;
  isRead: boolean;
}

export interface ReadingDetectionConfig {
  minReadingTimePerLine: number; // milliseconds
  lineHeight: number;
  fontSize: number;
  containerWidth: number;
}

/**
 * Split text into lines based on container width and font size
 */
export const splitTextIntoLines = (
  text: string,
  containerWidth: number,
  fontSize: number
): string[] => {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let currentLine = '';

  // Estimate average character width (rough approximation)
  const avgCharWidth = fontSize * 0.6;
  const padding = 48; // Left + right padding
  const availableWidth = containerWidth - padding;

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const estimatedWidth = testLine.length * avgCharWidth;

    if (estimatedWidth <= availableWidth && currentLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
};

/**
 * Calculate reading time for a line based on word count
 */
export const calculateLineReadingTime = (
  line: string,
  wordsPerMinute: number = 200
): number => {
  const wordCount = line.split(/\s+/).filter(w => w.length > 0).length;
  const readingTimeSeconds = (wordCount / wordsPerMinute) * 60;
  return Math.max(readingTimeSeconds * 1000, 2000); // Minimum 2 seconds per line
};

/**
 * Check if a line has been read based on visibility time
 */
export const isLineRead = (
  lineState: LineReadingState,
  minReadingTime: number
): boolean => {
  return lineState.readingTime >= minReadingTime;
};

/**
 * Get current line index based on scroll position
 */
export const getCurrentLineIndex = (
  scrollY: number,
  lineHeight: number,
  offset: number = 0
): number => {
  return Math.max(0, Math.floor((scrollY + offset) / lineHeight));
};

