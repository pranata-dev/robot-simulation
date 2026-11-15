'use client';

import { type RefObject, memo, useEffect, useMemo, useRef } from 'react';
import {
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
  useRevoluteJoint,
} from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import {
  SEESAW_BEAM_HALF_DEPTH,
  SEESAW_BEAM_HALF_HEIGHT,
  SEESAW_BEAM_LENGTH,
  SEESAW_PIVOT_Y,
} from '@/lib/constants/hardwareCatalog';
import { syncRigidBodyToWorldTransform } from '@/lib/physics/jointConstraints';
import { ENV_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface SeesawBeamProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const TICK_MARKS_METERS = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5] as const;
const ZERO_ROTATION: Vector3Tuple = [0, 0, 0];

interface SeesawPivotJointProps {
  fulcrumRef: RefObject<RapierRigidBody | null>;
  beamRef: RefObject<RapierRigidBody | null>;
}

function SeesawPivotJoint({ fulcrumRef, beamRef }: SeesawPivotJointProps) {
  useRevoluteJoint(
    fulcrumRef as RefObject<RapierRigidBody>,
    beamRef as RefObject<RapierRigidBody>,
    [
      [0, SEESAW_PIVOT_Y, 0],
      [0, 0, 0],
      [0, 0, 1],
    ],
  );
  return null;
}

function SeesawBeamProxy({ id, position, rotation }: SeesawBeamProxyProps) {
  const fulcrumRef = useRef<RapierRigidBody | null>(null);
  const beamRef = useRef<RapierRigidBody | null>(null);

  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const simulationRunId = useSimulationStore((state) => state.simulationRunId);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
  const surfaceFriction = useSimulationStore((state) => state.surfaceFriction);
  const selectPart = useSimulationStore((state) => state.selectPart);

  const isPlaying = simulationStatus === 'playing';
  const [posX, posY, posZ] = position;
  const beamPosition = useMemo<Vector3Tuple>(
    () => [posX, posY + SEESAW_PIVOT_Y, posZ],
    [posX, posY, posZ],
  );
  const beamFriction = Math.max(surfaceFriction, 0.75);
  const prevPlayingRef = useRef(isPlaying);

  useEffect(() => {
    const beam = beamRef.current;
    const enteredPlaying = !prevPlayingRef.current && isPlaying;
    prevPlayingRef.current = isPlaying;
    if (!beam) return;
    if (isPlaying && !enteredPlaying) return;

    syncRigidBodyToWorldTransform(beam, beamPosition, ZERO_ROTATION);
    if (enteredPlaying) {
      try {
        beam.recomputeMassPropertiesFromColliders();
        beam.wakeUp();
      } catch {
        // Ignore stale RigidBody during scene teardown.
      }
    }
  }, [beamPosition, isPlaying, resetNonce]);

  return (
    <group>
      {/* Static Fulcrum Stand */}
      <DraggableRigidPart
        id={id}
        partType="physics_seesaw_beam"
        position={position}
        rotation={rotation}
        rigidBodyRef={fulcrumRef}
        rigidBodyTypeOverride="fixed"
        includeDefaultCollider={false}
        collisionGroups={ENV_COLLISION_GROUPS}
        friction={0.9}
        restitution={0.05}
        customColliders={
          /* Pedestal base stays strictly below y = 0.32 so tilted beam never hits fulcrum base */
          <CuboidCollider
            args={[0.28, 0.16, 0.42]}
            position={[0, 0.16, 0]}
            friction={0.9}
            restitution={0.05}
            collisionGroups={ENV_COLLISION_GROUPS}
            solverGroups={ENV_COLLISION_GROUPS}
          />
        }
      >
        {/* Base plate */}
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 0.08, 0.92]} />
          <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Side support uprights outside beam Z bounds */}
        {[-0.39, 0.39].map((sideZ) => (
          <mesh key={sideZ} position={[0, SEESAW_PIVOT_Y / 2 + 0.02, sideZ]} castShadow receiveShadow>
            <boxGeometry args={[0.14, SEESAW_PIVOT_Y + 0.02, 0.06]} />
            <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.35} />
          </mesh>
        ))}
        {/* Steel axle pin at pivot height */}
        <mesh position={[0, SEESAW_PIVOT_Y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.88, 20]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.25} metalness={0.85} />
        </mesh>
      </DraggableRigidPart>

      {/* Pivoted 3.0m Balance Beam */}
      <RigidBody
        ref={beamRef}
        name={`${id}_BEAM`}
        type={isPlaying ? 'dynamic' : 'kinematicPosition'}
        colliders={false}
        canSleep={false}
        position={beamPosition}
        rotation={ZERO_ROTATION}
        angularDamping={0.45}
        linearDamping={0.05}
        collisionGroups={ENV_COLLISION_GROUPS}
        solverGroups={ENV_COLLISION_GROUPS}
      >
        <CuboidCollider
          args={[SEESAW_BEAM_LENGTH / 2, SEESAW_BEAM_HALF_HEIGHT, SEESAW_BEAM_HALF_DEPTH]}
          mass={1.5}
          friction={beamFriction}
          restitution={0.05}
          collisionGroups={ENV_COLLISION_GROUPS}
          solverGroups={ENV_COLLISION_GROUPS}
        />

        <group
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta <= 5) selectPart(id);
          }}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry
              args={[SEESAW_BEAM_LENGTH, SEESAW_BEAM_HALF_HEIGHT * 2, SEESAW_BEAM_HALF_DEPTH * 2]}
            />
            <meshStandardMaterial color="#0284c7" roughness={0.45} metalness={0.2} />
          </mesh>

          {/* Distance tick marks (-1.5m to +1.5m) */}
          {TICK_MARKS_METERS.map((markX) => {
            const isCenter = markX === 0;
            const xOffset = markX === -1.5 ? -1.48 : markX === 1.5 ? 1.48 : markX;
            return (
              <mesh
                key={markX}
                position={[xOffset, SEESAW_BEAM_HALF_HEIGHT + 0.003, 0]}
                receiveShadow
              >
                <boxGeometry
                  args={[isCenter ? 0.05 : 0.025, 0.006, SEESAW_BEAM_HALF_DEPTH * 1.85]}
                />
                <meshStandardMaterial
                  color={isCenter ? '#facc15' : '#f8fafc'}
                  roughness={0.4}
                />
              </mesh>
            );
          })}
        </group>
      </RigidBody>

      {isPlaying && (
        <SeesawPivotJoint
          key={`${id}-seesaw-${simulationRunId}`}
          fulcrumRef={fulcrumRef}
          beamRef={beamRef}
        />
      )}
    </group>
  );
}

export default memo(SeesawBeamProxy);
