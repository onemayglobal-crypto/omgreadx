/**
 * Text Line Mapper
 * Divides displayed text into line segments with bounding boxes
 */

import { Dimensions } from 'react-native';

export interface LineBounds {
  lineIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  leftBoundary: number;
  rightBoundary: number;
  text: string;
}

export interface TextLineMapperConfig {
  fontSize: number;
  lineHeight: number;
  containerWidth: number;
  containerX: number;
  containerY: number;
  padding: number;
}

export class TextLineMapper {
  private config: TextLineMapperConfig;

  constructor(config: TextLineMapperConfig) {
    this.config = config;
  }

  /**
   * Divide text into line segments with bounding boxes
   */
  mapTextToLines(text: string): LineBounds[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lines: string[] = [];
    let currentLine = '';

    const avgCharWidth = this.config.fontSize * 0.6;
    const availableWidth = this.config.containerWidth - (this.config.padding * 2);

    // Split text into lines based on container width
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

    // Create bounding boxes for each line
    const lineBounds: LineBounds[] = [];
    lines.forEach((lineText, index) => {
      const lineTextWidth = lineText.length * avgCharWidth;
      const x = this.config.containerX + this.config.padding;
      const y = this.config.containerY + (index * this.config.lineHeight);
      const width = Math.min(lineTextWidth, availableWidth);
      const height = this.config.lineHeight;

      lineBounds.push({
        lineIndex: index,
        x,
        y,
        width,
        height,
        leftBoundary: x,
        rightBoundary: x + width,
        text: lineText,
      });
    });

    return lineBounds;
  }

  /**
   * Map gaze coordinates to current line
   */
  mapGazeToLine(gazeX: number, gazeY: number, lineBounds: LineBounds[]): LineBounds | null {
    for (const line of lineBounds) {
      if (
        gazeY >= line.y &&
        gazeY <= line.y + line.height &&
        gazeX >= line.leftBoundary &&
        gazeX <= line.rightBoundary
      ) {
        return line;
      }
    }
    return null;
  }

  /**
   * Check if gaze has passed the right boundary of a line
   */
  hasPassedRightBoundary(gazeX: number, line: LineBounds, threshold: number = 0.9): boolean {
    // Consider line complete when gaze passes 90% of the line width
    const completionX = line.leftBoundary + (line.width * threshold);
    return gazeX >= completionX;
  }

  /**
   * Calculate reading progress for a line (0 to 1)
   */
  calculateLineProgress(gazeX: number, line: LineBounds): number {
    if (gazeX < line.leftBoundary) return 0;
    if (gazeX > line.rightBoundary) return 1;
    
    const progress = (gazeX - line.leftBoundary) / line.width;
    return Math.max(0, Math.min(1, progress));
  }
}

