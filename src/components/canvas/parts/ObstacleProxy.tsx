'use client';

import { memo } from 'react';
import { interactionGroups } from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/socketRegistry';
import type { Vector3Tuple } from '@/types/simulator';

interface ObstacleProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const { dimensions } = PART_CATALOG.OBSTACLE_BLOCK;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HEIGHT / 2, DEPTH / 2];
const OBSTACLE_COLLISION_GROUPS = interactionGroups(0, [0, 1]);

function ObstacleProxy({ id, position, rotation }: ObstacleProxyProps) {
  return (
    <DraggableRigidPart
      id={id}
      partType="OBSTACLE_BLOCK"
      position={position}
      rotation={rotation}
      rigidBodyTypeOverride="fixed"
      colliderHalfExtents={COLLIDER_HALF_EXTENTS}
      mass={0}
      friction={0.9}
      collisionGroups={OBSTACLE_COLLISION_GROUPS}
    >
      {/* Concrete/industrial sandbox block */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color="#64748b" roughness={0.72} metalness={0.12} />
      </mesh>

      {/* Top hazard / crate cap accent */}
      <mesh castShadow receiveShadow position={[0, HEIGHT / 2 - 0.015, 0]}>
        <boxGeometry args={[WIDTH - 0.06, 0.032, DEPTH - 0.06]} />
        <meshStandardMaterial color="#E8A07C" roughness={0.5} metalness={0.15} />
      </mesh>
    </DraggableRigidPart>
  );
}

export default memo(ObstacleProxy);

