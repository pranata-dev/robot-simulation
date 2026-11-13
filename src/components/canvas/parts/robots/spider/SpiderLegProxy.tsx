'use client';

import { memo, useEffect, useRef } from 'react';
import {
  BallCollider,
  CuboidCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import AnchorMarker from '@/components/canvas/parts/shared/AnchorMarker';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import { ROBOT_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface SpiderLegProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
}

const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];

/** Tibia tilts from knee [0, 0.04, 0.34] down to rubber foot tip [0, -0.34, 0.50]. */
const KNEE_POS: Vector3Tuple = [0, 0.04, 0.34];
const FOOT_TIP_POS: Vector3Tuple = [0, -0.34, 0.5];
const FOOT_RADIUS = 0.045;
const TIBIA_LENGTH = Math.hypot(FOOT_TIP_POS[2] - KNEE_POS[2], KNEE_POS[1] - FOOT_TIP_POS[1]);
const TIBIA_TILT_X = -Math.atan2(FOOT_TIP_POS[2] - KNEE_POS[2], KNEE_POS[1] - FOOT_TIP_POS[1]);
const FEMUR_LENGTH = 0.34;
const FEMUR_TILT_X = Math.PI / 2 - Math.atan2(KNEE_POS[1], KNEE_POS[2]);
const DISABLE_RAYCAST = () => null;

function SpiderLegProxy({
  id,
  position,
  rotation = DEFAULT_ROTATION,
  attachedTo,
}: SpiderLegProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');
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
      partType="LEG_TIBIA"
      position={position}
      rotation={rotation}
      attachedTo={attachedTo}
      enableSnapping
      includeDefaultCollider={false}
      restitution={0}
      linearDamping={0.25}
      angularDamping={0.6}
      collisionGroups={ROBOT_COLLISION_GROUPS}
      rigidBodyRef={rigidBodyRef}
    >
      {/* Articulated L-shaped colliders clear of the [0, 0, 0] servo horn pivot */}
      <CuboidCollider
        args={[0.028, 0.028, 0.13]}
        position={[0, 0.02, 0.21]}
        mass={0.008}
        friction={0.6}
        restitution={0}
        collisionGroups={ROBOT_COLLISION_GROUPS}
        solverGroups={ROBOT_COLLISION_GROUPS}
      />
      <CuboidCollider
        args={[0.024, TIBIA_LENGTH / 2 - 0.02, 0.024]}
        position={[0, -0.15, 0.42]}
        rotation={[TIBIA_TILT_X, 0, 0]}
        mass={0.01}
        friction={0.6}
        restitution={0}
        collisionGroups={ROBOT_COLLISION_GROUPS}
        solverGroups={ROBOT_COLLISION_GROUPS}
      />
      <BallCollider
        args={[FOOT_RADIUS]}
        position={FOOT_TIP_POS}
        mass={0.012}
        friction={1.4}
        restitution={0}
        collisionGroups={ROBOT_COLLISION_GROUPS}
        solverGroups={ROBOT_COLLISION_GROUPS}
      />

      {/* Red sphere socket marking top servo-horn attachment joint */}
      <AnchorMarker name="LEG_HIP_MOUNT" position={[0, 0, 0]} color="#ef4444" />

      {/* Upper mounting hub */}
      <mesh
        castShadow
        receiveShadow
        raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
      >
        <cylinderGeometry args={[0.042, 0.042, 0.03, 16]} />
        <meshStandardMaterial
          color="#827148"
          roughness={0.45}
          metalness={0.2}
          transparent={isWiringXray}
          opacity={isWiringXray ? 0.22 : 1}
          depthWrite={!isWiringXray}
        />
      </mesh>

      {/* Upper femur strut */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.02, 0.17]}
        rotation={[FEMUR_TILT_X, 0, 0]}
        raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
      >
        <cylinderGeometry args={[0.024, 0.024, FEMUR_LENGTH, 16]} />
        <meshStandardMaterial
          color="#A5AF79"
          roughness={0.5}
          metalness={0.2}
          transparent={isWiringXray}
          opacity={isWiringXray ? 0.22 : 1}
          depthWrite={!isWiringXray}
        />
      </mesh>

      {/* Knee joint hub */}
      <mesh
        castShadow
        receiveShadow
        position={KNEE_POS}
        raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
      >
        <sphereGeometry args={[0.038, 16, 16]} />
        <meshStandardMaterial
          color="#827148"
          roughness={0.4}
          metalness={0.3}
          transparent={isWiringXray}
          opacity={isWiringXray ? 0.22 : 1}
          depthWrite={!isWiringXray}
        />
      </mesh>

      {/* Lower tibia leg cylinder */}
      <mesh
        castShadow
        receiveShadow
        position={[0, -0.15, 0.42]}
        rotation={[TIBIA_TILT_X, 0, 0]}
        raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
      >
        <cylinderGeometry args={[0.022, 0.016, TIBIA_LENGTH, 16]} />
        <meshStandardMaterial
          color="#E8A07C"
          roughness={0.45}
          metalness={0.15}
          transparent={isWiringXray}
          opacity={isWiringXray ? 0.22 : 1}
          depthWrite={!isWiringXray}
        />
      </mesh>

      {/* High-friction rubber foot tip */}
      <mesh
        castShadow
        receiveShadow
        position={FOOT_TIP_POS}
        raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
      >
        <sphereGeometry args={[FOOT_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color="#1f2937"
          roughness={0.9}
          transparent={isWiringXray}
          opacity={isWiringXray ? 0.22 : 1}
          depthWrite={!isWiringXray}
        />
      </mesh>
    </DraggableRigidPart>
  );
}

export default memo(SpiderLegProxy);

