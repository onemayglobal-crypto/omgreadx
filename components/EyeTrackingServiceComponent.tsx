import React, { useEffect } from 'react';
import { EyeTrackingService, GazePoint } from '@/utils/eyeTrackingService';

interface EyeTrackingServiceComponentProps {
  service: EyeTrackingService;
  onGazeDetected: (gaze: GazePoint) => void;
}

/**
 * Component wrapper for eye-tracking service
 */
export default function EyeTrackingServiceComponent({
  service,
  onGazeDetected,
}: EyeTrackingServiceComponentProps) {
  useEffect(() => {
    // Start tracking when component mounts
    service.startTracking(onGazeDetected);

    return () => {
      // Stop tracking when component unmounts
      service.stopTracking();
    };
  }, [service, onGazeDetected]);

  // This component doesn't render anything
  return null;
}

