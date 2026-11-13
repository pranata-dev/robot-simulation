'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSimulationStore } from '@/store/useSimulationStore';

const FPS_SAMPLE_WINDOW_SECONDS = 0.5;
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_DURATION_TRIGGER_SECONDS = 2.0;

/**
 * Monitors rolling frame rates inside the R3F render loop and activates
 * performance mode if average FPS drops below 30 for more than 2 seconds.
 */
export default function PerformanceMonitorGuard() {
  const frameCountRef = useRef(0);
  const windowElapsedRef = useRef(0);
  const lowFpsDurationRef = useRef(0);
  const triggeredRef = useRef(false);

  useFrame((_, delta) => {
    if (triggeredRef.current) return;
    if (delta > 0.5) {
      // Ignore tab-switch or background throttling pauses so they do not trigger falsely.
      frameCountRef.current = 0;
      windowElapsedRef.current = 0;
      return;
    }

    frameCountRef.current += 1;
    windowElapsedRef.current += delta;

    if (windowElapsedRef.current < FPS_SAMPLE_WINDOW_SECONDS) {
      return;
    }

    const avgFps = frameCountRef.current / windowElapsedRef.current;
    if (avgFps < LOW_FPS_THRESHOLD) {
      lowFpsDurationRef.current += windowElapsedRef.current;
      if (lowFpsDurationRef.current > LOW_FPS_DURATION_TRIGGER_SECONDS) {
        triggeredRef.current = true;
        useSimulationStore.getState().setPerformanceMode(true);
      }
    } else {
      lowFpsDurationRef.current = 0;
    }

    frameCountRef.current = 0;
    windowElapsedRef.current = 0;
  });

  return null;
}

