import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
  getSocketsForPart,
  SPIDER_LEG_HINGE_OFFSET,
  SPIDER_SERVO_HORN_OFFSET,
} from '@/lib/constants/socketRegistry';
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
      initialAngleRad: number;
    }
  | {
      kind: 'SPHERICAL';
      key: string;
      socketId: SocketId;
      anchorA: Vector3Tuple;
      anchorB: Vector3Tuple;
    }
  | {
      kind: 'SPRING';
      key: string;
      socketId: SocketId;
      anchorA: Vector3Tuple;
      restLength: number;
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

function computeTwistAngleAroundAxis(relQuat: THREE.Quaternion, axis: Vector3Tuple): number {
  const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const proj = relQuat.x * axisVec.x + relQuat.y * axisVec.y + relQuat.z * axisVec.z;
  const twist = new THREE.Quaternion(
    axisVec.x * proj,
    axisVec.y * proj,
    axisVec.z * proj,
    relQuat.w,
  );
  if (twist.lengthSq() <= 1e-10) {
    return 0;
  }
  twist.normalize();
  const sinHalf = twist.x * axisVec.x + twist.y * axisVec.y + twist.z * axisVec.z;
  const angle = 2 * Math.atan2(sinHalf, twist.w);
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Measures the current live twist angle (radians) between two Rapier RigidBodies around `axis`.
 */
export function measureRevoluteJointAngleRad(
  parentBody: RapierRigidBody | null | undefined,
  childBody: RapierRigidBody | null | undefined,
  axis: Vector3Tuple,
): number | null {
  if (!parentBody || !childBody) return null;
  try {
    const pRot = parentBody.rotation();
    const cRot = childBody.rotation();
    const invParent = new THREE.Quaternion(pRot.x, pRot.y, pRot.z, pRot.w).invert();
    const childQ = new THREE.Quaternion(cRot.x, cRot.y, cRot.z, cRot.w);
    const relQuat = invParent.multiply(childQ).normalize();
    return computeTwistAngleAroundAxis(relQuat, axis);
  } catch {
    return null;
  }
}

/**
 * Resolves exact local Rapier joint anchors and frames from the assembled world
 * positions and rotations of parent and child parts in the store so Frame-1
 * constraints hold assembled geometry with zero initial solver impulse.
 */
export function resolveJointConstraintSpec(
  parent: WorkspacePart,
  child: WorkspacePart,
): ResolvedJointConstraint | null {
  if (!child.attachedTo || child.attachedTo !== parent.id) {
    return null;
  }

  const parentWorldPos = new THREE.Vector3(...parent.position);
  const childWorldPos = new THREE.Vector3(...child.position);
  const parentWorldQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(parent.rotation[0], parent.rotation[1], parent.rotation[2], 'XYZ'),
  );
  const childWorldQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(child.rotation[0], child.rotation[1], child.rotation[2], 'XYZ'),
  );
  const invParentQuat = parentWorldQuat.clone().invert();

  if (parent.type === 'pivot_anchor') {
    const anchorA: Vector3Tuple = [0, -0.1, 0];
    if (child.type === 'pendulum_bob') {
      const anchorAWorld = parentWorldPos
        .clone()
        .add(new THREE.Vector3(anchorA[0], anchorA[1], anchorA[2]).applyQuaternion(parentWorldQuat));
      const invChildQuat = childWorldQuat.clone().invert();
      const anchorBVec = anchorAWorld.sub(childWorldPos).applyQuaternion(invChildQuat);
      return {
        kind: 'SPHERICAL',
        key: `${child.id}:${parent.id}:pendulum`,
        socketId: child.socketId ?? 'socket-harmonic-pivot',
        anchorA,
        anchorB: [anchorBVec.x, anchorBVec.y, anchorBVec.z],
      };
    }
    if (child.type === 'helical_spring_mass') {
      return {
        kind: 'SPRING',
        key: `${child.id}:${parent.id}:spring`,
        socketId: child.socketId ?? 'socket-harmonic-spring',
        anchorA,
        restLength: 1.4,
      };
    }
  }

  if (!child.socketId) {
    return null;
  }

  const socket = getSocketsForPart(parent.type).find((entry) => entry.id === child.socketId);
  if (!socket) {
    return null;
  }

  const key = `${child.id}:${parent.id}:${socket.id}`;

  if (child.type === 'LEG_TIBIA' && parent.type === 'SERVO_MG90S') {
    const hornOffset = socket.position ?? SPIDER_SERVO_HORN_OFFSET;
    const anchorAVec = new THREE.Vector3(hornOffset[0], hornOffset[1], hornOffset[2]);
    const hornWorldPos = parentWorldPos
      .clone()
      .add(anchorAVec.clone().applyQuaternion(parentWorldQuat));
    const invChildQuat = childWorldQuat.clone().invert();
    const anchorBVec = hornWorldPos
      .clone()
      .sub(childWorldPos)
      .applyQuaternion(invChildQuat)
      .add(new THREE.Vector3(...SPIDER_LEG_HINGE_OFFSET));
    const axis = resolveSpiderHipRevoluteAxis(
      parent.socketId,
      socket.jointAxis ?? DEFAULT_REVOLUTE_AXIS,
    );
    const relQuat = invParentQuat.clone().multiply(childWorldQuat).normalize();

    return {
      kind: 'REVOLUTE',
      key,
      socketId: socket.id,
      anchorA: [anchorAVec.x, anchorAVec.y, anchorAVec.z],
      anchorB: [anchorBVec.x, anchorBVec.y, anchorBVec.z],
      axis,
      initialAngleRad: computeTwistAngleAroundAxis(relQuat, axis),
    };
  }

  const anchorAVec = childWorldPos.clone().sub(parentWorldPos).applyQuaternion(invParentQuat);
  const frameAQuat = invParentQuat.clone().multiply(childWorldQuat).normalize();

  return {
    kind: 'FIXED',
    key,
    socketId: socket.id,
    anchorA: [anchorAVec.x, anchorAVec.y, anchorAVec.z],
    frameA: [frameAQuat.x, frameAQuat.y, frameAQuat.z, frameAQuat.w],
    anchorB: [0, 0, 0],
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

