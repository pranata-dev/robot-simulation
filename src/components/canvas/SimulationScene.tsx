'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody, interactionGroups } from '@react-three/rapier';
import ChassisBase from '@/components/canvas/parts/ChassisBase';
import ESP32Proxy from '@/components/canvas/parts/ESP32Proxy';
import ObstacleProxy from '@/components/canvas/parts/ObstacleProxy';
import ServoProxy from '@/components/canvas/parts/ServoProxy';
import SpiderLegProxy from '@/components/canvas/parts/SpiderLegProxy';
import TargetZoneProxy from '@/components/canvas/parts/TargetZoneProxy';
import JointSystem from '@/components/canvas/JointSystem';
import WiringSystem from '@/components/canvas/WiringSystem';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { ThemeMode, Vector3Tuple } from '@/types/simulator';

const CAMERA_POSITION: Vector3Tuple = [5, 5, 5];
const GRAVITY: Vector3Tuple = [0, -9.81, 0];
const FLOOR_SIZE = 20;
const FLOOR_HALF = FLOOR_SIZE / 2;
const FLOOR_THICKNESS_HALF = 0.05;
const SHADOW_EXTENT = 6;

function WorkspaceParts() {
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);

  return (
    <>
      {workspaceParts.map((part) => {
        switch (part.type) {
          case 'CHASSIS_BASE':
            return (
              <ChassisBase
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
              />
            );
          case 'SERVO_MG90S':
            return (
              <ServoProxy
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
                attachedTo={part.attachedTo}
              />
            );
          case 'ESP32_DEVKIT':
            return (
              <ESP32Proxy
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
                attachedTo={part.attachedTo}
              />
            );
          case 'LEG_TIBIA':
            return (
              <SpiderLegProxy
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
                attachedTo={part.attachedTo}
              />
            );
          case 'OBSTACLE_BLOCK':
            return (
              <ObstacleProxy
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
              />
            );
          case 'TARGET_ZONE':
            return (
              <TargetZoneProxy
                key={part.id}
                id={part.id}
                position={part.position}
                rotation={part.rotation}
              />
            );
          case 'BATTERY_2S':
          case 'LEG_COXA':
            return null;
          default: {
            const unhandled: never = part.type;
            return unhandled;
          }
        }
      })}
    </>
  );
}

function Floor({ theme }: { theme: ThemeMode }) {
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      name="FLOOR"
      position={[0, 0, 0]}
      friction={1.5}
      collisionGroups={interactionGroups(0, [0, 1])}
    >
      <CuboidCollider
        args={[FLOOR_HALF, FLOOR_THICKNESS_HALF, FLOOR_HALF]}
        position={[0, -FLOOR_THICKNESS_HALF, 0]}
        friction={1.5}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial
          color={theme === 'dark' ? '#1e293b' : '#f1f5f9'}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
    </RigidBody>
  );
}

function Lights({ theme }: { theme: ThemeMode }) {
  const isDark = theme === 'dark';

  return (
    <>
      <ambientLight intensity={isDark ? 0.35 : 0.65} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={isDark ? 1.05 : 1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-bias={-0.0005}
      />
    </>
  );
}

export default function SimulationScene() {
  const isPhysicsPaused = useSimulationStore((state) => state.simulationStatus !== 'playing');
  const theme = useSimulationStore((state) => state.theme);
  const isDark = theme === 'dark';

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: CAMERA_POSITION, fov: 50, near: 0.05, far: 200 }}
      gl={{ antialias: true }}
      onPointerMissed={() => useSimulationStore.getState().cancelWiring()}
    >
      <color attach="background" args={[isDark ? '#0f172a' : '#f8fafc']} />
      <Lights theme={theme} />

      <gridHelper
        args={[FLOOR_SIZE, FLOOR_SIZE * 2, isDark ? '#334155' : '#cbd5e1', isDark ? '#1e293b' : '#e2e8f0']}
        position={[0, 0.0005, 0]}
      />
      <ContactShadows
        resolution={1024}
        scale={20}
        blur={2}
        opacity={isDark ? 0.55 : 0.4}
        far={2}
        color="#000000"
        position={[0, 0.001, 0]}
      />

      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={isDark ? 0.45 : 0.85} />
        <Physics gravity={GRAVITY} paused={isPhysicsPaused}>
          <Floor theme={theme} />
          <WorkspaceParts />
          <JointSystem />
        </Physics>
      </Suspense>

      <WiringSystem />
      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping />
    </Canvas>
  );
}
