import * as THREE from 'three';
import type {
  PartType,
  QuaternionTuple,
  SocketDefinition,
  Vector3Tuple,
  WorkspacePart,
} from '@/types/simulator';

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
 * from its parent's transform matrix and local socket definition.
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
 * against an explicit socket map with zero store or blueprint registry coupling.
 */
export function resolveHierarchyWithSockets(
  workspaceParts: readonly WorkspacePart[],
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
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

      const socket = socketsByPart[parent.type].find((entry) => entry.id === part.socketId);
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

