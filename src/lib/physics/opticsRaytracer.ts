import * as THREE from 'three';
import type {
  OpticsRaySegment,
  OpticsRaytraceResult,
  PartType,
  Vector3Tuple,
  WorkspacePart,
} from '@/types/simulator';

export interface OpticsTraceParameters {
  laserYawDeg: number;
  laserPitchDeg: number;
  opticalElementYawDeg: number;
  refractiveIndex: number;
  lensFocalLength: number;
}

const MAX_RAY_SEGMENTS = 12;
const MAX_RAY_DISTANCE = 18;
const RAY_EPSILON = 0.004;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const BEAM_CENTER_LOCAL_Y = 0.55;

const OPTICS_PART_TYPES = new Set<PartType>([
  'laser_emitter',
  'plane_mirror',
  'convex_lens',
  'concave_lens',
  'glass_prism',
  'optical_target_screen',
]);

interface RayHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  part: WorkspacePart;
  exitingGlass: boolean;
}

function toTuple(v: THREE.Vector3): Vector3Tuple {
  return [v.x, v.y, v.z];
}

function getElementWorldTransform(
  part: WorkspacePart,
  opticalElementYawDeg: number,
): { matrix: THREE.Matrix4; inverse: THREE.Matrix4; quat: THREE.Quaternion } {
  const isRotatedInteractive =
    part.type === 'plane_mirror' || part.type === 'glass_prism';
  const extraYaw = isRotatedInteractive ? opticalElementYawDeg * DEG_TO_RAD : 0;
  const euler = new THREE.Euler(part.rotation[0], part.rotation[1] + extraYaw, part.rotation[2]);
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const pos = new THREE.Vector3(part.position[0], part.position[1], part.position[2]);
  const matrix = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
  const inverse = matrix.clone().invert();
  return { matrix, inverse, quat };
}

function intersectThinBoxFace(
  localOrigin: THREE.Vector3,
  localDir: THREE.Vector3,
  centerY: number,
  halfHeight: number,
  halfWidthZ: number,
): { t: number; localHit: THREE.Vector3; localNormal: THREE.Vector3 } | null {
  if (Math.abs(localDir.x) < 1e-6) return null;
  const t = -localOrigin.x / localDir.x;
  if (t <= RAY_EPSILON) return null;

  const hit = localOrigin.clone().addScaledVector(localDir, t);
  if (Math.abs(hit.y - centerY) > halfHeight || Math.abs(hit.z) > halfWidthZ) {
    return null;
  }

  const normalX = localDir.x > 0 ? -1 : 1;
  return { t, localHit: hit, localNormal: new THREE.Vector3(normalX, 0, 0) };
}

function intersectLensAperture(
  localOrigin: THREE.Vector3,
  localDir: THREE.Vector3,
  centerY: number,
  radius: number,
): { t: number; localHit: THREE.Vector3; localNormal: THREE.Vector3 } | null {
  if (Math.abs(localDir.x) < 1e-6) return null;
  const t = -localOrigin.x / localDir.x;
  if (t <= RAY_EPSILON) return null;

  const hit = localOrigin.clone().addScaledVector(localDir, t);
  const dy = hit.y - centerY;
  const dz = hit.z;
  if (dy * dy + dz * dz > radius * radius) {
    return null;
  }

  const normalX = localDir.x > 0 ? -1 : 1;
  return { t, localHit: hit, localNormal: new THREE.Vector3(normalX, 0, 0) };
}

function intersectEquilateralPrism(
  localOrigin: THREE.Vector3,
  localDir: THREE.Vector3,
  insidePrism: boolean,
): { t: number; localHit: THREE.Vector3; localNormal: THREE.Vector3; exiting: boolean } | null {
  const radius = 0.62;
  const yMin = 0.05;
  const yMax = 1.08;
  const vertices: Array<[number, number]> = [
    [radius, 0],
    [-radius * 0.5, radius * 0.8660254],
    [-radius * 0.5, -radius * 0.8660254],
  ];

  let bestT = Infinity;
  let bestHit: THREE.Vector3 | null = null;
  let bestNormal: THREE.Vector3 | null = null;

  for (let i = 0; i < 3; i++) {
    const [x1, z1] = vertices[i];
    const [x2, z2] = vertices[(i + 1) % 3];
    const ex = x2 - x1;
    const ez = z2 - z1;
    const edgeLen = Math.hypot(ex, ez) || 1;
    // Outward 2D normal in XZ plane for CCW polygon
    const nx = ez / edgeLen;
    const nz = -ex / edgeLen;

    const denom = localDir.x * nx + localDir.z * nz;
    if (Math.abs(denom) < 1e-6) continue;
    // If inside glass, look for faces pointing outward relative to ray (denom > 0)
    // If outside in air, look for faces facing incoming ray (denom < 0)
    if (insidePrism && denom <= 0) continue;
    if (!insidePrism && denom >= 0) continue;

    const rhs = nx * (x1 - localOrigin.x) + nz * (z1 - localOrigin.z);
    const t = rhs / denom;
    if (t <= RAY_EPSILON || t >= bestT) continue;

    const hit = localOrigin.clone().addScaledVector(localDir, t);
    if (hit.y < yMin || hit.y > yMax) continue;

    // Project onto edge parameter s in [0, 1]
    const dotEdge = (hit.x - x1) * ex + (hit.z - z1) * ez;
    const s = dotEdge / (edgeLen * edgeLen);
    if (s < -1e-4 || s > 1 + 1e-4) continue;

    bestT = t;
    bestHit = hit;
    bestNormal = new THREE.Vector3(insidePrism ? -nx : nx, 0, insidePrism ? -nz : nz);
  }

  if (!bestHit || !bestNormal) return null;
  return { t: bestT, localHit: bestHit, localNormal: bestNormal, exiting: insidePrism };
}

function intersectObstacleBox(
  localOrigin: THREE.Vector3,
  localDir: THREE.Vector3,
  halfExtents: Vector3Tuple,
): { t: number; localHit: THREE.Vector3; localNormal: THREE.Vector3 } | null {
  const [hx, hy, hz] = halfExtents;
  const min = [-hx, -hy, -hz];
  const max = [hx, hy, hz];
  const orig = [localOrigin.x, localOrigin.y, localOrigin.z];
  const dir = [localDir.x, localDir.y, localDir.z];

  let tMin = RAY_EPSILON;
  let tMax = Infinity;
  let hitAxis = -1;
  let hitSign = 1;

  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(dir[axis]) < 1e-7) {
      if (orig[axis] < min[axis] || orig[axis] > max[axis]) return null;
      continue;
    }
    const invD = 1 / dir[axis];
    let t1 = (min[axis] - orig[axis]) * invD;
    let t2 = (max[axis] - orig[axis]) * invD;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitAxis = axis;
      hitSign = dir[axis] > 0 ? -1 : 1;
      void sign;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (hitAxis === -1 || !Number.isFinite(tMin)) return null;
  const hit = localOrigin.clone().addScaledVector(localDir, tMin);
  const normal = new THREE.Vector3(
    hitAxis === 0 ? hitSign : 0,
    hitAxis === 1 ? hitSign : 0,
    hitAxis === 2 ? hitSign : 0,
  );
  return { t: tMin, localHit: hit, localNormal: normal };
}

export function traceOpticsBench(
  workspaceParts: readonly WorkspacePart[],
  params: OpticsTraceParameters,
): OpticsRaytraceResult {
  const emitter = workspaceParts.find((p) => p.type === 'laser_emitter');
  const hasOpticsBench =
    Boolean(emitter) || workspaceParts.some((p) => OPTICS_PART_TYPES.has(p.type));

  if (!emitter) {
    return {
      hasOpticsBench,
      segments: [],
      targetHit: false,
      targetHitPoint: null,
      primaryIncidentDeg: null,
      primaryOutgoingDeg: null,
      criticalAngleDeg: Number.isFinite(params.refractiveIndex) && params.refractiveIndex > 1
        ? Math.asin(1 / params.refractiveIndex) * RAD_TO_DEG
        : null,
      totalInternalReflection: false,
    };
  }

  const emitterQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      emitter.rotation[0],
      emitter.rotation[1] + params.laserYawDeg * DEG_TO_RAD,
      emitter.rotation[2] + params.laserPitchDeg * DEG_TO_RAD,
    ),
  );
  const emitterPos = new THREE.Vector3(emitter.position[0], emitter.position[1], emitter.position[2]);
  const rayOrigin = new THREE.Vector3(0.62, BEAM_CENTER_LOCAL_Y, 0)
    .applyQuaternion(emitterQuat)
    .add(emitterPos);
  const rayDir = new THREE.Vector3(1, 0, 0).applyQuaternion(emitterQuat).normalize();

  const interactables = workspaceParts.filter(
    (p) =>
      p.type === 'plane_mirror' ||
      p.type === 'convex_lens' ||
      p.type === 'concave_lens' ||
      p.type === 'glass_prism' ||
      p.type === 'optical_target_screen' ||
      p.type === 'OBSTACLE_BLOCK',
  );

  const nGlass = Math.max(1.0, Math.min(2.42, params.refractiveIndex));
  const criticalAngleDeg = nGlass > 1.0001 ? Math.asin(1 / nGlass) * RAD_TO_DEG : 90;

  const segments: OpticsRaySegment[] = [];
  let currentOrigin = rayOrigin.clone();
  let currentDir = rayDir.clone();
  let insidePrismId: string | null = null;
  let targetHit = false;
  let targetHitPoint: Vector3Tuple | null = null;
  let primaryIncidentDeg: number | null = null;
  let primaryOutgoingDeg: number | null = null;
  let totalInternalReflection = false;

  for (let bounce = 0; bounce < MAX_RAY_SEGMENTS; bounce++) {
    let closestHit: RayHit | null = null;

    for (const part of interactables) {
      const { matrix, inverse, quat } = getElementWorldTransform(
        part,
        params.opticalElementYawDeg,
      );
      const localOrigin = currentOrigin.clone().applyMatrix4(inverse);
      const localDir = currentDir.clone().transformDirection(inverse).normalize();

      let localResult: {
        t: number;
        localHit: THREE.Vector3;
        localNormal: THREE.Vector3;
        exiting?: boolean;
      } | null = null;

      if (part.type === 'plane_mirror') {
        localResult = intersectThinBoxFace(localOrigin, localDir, BEAM_CENTER_LOCAL_Y, 0.56, 0.7);
      } else if (part.type === 'optical_target_screen') {
        localResult = intersectThinBoxFace(localOrigin, localDir, BEAM_CENTER_LOCAL_Y, 0.62, 0.78);
      } else if (part.type === 'convex_lens' || part.type === 'concave_lens') {
        localResult = intersectLensAperture(localOrigin, localDir, BEAM_CENTER_LOCAL_Y, 0.58);
      } else if (part.type === 'glass_prism') {
        localResult = intersectEquilateralPrism(localOrigin, localDir, insidePrismId === part.id);
      } else if (part.type === 'OBSTACLE_BLOCK') {
        localResult = intersectObstacleBox(localOrigin, localDir, [0.4, 0.175, 0.25]);
      }

      if (!localResult) continue;
      const worldHit = localResult.localHit.clone().applyMatrix4(matrix);
      const worldDist = worldHit.distanceTo(currentOrigin);
      if (worldDist <= RAY_EPSILON) continue;
      if (!closestHit || worldDist < closestHit.distance) {
        const worldNormal = localResult.localNormal.clone().applyQuaternion(quat).normalize();
        closestHit = {
          distance: worldDist,
          point: worldHit,
          normal: worldNormal,
          part,
          exitingGlass: Boolean(localResult.exiting),
        };
      }
    }

    if (!closestHit) {
      const farEnd = currentOrigin.clone().addScaledVector(currentDir, MAX_RAY_DISTANCE);
      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(farEnd),
        hitPoint: null,
        hitNormal: null,
        hitPartId: null,
        hitPartType: null,
        interaction: 'NONE',
        incidentDeg: null,
        outgoingDeg: null,
        criticalDeg: null,
      });
      break;
    }

    const { point, normal, part, exitingGlass } = closestHit;
    const cosI = Math.min(1, Math.max(0, -currentDir.dot(normal)));
    const incidentDeg = Math.acos(cosI) * RAD_TO_DEG;

    if (part.type === 'optical_target_screen') {
      targetHit = true;
      targetHitPoint = toTuple(point);
      if (primaryIncidentDeg === null) {
        primaryIncidentDeg = incidentDeg;
        primaryOutgoingDeg = 0;
      }
      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(point),
        hitPoint: toTuple(point),
        hitNormal: toTuple(normal),
        hitPartId: part.id,
        hitPartType: part.type,
        interaction: 'TARGET',
        incidentDeg,
        outgoingDeg: 0,
        criticalDeg: null,
      });
      break;
    }

    if (part.type === 'OBSTACLE_BLOCK') {
      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(point),
        hitPoint: toTuple(point),
        hitNormal: toTuple(normal),
        hitPartId: part.id,
        hitPartType: part.type,
        interaction: 'ABSORB',
        incidentDeg,
        outgoingDeg: null,
        criticalDeg: null,
      });
      break;
    }

    if (part.type === 'plane_mirror') {
      const reflected = currentDir
        .clone()
        .addScaledVector(normal, 2 * cosI)
        .normalize();
      if (primaryIncidentDeg === null) {
        primaryIncidentDeg = incidentDeg;
        primaryOutgoingDeg = incidentDeg;
      }
      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(point),
        hitPoint: toTuple(point),
        hitNormal: toTuple(normal),
        hitPartId: part.id,
        hitPartType: part.type,
        interaction: 'REFLECT',
        incidentDeg,
        outgoingDeg: incidentDeg,
        criticalDeg: null,
      });
      currentOrigin = point.clone().addScaledVector(reflected, RAY_EPSILON);
      currentDir = reflected;
      continue;
    }

    if (part.type === 'convex_lens' || part.type === 'concave_lens') {
      const { matrix, quat } = getElementWorldTransform(part, params.opticalElementYawDeg);
      const lensCenter = new THREE.Vector3(0, BEAM_CENTER_LOCAL_Y, 0).applyMatrix4(matrix);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
      if (axis.dot(currentDir) < 0) axis.negate();

      const radial = point.clone().sub(lensCenter);
      radial.addScaledVector(axis, -radial.dot(axis));

      const absFocal = Math.max(0.6, Math.abs(params.lensFocalLength));
      const signedFocal = part.type === 'convex_lens' ? absFocal : -absFocal;
      const forwardDot = Math.max(0.15, currentDir.dot(axis));
      const outgoing = currentDir
        .clone()
        .divideScalar(forwardDot)
        .addScaledVector(radial, -1 / signedFocal)
        .normalize();

      const outgoingDeg = Math.acos(Math.min(1, Math.max(0, outgoing.dot(normal.clone().negate())))) * RAD_TO_DEG;
      if (primaryIncidentDeg === null) {
        primaryIncidentDeg = incidentDeg;
        primaryOutgoingDeg = outgoingDeg;
      }

      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(point),
        hitPoint: toTuple(point),
        hitNormal: toTuple(normal),
        hitPartId: part.id,
        hitPartType: part.type,
        interaction: 'LENS',
        incidentDeg,
        outgoingDeg,
        criticalDeg: null,
      });
      currentOrigin = point.clone().addScaledVector(outgoing, RAY_EPSILON);
      currentDir = outgoing;
      continue;
    }

    if (part.type === 'glass_prism') {
      const eta = exitingGlass ? nGlass : 1 / nGlass;
      const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI);

      if (sin2T > 1) {
        // Total Internal Reflection (TIR)
        totalInternalReflection = true;
        const reflected = currentDir
          .clone()
          .addScaledVector(normal, 2 * cosI)
          .normalize();
        if (primaryIncidentDeg === null || exitingGlass) {
          primaryIncidentDeg = incidentDeg;
          primaryOutgoingDeg = incidentDeg;
        }
        segments.push({
          start: toTuple(currentOrigin),
          end: toTuple(point),
          hitPoint: toTuple(point),
          hitNormal: toTuple(normal),
          hitPartId: part.id,
          hitPartType: part.type,
          interaction: 'TIR',
          incidentDeg,
          outgoingDeg: incidentDeg,
          criticalDeg: criticalAngleDeg,
        });
        currentOrigin = point.clone().addScaledVector(reflected, RAY_EPSILON);
        currentDir = reflected;
        insidePrismId = part.id;
        continue;
      }

      const cosT = Math.sqrt(Math.max(0, 1 - sin2T));
      const refracted = currentDir
        .clone()
        .multiplyScalar(eta)
        .addScaledVector(normal, eta * cosI - cosT)
        .normalize();
      const outgoingDeg = Math.acos(Math.min(1, Math.max(0, cosT))) * RAD_TO_DEG;

      if (primaryIncidentDeg === null) {
        primaryIncidentDeg = incidentDeg;
        primaryOutgoingDeg = outgoingDeg;
      }

      segments.push({
        start: toTuple(currentOrigin),
        end: toTuple(point),
        hitPoint: toTuple(point),
        hitNormal: toTuple(normal),
        hitPartId: part.id,
        hitPartType: part.type,
        interaction: 'REFRACT',
        incidentDeg,
        outgoingDeg,
        criticalDeg: exitingGlass ? criticalAngleDeg : null,
      });
      currentOrigin = point.clone().addScaledVector(refracted, RAY_EPSILON);
      currentDir = refracted;
      insidePrismId = exitingGlass ? null : part.id;
      continue;
    }
  }

  return {
    hasOpticsBench,
    segments,
    targetHit,
    targetHitPoint,
    primaryIncidentDeg,
    primaryOutgoingDeg,
    criticalAngleDeg,
    totalInternalReflection,
  };
}

