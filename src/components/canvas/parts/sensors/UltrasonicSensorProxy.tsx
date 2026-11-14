'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { interactionGroups, type RapierRigidBody, useRapier } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import PinNode from '@/components/canvas/parts/shared/PinNode';
import { PART_CATALOG, ULTRASONIC_PINS } from '@/lib/constants/hardwareCatalog';
import { ROBOT_COLLISION_GROUPS } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

interface UltrasonicSensorProxyProps {
  id: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
}

const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const { dimensions, mass } = PART_CATALOG.ULTRASONIC_HCSR04;
const [WIDTH, HEIGHT, DEPTH] = dimensions;
const COLLIDER_HALF_EXTENTS: Vector3Tuple = [WIDTH / 2, HEIGHT / 2, DEPTH / 2];
const ENV_RAY_GROUPS = interactionGroups(0, [0]);

const PCB_THICKNESS = 0.03;
const PCB_CENTER_Z = -0.055;
const TRANSDUCER_X_OFFSETS = [-0.12, 0.12] as const;
const TRANSDUCER_RADIUS = 0.075;
const TRANSDUCER_LENGTH = 0.11;
const TRANSDUCER_CENTER_Z = 0.015;
const TRANSDUCER_FRONT_Z = TRANSDUCER_CENTER_Z + TRANSDUCER_LENGTH / 2;

const RAY_ORIGIN_LOCAL = new THREE.Vector3(0, 0, TRANSDUCER_FRONT_Z + 0.015);
const RAY_MAX_TOI = 100;
const NO_OBSTACLE_CM = 999;
const SCENE_UNIT_TO_CM = 10;
const RAYCAST_INTERVAL_MS = 100;
const VISUAL_BEAM_MAX_LENGTH = 1.6;
const DISABLE_RAYCAST = () => null;

/** Forward acoustic cone directions in sensor local space (+Z is forward). */
const ACOUSTIC_CONE_DIRS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 1).normalize(),
  new THREE.Vector3(0, -0.04, 0.999).normalize(),
  new THREE.Vector3(0, -0.075, 0.997).normalize(),
  new THREE.Vector3(0, -0.11, 0.994).normalize(),
  new THREE.Vector3(0, -0.15, 0.988).normalize(),
  new THREE.Vector3(0, -0.22, 0.975).normalize(),
  new THREE.Vector3(0, -0.34, 0.94).normalize(),
  new THREE.Vector3(0, -0.52, 0.854).normalize(),
  new THREE.Vector3(0, -0.68, 0.733).normalize(),
  new THREE.Vector3(-0.14, -0.08, 0.987).normalize(),
  new THREE.Vector3(0.14, -0.08, 0.987).normalize(),
  new THREE.Vector3(-0.27, -0.08, 0.96).normalize(),
  new THREE.Vector3(0.27, -0.08, 0.96).normalize(),
];

function isValidObstacleCollider(collider: {
  parent(): RapierRigidBody | null;
  translation(): { y: number };
}): boolean {
  const parent = collider.parent();
  const userData = parent?.userData as { isFloor?: boolean } | undefined;
  if (userData?.isFloor === true) return false;
  // Floor collider sits centered at y = -0.5; obstacles always sit on/above y = 0.
  return collider.translation().y >= -0.1;
}

function UltrasonicSensorProxy({
  id,
  position,
  rotation = DEFAULT_ROTATION,
  attachedTo,
}: UltrasonicSensorProxyProps) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const beamMeshRef = useRef<THREE.Mesh | null>(null);
  const beamMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const lastSampleAtRef = useRef<number>(0);

  const worldPosVec = useMemo(() => new THREE.Vector3(), []);
  const worldQuat = useMemo(() => new THREE.Quaternion(), []);
  const rayOriginVec = useMemo(() => new THREE.Vector3(), []);
  const rayDirVec = useMemo(() => new THREE.Vector3(), []);

  const { rapier, world } = useRapier();
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  const wiringMode = useSimulationStore((state) => state.wiringMode);
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');
  const isPlaying = useSimulationStore((state) => state.simulationStatus === 'playing');
  const registerRigidBody = useSimulationStore((state) => state.registerRigidBody);
  const unregisterRigidBody = useSimulationStore((state) => state.unregisterRigidBody);

  const visiblePins =
    wiringMode === '1-wire' ? ULTRASONIC_PINS.filter((pin) => pin.role === 'PWM') : ULTRASONIC_PINS;

  useEffect(() => {
    registerRigidBody(id, rigidBodyRef);
    return () => {
      unregisterRigidBody(id, rigidBodyRef);
    };
  }, [id, registerRigidBody, unregisterRigidBody]);

  useEffect(() => {
    if (!isPlaying) {
      lastSampleAtRef.current = 0;
    }
  }, [isPlaying]);

  useFrame(() => {
    if (!isPlaying) return;
    const rb = rigidBodyRef.current;
    if (!rb) return;

    const now = performance.now();
    if (now - lastSampleAtRef.current < RAYCAST_INTERVAL_MS) {
      return;
    }
    lastSampleAtRef.current = now;

    if (!rayRef.current) {
      rayRef.current = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    }
    const ray = rayRef.current;

    const translation = rb.translation();
    const rot = rb.rotation();
    worldPosVec.set(translation.x, translation.y, translation.z);
    worldQuat.set(rot.x, rot.y, rot.z, rot.w);

    rayOriginVec.copy(RAY_ORIGIN_LOCAL).applyQuaternion(worldQuat).add(worldPosVec);
    ray.origin.x = rayOriginVec.x;
    ray.origin.y = rayOriginVec.y;
    ray.origin.z = rayOriginVec.z;

    let minToi = Number.POSITIVE_INFINITY;
    const filterFlags = rapier.QueryFilterFlags.EXCLUDE_SENSORS;

    for (const localDir of ACOUSTIC_CONE_DIRS) {
      rayDirVec.copy(localDir).applyQuaternion(worldQuat).normalize();
      ray.dir.x = rayDirVec.x;
      ray.dir.y = rayDirVec.y;
      ray.dir.z = rayDirVec.z;

      const hit = world.castRay(
        ray,
        RAY_MAX_TOI,
        true,
        filterFlags,
        ENV_RAY_GROUPS,
        undefined,
        rb,
        isValidObstacleCollider,
      );
      if (hit && hit.timeOfImpact < minToi) {
        minToi = hit.timeOfImpact;
      }
    }

    const distanceCm = Number.isFinite(minToi)
      ? Math.round(minToi * SCENE_UNIT_TO_CM * 10) / 10
      : NO_OBSTACLE_CM;

    useSimulationStore.getState().updateSensorDistance(id, distanceCm);

    if (beamMeshRef.current && beamMatRef.current) {
      const visualLen = Number.isFinite(minToi)
        ? Math.max(0.08, Math.min(VISUAL_BEAM_MAX_LENGTH, minToi))
        : VISUAL_BEAM_MAX_LENGTH;
      beamMeshRef.current.scale.set(1, visualLen, 1);
      beamMeshRef.current.position.z = TRANSDUCER_FRONT_Z + visualLen / 2;
      beamMatRef.current.color.set(distanceCm <= 20 ? '#f59e0b' : '#38bdf8');
      beamMatRef.current.opacity = Number.isFinite(minToi) ? 0.34 : 0.16;
    }
  });

  return (
    <DraggableRigidPart
      id={id}
      partType="ULTRASONIC_HCSR04"
      position={position}
      rotation={rotation}
      attachedTo={attachedTo}
      enableSnapping
      mass={mass}
      colliderHalfExtents={COLLIDER_HALF_EXTENTS}
      collisionGroups={ROBOT_COLLISION_GROUPS}
      rigidBodyRef={rigidBodyRef}
    >
      <group>
        {/* Main blue HC-SR04 PCB carrier board */}
        <mesh position={[0, 0, PCB_CENTER_Z]} castShadow={!isWiringXray} receiveShadow>
          <boxGeometry args={[WIDTH, HEIGHT, PCB_THICKNESS]} />
          <meshStandardMaterial
            color="#1d4ed8"
            roughness={0.45}
            metalness={0.15}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.25 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* Top 4-pin header insulator block */}
        <mesh position={[0, HEIGHT / 2 + 0.012, PCB_CENTER_Z]} castShadow={!isWiringXray}>
          <boxGeometry args={[0.24, 0.024, 0.036]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.55}
            metalness={0.1}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.25 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* Silver crystal oscillator between transducers */}
        <mesh position={[0, 0.055, PCB_CENTER_Z + PCB_THICKNESS / 2 + 0.008]} castShadow={!isWiringXray}>
          <boxGeometry args={[0.09, 0.036, 0.018]} />
          <meshStandardMaterial
            color="#cbd5e1"
            roughness={0.28}
            metalness={0.8}
            transparent={isWiringXray}
            opacity={isWiringXray ? 0.25 : 1}
            depthWrite={!isWiringXray}
          />
        </mesh>

        {/* Dual forward-facing aluminum ultrasonic transducers (+Z) */}
        {TRANSDUCER_X_OFFSETS.map((offsetX) => (
          <group key={offsetX} position={[offsetX, 0, TRANSDUCER_CENTER_Z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={!isWiringXray} receiveShadow>
              <cylinderGeometry args={[TRANSDUCER_RADIUS, TRANSDUCER_RADIUS, TRANSDUCER_LENGTH, 20]} />
              <meshStandardMaterial
                color="#e2e8f0"
                roughness={0.25}
                metalness={0.78}
                transparent={isWiringXray}
                opacity={isWiringXray ? 0.25 : 1}
                depthWrite={!isWiringXray}
              />
            </mesh>
            <mesh
              position={[0, 0, TRANSDUCER_LENGTH / 2 + 0.002]}
              rotation={[Math.PI / 2, 0, 0]}
              raycast={DISABLE_RAYCAST}
            >
              <cylinderGeometry args={[TRANSDUCER_RADIUS * 0.78, TRANSDUCER_RADIUS * 0.78, 0.005, 16]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.8}
                metalness={0.2}
                transparent={isWiringXray}
                opacity={isWiringXray ? 0.25 : 1}
                depthWrite={!isWiringXray}
              />
            </mesh>
          </group>
        ))}

        {/* Live ultrasonic beam preview during physics playback */}
        {isPlaying && (
          <mesh
            ref={beamMeshRef}
            position={[0, 0, TRANSDUCER_FRONT_Z + VISUAL_BEAM_MAX_LENGTH / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={DISABLE_RAYCAST}
          >
            <cylinderGeometry args={[0.02, 0.14, 1, 14, 1, true]} />
            <meshBasicMaterial
              ref={beamMatRef}
              color="#38bdf8"
              transparent
              opacity={0.18}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Electrical pins (VCC, TRIG, ECHO, GND) */}
        {visiblePins.map((pin) => (
          <PinNode key={pin.id} partId={id} pin={pin} />
        ))}
      </group>
    </DraggableRigidPart>
  );
}

export default memo(UltrasonicSensorProxy);
