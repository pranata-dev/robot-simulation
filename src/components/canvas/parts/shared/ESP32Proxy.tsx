'use client';

import { memo, useEffect, useRef } from 'react';
import { Text } from '@react-three/drei';
import type { RapierRigidBody } from '@react-three/rapier';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import PinNode from '@/components/canvas/parts/shared/PinNode';
import { ESP32_PINS, PART_CATALOG } from '@/lib/constants/socketRegistry';
import { ROBOT_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PinId, Vector3Tuple } from '@/types/simulator';

interface ESP32ProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
}

const { dimensions, mass } = PART_CATALOG.ESP32_DEVKIT;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const PCB_HEIGHT = 0.03;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HEIGHT / 2, DEPTH / 2];
const GPIO_PIN_COLOR = '#22c55e';
const SILKSCREEN_Y = PCB_HEIGHT / 2 + 0.004;
const SILKSCREEN_INWARD_OFFSET = 0.055;
const DISABLE_RAYCAST = () => null;

const PIN_SILKSCREEN_LABELS: Partial<Record<PinId, string>> = {
  ESP_VIN: '5V',
  ESP_GND: 'GND',
  ESP_D13: 'P1',
  ESP_D12: 'P2',
  ESP_D14: 'P3',
  ESP_D27: 'P4',
  ESP_D26: 'P5',
  ESP_D25: 'P6',
  ESP_D33: 'P7',
  ESP_D32: 'P8',
};

function ESP32Proxy({ id, position, rotation, attachedTo }: ESP32ProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
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
      partType="ESP32_DEVKIT"
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
      {/* Flat rectangular PCB substrate */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[WIDTH, PCB_HEIGHT, DEPTH]} />
        <meshStandardMaterial color="#065f46" roughness={0.55} metalness={0.15} />
      </mesh>

      {/* ESP-WROOM-32 RF shield */}
      <mesh castShadow position={[0, PCB_HEIGHT / 2 + 0.02, -0.1]}>
        <boxGeometry args={[0.085, 0.04, 0.22]} />
        <meshStandardMaterial color="#d4d4d8" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Micro-USB port at front edge */}
      <mesh castShadow position={[0, PCB_HEIGHT / 2 + 0.015, DEPTH / 2 - 0.03]}>
        <boxGeometry args={[0.075, 0.03, 0.07]} />
        <meshStandardMaterial color="#a1a1aa" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Interactive asset-map GPIO, VIN, and GND pins with PCB silkscreen labels */}
      {ESP32_PINS.map((pin) => {
        const label = PIN_SILKSCREEN_LABELS[pin.id] ?? pin.label;
        const xOffset = pin.position[0] < 0 ? SILKSCREEN_INWARD_OFFSET : -SILKSCREEN_INWARD_OFFSET;

        return (
          <group key={pin.id}>
            <PinNode
              partId={id}
              pin={pin}
              radius={0.03}
              color={pin.role === 'PWM' ? GPIO_PIN_COLOR : pin.color}
            />
            <Text
              position={[pin.position[0] + xOffset, SILKSCREEN_Y, pin.position[2]]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.036}
              color="white"
              anchorX="center"
              anchorY="middle"
              raycast={DISABLE_RAYCAST}
            >
              {label}
            </Text>
          </group>
        );
      })}
    </DraggableRigidPart>
  );
}

export default memo(ESP32Proxy);
