import { Dimensions } from 'react-native';

export interface GazePoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface LineBounds {
  lineIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineReadingState {
  lineIndex: number;
  bounds: LineBounds;
  gazePoints: GazePoint[];
  startTime: number;
  isComplete: boolean;
  completionPercentage: number;
}

/**
 * Calculate bounding boxes for each line of text
 */
export const calculateLineBounds = (
  text: string,
  containerX: number,
  containerY: number,
  containerWidth: number,
  fontSize: number,
  lineHeight: number
): LineBounds[] => {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let currentLine = '';

  // Estimate average character width
  const avgCharWidth = fontSize * 0.6;
  const padding = 24; // Left + right padding
  const availableWidth = containerWidth - padding * 2;

  // Split text into lines
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

  // Calculate bounding boxes for each line
  const lineBounds: LineBounds[] = [];
  lines.forEach((line, index) => {
    const lineTextWidth = line.length * avgCharWidth;
    const x = containerX + padding;
    const y = containerY + (index * lineHeight);
    const width = Math.min(lineTextWidth, availableWidth);
    const height = lineHeight;

    lineBounds.push({
      lineIndex: index,
      x,
      y,
      width,
      height,
    });
  });

  return lineBounds;
};

/**
 * Check if a gaze point is within a line's bounding box
 */
export const isGazeInLine = (gaze: GazePoint, lineBounds: LineBounds): boolean => {
  return (
    gaze.x >= lineBounds.x &&
    gaze.x <= lineBounds.x + lineBounds.width &&
    gaze.y >= lineBounds.y &&
    gaze.y <= lineBounds.y + lineBounds.height
  );
};

/**
 * Calculate reading progress for a line based on gaze movement
 */
export const calculateLineProgress = (
  lineState: LineReadingState,
  currentGaze: GazePoint
): number => {
  if (lineState.isComplete) return 100;

  const { bounds, gazePoints } = lineState;
  
  // Add current gaze point
  const allGazePoints = [...gazePoints, currentGaze].filter(g => 
    isGazeInLine(g, bounds)
  );

  if (allGazePoints.length === 0) return 0;

  // Calculate horizontal coverage (how much of the line width has been gazed at)
  const minX = Math.min(...allGazePoints.map(g => g.x));
  const maxX = Math.max(...allGazePoints.map(g => g.x));
  const coveredWidth = Math.max(0, maxX - minX);
  const progress = Math.min(100, (coveredWidth / bounds.width) * 100);

  return progress;
};

/**
 * Check if a line is complete based on gaze coverage
 */
export const isLineComplete = (
  lineState: LineReadingState,
  threshold: number = 60 // Lowered threshold for easier completion
): boolean => {
  if (lineState.isComplete) return true;

  const { bounds, gazePoints } = lineState;
  const validGazePoints = gazePoints.filter(g => isGazeInLine(g, bounds));

  // Require at least 1 gaze point (reduced from 2 for easier detection)
  if (validGazePoints.length < 1) return false;

  // Check if gaze has moved across the line width
  const xPositions = validGazePoints.map(g => g.x);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);
  const coverage = ((maxX - minX) / bounds.width) * 100;

  // Also check time spent (minimum reading time) - reduced to 500ms for faster completion
  const timeSpent = Date.now() - lineState.startTime;
  const minReadingTime = 500; // Reduced from 1000ms to 500ms

  // If we have enough gaze points and sufficient time, mark as complete
  // Also accept if we have good coverage even with less time
  const hasGoodCoverage = coverage >= threshold;
  const hasEnoughTime = timeSpent >= minReadingTime;
  const hasMultipleGazePoints = validGazePoints.length >= 3; // If we have 3+ gaze points, accept with less coverage

  return (hasGoodCoverage && hasEnoughTime) || (hasMultipleGazePoints && timeSpent >= 300);
};

/**
 * Process gaze data and update line reading states
 */
export const processGazeData = (
  gaze: GazePoint,
  lineStates: LineReadingState[],
  currentLineIndex: number
): {
  updatedStates: LineReadingState[];
  shouldAdvance: boolean;
  completedLineIndex: number | null;
} => {
  const updatedStates = [...lineStates];
  let shouldAdvance = false;
  let completedLineIndex: number | null = null;

  if (currentLineIndex >= 0 && currentLineIndex < updatedStates.length) {
    const currentLine = updatedStates[currentLineIndex];

    if (!currentLine.isComplete && isGazeInLine(gaze, currentLine.bounds)) {
      // Add gaze point to current line
      currentLine.gazePoints.push(gaze);
      currentLine.completionPercentage = calculateLineProgress(currentLine, gaze);

      // Check if line is complete
      if (isLineComplete(currentLine)) {
        currentLine.isComplete = true;
        currentLine.completionPercentage = 100;
        shouldAdvance = true;
        completedLineIndex = currentLineIndex;
      }

      updatedStates[currentLineIndex] = currentLine;
    }
  }

  return { updatedStates, shouldAdvance, completedLineIndex };
};

