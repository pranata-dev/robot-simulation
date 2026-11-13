'use client';

import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { makePinNodeKey } from '@/lib/microcontroller/circuitValidator';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PinDefinition, Vector3Tuple } from '@/types/simulator';

interface PinNodeProps {
  partId: string;
  pin: PinDefinition;
  radius?: number;
  color?: string;
}

const SELECTED_COLOR = '#FFEED6';
const FAULT_RED_COLOR = '#ef4444';
const DISABLE_RAYCAST = () => null;

function PinNode({ partId, pin, radius = 0.03, color }: PinNodeProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const haloRef = useRef<THREE.Mesh | null>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const pinKey = makePinNodeKey(partId, pin.id);
  const isDraftStart = useSimulationStore(
    (state) =>
      state.activeDraftWire?.startPartId === partId &&
      state.activeDraftWire?.startPinId === pin.id,
  );
  const isFaulty = useSimulationStore(
    (state) =>
      state.showCircuitDiagnostics && Boolean(state.wiringValidation.faultyPinKeys[pinKey]),
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  useEffect(() => {
    if (!isFaulty && meshRef.current && materialRef.current) {
      const baseScale = isDraftStart ? 1.45 : 1;
      meshRef.current.scale.setScalar(baseScale);
      materialRef.current.emissiveIntensity = isDraftStart ? 0.9 : 0.45;
    }
  }, [isDraftStart, isFaulty]);

  useFrame(({ clock }) => {
    if (!isFaulty || isDraftStart) return;

    const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 8);
    if (meshRef.current) {
      meshRef.current.scale.setScalar(1.15 + pulse * 0.45);
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0.75 + pulse * 1.45;
    }
    if (haloRef.current && haloMaterialRef.current) {
      haloRef.current.scale.setScalar(1.3 + pulse * 0.75);
      haloMaterialRef.current.opacity = 0.22 + (1 - pulse) * 0.42;
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { readOnly, simulationStatus, activeDraftWire, startWiring, completeWiring } =
      useSimulationStore.getState();
    if (readOnly || simulationStatus !== 'idle') return;

    if (!activeDraftWire) {
      const worldPos = new THREE.Vector3();
      if (meshRef.current) {
        meshRef.current.getWorldPosition(worldPos);
      }
      const startPos: Vector3Tuple = [worldPos.x, worldPos.y, worldPos.z];
      startWiring(partId, pin.id, startPos);
      return;
    }

    completeWiring(partId, pin.id);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'auto';
  };

  const baseColor = color ?? pin.color;
  const displayColor = isDraftStart
    ? SELECTED_COLOR
    : isFaulty
      ? FAULT_RED_COLOR
      : baseColor;
  const scale = isDraftStart ? 1.45 : 1;

  return (
    <group name={pin.id} position={pin.position}>
      <mesh
        ref={meshRef}
        scale={scale}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <sphereGeometry args={[radius]} />
        <meshStandardMaterial
          ref={materialRef}
          color={displayColor}
          emissive={displayColor}
          emissiveIntensity={isDraftStart ? 0.9 : 0.45}
        />
      </mesh>
      {isFaulty && !isDraftStart && (
        <mesh ref={haloRef} raycast={DISABLE_RAYCAST}>
          <sphereGeometry args={[radius * 1.45]} />
          <meshBasicMaterial
            ref={haloMaterialRef}
            color={FAULT_RED_COLOR}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

export default memo(PinNode);
