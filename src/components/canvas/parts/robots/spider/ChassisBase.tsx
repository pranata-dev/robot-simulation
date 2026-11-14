'use client';

import { memo, useEffect, useRef } from 'react';
import { CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import AnchorMarker, { type SocketFeedbackState } from '@/components/canvas/parts/shared/AnchorMarker';
import AssemblyStand from '@/components/canvas/parts/shared/AssemblyStand';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import {
  PART_CATALOG,
  getActiveBlueprint,
} from '@/lib/constants/socketRegistry';
import {
  CHASSIS_ANGULAR_DAMPING,
  CHASSIS_LINEAR_DAMPING,
  ROBOT_COLLISION_GROUPS,
} from '@/lib/physics/servoMotorControl';
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
const DISABLE_RAYCAST = () => null;

function ChassisBase({ id, position, rotation }: ChassisBaseProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const activeBlueprintId = useSimulationStore((state) => state.activeBlueprintId);
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');
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

  const blueprint = getActiveBlueprint(activeBlueprintId);
  const chassisDimensions = blueprint.chassisDimensions;
  const chassisHalfHeight = chassisDimensions[1] / 2;
  const colliderHalfExtents: Vector3Tuple = [
    chassisDimensions[0] / 2,
    chassisHalfHeight,
    chassisDimensions[2] / 2,
  ];
  const chassisSockets = blueprint.sockets.CHASSIS_BASE;

  const standHeight = position[1] - chassisHalfHeight;
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
        colliderHalfExtents={colliderHalfExtents}
        mass={CHASSIS_MASS * 0.4}
        friction={0.2}
        restitution={0}
        linearDamping={CHASSIS_LINEAR_DAMPING}
        angularDamping={CHASSIS_ANGULAR_DAMPING}
        canSleep={false}
        collisionGroups={ROBOT_COLLISION_GROUPS}
        rigidBodyRef={rigidBodyRef}
        userData={CHASSIS_USER_DATA}
        customColliders={
          /* Flush low-CoM belly ballast keeps CoM below chassis midline without reducing clearance */
          <CuboidCollider
            args={[colliderHalfExtents[0] * 0.8, 0.02, colliderHalfExtents[2] * 0.8]}
            position={[0, -(colliderHalfExtents[1] - 0.02), 0]}
            mass={CHASSIS_MASS * 0.6}
            friction={0.2}
            restitution={0}
            collisionGroups={ROBOT_COLLISION_GROUPS}
            solverGroups={ROBOT_COLLISION_GROUPS}
          />
        }
      >
        <mesh
          castShadow
          receiveShadow
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <boxGeometry args={chassisDimensions} />
          <meshStandardMaterial
            color="#3f3f46"
            metalness={0.3}
            roughness={0.6}
            transparent
            opacity={isWiringXray ? 0.22 : 0.65}
            depthWrite={!isWiringXray}
          />
        </mesh>
        {chassisSockets.map((socket) => {
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
