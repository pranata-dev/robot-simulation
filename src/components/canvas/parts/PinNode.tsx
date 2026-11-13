'use client';

import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PinDefinition, Vector3Tuple } from '@/types/simulator';

interface PinNodeProps {
  partId: string;
  pin: PinDefinition;
  radius?: number;
  color?: string;
}

const SELECTED_COLOR = '#FFEED6';

function PinNode({ partId, pin, radius = 0.03, color }: PinNodeProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const isDraftStart = useSimulationStore(
    (state) =>
      state.activeDraftWire?.startPartId === partId &&
      state.activeDraftWire?.startPinId === pin.id,
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { activeDraftWire, startWiring, completeWiring } = useSimulationStore.getState();

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
  const displayColor = isDraftStart ? SELECTED_COLOR : baseColor;
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
          color={displayColor}
          emissive={displayColor}
          emissiveIntensity={isDraftStart ? 0.9 : 0.45}
        />
      </mesh>
    </group>
  );
}

export default memo(PinNode);

