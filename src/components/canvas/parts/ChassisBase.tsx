'use client';

import { memo, useEffect, useRef } from 'react';
import { type RapierRigidBody, interactionGroups } from '@react-three/rapier';
import AnchorMarker, { type SocketFeedbackState } from '@/components/canvas/parts/AnchorMarker';
import AssemblyStand from '@/components/canvas/parts/AssemblyStand';
import DraggableRigidPart from '@/components/canvas/parts/DraggableRigidPart';
import {
  CHASSIS_COLLIDER_HALF_EXTENTS,
  CHASSIS_DIMENSIONS,
  CHASSIS_HALF_HEIGHT,
  CHASSIS_SOCKETS,
  PART_CATALOG,
} from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface ChassisBaseProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const CHASSIS_USER_DATA = { type: 'chassis' };
const CHASSIS_MASS = PART_CATALOG.CHASSIS_BASE.mass;
const STAND_VISIBILITY_EPSILON = 0.005;

function ChassisBase({ id, position, rotation }: ChassisBaseProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const registerRigidBody = useSimulationStore((state) => state.registerRigidBody);
  const unregisterRigidBody = useSimulationStore((state) => state.unregisterRigidBody);
  const activeSnapTarget = useSimulationStore((state) =>
    state.activeSnapTarget?.parentId === id ? state.activeSnapTarget : null,
  );

  useEffect(() => {
    registerRigidBody(id, rigidBodyRef);
    return () => {
      unregisterRigidBody(id, rigidBodyRef);
    };
  }, [id, registerRigidBody, unregisterRigidBody]);

  const standHeight = position[1] - CHASSIS_HALF_HEIGHT;
  const showAssemblyStand = simulationStatus === 'idle' && standHeight > STAND_VISIBILITY_EPSILON;

  return (
    <>
      <DraggableRigidPart
        id={id}
        partType="CHASSIS_BASE"
        position={position}
        rotation={rotation}
        colliders={false}
        includeDefaultCollider
        colliderHalfExtents={CHASSIS_COLLIDER_HALF_EXTENTS}
        mass={CHASSIS_MASS}
        friction={0.4}
        linearDamping={0.35}
        angularDamping={1.0}
        rigidBodyTypeOverride="dynamic"
        collisionGroups={interactionGroups(1, [0])}
        rigidBodyRef={rigidBodyRef}
        userData={CHASSIS_USER_DATA}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={CHASSIS_DIMENSIONS} />
          <meshStandardMaterial
            color="#3f3f46"
            metalness={0.3}
            roughness={0.6}
            transparent
            opacity={0.65}
          />
        </mesh>
        {CHASSIS_SOCKETS.map((socket) => {
          let feedbackState: SocketFeedbackState = 'idle';
          if (activeSnapTarget?.socketId === socket.id) {
            feedbackState = activeSnapTarget.isValid ? 'valid' : 'invalid';
          }

          return (
            <AnchorMarker
              key={socket.id}
              name={socket.id}
              position={socket.position}
              rotation={socket.rotation}
              feedbackState={feedbackState}
            />
          );
        })}
      </DraggableRigidPart>

      {showAssemblyStand && (
        <AssemblyStand chassisId={id} chassisPosition={position} standHeight={standHeight} />
      )}
    </>
  );
}

export default memo(ChassisBase);
