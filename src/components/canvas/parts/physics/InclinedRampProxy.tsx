'use client';

import { memo, useMemo, useRef } from 'react';
import { CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import {
  RAMP_RAIL_HEIGHT,
  RAMP_RAIL_THICKNESS,
  computeRampGeometry,
} from '@/lib/physics/rampGeometry';
import { ENV_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface InclinedRampProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const RAIL_FRICTION = 0.15;

function InclinedRampProxy({ id, position, rotation }: InclinedRampProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const rampAngle = useSimulationStore((state) => state.rampAngle);
  const surfaceFriction = useSimulationStore((state) => state.surfaceFriction);

  const geom = useMemo(() => computeRampGeometry(rampAngle), [rampAngle]);
  const {
    angleRad,
    slopeLength,
    rampWidth,
    deckThickness,
    slopeCenterX,
    slopeCenterY,
    crestX,
    crestY,
    topPlatformLength,
    topPlatformCenterX,
    topPlatformCenterY,
  } = geom;

  const railOffsetZ = rampWidth / 2 + RAMP_RAIL_THICKNESS / 2;
  const railHeightAboveDeckCenter = deckThickness / 2 + RAMP_RAIL_HEIGHT / 2;
  const sin = Math.sin(angleRad);
  const cos = Math.cos(angleRad);

  // Offset slope rails strictly along the tilted ramp surface normal so colliders align with visual walls.
  const slopeRailCenterX = slopeCenterX + railHeightAboveDeckCenter * sin;
  const slopeRailCenterY = slopeCenterY + railHeightAboveDeckCenter * cos;
  const topRailCenterY = topPlatformCenterY + railHeightAboveDeckCenter;
  const supportHeight = Math.max(0.05, crestY - deckThickness);

  return (
    <DraggableRigidPart
      id={id}
      partType="physics_inclined_ramp"
      position={position}
      rotation={rotation}
      rigidBodyRef={rigidBodyRef}
      rigidBodyTypeOverride="fixed"
      includeDefaultCollider={false}
      collisionGroups={ENV_COLLISION_GROUPS}
      friction={surfaceFriction}
      restitution={0.05}
      customColliders={
        <>
          {/* Angled ramp slope collider */}
          <CuboidCollider
            args={[slopeLength / 2, deckThickness / 2, rampWidth / 2]}
            position={[slopeCenterX, slopeCenterY, 0]}
            rotation={[0, 0, -angleRad]}
            friction={surfaceFriction}
            restitution={0.05}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />

          {/* Flat top launch platform collider */}
          <CuboidCollider
            args={[topPlatformLength / 2, deckThickness / 2, rampWidth / 2]}
            position={[topPlatformCenterX, topPlatformCenterY, 0]}
            friction={surfaceFriction}
            restitution={0.05}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />

          {/* Slope side guardrails */}
          <CuboidCollider
            args={[slopeLength / 2, RAMP_RAIL_HEIGHT / 2, RAMP_RAIL_THICKNESS / 2]}
            position={[slopeRailCenterX, slopeRailCenterY, railOffsetZ]}
            rotation={[0, 0, -angleRad]}
            friction={RAIL_FRICTION}
            restitution={0.1}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
          <CuboidCollider
            args={[slopeLength / 2, RAMP_RAIL_HEIGHT / 2, RAMP_RAIL_THICKNESS / 2]}
            position={[slopeRailCenterX, slopeRailCenterY, -railOffsetZ]}
            rotation={[0, 0, -angleRad]}
            friction={RAIL_FRICTION}
            restitution={0.1}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />

          {/* Top platform guardrails + backstop */}
          <CuboidCollider
            args={[topPlatformLength / 2, RAMP_RAIL_HEIGHT / 2, RAMP_RAIL_THICKNESS / 2]}
            position={[topPlatformCenterX, topRailCenterY, railOffsetZ]}
            friction={RAIL_FRICTION}
            restitution={0.1}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
          <CuboidCollider
            args={[topPlatformLength / 2, RAMP_RAIL_HEIGHT / 2, RAMP_RAIL_THICKNESS / 2]}
            position={[topPlatformCenterX, topRailCenterY, -railOffsetZ]}
            friction={RAIL_FRICTION}
            restitution={0.1}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
          <CuboidCollider
            args={[
              RAMP_RAIL_THICKNESS / 2,
              RAMP_RAIL_HEIGHT / 2,
              (rampWidth + RAMP_RAIL_THICKNESS * 2) / 2,
            ]}
            position={[crestX - topPlatformLength + RAMP_RAIL_THICKNESS / 2, topRailCenterY, 0]}
            friction={RAIL_FRICTION}
            restitution={0.1}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
        </>
      }
    >
      {/* Angled slope deck + lane divider stripes */}
      <group position={[slopeCenterX, slopeCenterY, 0]} rotation={[0, 0, -angleRad]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[slopeLength, deckThickness, rampWidth]} />
          <meshStandardMaterial color="#475569" roughness={0.65} metalness={0.18} />
        </mesh>

        {/* Three visual race lane dividers */}
        {[-0.35, 0.35].map((laneZ) => (
          <mesh key={laneZ} position={[0, deckThickness / 2 + 0.002, laneZ]} receiveShadow>
            <boxGeometry args={[slopeLength - 0.08, 0.004, 0.025]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
          </mesh>
        ))}

        {/* Side guardrails on slope */}
        <mesh position={[0, railHeightAboveDeckCenter, railOffsetZ]} castShadow receiveShadow>
          <boxGeometry args={[slopeLength, RAMP_RAIL_HEIGHT, RAMP_RAIL_THICKNESS]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.55} metalness={0.25} />
        </mesh>
        <mesh position={[0, railHeightAboveDeckCenter, -railOffsetZ]} castShadow receiveShadow>
          <boxGeometry args={[slopeLength, RAMP_RAIL_HEIGHT, RAMP_RAIL_THICKNESS]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.55} metalness={0.25} />
        </mesh>
      </group>

      {/* Flat top launch platform */}
      <group position={[topPlatformCenterX, topPlatformCenterY, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[topPlatformLength, deckThickness, rampWidth]} />
          <meshStandardMaterial color="#334155" roughness={0.65} metalness={0.2} />
        </mesh>
        <mesh position={[0, railHeightAboveDeckCenter, railOffsetZ]} castShadow receiveShadow>
          <boxGeometry args={[topPlatformLength, RAMP_RAIL_HEIGHT, RAMP_RAIL_THICKNESS]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.55} metalness={0.25} />
        </mesh>
        <mesh position={[0, railHeightAboveDeckCenter, -railOffsetZ]} castShadow receiveShadow>
          <boxGeometry args={[topPlatformLength, RAMP_RAIL_HEIGHT, RAMP_RAIL_THICKNESS]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.55} metalness={0.25} />
        </mesh>
        <mesh
          position={[-topPlatformLength / 2 + RAMP_RAIL_THICKNESS / 2, railHeightAboveDeckCenter, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={[RAMP_RAIL_THICKNESS, RAMP_RAIL_HEIGHT, rampWidth + RAMP_RAIL_THICKNESS * 2]}
          />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} metalness={0.2} />
        </mesh>
      </group>

      {/* Vertical support columns holding up the crest & launch deck */}
      {[-0.95, 0.95].map((pillarZ) => (
        <group key={pillarZ}>
          <mesh
            position={[crestX - 0.12, supportHeight / 2, pillarZ]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.14, supportHeight, 0.14]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.35} />
          </mesh>
          <mesh
            position={[crestX - topPlatformLength + 0.12, supportHeight / 2, pillarZ]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.14, supportHeight, 0.14]} />
            <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.35} />
          </mesh>
        </group>
      ))}
    </DraggableRigidPart>
  );
}

export default memo(InclinedRampProxy);

