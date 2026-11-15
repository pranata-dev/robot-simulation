import * as THREE from 'three';
import { ROLLING_SOLID_RADIUS } from '@/lib/constants/hardwareCatalog';
import { PART_CATALOG, getActiveChassisHalfHeight } from '@/lib/constants/socketRegistry';
import { getAllRegisteredRigidBodies, getPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import type {
  SimulationStatus,
  Vector3Tuple,
  WiringValidationResult,
  WorkspacePart,
} from '@/types/simulator';

export const MAX_TELEMETRY_CONTACTS = 6;
export const MAX_VELOCITY_VECTORS = 12;
const LEG_FOOT_LOCAL: Vector3Tuple = [0, -0.34, 0.5];
const LEG_FOOT_RADIUS = 0.045;
const GROUND_CONTACT_THRESHOLD = 0.03;
const BASE_ESP32_CURRENT_MA = 80;
const SERVO_IDLE_CURRENT_MA = 150;
const SERVO_ACTIVE_SURGE_MA = 400; // 150 mA idle -> 550 mA peak active torque load

export interface FreeBodyVelocityVector {
  position: Vector3Tuple;
  linvel: Vector3Tuple;
}

export interface HarmonicSample {
  timeSec: number;
  ekJ: number;
  epJ: number;
  etotJ: number;
  displacementM: number;
}

export const MAX_HARMONIC_HISTORY = 180;

export const harmonicHistoryRef: {
  samples: HarmonicSample[];
  elapsedSec: number;
  sampleTimerSec: number;
} = {
  samples: [],
  elapsedSec: 0,
  sampleTimerSec: 0,
};

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
  freeBodyCount: number;
  freeBodyLinearSpeedMps: number;
  freeBodyAngularSpeedRadPerSec: number;
  freeBodyKineticEnergyJ: number;
  freeBodyPotentialEnergyJ: number;
  freeBodyTrackedLabel: string;
  hasHarmonicOscillator: boolean;
  harmonicMode: 'pendulum' | 'spring' | 'none';
  harmonicEkJ: number;
  harmonicEpJ: number;
  harmonicEtotJ: number;
  harmonicPeriodSec: number;
  harmonicFrequencyHz: number;
  harmonicDisplacementM: number;
}

export interface TelemetryAccumulator {
  origin: Vector3Tuple;
  hasOrigin: boolean;
  prevAngles: Record<string, number>;
  servoActivity: Record<string, number>;
  contactPoints: Vector3Tuple[];
  velocityVectors: FreeBodyVelocityVector[];
  velocityVectorCount: number;
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
  freeBodyCount: 0,
  freeBodyLinearSpeedMps: 0,
  freeBodyAngularSpeedRadPerSec: 0,
  freeBodyKineticEnergyJ: 0,
  freeBodyPotentialEnergyJ: 0,
  freeBodyTrackedLabel: 'No Free Body',
  hasHarmonicOscillator: false,
  harmonicMode: 'none',
  harmonicEkJ: 0,
  harmonicEpJ: 0,
  harmonicEtotJ: 0,
  harmonicPeriodSec: 0,
  harmonicFrequencyHz: 0,
  harmonicDisplacementM: 0,
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
    velocityVectors: Array.from({ length: MAX_VELOCITY_VECTORS }, () => ({
      position: [0, 0, 0] as Vector3Tuple,
      linvel: [0, 0, 0] as Vector3Tuple,
    })),
    velocityVectorCount: 0,
  };
}

export function resetPhysicsTelemetry(): void {
  physicsTelemetryRef.current = {
    ...INITIAL_PHYSICS_TELEMETRY,
    centerOfMass: [...INITIAL_PHYSICS_TELEMETRY.centerOfMass],
  };
  harmonicHistoryRef.samples = [];
  harmonicHistoryRef.elapsedSec = 0;
  harmonicHistoryRef.sampleTimerSec = 0;
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
  gravity: readonly [number, number, number] = [0, -9.81, 0],
  selectedPartId: string | null = null,
  harmonicParams: {
    massKg: number;
    pendulumLengthM: number;
    springStiffness: number;
    timeScale: number;
  } = { massKg: 1.0, pendulumLengthM: 2.0, springStiffness: 18.0, timeScale: 1.0 },
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

  const gravityMagnitude = Math.hypot(gravity[0], gravity[1], gravity[2]);

  let freeBodyCount = 0;
  let freeBodyKineticEnergyJ = 0;
  let freeBodyPotentialEnergyJ = 0;
  let trackedSpeedMps = 0;
  let trackedAngularRadPerSec = 0;
  let trackedLabel = 'No Free Body';
  let foundSelectedFreeBody = false;
  let vectorSlotCount = 0;

  for (const part of workspaceParts) {
    const catalogEntry = PART_CATALOG[part.type];
    if (!catalogEntry || catalogEntry.collisionLayer !== 'free_body') continue;

    freeBodyCount += 1;
    const mass = catalogEntry.mass;
    const body = getPartRigidBody(part.id);

    let px = part.position[0];
    let py = part.position[1];
    let pz = part.position[2];
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let wx = 0;
    let wy = 0;
    let wz = 0;

    if (body) {
      try {
        const t = body.translation();
        px = t.x;
        py = t.y;
        pz = t.z;
        if (simulationStatus === 'playing') {
          const lv = body.linvel();
          const av = body.angvel();
          vx = lv.x;
          vy = lv.y;
          vz = lv.z;
          wx = av.x;
          wy = av.y;
          wz = av.z;
        }
      } catch {
        // Ignore unmounted body frame.
      }
    }

    const speedSq = vx * vx + vy * vy + vz * vz;
    const speed = Math.sqrt(speedSq);
    const omega = Math.hypot(wx, wy, wz);
    const heightAboveFloor = Math.max(0, py - ROLLING_SOLID_RADIUS);

    freeBodyKineticEnergyJ += 0.5 * mass * speedSq;
    freeBodyPotentialEnergyJ += mass * gravityMagnitude * heightAboveFloor;

    const isSelected = selectedPartId !== null && part.id === selectedPartId;
    if (isSelected || (!foundSelectedFreeBody && (freeBodyCount === 1 || speed > trackedSpeedMps))) {
      if (isSelected) {
        foundSelectedFreeBody = true;
      }
      trackedSpeedMps = speed;
      trackedAngularRadPerSec = omega;
      trackedLabel = catalogEntry.label;
    }

    if (simulationStatus === 'playing' && vectorSlotCount < MAX_VELOCITY_VECTORS) {
      const slot = acc.velocityVectors[vectorSlotCount];
      slot.position[0] = px;
      slot.position[1] = py;
      slot.position[2] = pz;
      slot.linvel[0] = vx;
      slot.linvel[1] = vy;
      slot.linvel[2] = vz;
      vectorSlotCount += 1;
    }
  }
  acc.velocityVectorCount = vectorSlotCount;

  const pendulumPart = workspaceParts.find((p) => p.type === 'pendulum_bob');
  const springPart = workspaceParts.find((p) => p.type === 'helical_spring_mass');
  const activeHarmonic =
    selectedPartId === springPart?.id
      ? springPart
      : selectedPartId === pendulumPart?.id
        ? pendulumPart
        : pendulumPart ?? springPart;

  let hasHarmonicOscillator = false;
  let harmonicMode: 'pendulum' | 'spring' | 'none' = 'none';
  let harmonicEkJ = 0;
  let harmonicEpJ = 0;
  let harmonicEtotJ = 0;
  let harmonicPeriodSec = 0;
  let harmonicFrequencyHz = 0;
  let harmonicDisplacementM = 0;

  if (activeHarmonic && activeHarmonic.attachedTo) {
    const pivot = partsById.get(activeHarmonic.attachedTo);
    if (pivot) {
      hasHarmonicOscillator = true;
      const body = getPartRigidBody(activeHarmonic.id);
      let bx = activeHarmonic.position[0];
      let by = activeHarmonic.position[1];
      let bvx = 0;
      let bvy = 0;
      let bvz = 0;
      if (body) {
        try {
          const bt = body.translation();
          bx = bt.x;
          by = bt.y;
          if (simulationStatus === 'playing') {
            const blv = body.linvel();
            bvx = blv.x;
            bvy = blv.y;
            bvz = blv.z;
          }
        } catch {
          // Ignore disposed rigid body
        }
      }

      const m = Math.max(0.2, harmonicParams.massKg);
      const g = Math.max(0.1, gravityMagnitude);

      if (activeHarmonic.type === 'pendulum_bob') {
        harmonicMode = 'pendulum';
        const anchorY = pivot.position[1] - 0.1;
        const lowestY = anchorY - harmonicParams.pendulumLengthM;
        const heightDelta = Math.max(0, by - lowestY);
        const speedSq = bvx * bvx + bvy * bvy + bvz * bvz;
        harmonicEkJ = 0.5 * m * speedSq;
        harmonicEpJ = m * g * heightDelta;
        harmonicEtotJ = harmonicEkJ + harmonicEpJ;
        harmonicPeriodSec = 2 * Math.PI * Math.sqrt(harmonicParams.pendulumLengthM / g);
        harmonicFrequencyHz = harmonicPeriodSec > 0 ? 1 / harmonicPeriodSec : 0;
        harmonicDisplacementM = bx - pivot.position[0];
      } else {
        harmonicMode = 'spring';
        const anchorY = pivot.position[1] - 0.1;
        const restLength = 1.4;
        const k = Math.max(1, harmonicParams.springStiffness);
        const equilibriumY = anchorY - restLength - (m * g) / k;
        const dy = by - equilibriumY;
        harmonicEkJ = 0.5 * m * bvy * bvy;
        harmonicEpJ = 0.5 * k * dy * dy;
        harmonicEtotJ = harmonicEkJ + harmonicEpJ;
        harmonicPeriodSec = 2 * Math.PI * Math.sqrt(m / k);
        harmonicFrequencyHz = harmonicPeriodSec > 0 ? 1 / harmonicPeriodSec : 0;
        harmonicDisplacementM = dy;
      }

      if (simulationStatus === 'playing') {
        harmonicHistoryRef.elapsedSec += dt * harmonicParams.timeScale;
        harmonicHistoryRef.sampleTimerSec += dt;
        if (harmonicHistoryRef.sampleTimerSec >= 0.03) {
          harmonicHistoryRef.sampleTimerSec = 0;
          harmonicHistoryRef.samples.push({
            timeSec: harmonicHistoryRef.elapsedSec,
            ekJ: harmonicEkJ,
            epJ: harmonicEpJ,
            etotJ: harmonicEtotJ,
            displacementM: harmonicDisplacementM,
          });
          if (harmonicHistoryRef.samples.length > MAX_HARMONIC_HISTORY) {
            harmonicHistoryRef.samples.shift();
          }
        }
      }
    }
  }

  const snapshot: PhysicsTelemetrySnapshot = {
    totalMassGrams: totalMassKg * 1000,
    weightNewtons: totalMassKg * gravityMagnitude,
    chassisSpeedCmPerSec,
    displacementCm,
    estimatedCurrentMa,
    activeServosMoving,
    poweredServoCount: poweredServoIds.length,
    groundedContacts: contactCount,
    centerOfMass: [comX, comY, comZ],
    freeBodyCount,
    freeBodyLinearSpeedMps: trackedSpeedMps,
    freeBodyAngularSpeedRadPerSec: trackedAngularRadPerSec,
    freeBodyKineticEnergyJ,
    freeBodyPotentialEnergyJ,
    freeBodyTrackedLabel: trackedLabel,
    hasHarmonicOscillator,
    harmonicMode,
    harmonicEkJ,
    harmonicEpJ,
    harmonicEtotJ,
    harmonicPeriodSec,
    harmonicFrequencyHz,
    harmonicDisplacementM,
  };

  physicsTelemetryRef.current = snapshot;
  return snapshot;
}
