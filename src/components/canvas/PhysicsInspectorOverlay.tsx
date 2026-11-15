'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  MAX_TELEMETRY_CONTACTS,
  MAX_VELOCITY_VECTORS,
  createTelemetryAccumulator,
  resetPhysicsTelemetry,
  samplePhysicsTelemetryFrame,
} from '@/lib/physics/telemetryState';
import { useSimulationStore } from '@/store/useSimulationStore';

const DISABLE_RAYCAST = () => null;
const CONTACT_SLOTS = Array.from({ length: MAX_TELEMETRY_CONTACTS }, (_, i) => i);
const VELOCITY_SLOTS = Array.from({ length: MAX_VELOCITY_VECTORS }, (_, i) => i);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const _velDir = new THREE.Vector3();
const _velQuat = new THREE.Quaternion();

/**
 * Renders the 3D Center of Mass (CoM) crosshair, downward Gravity Force vector (W = mg),
 * upward ground contact reaction indicators, and 3D linear velocity vectors (v) on moving free bodies.
 */
export default function PhysicsInspectorOverlay() {
  const comGroupRef = useRef<THREE.Group | null>(null);
  const gravityShaftRef = useRef<THREE.Mesh | null>(null);
  const gravityHeadRef = useRef<THREE.Mesh | null>(null);
  const contactGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const velocityGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const velocityShaftRefs = useRef<(THREE.Mesh | null)[]>([]);
  const velocityHeadRefs = useRef<(THREE.Mesh | null)[]>([]);
  const accumulatorRef = useRef(createTelemetryAccumulator());

  useEffect(() => {
    return () => {
      resetPhysicsTelemetry();
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const {
      workspaceParts,
      simulationStatus,
      wiringValidation,
      servoAngles,
      gravity,
      selectedPartId,
      harmonicMass,
      pendulumLength,
      springStiffness,
      timeScale,
    } = useSimulationStore.getState();

    const acc = accumulatorRef.current;
    const telemetry = samplePhysicsTelemetryFrame(
      dt,
      workspaceParts,
      simulationStatus,
      wiringValidation,
      servoAngles,
      acc,
      gravity,
      selectedPartId,
      {
        massKg: harmonicMass,
        pendulumLengthM: pendulumLength,
        springStiffness,
        timeScale,
      },
    );

    const hasMass = telemetry.totalMassGrams > 0;
    if (comGroupRef.current) {
      comGroupRef.current.visible = hasMass;
      comGroupRef.current.position.set(
        telemetry.centerOfMass[0],
        telemetry.centerOfMass[1],
        telemetry.centerOfMass[2],
      );
    }

    const totalMassKg = telemetry.totalMassGrams / 1000;
    const arrowLength = Math.min(0.65, Math.max(0.24, totalMassKg * 0.45));
    const headLength = 0.085;
    const shaftLength = Math.max(0.08, arrowLength - headLength);
    if (gravityShaftRef.current && gravityHeadRef.current) {
      gravityShaftRef.current.scale.set(1, shaftLength, 1);
      gravityShaftRef.current.position.set(0, -shaftLength / 2, 0);
      gravityHeadRef.current.position.set(0, -(shaftLength + headLength / 2), 0);
    }

    for (let i = 0; i < MAX_TELEMETRY_CONTACTS; i++) {
      const slotGroup = contactGroupRefs.current[i];
      if (!slotGroup) continue;
      if (i < telemetry.groundedContacts) {
        const pt = acc.contactPoints[i];
        slotGroup.visible = true;
        slotGroup.position.set(pt[0], pt[1], pt[2]);
      } else {
        slotGroup.visible = false;
      }
    }

    for (let i = 0; i < MAX_VELOCITY_VECTORS; i++) {
      const velGroup = velocityGroupRefs.current[i];
      const shaft = velocityShaftRefs.current[i];
      const head = velocityHeadRefs.current[i];
      if (!velGroup || !shaft || !head) continue;

      if (i < acc.velocityVectorCount) {
        const sample = acc.velocityVectors[i];
        const [vx, vy, vz] = sample.linvel;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > 0.04) {
          const totalLen = Math.min(2.2, Math.max(0.24, speed * 0.35));
          const vHeadLen = 0.1;
          const vShaftLen = Math.max(0.08, totalLen - vHeadLen);
          _velDir.set(vx / speed, vy / speed, vz / speed);
          _velQuat.setFromUnitVectors(UP_AXIS, _velDir);

          velGroup.visible = true;
          velGroup.position.set(sample.position[0], sample.position[1], sample.position[2]);
          velGroup.quaternion.copy(_velQuat);
          shaft.scale.set(1, vShaftLen, 1);
          shaft.position.set(0, vShaftLen / 2, 0);
          head.position.set(0, vShaftLen + vHeadLen / 2, 0);
        } else {
          velGroup.visible = false;
        }
      } else {
        velGroup.visible = false;
      }
    }
  });

  return (
    <group name="PHYSICS_INSPECTOR_OVERLAY">
      {/* 3D Center of Mass Target Gizmo + Downward Gravity Force Vector W = mg */}
      <group ref={comGroupRef} renderOrder={999}>
        <mesh raycast={DISABLE_RAYCAST}>
          <sphereGeometry args={[0.042, 16, 16]} />
          <meshBasicMaterial color="#facc15" depthTest={false} transparent opacity={0.95} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={DISABLE_RAYCAST}>
          <torusGeometry args={[0.075, 0.008, 12, 32]} />
          <meshBasicMaterial color="#facc15" depthTest={false} transparent opacity={0.9} />
        </mesh>
        <mesh raycast={DISABLE_RAYCAST}>
          <torusGeometry args={[0.075, 0.008, 12, 32]} />
          <meshBasicMaterial color="#facc15" depthTest={false} transparent opacity={0.9} />
        </mesh>

        <mesh ref={gravityShaftRef} raycast={DISABLE_RAYCAST}>
          <cylinderGeometry args={[0.011, 0.011, 1, 12]} />
          <meshBasicMaterial color="#f43f5e" depthTest={false} transparent opacity={0.92} />
        </mesh>
        <mesh ref={gravityHeadRef} rotation={[Math.PI, 0, 0]} raycast={DISABLE_RAYCAST}>
          <coneGeometry args={[0.032, 0.085, 16]} />
          <meshBasicMaterial color="#f43f5e" depthTest={false} transparent opacity={0.95} />
        </mesh>
      </group>

      {/* Upward Ground Contact Reaction Indicators */}
      {CONTACT_SLOTS.map((slot) => (
        <group
          key={slot}
          ref={(el) => {
            contactGroupRefs.current[slot] = el;
          }}
          visible={false}
          renderOrder={998}
        >
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={DISABLE_RAYCAST}>
            <ringGeometry args={[0.055, 0.085, 24]} />
            <meshBasicMaterial
              color="#10b981"
              side={THREE.DoubleSide}
              depthTest={false}
              transparent
              opacity={0.9}
            />
          </mesh>
          <mesh position={[0, 0.11, 0]} raycast={DISABLE_RAYCAST}>
            <cylinderGeometry args={[0.009, 0.009, 0.22, 12]} />
            <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.245, 0]} raycast={DISABLE_RAYCAST}>
            <coneGeometry args={[0.028, 0.065, 16]} />
            <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.95} />
          </mesh>
        </group>
      ))}
      {/* 3D Linear Velocity Vectors (v) for Moving Free-Body Objects */}
      {VELOCITY_SLOTS.map((slot) => (
        <group
          key={slot}
          ref={(el) => {
            velocityGroupRefs.current[slot] = el;
          }}
          visible={false}
          renderOrder={1000}
        >
          <mesh
            ref={(el) => {
              velocityShaftRefs.current[slot] = el;
            }}
            raycast={DISABLE_RAYCAST}
          >
            <cylinderGeometry args={[0.015, 0.015, 1, 12]} />
            <meshBasicMaterial color="#38bdf8" depthTest={false} transparent opacity={0.95} />
          </mesh>
          <mesh
            ref={(el) => {
              velocityHeadRefs.current[slot] = el;
            }}
            raycast={DISABLE_RAYCAST}
          >
            <coneGeometry args={[0.042, 0.1, 16]} />
            <meshBasicMaterial color="#0ea5e9" depthTest={false} transparent opacity={0.98} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
