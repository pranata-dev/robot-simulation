'use client';

import { type ComponentRef, type RefObject, useEffect, useRef } from 'react';
import type { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple, ViewMode } from '@/types/simulator';

export type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

interface CameraViewControllerProps {
  controlsRef: RefObject<OrbitControlsHandle | null>;
  defaultCameraPosition: Vector3Tuple;
}

const XRAY_CAMERA_OFFSET: Vector3Tuple = [0, 2.6, 1.35];
const XRAY_TARGET_OFFSET: Vector3Tuple = [0, 0.1, 0.15];
const SETTLE_THRESHOLD = 0.015;
const LERP_SPEED = 8;

/**
 * Smoothly animates the camera and OrbitControls target between the standard isometric
 * perspective and the angled top-down electronics bay overview when X-Ray Wiring View toggles.
 */
export default function CameraViewController({
  controlsRef,
  defaultCameraPosition,
}: CameraViewControllerProps) {
  const { camera } = useThree();
  const viewMode = useSimulationStore((state) => state.viewMode);

  const prevViewModeRef = useRef<ViewMode>(viewMode);
  const isAnimatingRef = useRef(false);
  const targetCameraPosRef = useRef(new THREE.Vector3(...defaultCameraPosition));
  const targetLookAtRef = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleUserControlStart = () => {
      isAnimatingRef.current = false;
    };

    controls.addEventListener('start', handleUserControlStart);
    return () => {
      controls.removeEventListener('start', handleUserControlStart);
    };
  }, [controlsRef]);

  useEffect(() => {
    if (prevViewModeRef.current === viewMode) return;
    prevViewModeRef.current = viewMode;

    if (viewMode === 'wiring_xray') {
      const { workspaceParts } = useSimulationStore.getState();
      const chassis = workspaceParts.find((part) => part.type === 'CHASSIS_BASE');
      const mcu = workspaceParts.find((part) => part.type === 'ESP32_DEVKIT');
      const anchor = chassis ?? mcu;
      const basePos: Vector3Tuple = anchor ? anchor.position : [0, 0.4, 0];

      targetLookAtRef.current.set(
        basePos[0] + XRAY_TARGET_OFFSET[0],
        basePos[1] + XRAY_TARGET_OFFSET[1],
        basePos[2] + XRAY_TARGET_OFFSET[2],
      );
      targetCameraPosRef.current.set(
        basePos[0] + XRAY_CAMERA_OFFSET[0],
        basePos[1] + XRAY_CAMERA_OFFSET[1],
        basePos[2] + XRAY_CAMERA_OFFSET[2],
      );
    } else {
      targetLookAtRef.current.set(0, 0, 0);
      targetCameraPosRef.current.set(...defaultCameraPosition);
    }

    isAnimatingRef.current = true;
  }, [defaultCameraPosition, viewMode]);

  useFrame((_, delta) => {
    if (!isAnimatingRef.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const alpha = 1 - Math.exp(-LERP_SPEED * Math.min(delta, 0.1));
    camera.position.lerp(targetCameraPosRef.current, alpha);
    controls.target.lerp(targetLookAtRef.current, alpha);
    controls.update();

    const posDone = camera.position.distanceTo(targetCameraPosRef.current) < SETTLE_THRESHOLD;
    const targetDone = controls.target.distanceTo(targetLookAtRef.current) < SETTLE_THRESHOLD;
    if (posDone && targetDone) {
      camera.position.copy(targetCameraPosRef.current);
      controls.target.copy(targetLookAtRef.current);
      controls.update();
      isAnimatingRef.current = false;
    }
  });

  return null;
}

