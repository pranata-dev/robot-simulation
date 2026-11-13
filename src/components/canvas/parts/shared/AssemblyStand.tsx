'use client';

import { memo, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, type RapierRigidBody, RigidBody, interactionGroups } from '@react-three/rapier';
import { isValidRigidBody } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface AssemblyStandProps {
  chassisId: string;
  chassisPosition: Vector3Tuple;
  standHeight: number;
}

const BASE_PLATE_SIZE: Vector3Tuple = [0.62, 0.024, 0.82];
const CRADLE_PLATE_SIZE: Vector3Tuple = [0.54, 0.024, 0.72];
const PILLAR_RADIUS = 0.045;
const PILLAR_X_OFFSET = 0.16;
const PILLAR_Z_OFFSET = 0.22;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [0.27, 0.5, 0.36];
const STAND_COLLISION_GROUPS = interactionGroups(0, [1]);
const DISABLE_RAYCAST = () => null;

const PILLAR_OFFSETS: readonly [number, number][] = [
  [-PILLAR_X_OFFSET, -PILLAR_Z_OFFSET],
  [PILLAR_X_OFFSET, -PILLAR_Z_OFFSET],
  [-PILLAR_X_OFFSET, PILLAR_Z_OFFSET],
  [PILLAR_X_OFFSET, PILLAR_Z_OFFSET],
];

/**
 * Semi-transparent industrial support jig rendered beneath an elevated chassis during idle assembly.
 * Automatically tracks chassis XZ drags at 60 FPS and unmounts (disabling its collider) during playback.
 */
function AssemblyStand({ chassisId, chassisPosition, standHeight }: AssemblyStandProps) {
  const standBodyRef = useRef<RapierRigidBody | null>(null);
  const standVisualRef = useRef<THREE.Group | null>(null);
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');

  const baseHeight = BASE_PLATE_SIZE[1];
  const cradleHeight = CRADLE_PLATE_SIZE[1];
  const pillarHeight = Math.max(0.02, standHeight - baseHeight - cradleHeight);
  const pillarCenterY = baseHeight + pillarHeight / 2;
  const cradleCenterY = Math.max(baseHeight + cradleHeight / 2, standHeight - cradleHeight / 2);

  useFrame(({ scene }) => {
    const chassisObj = scene.getObjectByName(chassisId);
    if (!chassisObj) return;

    const { x, z } = chassisObj.position;
    if (standVisualRef.current) {
      standVisualRef.current.position.set(x, 0, z);
    }
    if (isValidRigidBody(standBodyRef.current)) {
      try {
        standBodyRef.current.setTranslation({ x, y: 0, z }, false);
      } catch {
        // Ignore transient Rapier handle access while switching simulation modes.
      }
    }
  });

  return (
    <RigidBody
      ref={standBodyRef}
      type="fixed"
      colliders={false}
      name={`${chassisId}_ASSEMBLY_STAND_BODY`}
      position={[chassisPosition[0], 0, chassisPosition[2]]}
      collisionGroups={STAND_COLLISION_GROUPS}
    >
      <CuboidCollider
        args={[COLLIDER_HALF_EXTENTS[0], standHeight / 2, COLLIDER_HALF_EXTENTS[2]]}
        position={[0, standHeight / 2, 0]}
        friction={0.8}
        restitution={0}
      />
      <group ref={standVisualRef} name={`${chassisId}_ASSEMBLY_STAND`}>
        {/* Floor-anchored baseplate at y = 0 */}
        <mesh position={[0, baseHeight / 2, 0]} receiveShadow raycast={DISABLE_RAYCAST}>
          <boxGeometry args={BASE_PLATE_SIZE} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.55}
            roughness={0.35}
            transparent
            opacity={isWiringXray ? 0.22 : 0.55}
            depthWrite={false}
          />
        </mesh>

        {/* Four vertical support struts spanning baseplate to upper cradle */}
        {PILLAR_OFFSETS.map(([px, pz], index) => (
          <mesh
            key={index}
            position={[px, pillarCenterY, pz]}
            castShadow
            raycast={DISABLE_RAYCAST}
          >
            <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS * 1.15, pillarHeight, 16]} />
            <meshStandardMaterial
              color="#64748b"
              metalness={0.65}
              roughness={0.3}
              transparent
              opacity={isWiringXray ? 0.22 : 0.42}
              depthWrite={false}
            />
          </mesh>
        ))}

        {/* Upper cradle plate contacting chassis underside */}
        <mesh position={[0, cradleCenterY, 0]} raycast={DISABLE_RAYCAST}>
          <boxGeometry args={CRADLE_PLATE_SIZE} />
          <meshStandardMaterial
            color="#A5AF79"
            emissive="#A5AF79"
            emissiveIntensity={0.2}
            metalness={0.4}
            roughness={0.4}
            transparent
            opacity={isWiringXray ? 0.22 : 0.48}
            depthWrite={false}
          />
        </mesh>
      </group>
    </RigidBody>
  );
}

export default memo(AssemblyStand);

