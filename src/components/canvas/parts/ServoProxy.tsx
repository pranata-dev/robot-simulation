'use client';

import { memo, useEffect, useRef } from 'react';
import { type RapierRigidBody, interactionGroups } from '@react-three/rapier';
import AnchorMarker, { type SocketFeedbackState } from '@/components/canvas/parts/AnchorMarker';
import DraggableRigidPart from '@/components/canvas/parts/DraggableRigidPart';
import PinNode from '@/components/canvas/parts/PinNode';
import { PART_CATALOG, SERVO_PINS, SERVO_SOCKETS } from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface ServoProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
}

const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const { dimensions, mass } = PART_CATALOG.SERVO_MG90S;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const HALF_HEIGHT = HEIGHT / 2;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HALF_HEIGHT, DEPTH / 2];

/** Output shaft spans from the top face of the body up to SOCKET_SERVO_HORN (y = 0.18). */
const HORN_Y = SERVO_SOCKETS[0].position[1];
const SHAFT_LENGTH = HORN_Y - HALF_HEIGHT;
const SHAFT_RADIUS = 0.025;
const HORN_HUB_RADIUS = 0.042;
const HORN_THICKNESS = 0.02;
const HORN_CENTER_Y = HORN_Y - HORN_THICKNESS / 2;
const HORN_ARM_LENGTH = 0.15;
const HORN_ARM_WIDTH = 0.042;
const HORN_ARM_OFFSET_Z = 0.05;

/** Housing = two vertical end cylinders + bridging box, matching the [0.22, 0.28, 0.12] footprint. */
const BODY_RADIUS = DEPTH / 2;
const MOUNT_EAR_WIDTH = WIDTH + 0.1;

function ServoProxy({ id, position, rotation = DEFAULT_ROTATION, attachedTo }: ServoProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
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

  return (
    <DraggableRigidPart
      id={id}
      partType="SERVO_MG90S"
      position={position}
      rotation={rotation}
      attachedTo={attachedTo}
      enableSnapping
      colliderHalfExtents={COLLIDER_HALF_EXTENTS}
      mass={mass}
      rigidBodyTypeOverride="dynamic"
      collisionGroups={interactionGroups(1, [0])}
      rigidBodyRef={rigidBodyRef}
    >
      <group name={`${id}_BODY`}>
        {/* Main housing: vertical cylinders at each end bridged by a box. */}
        <mesh castShadow receiveShadow position={[-(WIDTH / 2 - BODY_RADIUS), 0, 0]}>
          <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS, HEIGHT, 24]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
        </mesh>
        <mesh castShadow receiveShadow position={[WIDTH / 2 - BODY_RADIUS, 0, 0]}>
          <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS, HEIGHT, 24]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
        </mesh>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[WIDTH - DEPTH, HEIGHT, DEPTH]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
        </mesh>

        {/* Mounting ears. */}
        <mesh castShadow position={[0, HALF_HEIGHT - 0.06, 0]}>
          <boxGeometry args={[MOUNT_EAR_WIDTH, 0.02, DEPTH]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.6} />
        </mesh>

        {/* Output shaft & horn hub */}
        <mesh castShadow position={[0, HALF_HEIGHT + SHAFT_LENGTH / 2, 0]}>
          <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 16]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh castShadow position={[0, HORN_CENTER_Y, 0]}>
          <cylinderGeometry args={[HORN_HUB_RADIUS, HORN_HUB_RADIUS, HORN_THICKNESS, 24]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, HORN_CENTER_Y, HORN_ARM_OFFSET_Z]}>
          <boxGeometry args={[HORN_ARM_WIDTH, HORN_THICKNESS, HORN_ARM_LENGTH]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.4} />
        </mesh>

        {SERVO_PINS.map((pin) => (
          <PinNode key={pin.id} partId={id} pin={pin} radius={0.025} />
        ))}

        {SERVO_SOCKETS.map((socket) => {
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
      </group>
    </DraggableRigidPart>
  );
}

export default memo(ServoProxy);
