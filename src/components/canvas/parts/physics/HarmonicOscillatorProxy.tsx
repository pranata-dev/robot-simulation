'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { BallCollider, CuboidCollider, interactionGroups } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import DraggableRigidPart from '@/components/canvas/parts/shared/DraggableRigidPart';
import { PART_CATALOG } from '@/lib/constants/hardwareCatalog';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { WorkspacePart } from '@/types/simulator';

const HELIX_SEGMENTS = 72;
const HELIX_TURNS = 9;
const HELIX_RADIUS = 0.14;
const BOB_RADIUS = 0.25;

interface HarmonicOscillatorProxyProps {
  part: WorkspacePart;
}

function PivotAnchorVisual({ label }: { label: string }) {
  return (
    <group>
      {/* Overhead clamp block */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.56, 0.22, 0.44]} />
        <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Vertical gantry pillar down to floor beside the swing plane */}
      <mesh castShadow receiveShadow position={[0, -1.8, -0.55]}>
        <boxGeometry args={[0.14, 3.6, 0.14]} />
        <meshStandardMaterial color="#475569" metalness={0.45} roughness={0.45} />
      </mesh>
      {/* Cantilever arm extending forward from pillar to pivot */}
      <mesh castShadow receiveShadow position={[0, 0, -0.28]}>
        <boxGeometry args={[0.14, 0.14, 0.56]} />
        <meshStandardMaterial color="#475569" metalness={0.45} roughness={0.45} />
      </mesh>
      {/* Base foot */}
      <mesh castShadow receiveShadow position={[0, -3.55, -0.4]}>
        <boxGeometry args={[0.9, 0.1, 0.8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Pivot bearing pin */}
      <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.24, 16]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.75} roughness={0.25} />
      </mesh>
      <Text position={[0, 0.24, 0]} fontSize={0.12} color="#e2e8f0" anchorX="center" anchorY="bottom">
        {label}
      </Text>
    </group>
  );
}

function PendulumRodConnector({ part }: { part: WorkspacePart }) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const pPos = useMemo(() => new THREE.Vector3(), []);
  const bPos = useMemo(() => new THREE.Vector3(), []);
  const delta = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !part.attachedTo) return;

    const state = useSimulationStore.getState();
    const pivotPart = state.workspaceParts.find((p) => p.id === part.attachedTo);
    if (!pivotPart) return;

    const isPlaying = state.simulationStatus === 'playing';
    const pivotBody = isPlaying ? state.rigidBodyRefs[pivotPart.id]?.current : null;
    const bobBody = isPlaying ? state.rigidBodyRefs[part.id]?.current : null;

    if (pivotBody && bobBody) {
      const pt = pivotBody.translation();
      const bt = bobBody.translation();
      pPos.set(pt.x, pt.y - 0.1, pt.z);
      bPos.set(bt.x, bt.y, bt.z);
    } else {
      pPos.set(pivotPart.position[0], pivotPart.position[1] - 0.1, pivotPart.position[2]);
      bPos.set(part.position[0], part.position[1], part.position[2]);
    }

    delta.subVectors(pPos, bPos);
    const len = delta.length();
    if (len < 1e-4) return;
    mid.addVectors(pPos, bPos).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.scale.set(1, len, 1);
    quat.setFromUnitVectors(up, delta.normalize());
    mesh.quaternion.copy(quat);
  });

  return (
    <mesh ref={meshRef} castShadow>
      <cylinderGeometry args={[0.025, 0.025, 1, 12]} />
      <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.25} />
    </mesh>
  );
}

function HelicalSpringConnector({ part }: { part: WorkspacePart }) {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array((HELIX_SEGMENTS + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#38bdf8', linewidth: 2 });
    return { geometry: geo, material: mat };
  }, []);

  const lineObj = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  const pPos = useMemo(() => new THREE.Vector3(), []);
  const mPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!part.attachedTo) return;
    const state = useSimulationStore.getState();
    const pivotPart = state.workspaceParts.find((p) => p.id === part.attachedTo);
    if (!pivotPart) return;

    const isPlaying = state.simulationStatus === 'playing';
    const pivotBody = isPlaying ? state.rigidBodyRefs[pivotPart.id]?.current : null;
    const massBody = isPlaying ? state.rigidBodyRefs[part.id]?.current : null;

    if (pivotBody && massBody) {
      const pt = pivotBody.translation();
      const mt = massBody.translation();
      pPos.set(pt.x, pt.y - 0.1, pt.z);
      mPos.set(mt.x, mt.y + 0.25, mt.z);
    } else {
      pPos.set(pivotPart.position[0], pivotPart.position[1] - 0.1, pivotPart.position[2]);
      mPos.set(part.position[0], part.position[1] + 0.25, part.position[2]);
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i <= HELIX_SEGMENTS; i++) {
      const t = i / HELIX_SEGMENTS;
      const angle = t * HELIX_TURNS * Math.PI * 2;
      const envelope = t < 0.08 || t > 0.92 ? 0 : 1;
      const x = THREE.MathUtils.lerp(pPos.x, mPos.x, t) + Math.cos(angle) * HELIX_RADIUS * envelope;
      const y = THREE.MathUtils.lerp(pPos.y, mPos.y, t);
      const z = THREE.MathUtils.lerp(pPos.z, mPos.z, t) + Math.sin(angle) * HELIX_RADIUS * envelope;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  return <primitive object={lineObj} />;
}

function HarmonicOscillatorProxy({ part }: HarmonicOscillatorProxyProps) {
  const entry = PART_CATALOG[part.type];
  const harmonicMass = useSimulationStore((s) => s.harmonicMass);
  const envGroups = interactionGroups(0, [0, 1]);

  if (part.type === 'pivot_anchor') {
    return (
      <DraggableRigidPart
        id={part.id}
        partType={part.type}
        position={part.position}
        rotation={part.rotation}
        attachedTo={part.attachedTo}
        rigidBodyTypeOverride="fixed"
        colliders={false}
        includeDefaultCollider={false}
        collisionGroups={envGroups}
        customColliders={
          <CuboidCollider
            args={[0.28, 0.11, 0.22]}
            friction={0.5}
            restitution={0.1}
            collisionGroups={envGroups}
            solverGroups={envGroups}
          />
        }
      >
        <PivotAnchorVisual label={part.label} />
      </DraggableRigidPart>
    );
  }

  if (part.type === 'pendulum_bob') {
    return (
      <>
        <DraggableRigidPart
          id={part.id}
          partType={part.type}
          position={part.position}
          rotation={part.rotation}
          attachedTo={part.attachedTo}
          mass={entry.mass}
          friction={entry.defaultFriction ?? 0.1}
          restitution={entry.defaultRestitution ?? 0.2}
          colliders={false}
          includeDefaultCollider={false}
          collisionGroups={envGroups}
          canSleep={false}
          linearDamping={0}
          angularDamping={0.15}
          customColliders={
            <BallCollider
              args={[BOB_RADIUS]}
              mass={entry.mass}
              friction={0.1}
              restitution={0.2}
              collisionGroups={envGroups}
              solverGroups={envGroups}
            />
          }
        >
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[BOB_RADIUS, 28, 28]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.7} roughness={0.22} />
          </mesh>
          <Text position={[0, -0.36, 0]} fontSize={0.11} color="#fde68a" anchorX="center">
            {`Pendulum (${harmonicMass.toFixed(1)} kg)`}
          </Text>
        </DraggableRigidPart>
        <PendulumRodConnector part={part} />
      </>
    );
  }

  return (
    <>
      <DraggableRigidPart
        id={part.id}
        partType={part.type}
        position={part.position}
        rotation={part.rotation}
        attachedTo={part.attachedTo}
        mass={entry.mass}
        friction={entry.defaultFriction ?? 0.2}
        restitution={entry.defaultRestitution ?? 0.1}
        colliders={false}
        includeDefaultCollider={false}
        collisionGroups={envGroups}
        canSleep={false}
        linearDamping={0}
        angularDamping={0.5}
        customColliders={
          <CuboidCollider
            args={[0.25, 0.25, 0.25]}
            mass={entry.mass}
            friction={0.2}
            restitution={0.1}
            collisionGroups={envGroups}
            solverGroups={envGroups}
          />
        }
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#0284c7" metalness={0.45} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <torusGeometry args={[0.07, 0.02, 10, 20]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
        </mesh>
        <Text position={[0, -0.38, 0]} fontSize={0.11} color="#bae6fd" anchorX="center">
          {`Spring Mass (${harmonicMass.toFixed(1)} kg)`}
        </Text>
      </DraggableRigidPart>
      <HelicalSpringConnector part={part} />
    </>
  );
}

export default memo(HarmonicOscillatorProxy);
