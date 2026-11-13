import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { getSocketsForPart } from '@/lib/constants/socketRegistry';
import {
  isValidRigidBody,
  resolveSpiderHipRevoluteAxis,
} from '@/lib/physics/servoMotorControl';
import type {
  QuaternionTuple,
  SocketId,
  Vector3Tuple,
  WorkspacePart,
} from '@/types/simulator';

const ZERO_VEC: Vector3Tuple = [0, 0, 0];
const IDENTITY_QUAT: QuaternionTuple = [0, 0, 0, 1];
const DEFAULT_REVOLUTE_AXIS: Vector3Tuple = [0, 1, 0];

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

export type ResolvedJointConstraint =
  | {
      kind: 'FIXED';
      key: string;
      socketId: SocketId;
      anchorA: Vector3Tuple;
      frameA: QuaternionTuple;
      anchorB: Vector3Tuple;
      frameB: QuaternionTuple;
    }
  | {
      kind: 'REVOLUTE';
      key: string;
      socketId: SocketId;
      anchorA: Vector3Tuple;
      anchorB: Vector3Tuple;
      axis: Vector3Tuple;
    };

/**
 * Converts an XYZ Euler tuple into a normalized [x, y, z, w] quaternion tuple
 * matching transformMath.ts socket composition.
 */
export function eulerToQuaternionTuple(rotation: Vector3Tuple): QuaternionTuple {
  _euler.set(rotation[0], rotation[1], rotation[2], 'XYZ');
  _quat.setFromEuler(_euler);
  return [_quat.x, _quat.y, _quat.z, _quat.w];
}

/**
 * Resolves exact local Rapier joint anchors and frames between an attached child part
 * and its parent socket from socketRegistry/spiderBlueprint so Frame-1 constraints
 * match snapLogic world poses with zero initial solver error.
 */
export function resolveJointConstraintSpec(
  parent: WorkspacePart,
  child: WorkspacePart,
): ResolvedJointConstraint | null {
  if (!child.attachedTo || !child.socketId || child.attachedTo !== parent.id) {
    return null;
  }

  const socket = getSocketsForPart(parent.type).find((entry) => entry.id === child.socketId);
  if (!socket) {
    return null;
  }

  const key = `${child.id}:${parent.id}:${socket.id}`;

  if (child.type === 'LEG_TIBIA' && parent.type === 'SERVO_MG90S') {
    return {
      kind: 'REVOLUTE',
      key,
      socketId: socket.id,
      anchorA: [socket.position[0], socket.position[1], socket.position[2]],
      anchorB: [...ZERO_VEC],
      axis: resolveSpiderHipRevoluteAxis(
        parent.socketId,
        socket.jointAxis ?? DEFAULT_REVOLUTE_AXIS,
      ),
    };
  }

  return {
    kind: 'FIXED',
    key,
    socketId: socket.id,
    anchorA: [socket.position[0], socket.position[1], socket.position[2]],
    frameA: eulerToQuaternionTuple(socket.rotation),
    anchorB: [...ZERO_VEC],
    frameB: [...IDENTITY_QUAT],
  };
}

/**
 * Synchronizes a live Rapier RigidBody translation, quaternion, and zero velocities
 * to its snapped world transform before physics stepping or joint creation.
 */
export function syncRigidBodyToWorldTransform(
  body: RapierRigidBody | null | undefined,
  position: Vector3Tuple,
  rotation: Vector3Tuple,
): boolean {
  if (!isValidRigidBody(body)) {
    return false;
  }

  const [qx, qy, qz, qw] = eulerToQuaternionTuple(rotation);
  try {
    body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    return true;
  } catch {
    return false;
  }
}

