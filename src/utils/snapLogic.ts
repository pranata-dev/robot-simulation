import { getActiveSocketsByPart, getSocketsForPart } from '@/lib/constants/socketRegistry';
import type {
  ActiveSnapTarget,
  PartType,
  SocketId,
  Vector3Tuple,
  WorkspacePart,
} from '@/types/simulator';
import {
  type SocketWorldTransform,
  computeSocketWorldTransform,
  resolveHierarchyWithSockets,
} from '@/utils/transformMath';

export { computeSocketWorldTransform, type SocketWorldTransform };

export const SNAP_THRESHOLD = 0.5;

export interface GlobalSocketTarget {
  parentId: string;
  socketId: SocketId;
  allowedTypes: readonly PartType[];
  position: Vector3Tuple;
  rotation: Vector3Tuple;
}

export interface SnapMatchResult extends GlobalSocketTarget {
  distance: number;
}

/**
 * Resolves all snapped descendant part transforms deterministically from root parts
 * using socket transform matrices defined in the active blueprint via socketRegistry.
 */
export function resolveHierarchyWorldTransforms(
  workspaceParts: readonly WorkspacePart[],
  seedRootIds?: ReadonlySet<string>,
): WorkspacePart[] {
  return resolveHierarchyWithSockets(workspaceParts, getActiveSocketsByPart(), seedRootIds);
}

function getXzDistance(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[2] - b[2], 2));
}

export function isSocketCompatible(partType: PartType, socket: GlobalSocketTarget): boolean {
  if (partType === 'LEG_TIBIA' && socket.socketId !== 'SOCKET_SERVO_HORN') {
    return false;
  }
  return socket.allowedTypes.includes(partType);
}

/**
 * Type-strict proximity check on the XZ plane (ignoring Y).
 * Sockets whose allowedTypes do not include partType are ignored even at distance 0.
 */
export function findNearestSnapTarget(
  partType: PartType,
  partPosition: Vector3Tuple,
  sockets: readonly GlobalSocketTarget[],
  threshold: number = SNAP_THRESHOLD,
): SnapMatchResult | null {
  let closest: SnapMatchResult | null = null;
  let minDistance = threshold;

  for (const socket of sockets) {
    if (!isSocketCompatible(partType, socket)) continue;

    const distance = getXzDistance(partPosition, socket.position);
    if (distance < minDistance) {
      minDistance = distance;
      closest = {
        parentId: socket.parentId,
        socketId: socket.socketId,
        allowedTypes: socket.allowedTypes,
        position: [...socket.position],
        rotation: [...socket.rotation],
        distance,
      };
    }
  }

  return closest;
}

/**
 * Evaluates hover feedback for any nearby unoccupied socket: valid matches take priority over
 * incompatible ones so the UI can color-code green (#A5AF79) vs red (#ef4444).
 */
export function evaluateSocketProximity(
  partType: PartType,
  partPosition: Vector3Tuple,
  sockets: readonly GlobalSocketTarget[],
  threshold: number = SNAP_THRESHOLD,
): ActiveSnapTarget | null {
  const validMatch = findNearestSnapTarget(partType, partPosition, sockets, threshold);
  if (validMatch) {
    return {
      parentId: validMatch.parentId,
      socketId: validMatch.socketId,
      isValid: true,
    };
  }

  let closestInvalid: GlobalSocketTarget | null = null;
  let minDistance = threshold;

  for (const socket of sockets) {
    if (isSocketCompatible(partType, socket)) continue;
    const distance = getXzDistance(partPosition, socket.position);
    if (distance < minDistance) {
      minDistance = distance;
      closestInvalid = socket;
    }
  }

  if (!closestInvalid) return null;

  return {
    parentId: closestInvalid.parentId,
    socketId: closestInvalid.socketId,
    isValid: false,
  };
}

/**
 * Resolves all unoccupied sockets in world coordinates across workspace host parts.
 */
export function getUnoccupiedSocketsInWorld(
  draggedPartId: string,
  workspaceParts: readonly WorkspacePart[],
): GlobalSocketTarget[] {
  const targets: GlobalSocketTarget[] = [];

  for (const host of workspaceParts) {
    if (host.id === draggedPartId) continue;

    const hostSockets = getSocketsForPart(host.type);
    if (hostSockets.length === 0) continue;

    for (const socket of hostSockets) {
      const isOccupied = workspaceParts.some(
        (other) =>
          other.id !== draggedPartId &&
          other.attachedTo === host.id &&
          other.socketId === socket.id,
      );
      if (isOccupied) continue;

      const worldTransform = computeSocketWorldTransform(host.position, host.rotation, socket);
      targets.push({
        parentId: host.id,
        socketId: socket.id,
        allowedTypes: socket.allowedTypes,
        position: worldTransform.position,
        rotation: worldTransform.rotation,
      });
    }
  }

  return targets;
}
