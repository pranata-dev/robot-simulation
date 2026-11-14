'use client';

import { memo, useEffect, useRef } from 'react';
import { Text } from '@react-three/drei';
import type { RapierRigidBody } from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/socketRegistry';
import { ROBOT_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface BatteryPackProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
}

const BATTERY_SPEC = PART_CATALOG.BATTERY_2S;
const [WIDTH, HEIGHT, DEPTH] = BATTERY_SPEC.dimensions;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HEIGHT / 2, DEPTH / 2];

/**
 * 3D LiPo Battery Pack rigid proxy mounted on the rear/top chassis socket to shift center of mass.
 */
function BatteryPackProxy({ id, position, rotation, attachedTo }: BatteryPackProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const registerRigidBody = useSimulationStore((state) => state.registerRigidBody);
  const unregisterRigidBody = useSimulationStore((state) => state.unregisterRigidBody);

  useEffect(() => {
    registerRigidBody(id, rigidBodyRef);
    return () => {
      unregisterRigidBody(id, rigidBodyRef);
    };
  }, [id, registerRigidBody, unregisterRigidBody]);

  return (
    <DraggableRigidPart
      id={id}
      partType="BATTERY_2S"
      position={position}
      rotation={rotation}
      attachedTo={attachedTo}
      enableSnapping
      colliderHalfExtents={COLLIDER_HALF_EXTENTS}
      mass={BATTERY_SPEC.mass}
      restitution={0}
      collisionGroups={ROBOT_COLLISION_GROUPS}
      rigidBodyRef={rigidBodyRef}
    >
      {/* Main shrink-wrapped 2S LiPo rectangular battery block */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, DEPTH]} />
        <meshStandardMaterial color="#1e293b" roughness={0.45} metalness={0.25} />
      </mesh>

      {/* Top high-visibility LiPo accent plate */}
      <mesh position={[0, HEIGHT / 2 + 0.004, 0]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH * 0.84, 0.008, DEPTH * 0.78]} />
        <meshStandardMaterial color="#0284c7" roughness={0.35} metalness={0.15} />
      </mesh>

      {/* Retention velcro straps */}
      <mesh position={[0, 0, DEPTH * 0.2]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH + 0.016, HEIGHT + 0.012, 0.05]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, -DEPTH * 0.2]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH + 0.016, HEIGHT + 0.012, 0.05]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} />
      </mesh>

      {/* Yellow XT60 connector housing on front-facing end */}
      <mesh position={[0.06, HEIGHT * 0.15, DEPTH / 2 + 0.022]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.05, 0.044]} />
        <meshStandardMaterial color="#eab308" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0.04, HEIGHT * 0.15, DEPTH / 2 + 0.05]} castShadow>
        <boxGeometry args={[0.018, 0.018, 0.03]} />
        <meshStandardMaterial color="#ef4444" roughness={0.4} />
      </mesh>
      <mesh position={[0.08, HEIGHT * 0.15, DEPTH / 2 + 0.05]} castShadow>
        <boxGeometry args={[0.018, 0.018, 0.03]} />
        <meshStandardMaterial color="#111827" roughness={0.4} />
      </mesh>

      {/* White JST-XH 3-pin balance lead */}
      <mesh position={[-0.08, HEIGHT * 0.15, DEPTH / 2 + 0.018]} castShadow receiveShadow>
        <boxGeometry args={[0.055, 0.032, 0.036]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>

      <Text
        position={[0, HEIGHT / 2 + 0.011, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.05}
        color="#f8fafc"
        anchorX="center"
        anchorY="middle"
      >
        LiPo 2.5kg
      </Text>
    </DraggableRigidPart>
  );
}

export default memo(BatteryPackProxy);

