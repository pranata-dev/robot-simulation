import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
  DEFAULT_PHYSICS_LAUNCH_SPEED,
  PART_CATALOG,
  ROLLING_SOLID_RADIUS,
} from '@/lib/constants/hardwareCatalog';
import { isValidRigidBody } from '@/lib/physics/servoMotorControl';
import type { Vector3Tuple, WorkspacePart } from '@/types/simulator';

export const RAMP_SLOPE_LENGTH = 4.4;
export const RAMP_WIDTH = 2.4;
export const RAMP_DECK_THICKNESS = 0.08;
export const RAMP_TOP_PLATFORM_LENGTH = 0.9;
export const RAMP_RAIL_HEIGHT = 0.22;
export const RAMP_RAIL_THICKNESS = 0.06;
export const RAMP_SLOPE_BOTTOM_X = 2.0;
export const DEFAULT_RAMP_ANGLE_DEG = 20;

export interface RampGeometrySpec {
  angleDeg: number;
  angleRad: number;
  slopeLength: number;
  rampWidth: number;
  deckThickness: number;
  slopeBottomX: number;
  slopeCenterX: number;
  slopeCenterY: number;
  crestX: number;
  crestY: number;
  topPlatformLength: number;
  topPlatformCenterX: number;
  topPlatformCenterY: number;
}

/**
 * Computes exact local center positions and crest coordinates for the adjustable
 * inclined ramp so its lower exit edge rests seamlessly at `y = 0.002` at every angle.
 */
export function computeRampGeometry(angleDeg: number): RampGeometrySpec {
  const clampedDeg = Math.max(5, Math.min(45, angleDeg));
  const angleRad = THREE.MathUtils.degToRad(clampedDeg);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const halfLen = RAMP_SLOPE_LENGTH / 2;
  const halfThick = RAMP_DECK_THICKNESS / 2;
  const exitY = 0.002;

  const slopeCenterX = RAMP_SLOPE_BOTTOM_X - halfLen * cos - halfThick * sin;
  const slopeCenterY = halfLen * sin - halfThick * cos + exitY;
  const crestX = RAMP_SLOPE_BOTTOM_X - RAMP_SLOPE_LENGTH * cos - RAMP_DECK_THICKNESS * sin;
  const crestY = RAMP_SLOPE_LENGTH * sin + exitY;
  const topPlatformCenterX = crestX - RAMP_TOP_PLATFORM_LENGTH / 2;
  const topPlatformCenterY = crestY - halfThick;

  return {
    angleDeg: clampedDeg,
    angleRad,
    slopeLength: RAMP_SLOPE_LENGTH,
    rampWidth: RAMP_WIDTH,
    deckThickness: RAMP_DECK_THICKNESS,
    slopeBottomX: RAMP_SLOPE_BOTTOM_X,
    slopeCenterX,
    slopeCenterY,
    crestX,
    crestY,
    topPlatformLength: RAMP_TOP_PLATFORM_LENGTH,
    topPlatformCenterX,
    topPlatformCenterY,
  };
}

/**
 * Computes world coordinates placing a rolling sphere/cylinder tangent to the ramp slope
 * `distanceFromCrest` units downhill from the upper crest at a given lane Z offset.
 */
export function computeBodyOnRampStartPose(
  rampPosition: Vector3Tuple,
  rampAngleDeg: number,
  laneOffsetZ: number,
  distanceFromCrest: number = 0.35,
  radius: number = ROLLING_SOLID_RADIUS,
): Vector3Tuple {
  const geom = computeRampGeometry(rampAngleDeg);
  const cos = Math.cos(geom.angleRad);
  const sin = Math.sin(geom.angleRad);

  const localX = geom.crestX + distanceFromCrest * cos + radius * sin;
  const localY = geom.crestY - distanceFromCrest * sin + radius * cos;

  return [
    rampPosition[0] + localX,
    rampPosition[1] + localY,
    rampPosition[2] + laneOffsetZ,
  ];
}

/**
 * Reprojects rolling test bodies standing above any `physics_inclined_ramp` in the workspace
 * whenever the user changes the Ramp Inclination slider in Idle Mode so parts never float or clip.
 */
export function reprojectPartsOntoRamp(
  workspaceParts: readonly WorkspacePart[],
  nextRampAngleDeg: number,
): WorkspacePart[] {
  const ramp = workspaceParts.find((part) => part.type === 'physics_inclined_ramp');
  if (!ramp) return [...workspaceParts];

  const geom = computeRampGeometry(nextRampAngleDeg);
  const tan = Math.tan(geom.angleRad);
  const cos = Math.cos(geom.angleRad);

  return workspaceParts.map((part) => {
    if (PART_CATALOG[part.type]?.collisionLayer !== 'free_body') {
      return part;
    }

    const relX = part.position[0] - ramp.position[0];
    const relZ = part.position[2] - ramp.position[2];
    const halfWidth = geom.rampWidth / 2;
    if (Math.abs(relZ) > halfWidth) {
      return part;
    }

    const radius = ROLLING_SOLID_RADIUS;
    if (relX >= geom.crestX - geom.topPlatformLength && relX < geom.crestX) {
      return {
        ...part,
        position: [part.position[0], ramp.position[1] + geom.crestY + radius, part.position[2]],
      };
    }

    if (relX >= geom.crestX && relX <= geom.slopeBottomX) {
      const surfaceY = geom.crestY - (relX - geom.crestX) * tan;
      const centerY = Math.max(radius, surfaceY + radius / cos);
      return {
        ...part,
        position: [part.position[0], ramp.position[1] + centerY, part.position[2]],
      };
    }

    return part;
  });
}

/**
 * Resolves the world initial linear velocity vector for a free body, scaling configured
 * `initialVelocity` magnitudes proportionally against `launchSpeed`.
 */
export function resolveFreeBodyLaunchVelocity(
  initialVelocity: Vector3Tuple | undefined,
  launchSpeed: number,
): Vector3Tuple | null {
  if (!initialVelocity) return null;
  const [vx, vy, vz] = initialVelocity;
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) return null;
  const speedScale = DEFAULT_PHYSICS_LAUNCH_SPEED > 0 ? launchSpeed / DEFAULT_PHYSICS_LAUNCH_SPEED : 1;
  return [vx * speedScale, vy * speedScale, vz * speedScale];
}

/**
 * Applies physical principal angular inertia overrides to Rapier bodies that cannot match
 * target rotational inertia via a single primitive collider (`I = mR^2` for a hollow cylinder).
 */
export function applyRollingSolidMassProperties(
  part: Pick<WorkspacePart, 'type' | 'initialVelocity'>,
  body: RapierRigidBody | null | undefined,
  options: { applyInitialVelocity?: boolean; launchSpeed?: number } = {},
): void {
  if (!isValidRigidBody(body)) return;

  try {
    if (part.type === 'physics_hollow_cylinder') {
      const mass = PART_CATALOG.physics_hollow_cylinder.mass;
      const r = ROLLING_SOLID_RADIUS;
      // Collider is rotated +90 deg around X, placing the cylinder symmetry axis along RigidBody local Z.
      // Solid cylinder collider provides 0.5 * mR^2 about Z; add another 0.5 * mR^2 with 0 mass so I_z = mR^2.
      const halfRollInertia = 0.5 * mass * r * r;
      const transverseBoost = 0.25 * mass * r * r;
      body.setAdditionalMassProperties(
        0,
        { x: 0, y: 0, z: 0 },
        { x: transverseBoost, y: transverseBoost, z: halfRollInertia },
        { x: 0, y: 0, z: 0, w: 1 },
        false,
      );
    }

    if (options.applyInitialVelocity) {
      const resolvedVel = resolveFreeBodyLaunchVelocity(
        part.initialVelocity,
        options.launchSpeed ?? DEFAULT_PHYSICS_LAUNCH_SPEED,
      );
      if (resolvedVel) {
        body.setLinvel({ x: resolvedVel[0], y: resolvedVel[1], z: resolvedVel[2] }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.wakeUp();
      }
    }
  } catch {
    // Ignore stale RigidBody handle during Rapier reset.
  }
}
