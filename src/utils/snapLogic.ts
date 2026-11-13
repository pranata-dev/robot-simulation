import * as THREE from 'three';
import { SOCKETS_BY_PART } from '@/lib/constants/socketRegistry';
import type {
  ActiveSnapTarget,
  PartType,
  QuaternionTuple,
  SocketDefinition,
  SocketId,
  Vector3Tuple,
  WorkspacePart,
} from '@/types/simulator';

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

export interface SocketWorldTransform {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  quaternion: QuaternionTuple;
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const _parentPos = new THREE.Vector3();
const _parentEuler = new THREE.Euler();
const _parentQuat = new THREE.Quaternion();
const _parentMatrix = new THREE.Matrix4();
const _socketPos = new THREE.Vector3();
const _socketEuler = new THREE.Euler();
const _socketQuat = new THREE.Quaternion();
const _socketMatrix = new THREE.Matrix4();
const _worldMatrix = new THREE.Matrix4();
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldEuler = new THREE.Euler();

/**
 * Deterministically computes a socket's world translation, Euler rotation, and quaternion
 * from its parent's transform matrix and local socket definition in socketRegistry.
 */
export function computeSocketWorldTransform(
  parentPosition: Vector3Tuple,
  parentRotation: Vector3Tuple,
  socket: Pick<SocketDefinition, 'position' | 'rotation'>,
): SocketWorldTransform {
  _parentPos.set(parentPosition[0], parentPosition[1], parentPosition[2]);
  _parentEuler.set(parentRotation[0], parentRotation[1], parentRotation[2], 'XYZ');
  _parentQuat.setFromEuler(_parentEuler);
  _parentMatrix.compose(_parentPos, _parentQuat, UNIT_SCALE);

  _socketPos.set(socket.position[0], socket.position[1], socket.position[2]);
  _socketEuler.set(socket.rotation[0], socket.rotation[1], socket.rotation[2], 'XYZ');
  _socketQuat.setFromEuler(_socketEuler);
  _socketMatrix.compose(_socketPos, _socketQuat, UNIT_SCALE);

  _worldMatrix.multiplyMatrices(_parentMatrix, _socketMatrix);
  _worldMatrix.decompose(_worldPos, _worldQuat, _worldScale);
  _worldEuler.setFromQuaternion(_worldQuat, 'XYZ');

  return {
    position: [_worldPos.x, _worldPos.y, _worldPos.z],
    rotation: [_worldEuler.x, _worldEuler.y, _worldEuler.z],
    quaternion: [_worldQuat.x, _worldQuat.y, _worldQuat.z, _worldQuat.w],
  };
}

/**
 * Resolves all snapped descendant part transforms deterministically from root parts
 * using socket transform matrices defined in socketRegistry.
 */
export function resolveHierarchyWorldTransforms(
  workspaceParts: readonly WorkspacePart[],
  seedRootIds?: ReadonlySet<string>,
): WorkspacePart[] {
  const byId = new Map(workspaceParts.map((part) => [part.id, part]));
  const resolved = new Set<string>(seedRootIds);

  if (!seedRootIds) {
    for (const part of workspaceParts) {
      if (!part.attachedTo) {
        resolved.add(part.id);
      }
    }
  }

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const [partId, part] of byId.entries()) {
      if (resolved.has(partId) || !part.attachedTo) continue;
      const parent = byId.get(part.attachedTo);
      if (!parent || !resolved.has(parent.id)) continue;

      const socket = SOCKETS_BY_PART[parent.type].find((entry) => entry.id === part.socketId);
      if (socket) {
        const worldTransform = computeSocketWorldTransform(parent.position, parent.rotation, socket);
        byId.set(partId, {
          ...part,
          position: worldTransform.position,
          rotation: worldTransform.rotation,
        });
      }

      resolved.add(partId);
      madeProgress = true;
    }
  }

  return workspaceParts.map((part) => byId.get(part.id) ?? part);
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

    const hostSockets = SOCKETS_BY_PART[host.type];
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
