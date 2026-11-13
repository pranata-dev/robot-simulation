'use client';

import { memo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, interactionGroups } from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface TargetZoneProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const { dimensions } = PART_CATALOG.TARGET_ZONE;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const SENSOR_HALF_HEIGHT = 0.65;
const TARGET_COLLISION_GROUPS = interactionGroups(0, [0, 1]);
const REQUIRED_DWELL_SECONDS = 1.5;

function isChassisIntersection(payload: {
  other: {
    rigidBodyObject?: { userData?: Record<string, unknown> } | null;
    colliderObject?: { userData?: Record<string, unknown> } | null;
  };
}): boolean {
  return (
    payload.other.rigidBodyObject?.userData?.type === 'chassis' ||
    payload.other.rigidBodyObject?.userData?.partType === 'CHASSIS_BASE' ||
    payload.other.colliderObject?.userData?.type === 'chassis'
  );
}

function TargetZoneProxy({ id, position, rotation }: TargetZoneProxyProps) {
  const challengeStatus = useSimulationStore((state) => state.challengeStatus);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const isLevelComplete = useSimulationStore((state) => state.isLevelComplete);
  const completeChallenge = useSimulationStore((state) => state.completeChallenge);

  const isChassisInsideRef = useRef(false);
  const dwellSecondsRef = useRef(0);

  useEffect(() => {
    if (simulationStatus !== 'playing') {
      isChassisInsideRef.current = false;
      dwellSecondsRef.current = 0;
    }
  }, [simulationStatus]);

  useFrame((_, delta) => {
    if (
      !isChassisInsideRef.current ||
      simulationStatus !== 'playing' ||
      challengeStatus !== 'in_progress'
    ) {
      return;
    }

    dwellSecondsRef.current += Math.min(delta, 0.1);
    if (dwellSecondsRef.current >= REQUIRED_DWELL_SECONDS) {
      isChassisInsideRef.current = false;
      completeChallenge();
    }
  });

  const isCompleted = isLevelComplete || challengeStatus === 'completed';
  const primaryColor = isCompleted ? '#facc15' : '#10b981';
  const emissiveColor = isCompleted ? '#eab308' : '#059669';

  return (
    <DraggableRigidPart
      id={id}
      partType="TARGET_ZONE"
      position={position}
      rotation={rotation}
      rigidBodyTypeOverride="fixed"
      includeDefaultCollider={false}
      sensor
      collisionGroups={TARGET_COLLISION_GROUPS}
      onIntersectionEnter={(e) => {
        if (isChassisIntersection(e)) {
          isChassisInsideRef.current = true;
        }
      }}
      onIntersectionExit={(e) => {
        if (isChassisIntersection(e)) {
          isChassisInsideRef.current = false;
          dwellSecondsRef.current = 0;
        }
      }}
    >
      {/* Elevated sensor volume so standing robot chassis triggers arrival cleanly */}
      <CuboidCollider
        args={[WIDTH / 2, SENSOR_HALF_HEIGHT, DEPTH / 2]}
        position={[0, SENSOR_HALF_HEIGHT, 0]}
        sensor
      />

      {/* Glowing base finish pad */}
      <mesh position={[0, HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial
          color={primaryColor}
          emissive={emissiveColor}
          emissiveIntensity={isCompleted ? 0.95 : 0.55}
          roughness={0.3}
          metalness={0.25}
        />
      </mesh>

      {/* Translucent holographic beacon field */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[WIDTH - 0.14, 0.42, DEPTH - 0.14]} />
        <meshStandardMaterial
          color={primaryColor}
          emissive={emissiveColor}
          emissiveIntensity={0.35}
          transparent
          opacity={0.18}
          roughness={0.2}
          depthWrite={false}
        />
      </mesh>

      {/* Gold side border rails */}
      <mesh position={[-WIDTH / 2 + 0.04, 0.025, 0]} castShadow>
        <boxGeometry args={[0.06, 0.05, DEPTH]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#d97706"
          emissiveIntensity={0.35}
          roughness={0.3}
          metalness={0.45}
        />
      </mesh>
      <mesh position={[WIDTH / 2 - 0.04, 0.025, 0]} castShadow>
        <boxGeometry args={[0.06, 0.05, DEPTH]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#d97706"
          emissiveIntensity={0.35}
          roughness={0.3}
          metalness={0.45}
        />
      </mesh>
    </DraggableRigidPart>
  );
}

export default memo(TargetZoneProxy);

