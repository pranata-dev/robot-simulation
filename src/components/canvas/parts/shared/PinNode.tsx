'use client';

import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { makePinNodeKey } from '@/lib/microcontroller/circuitValidator';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PinDefinition, PinId, Vector3Tuple } from '@/types/simulator';

interface PinNodeProps {
  partId: string;
  pin: PinDefinition;
  radius?: number;
  color?: string;
}

const SELECTED_COLOR = '#FFEED6';
const FAULT_RED_COLOR = '#ef4444';
const GROUND_RIM_COLOR = '#cbd5e1';
const DISABLE_RAYCAST = () => null;

const ESP_PIN_SHORT_LABELS: Partial<Record<PinId, string>> = {
  ESP_VIN: '5V',
  ESP_GND: 'GND',
  ESP_D13: 'P1 · PWM',
  ESP_D12: 'P2 · PWM',
  ESP_D14: 'P3 · PWM',
  ESP_D27: 'P4 · PWM',
  ESP_D26: 'P5 · PWM',
  ESP_D25: 'P6 · PWM',
  ESP_D33: 'P7 · PWM',
  ESP_D32: 'P8 · PWM',
  US_VCC: 'VCC · 5V',
  US_TRIG: 'TRIG · PWM',
  US_ECHO: 'ECHO · PWM',
  US_GND: 'GND',
};

function getHoverLabel(pin: PinDefinition): string {
  const mapped = ESP_PIN_SHORT_LABELS[pin.id];
  if (mapped) return mapped;
  if (pin.role === 'POWER') return '5V';
  if (pin.role === 'GROUND') return 'GND';
  return 'PWM';
}

function getScopedMeshName(partId: string, pin: PinDefinition): string {
  if (pin.hostPartType === 'SERVO_MG90S') {
    const suffix = pin.role === 'POWER' ? 'VCC' : pin.role === 'GROUND' ? 'GND' : 'PWM';
    return `${partId}_${suffix}`;
  }
  return `${partId}_${pin.id}`;
}

function PinNode({ partId, pin, radius = 0.03, color }: PinNodeProps) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const haloRef = useRef<THREE.Mesh | null>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const [isHovered, setIsHovered] = useState(false);

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
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');

  const baseEmissiveIntensity = isDraftStart
    ? isWiringXray
      ? 1.25
      : 0.9
    : isHovered
      ? isWiringXray
        ? 1.1
        : 0.75
      : isWiringXray
        ? 0.9
        : 0.45;

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  useEffect(() => {
    if (!isFaulty && meshRef.current && materialRef.current) {
      const baseScale = isDraftStart ? 1.45 : 1;
      meshRef.current.scale.setScalar(baseScale);
      materialRef.current.emissiveIntensity = baseEmissiveIntensity;
    }
  }, [baseEmissiveIntensity, isDraftStart, isFaulty]);

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
    setIsHovered(true);
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    setIsHovered(false);
  };

  const baseColor = color ?? pin.color;
  const displayColor = isDraftStart
    ? SELECTED_COLOR
    : isFaulty
      ? FAULT_RED_COLOR
      : baseColor;
  const scale = isDraftStart ? 1.45 : isHovered ? 1.25 : 1;
  const hoverLabel = getHoverLabel(pin);
  const badgeWidth = Math.max(0.11, hoverLabel.length * 0.022 + 0.045);

  return (
    <group name={pin.id} position={pin.position}>
      <mesh
        ref={meshRef}
        name={getScopedMeshName(partId, pin)}
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
          emissiveIntensity={baseEmissiveIntensity}
        />
      </mesh>
      {pin.role === 'GROUND' && !isFaulty && !isDraftStart && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={DISABLE_RAYCAST}>
          <ringGeometry args={[radius * 1.02, radius * 1.32, 20]} />
          <meshBasicMaterial color={GROUND_RIM_COLOR} side={THREE.DoubleSide} />
        </mesh>
      )}
      {isHovered && (
        <Billboard position={[0, radius * 2.5 + 0.055, 0]}>
          <mesh position={[0, 0, -0.002]} raycast={DISABLE_RAYCAST}>
            <planeGeometry args={[badgeWidth, 0.068]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.9} depthTest={false} />
          </mesh>
          <Text
            fontSize={0.036}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            renderOrder={20}
            raycast={DISABLE_RAYCAST}
          >
            {hoverLabel}
          </Text>
        </Billboard>
      )}
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
