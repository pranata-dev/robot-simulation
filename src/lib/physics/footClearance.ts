import * as THREE from 'three';
import {
  FOOT_GROUND_CLEARANCE,
  TIBIA_FOOT_RADIUS,
  TIBIA_FOOT_TIP,
} from '@/lib/constants/hardwareCatalog';
import type { WorkspacePart } from '@/types/simulator';

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _tip = new THREE.Vector3();

/**
 * World-space Y of the bottom of a LEG_TIBIA foot sphere, using the leg's stored
 * position and XYZ Euler rotation (same convention as eulerToQuaternionTuple).
 */
export function computeFootBottomWorldY(leg: WorkspacePart): number {
  _euler.set(leg.rotation[0], leg.rotation[1], leg.rotation[2], 'XYZ');
  _quat.setFromEuler(_euler);
  _tip.set(TIBIA_FOOT_TIP[0], TIBIA_FOOT_TIP[1], TIBIA_FOOT_TIP[2]).applyQuaternion(_quat);
  return leg.position[1] + _tip.y - TIBIA_FOOT_RADIUS;
}

/**
 * Lowest foot-sphere bottom among attached LEG_TIBIA parts (optionally limited to `partIds`),
 * or null when no attached legs are present.
 */
export function computeLowestFootBottomY(
  parts: readonly WorkspacePart[],
  partIds?: ReadonlySet<string>,
): number | null {
  let lowest: number | null = null;
  for (const part of parts) {
    if (part.type !== 'LEG_TIBIA' || !part.attachedTo) continue;
    if (partIds && !partIds.has(part.id)) continue;
    const footY = computeFootBottomWorldY(part);
    if (lowest === null || footY < lowest) lowest = footY;
  }
  return lowest;
}

/**
 * Non-negative vertical lift required so every attached foot sphere sits at least
 * FOOT_GROUND_CLEARANCE above the grid (never below y = 0).
 */
export function computeFootClearanceLift(
  parts: readonly WorkspacePart[],
  partIds?: ReadonlySet<string>,
): number {
  const lowest = computeLowestFootBottomY(parts, partIds);
  if (lowest === null) return 0;
  const deficit = FOOT_GROUND_CLEARANCE - lowest;
  return deficit > 1e-6 ? deficit : 0;
}

