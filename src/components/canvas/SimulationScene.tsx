'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import type * as THREE from 'three';
import ChassisBase from '@/components/canvas/parts/robots/spider/ChassisBase';
import SpiderLegProxy from '@/components/canvas/parts/robots/spider/SpiderLegProxy';
import ESP32Proxy from '@/components/canvas/parts/shared/ESP32Proxy';
import ObstacleProxy from '@/components/canvas/parts/shared/ObstacleProxy';
import ServoProxy from '@/components/canvas/parts/shared/ServoProxy';
import TargetZoneProxy from '@/components/canvas/parts/shared/TargetZoneProxy';
import CameraViewController, { type OrbitControlsHandle } from '@/components/canvas/CameraViewController';
import JointSystem from '@/components/canvas/JointSystem';
import PerformanceMonitorGuard from '@/components/canvas/PerformanceMonitorGuard';
import PhysicsInspectorOverlay from '@/components/canvas/PhysicsInspectorOverlay';
import WiringSystem from '@/components/canvas/WiringSystem';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { clearPhysicsRegistry } from '@/lib/physics/rigidBodyRegistry';
import { ENV_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { disposeSceneResources } from '@/lib/three/disposeSceneResources';
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
      type="fixed" colliders={false} name="FLOOR" position={[0, 0, 0]}
      friction={1.5} restitution={0}
      collisionGroups={ENV_COLLISION_GROUPS} solverGroups={ENV_COLLISION_GROUPS}
    >
      <CuboidCollider
        args={[FLOOR_HALF, FLOOR_THICKNESS_HALF, FLOOR_HALF]} position={[0, -FLOOR_THICKNESS_HALF, 0]}
        friction={1.5} restitution={0}
        collisionGroups={ENV_COLLISION_GROUPS} solverGroups={ENV_COLLISION_GROUPS}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color={theme === 'dark' ? '#1e293b' : '#f1f5f9'} roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

function Lights({ theme, shadowsEnabled }: { theme: ThemeMode; shadowsEnabled: boolean }) {
  const isDark = theme === 'dark';

  return (
    <>
      <ambientLight intensity={isDark ? 0.35 : 0.65} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={isDark ? 1.05 : 1.4}
        castShadow={shadowsEnabled}
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
  useKeyboardShortcuts();
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const isPhysicsPaused = simulationStatus !== 'playing';
  const runId = useSimulationStore((state) => state.runId);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
  const theme = useSimulationStore((state) => state.theme);
  const performanceMode = useSimulationStore((state) => state.performanceMode);
  const physicsInspectorOpen = useSimulationStore((state) => state.physicsInspectorOpen);
  const isDark = theme === 'dark';
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);

  useEffect(() => {
    return () => {
      const store = useSimulationStore.getState();
      store.stopSimulation();
      store.setPerformanceMode(false);
      clearPhysicsRegistry();
      if (sceneRef.current) {
        disposeSceneResources(sceneRef.current);
        sceneRef.current = null;
      }
      if (glRef.current) {
        glRef.current.renderLists.dispose();
        glRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={!performanceMode}
        dpr={performanceMode ? [1, 1] : [1, 2]}
        camera={{ position: CAMERA_POSITION, fov: 50, near: 0.05, far: 200 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          glRef.current = gl;
          sceneRef.current = scene;
        }}
        onPointerMissed={() => {
          const store = useSimulationStore.getState();
          store.cancelWiring();
          store.selectPart(null);
        }}
      >
        <color attach="background" args={[isDark ? '#0f172a' : '#f8fafc']} />
        <Lights theme={theme} shadowsEnabled={!performanceMode} />
        <PerformanceMonitorGuard />

        <gridHelper
          args={[FLOOR_SIZE, FLOOR_SIZE * 2, isDark ? '#334155' : '#cbd5e1', isDark ? '#1e293b' : '#e2e8f0']}
          position={[0, 0.0005, 0]}
        />
        {!performanceMode && (
          <ContactShadows
            resolution={1024} scale={20} blur={2} far={2} color="#000000"
            opacity={isDark ? 0.55 : 0.4} position={[0, 0.001, 0]}
          />
        )}

        <Suspense fallback={null}>
          <Environment preset="city" environmentIntensity={isDark ? 0.45 : 0.85} />
          <Physics gravity={GRAVITY} paused={isPhysicsPaused}>
            <Floor theme={theme} />
            <group key={`sim-${runId}-${resetNonce}-${simulationStatus}`}>
              <WorkspaceParts />
              <JointSystem />
            </group>
          </Physics>
        </Suspense>

        <WiringSystem />
        {physicsInspectorOpen && <PhysicsInspectorOverlay />}
        <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} enableDamping />
        <CameraViewController controlsRef={controlsRef} defaultCameraPosition={CAMERA_POSITION} />
      </Canvas>

      {performanceMode && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-amber-400/40 bg-slate-950/80 px-3 py-1 text-[11px] font-medium tracking-wide text-amber-200 shadow-md backdrop-blur-sm"
        >
          Performance Mode Active
        </div>
      )}
    </div>
  );
}
