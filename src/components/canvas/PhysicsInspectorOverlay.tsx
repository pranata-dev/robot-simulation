'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  MAX_TELEMETRY_CONTACTS,
  createTelemetryAccumulator,
  resetPhysicsTelemetry,
  samplePhysicsTelemetryFrame,
} from '@/lib/physics/telemetryState';
import { useSimulationStore } from '@/store/useSimulationStore';

const DISABLE_RAYCAST = () => null;
const CONTACT_SLOTS = Array.from({ length: MAX_TELEMETRY_CONTACTS }, (_, i) => i);

/**
 * Renders the 3D Center of Mass (CoM) crosshair, downward Gravity Force vector (W = mg),
 * and upward ground contact reaction indicators while sampling live telemetry at zero GC cost.
 */
export default function PhysicsInspectorOverlay() {
  const comGroupRef = useRef<THREE.Group | null>(null);
  const gravityShaftRef = useRef<THREE.Mesh | null>(null);
  const gravityHeadRef = useRef<THREE.Mesh | null>(null);
  const contactGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const accumulatorRef = useRef(createTelemetryAccumulator());

  useEffect(() => {
    return () => {
      resetPhysicsTelemetry();
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const { workspaceParts, simulationStatus, wiringValidation, servoAngles } =
      useSimulationStore.getState();

    const acc = accumulatorRef.current;
    const telemetry = samplePhysicsTelemetryFrame(
      dt,
      workspaceParts,
      simulationStatus,
      wiringValidation,
      servoAngles,
      acc,
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
    const arrowLength = Math.min(0.65, Math.max(0.24, totalMassKg * 1.45));
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
    </group>
  );
}
