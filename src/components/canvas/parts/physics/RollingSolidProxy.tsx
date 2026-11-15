'use client';

import { memo, useRef } from 'react';
import * as THREE from 'three';
import {
  BallCollider,
  CoefficientCombineRule,
  CylinderCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import {
  PART_CATALOG,
  ROLLING_CYLINDER_HALF_WIDTH,
  ROLLING_SOLID_RADIUS,
} from '@/lib/constants/hardwareCatalog';
import { ENV_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

export type RollingSolidVariant =
  | 'physics_solid_sphere'
  | 'physics_solid_cylinder'
  | 'physics_hollow_cylinder'
  | 'physics_collision_puck';

interface RollingSolidProxyProps {
  id: string;
  partType: RollingSolidVariant;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  initialVelocity?: Vector3Tuple;
}

const CYLINDER_ROTATION: Vector3Tuple = [Math.PI / 2, 0, 0];
const HOLLOW_INNER_RADIUS = 0.165;
const CYLINDER_LENGTH = ROLLING_CYLINDER_HALF_WIDTH * 2;

function RollingSolidProxy({
  id,
  partType,
  position,
  rotation,
  initialVelocity,
}: RollingSolidProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const surfaceFriction = useSimulationStore((state) => state.surfaceFriction);
  const restitution = useSimulationStore((state) => state.restitution);

  const catalogEntry = PART_CATALOG[partType];
  const isCollisionPuck = partType === 'physics_collision_puck';
  const isLaunchedPuck = isCollisionPuck && Boolean(initialVelocity);
  const effectiveFriction = isLaunchedPuck ? surfaceFriction * 0.05 : surfaceFriction;
  const effectiveRestitution = isCollisionPuck ? restitution : 0.15;

  const isBall = partType === 'physics_solid_sphere' || isCollisionPuck;

  return (
    <DraggableRigidPart
      id={id}
      partType={partType}
      position={position}
      rotation={rotation}
      initialVelocity={initialVelocity}
      rigidBodyRef={rigidBodyRef}
      includeDefaultCollider={false}
      collisionGroups={ENV_COLLISION_GROUPS}
      mass={catalogEntry.mass}
      friction={effectiveFriction}
      restitution={effectiveRestitution}
      linearDamping={0}
      angularDamping={0}
      customColliders={
        isBall ? (
          <BallCollider
            args={[ROLLING_SOLID_RADIUS]}
            mass={catalogEntry.mass}
            friction={effectiveFriction}
            frictionCombineRule={isLaunchedPuck ? CoefficientCombineRule.Min : undefined}
            restitution={effectiveRestitution}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
        ) : (
          <CylinderCollider
            args={[ROLLING_CYLINDER_HALF_WIDTH, ROLLING_SOLID_RADIUS]}
            rotation={CYLINDER_ROTATION}
            mass={catalogEntry.mass}
            friction={effectiveFriction}
            restitution={effectiveRestitution}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
        )
      }
    >
      {partType === 'physics_solid_sphere' && (
        <group>
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[ROLLING_SOLID_RADIUS, 32, 24]} />
            <meshStandardMaterial color="#ef4444" roughness={0.35} metalness={0.15} />
          </mesh>
          <mesh castShadow>
            <torusGeometry args={[ROLLING_SOLID_RADIUS + 0.002, 0.014, 8, 32]} />
            <meshStandardMaterial color="#fef2f2" roughness={0.4} />
          </mesh>
        </group>
      )}

      {partType === 'physics_solid_cylinder' && (
        <group rotation={CYLINDER_ROTATION}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry
              args={[ROLLING_SOLID_RADIUS, ROLLING_SOLID_RADIUS, CYLINDER_LENGTH, 32]}
            />
            <meshStandardMaterial color="#3b82f6" roughness={0.35} metalness={0.2} />
          </mesh>
          {/* High-contrast rotation marker strips on both end faces */}
          {[ROLLING_CYLINDER_HALF_WIDTH + 0.002, -(ROLLING_CYLINDER_HALF_WIDTH + 0.002)].map(
            (faceY) => (
              <mesh key={faceY} position={[0, faceY, 0]}>
                <boxGeometry args={[ROLLING_SOLID_RADIUS * 1.75, 0.004, 0.04]} />
                <meshStandardMaterial color="#eff6ff" roughness={0.4} />
              </mesh>
            ),
          )}
        </group>
      )}

      {partType === 'physics_hollow_cylinder' && (
        <group rotation={CYLINDER_ROTATION}>
          {/* Outer tube wall */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry
              args={[ROLLING_SOLID_RADIUS, ROLLING_SOLID_RADIUS, CYLINDER_LENGTH, 32, 1, true]}
            />
            <meshStandardMaterial
              color="#f59e0b"
              roughness={0.32}
              metalness={0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Inner hollow bore wall */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry
              args={[HOLLOW_INNER_RADIUS, HOLLOW_INNER_RADIUS, CYLINDER_LENGTH, 32, 1, true]}
            />
            <meshStandardMaterial
              color="#b45309"
              roughness={0.45}
              metalness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Annular end caps */}
          <mesh position={[0, ROLLING_CYLINDER_HALF_WIDTH, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[HOLLOW_INNER_RADIUS, ROLLING_SOLID_RADIUS, 32]} />
            <meshStandardMaterial
              color="#fbbf24"
              roughness={0.35}
              metalness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, -ROLLING_CYLINDER_HALF_WIDTH, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[HOLLOW_INNER_RADIUS, ROLLING_SOLID_RADIUS, 32]} />
            <meshStandardMaterial
              color="#fbbf24"
              roughness={0.35}
              metalness={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Visible rim marker to show angular speed */}
          <mesh position={[ROLLING_SOLID_RADIUS * 0.82, ROLLING_CYLINDER_HALF_WIDTH + 0.003, 0]}>
            <boxGeometry args={[0.06, 0.006, 0.04]} />
            <meshStandardMaterial color="#1c1917" roughness={0.5} />
          </mesh>
        </group>
      )}

      {partType === 'physics_collision_puck' && (
        <group>
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[ROLLING_SOLID_RADIUS, 32, 24]} />
            <meshStandardMaterial color="#10b981" roughness={0.3} metalness={0.22} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[ROLLING_SOLID_RADIUS + 0.002, 0.015, 8, 32]} />
            <meshStandardMaterial color="#ecfdf5" roughness={0.35} />
          </mesh>
        </group>
      )}
    </DraggableRigidPart>
  );
}

export default memo(RollingSolidProxy);
