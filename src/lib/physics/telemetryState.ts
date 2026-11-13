import * as THREE from 'three';
import { PART_CATALOG, getActiveChassisHalfHeight } from '@/lib/constants/socketRegistry';
import { getAllRegisteredRigidBodies, getPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import type {
  SimulationStatus,
  Vector3Tuple,
  WiringValidationResult,
  WorkspacePart,
} from '@/types/simulator';

export const MAX_TELEMETRY_CONTACTS = 6;
const LEG_FOOT_LOCAL: Vector3Tuple = [0, -0.34, 0.5];
const LEG_FOOT_RADIUS = 0.045;
const GROUND_CONTACT_THRESHOLD = 0.03;
const BASE_ESP32_CURRENT_MA = 80;
const SERVO_IDLE_CURRENT_MA = 150;
const SERVO_ACTIVE_SURGE_MA = 400; // 150 mA idle -> 550 mA peak active torque load

export interface PhysicsTelemetrySnapshot {
  totalMassGrams: number;
  weightNewtons: number;
  chassisSpeedCmPerSec: number;
  displacementCm: number;
  estimatedCurrentMa: number;
  activeServosMoving: number;
  poweredServoCount: number;
  groundedContacts: number;
  centerOfMass: Vector3Tuple;
}

export interface TelemetryAccumulator {
  origin: Vector3Tuple;
  hasOrigin: boolean;
  prevAngles: Record<string, number>;
  servoActivity: Record<string, number>;
  contactPoints: Vector3Tuple[];
}

export const INITIAL_PHYSICS_TELEMETRY: PhysicsTelemetrySnapshot = {
  totalMassGrams: 0,
  weightNewtons: 0,
  chassisSpeedCmPerSec: 0,
  displacementCm: 0,
  estimatedCurrentMa: 0,
  activeServosMoving: 0,
  poweredServoCount: 0,
  groundedContacts: 0,
  centerOfMass: [0, 0, 0],
};

/**
 * High-frequency telemetry buffer updated inside R3F `useFrame` and sampled by the HUD
 * at ~10 Hz to avoid triggering 60 FPS React DOM re-renders.
 */
export const physicsTelemetryRef: { current: PhysicsTelemetrySnapshot } = {
  current: {
    ...INITIAL_PHYSICS_TELEMETRY,
    centerOfMass: [...INITIAL_PHYSICS_TELEMETRY.centerOfMass],
  },
};

export function createTelemetryAccumulator(): TelemetryAccumulator {
  return {
    origin: [0, 0, 0],
    hasOrigin: false,
    prevAngles: {},
    servoActivity: {},
    contactPoints: Array.from({ length: MAX_TELEMETRY_CONTACTS }, () => [0, 0, 0] as Vector3Tuple),
  };
}

export function resetPhysicsTelemetry(): void {
  physicsTelemetryRef.current = {
    ...INITIAL_PHYSICS_TELEMETRY,
    centerOfMass: [...INITIAL_PHYSICS_TELEMETRY.centerOfMass],
  };
}

const _quat = new THREE.Quaternion();
const _vec = new THREE.Vector3();

/**
 * Samples Rapier body translations/velocities, mass-weighted Center of Mass, grounded leg contacts,
 * and estimated electrical draw into `physicsTelemetryRef.current` with zero per-frame allocations.
 */
export function samplePhysicsTelemetryFrame(
  dt: number,
  workspaceParts: readonly WorkspacePart[],
  simulationStatus: SimulationStatus,
  wiringValidation: WiringValidationResult,
  servoAngles: Readonly<Record<string, number>>,
  acc: TelemetryAccumulator,
): PhysicsTelemetrySnapshot {
  const partsById = new Map<string, WorkspacePart>();
  const legByServoId = new Map<string, string>();
  let chassisPart: WorkspacePart | undefined;

  for (const part of workspaceParts) {
    partsById.set(part.id, part);
    if (part.type === 'LEG_TIBIA' && part.attachedTo) {
      legByServoId.set(part.attachedTo, part.id);
    } else if (part.type === 'CHASSIS_BASE' && !chassisPart) {
      chassisPart = part;
    }
  }

  let totalMassKg = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const [partId, body] of getAllRegisteredRigidBodies()) {
    const part = partsById.get(partId);
    if (!part) continue;
    const mass = PART_CATALOG[part.type].mass;
    if (mass <= 0) continue;

    try {
      const t = body.translation();
      totalMassKg += mass;
      sumX += t.x * mass;
      sumY += t.y * mass;
      sumZ += t.z * mass;
    } catch {
      // Ignore unmounted rigid body handle.
    }
  }

  if (totalMassKg <= 0) {
    for (const part of workspaceParts) {
      const mass = PART_CATALOG[part.type].mass;
      if (mass <= 0) continue;
      totalMassKg += mass;
      sumX += part.position[0] * mass;
      sumY += part.position[1] * mass;
      sumZ += part.position[2] * mass;
    }
  }

  const comX = totalMassKg > 0 ? sumX / totalMassKg : 0;
  const comY = totalMassKg > 0 ? sumY / totalMassKg : 0.3;
  const comZ = totalMassKg > 0 ? sumZ / totalMassKg : 0;

  let chassisSpeedCmPerSec = 0;
  let displacementCm = 0;
  const chassisBody = chassisPart ? getPartRigidBody(chassisPart.id) : undefined;

  if (simulationStatus === 'playing' && chassisBody) {
    try {
      const t = chassisBody.translation();
      const v = chassisBody.linvel();
      if (!acc.hasOrigin) {
        acc.origin[0] = t.x;
        acc.origin[1] = t.y;
        acc.origin[2] = t.z;
        acc.hasOrigin = true;
      }
      chassisSpeedCmPerSec = Math.hypot(v.x, v.y, v.z) * 10;
      displacementCm = Math.hypot(t.x - acc.origin[0], t.z - acc.origin[2]) * 10;
    } catch {
      // Ignore unmounted body frame.
    }
  } else if (simulationStatus !== 'playing') {
    acc.hasOrigin = false;
  }

  let contactCount = 0;
  if (simulationStatus === 'playing') {
    for (const part of workspaceParts) {
      if (part.type !== 'LEG_TIBIA' || contactCount >= MAX_TELEMETRY_CONTACTS) continue;
      const legBody = getPartRigidBody(part.id);
      if (!legBody) continue;

      try {
        const t = legBody.translation();
        const r = legBody.rotation();
        _quat.set(r.x, r.y, r.z, r.w);
        _vec.set(LEG_FOOT_LOCAL[0], LEG_FOOT_LOCAL[1], LEG_FOOT_LOCAL[2]).applyQuaternion(_quat);
        const footY = t.y + _vec.y;
        if (footY - LEG_FOOT_RADIUS <= GROUND_CONTACT_THRESHOLD) {
          const slot = acc.contactPoints[contactCount];
          slot[0] = t.x + _vec.x;
          slot[1] = 0;
          slot[2] = t.z + _vec.z;
          contactCount += 1;
        }
      } catch {
        // Ignore removed leg body.
      }
    }

    if (contactCount === 0 && chassisBody) {
      try {
        const t = chassisBody.translation();
        if (t.y - getActiveChassisHalfHeight() <= GROUND_CONTACT_THRESHOLD) {
          const slot = acc.contactPoints[0];
          slot[0] = t.x;
          slot[1] = 0;
          slot[2] = t.z;
          contactCount = 1;
        }
      } catch {
        // Ignore removed chassis body.
      }
    }
  }

  let estimatedCurrentMa = 0;
  let activeServosMoving = 0;
  const poweredServoIds = wiringValidation.activeServoIds;

  if (simulationStatus === 'playing') {
    const hasEsp32 = workspaceParts.some(
      (part) => part.type === 'ESP32_DEVKIT' && Boolean(part.attachedTo),
    );
    estimatedCurrentMa += hasEsp32 ? BASE_ESP32_CURRENT_MA : 0;

    for (const servoId of poweredServoIds) {
      const targetDeg = servoAngles[servoId] ?? 0;
      const prevDeg = acc.prevAngles[servoId] ?? targetDeg;
      acc.prevAngles[servoId] = targetDeg;

      let transient = (acc.servoActivity[servoId] ?? 0) * Math.exp(-4.5 * dt);
      if (Math.abs(targetDeg - prevDeg) > 0.25) {
        transient = 1;
      }
      acc.servoActivity[servoId] = transient;

      let omega = 0;
      const legId = legByServoId.get(servoId);
      const legBody = legId ? getPartRigidBody(legId) : undefined;
      if (legBody) {
        try {
          const av = legBody.angvel();
          omega = Math.hypot(av.x, av.y, av.z);
        } catch {
          omega = 0;
        }
      }

      const torqueBias = Math.abs(targetDeg) > 1 ? 0.12 : 0;
      const loadRatio = Math.min(1, Math.max(transient, omega / 3.0) + torqueBias);
      if (loadRatio > 0.22) {
        activeServosMoving += 1;
      }
      estimatedCurrentMa += SERVO_IDLE_CURRENT_MA + SERVO_ACTIVE_SURGE_MA * loadRatio;
    }
  } else {
    acc.prevAngles = {};
    acc.servoActivity = {};
  }

  const snapshot: PhysicsTelemetrySnapshot = {
    totalMassGrams: totalMassKg * 1000,
    weightNewtons: totalMassKg * 9.81,
    chassisSpeedCmPerSec,
    displacementCm,
    estimatedCurrentMa,
    activeServosMoving,
    poweredServoCount: poweredServoIds.length,
    groundedContacts: contactCount,
    centerOfMass: [comX, comY, comZ],
  };

  physicsTelemetryRef.current = snapshot;
  return snapshot;
}
