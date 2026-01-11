/**
 * Reading Progress Tracker
 * Tracks left-to-right gaze movement and confirms line completion
 */

import { GazePoint } from './eyeTrackingService';
import { LineBounds, TextLineMapper } from './textLineMapper';

export interface LineReadingState {
  lineIndex: number;
  bounds: LineBounds;
  gazeHistory: GazePoint[];
  startTime: number;
  isComplete: boolean;
  completionPercentage: number;
  leftToRightProgress: number; // Tracks left-to-right movement (0 to 1)
  hasReachedRightBoundary: boolean;
}

export interface ReadingProgress {
  currentLineIndex: number;
  lineStates: LineReadingState[];
  totalLines: number;
  completedLines: number;
  overallProgress: number;
}

export class ReadingProgressTracker {
  private lineStates: Map<number, LineReadingState> = new Map();
  private currentLineIndex: number = 0;
  private textMapper: TextLineMapper;

  constructor(textMapper: TextLineMapper) {
    this.textMapper = textMapper;
  }

  /**
   * Initialize line states from text
   */
  initializeLines(text: string, containerX: number, containerY: number): void {
    const lineBounds = this.textMapper.mapTextToLines(text);
    this.lineStates.clear();

    lineBounds.forEach((bounds) => {
      this.lineStates.set(bounds.lineIndex, {
        lineIndex: bounds.lineIndex,
        bounds,
        gazeHistory: [],
        startTime: Date.now(),
        isComplete: false,
        completionPercentage: 0,
        leftToRightProgress: 0,
        hasReachedRightBoundary: false,
      });
    });

    this.currentLineIndex = 0;
  }

  /**
   * Process gaze point and update progress
   */
  processGaze(gaze: GazePoint): ReadingProgress {
    const currentLine = this.lineStates.get(this.currentLineIndex);
    if (!currentLine) {
      return this.getProgress();
    }

    // Check if gaze is within current line bounds
    const mappedLine = this.textMapper.mapGazeToLine(
      gaze.x,
      gaze.y,
      [currentLine.bounds]
    );

    if (mappedLine && mappedLine.lineIndex === this.currentLineIndex) {
      // Add gaze point to history
      currentLine.gazeHistory.push(gaze);

      // Calculate left-to-right progress
      const progress = this.textMapper.calculateLineProgress(gaze.x, currentLine.bounds);
      currentLine.leftToRightProgress = Math.max(currentLine.leftToRightProgress, progress);
      currentLine.completionPercentage = Math.min(100, progress * 100);

      // Check if gaze has passed right boundary
      if (this.textMapper.hasPassedRightBoundary(gaze.x, currentLine.bounds)) {
        currentLine.hasReachedRightBoundary = true;
        
        // Confirm completion when right boundary is passed
        if (!currentLine.isComplete) {
          currentLine.isComplete = true;
          currentLine.completionPercentage = 100;
          console.log(`Line ${this.currentLineIndex + 1} completed - gaze passed right boundary`);
        }
      }

      // Also check for left-to-right movement pattern
      if (currentLine.gazeHistory.length >= 2) {
        const recentGazes = currentLine.gazeHistory.slice(-5); // Last 5 gaze points
        const xPositions = recentGazes.map(g => g.x);
        const minX = Math.min(...xPositions);
        const maxX = Math.max(...xPositions);
        
        // If gaze has moved from left to right across significant portion
        const movementCoverage = (maxX - minX) / currentLine.bounds.width;
        if (movementCoverage >= 0.7 && currentLine.leftToRightProgress >= 0.8) {
          if (!currentLine.isComplete) {
            currentLine.isComplete = true;
            currentLine.completionPercentage = 100;
            console.log(`Line ${this.currentLineIndex + 1} completed - left-to-right movement detected`);
          }
        }
      }

      this.lineStates.set(this.currentLineIndex, currentLine);
    }

    return this.getProgress();
  }

  /**
   * Advance to next line
   */
  advanceToNextLine(): boolean {
    if (this.currentLineIndex < this.lineStates.size - 1) {
      this.currentLineIndex++;
      console.log(`Advanced to line ${this.currentLineIndex + 1}`);
      return true;
    }
    return false;
  }

  /**
   * Get current reading progress
   */
  getProgress(): ReadingProgress {
    const completedLines = Array.from(this.lineStates.values()).filter(
      line => line.isComplete
    ).length;

    return {
      currentLineIndex: this.currentLineIndex,
      lineStates: Array.from(this.lineStates.values()),
      totalLines: this.lineStates.size,
      completedLines,
      overallProgress: this.lineStates.size > 0 
        ? (completedLines / this.lineStates.size) * 100 
        : 0,
    };
  }

  /**
   * Check if all lines are complete
   */
  isAllComplete(): boolean {
    return Array.from(this.lineStates.values()).every(line => line.isComplete);
  }

  /**
   * Get current line state
   */
  getCurrentLine(): LineReadingState | null {
    return this.lineStates.get(this.currentLineIndex) || null;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.lineStates.clear();
    this.currentLineIndex = 0;
  }
}

