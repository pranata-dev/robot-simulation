'use client';

import { memo } from 'react';
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

function TargetZoneProxy({ id, position, rotation }: TargetZoneProxyProps) {
  const isLevelComplete = useSimulationStore((state) => state.isLevelComplete);
  const completeLevel = useSimulationStore((state) => state.completeLevel);

  const primaryColor = isLevelComplete ? '#facc15' : '#10b981';
  const emissiveColor = isLevelComplete ? '#eab308' : '#059669';

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
        if (
          e.colliderObject?.userData?.type === 'chassis' ||
          e.rigidBodyObject?.userData?.type === 'chassis' ||
          e.other.rigidBodyObject?.userData?.type === 'chassis'
        ) {
          completeLevel();
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
          emissiveIntensity={isLevelComplete ? 0.95 : 0.55}
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

