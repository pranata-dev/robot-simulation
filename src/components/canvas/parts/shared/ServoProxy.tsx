'use client';

import { memo, useEffect, useRef } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import AnchorMarker, { type SocketFeedbackState } from '@/components/canvas/parts/shared/AnchorMarker';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import PinNode from '@/components/canvas/parts/shared/PinNode';
import { PART_CATALOG, SERVO_PINS, getSocketsForPart } from '@/lib/constants/socketRegistry';
import { ROBOT_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
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
const HORN_Y = getSocketsForPart('SERVO_MG90S')[0]?.position[1] ?? 0.18;
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
const DISABLE_RAYCAST = () => null;

function ServoProxy({ id, position, rotation = DEFAULT_ROTATION, attachedTo }: ServoProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const wiringMode = useSimulationStore((state) => state.wiringMode);
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');
  const registerRigidBody = useSimulationStore((state) => state.registerRigidBody);
  const unregisterRigidBody = useSimulationStore((state) => state.unregisterRigidBody);
  const activeSnapTarget = useSimulationStore((state) =>
    state.activeSnapTarget?.parentId === id ? state.activeSnapTarget : null,
  );
  const visiblePins =
    wiringMode === '1-wire' ? SERVO_PINS.filter((pin) => pin.role === 'PWM') : SERVO_PINS;

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
      restitution={0}
      collisionGroups={ROBOT_COLLISION_GROUPS}
      rigidBodyRef={rigidBodyRef}
    >
      <group name={`${id}_BODY`}>
        {/* Main housing: vertical cylinders at each end bridged by a box. */}
        <mesh
          castShadow
          receiveShadow
          position={[-(WIDTH / 2 - BODY_RADIUS), 0, 0]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS, HEIGHT, 24]} />
          <meshStandardMaterial
            color="#1d4ed8"
            roughness={0.5}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[WIDTH / 2 - BODY_RADIUS, 0, 0]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS, HEIGHT, 24]} />
          <meshStandardMaterial
            color="#1d4ed8"
            roughness={0.5}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <boxGeometry args={[WIDTH - DEPTH, HEIGHT, DEPTH]} />
          <meshStandardMaterial
            color="#1d4ed8"
            roughness={0.5}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* Mounting ears. */}
        <mesh
          castShadow
          position={[0, HALF_HEIGHT - 0.06, 0]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <boxGeometry args={[MOUNT_EAR_WIDTH, 0.02, DEPTH]} />
          <meshStandardMaterial
            color="#1e3a8a"
            roughness={0.6}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* Output shaft & horn hub */}
        <mesh
          castShadow
          position={[0, HALF_HEIGHT + SHAFT_LENGTH / 2, 0]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <cylinderGeometry args={[SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_LENGTH, 16]} />
          <meshStandardMaterial
            color="#d4d4d8"
            metalness={0.8}
            roughness={0.25}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>
        <mesh
          castShadow
          position={[0, HORN_CENTER_Y, 0]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <cylinderGeometry args={[HORN_HUB_RADIUS, HORN_HUB_RADIUS, HORN_THICKNESS, 24]} />
          <meshStandardMaterial
            color="#f4f4f5"
            roughness={0.4}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>
        <mesh
          castShadow
          position={[0, HORN_CENTER_Y, HORN_ARM_OFFSET_Z]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <boxGeometry args={[HORN_ARM_WIDTH, HORN_THICKNESS, HORN_ARM_LENGTH]} />
          <meshStandardMaterial
            color="#f4f4f5"
            roughness={0.4}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* 3-pin Dupont header block on upper inward edge, clear of chassis and rotating horn */}
        <mesh
          castShadow
          position={wiringMode === '1-wire' ? [-0.08, 0.102, -0.105] : [0, 0.102, -0.105]}
          raycast={isWiringXray ? DISABLE_RAYCAST : undefined}
        >
          <boxGeometry
            args={wiringMode === '1-wire' ? [0.056, 0.032, 0.048] : [0.21, 0.032, 0.048]}
          />
          <meshStandardMaterial
            color="#1e293b"
            roughness={0.65}
            metalness={0.15}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.22 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {visiblePins.map((pin) => (
          <PinNode key={pin.id} partId={id} pin={pin} radius={0.025} />
        ))}

        {getSocketsForPart('SERVO_MG90S').map((socket) => {
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
