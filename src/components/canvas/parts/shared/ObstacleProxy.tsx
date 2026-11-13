'use client';

import { memo, useEffect, useRef } from 'react';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/socketRegistry';
import { ENV_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartType, Vector3Tuple } from '@/types/simulator';

interface ObstacleProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const { dimensions } = PART_CATALOG.OBSTACLE_BLOCK;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HEIGHT / 2, DEPTH / 2];
const OBSTACLE_COLLISION_GROUPS = ENV_COLLISION_GROUPS;
const HIT_COOLDOWN_MS = 450;
const ROBOT_COLLIDER_TYPES = new Set<PartType>([
  'CHASSIS_BASE',
  'ESP32_DEVKIT',
  'SERVO_MG90S',
  'LEG_TIBIA',
]);

function ObstacleProxy({ id, position, rotation }: ObstacleProxyProps) {
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const challengeStatus = useSimulationStore((state) => state.challengeStatus);
  const recordObstacleHit = useSimulationStore((state) => state.recordObstacleHit);
  const lastHitAtByPartRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (simulationStatus !== 'playing') {
      lastHitAtByPartRef.current.clear();
    }
  }, [simulationStatus]);

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
      restitution={0}
      collisionGroups={OBSTACLE_COLLISION_GROUPS}
      onCollisionEnter={(e) => {
        if (useSimulationStore.getState().simulationStatus !== 'playing') return;

        const userData = e.other.rigidBodyObject?.userData as
          | { partType?: PartType; partId?: string; type?: string }
          | undefined;
        const isRobotPart =
          userData?.type === 'chassis' ||
          (userData?.partType !== undefined && ROBOT_COLLIDER_TYPES.has(userData.partType));
        if (!isRobotPart) return;

        const key = userData?.partId ?? String(e.other.rigidBodyObject?.name ?? 'robot');
        const now = Date.now();
        const prevHitAt = lastHitAtByPartRef.current.get(key) ?? 0;
        if (now - prevHitAt < HIT_COOLDOWN_MS) return;

        lastHitAtByPartRef.current.set(key, now);
        recordObstacleHit();
      }}
    >
      {/* Concrete/industrial sandbox block */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color="#64748b" roughness={0.72} metalness={0.12} />
      </mesh>

      {/* Top hazard / crate cap accent */}
      <mesh castShadow receiveShadow position={[0, HEIGHT / 2 - 0.015, 0]}>
        <boxGeometry args={[WIDTH - 0.06, 0.032, DEPTH - 0.06]} />
        <meshStandardMaterial
          color={challengeStatus === 'failed' ? '#ef4444' : '#E8A07C'}
          roughness={0.5}
          metalness={0.15}
        />
      </mesh>
    </DraggableRigidPart>
  );
}

export default memo(ObstacleProxy);

