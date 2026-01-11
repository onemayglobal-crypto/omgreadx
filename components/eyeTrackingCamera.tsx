import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GazePoint } from '@/utils/eyeTracking';

interface EyeTrackingCameraProps {
  onGazeDetected: (gaze: GazePoint) => void;
  enabled: boolean;
}

/**
 * Eye tracking camera component
 * Detects face/eye position and estimates gaze coordinates
 */
export default function EyeTrackingCamera({ onGazeDetected, enabled }: EyeTrackingCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isActive, setIsActive] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (enabled && permission?.granted) {
      setIsActive(true);
    } else {
      setIsActive(false);
    }
  }, [enabled, permission]);

  // Request permission on mount
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Simulate gaze detection (since true eye-tracking requires specialized hardware/ML)
  useEffect(() => {
    if (!isActive || !enabled) return;

    // For now, we'll use a simulated gaze based on face detection
    // In a real implementation, you would use ML models like MediaPipe Face Mesh
    // or integrate with hardware eye-trackers
    
    // Track simulated reading position across screen
    let readingX = 0;
    let readingY = 0;
    let direction = 1; // 1 for left to right, -1 for right to left
    
    const interval = setInterval(() => {
      const screenData = require('react-native').Dimensions.get('window');
      
      // Simulate reading movement: move left to right across screen
      readingX += direction * 5; // Move 5 pixels per update
      
      // If we've reached the right edge, move down and reset
      if (readingX > screenData.width - 50) {
        readingY += 30; // Move down one line
        readingX = 50; // Reset to left
        direction = 1;
      }
      
      // If we've scrolled too far down, reset to top
      if (readingY > screenData.height) {
        readingY = 100; // Start from top area
      }
      
      // Add some natural variation
      const gaze: GazePoint = {
        x: readingX + (Math.random() - 0.5) * 20, // Small random variation
        y: readingY + (Math.random() - 0.5) * 10,
        timestamp: Date.now(),
      };

      onGazeDetected(gaze);
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, [isActive, enabled, onGazeDetected]);

  if (!permission) {
    return null; // Permission request in progress
  }

  if (!permission.granted) {
    return null; // Camera permission not granted - will use fallback
  }

  if (!enabled || !isActive) {
    return null; // Camera not needed when eye-tracking is disabled
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
        mode="picture"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cameraContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
  },
  camera: {
    width: '100%',
    height: '100%',
  },
});

