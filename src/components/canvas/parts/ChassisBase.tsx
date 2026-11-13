'use client';

import { memo, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { type RapierRigidBody, interactionGroups, useRapier } from '@react-three/rapier';
import AnchorMarker, { type SocketFeedbackState } from '@/components/canvas/parts/AnchorMarker';
import DraggableRigidPart from '@/components/canvas/parts/DraggableRigidPart';
import { CHASSIS_SOCKETS } from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface ChassisBaseProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
}

const CHASSIS_USER_DATA = { type: 'chassis' };

function ChassisBase({ id, position, rotation }: ChassisBaseProps) {
  const { world } = useRapier();
  const { scene } = useThree();
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
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

  useEffect(() => {
    const isAtResetOrigin =
      simulationStatus === 'idle' &&
      position[0] === 0 &&
      position[1] === 0.5 &&
      position[2] === 0;
    if (resetNonce === 0 || !isAtResetOrigin) return;

    rigidBodyRef.current?.setTranslation({ x: 0, y: 0.5, z: 0 }, true);
    rigidBodyRef.current?.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);
    rigidBodyRef.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rigidBodyRef.current?.setAngvel({ x: 0, y: 0, z: 0 }, true);

    const chassisObject = scene.getObjectByName(id);
    if (chassisObject) {
      chassisObject.position.set(0, 0.5, 0);
      chassisObject.quaternion.set(0, 0, 0, 1);
    }

    world.propagateModifiedBodyPositionsToColliders();
  }, [id, position, resetNonce, scene, simulationStatus, world]);

  return (
    <DraggableRigidPart
      id={id}
      partType="CHASSIS_BASE"
      position={position}
      rotation={rotation}
      colliders="cuboid"
      includeDefaultCollider={false}
      friction={0.4}
      linearDamping={0.35}
      angularDamping={1.0}
      rigidBodyTypeOverride="dynamic"
      collisionGroups={interactionGroups(1, [0])}
      rigidBodyRef={rigidBodyRef}
      userData={CHASSIS_USER_DATA}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.15, 1.6]} />
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
  );
}

export default memo(ChassisBase);
