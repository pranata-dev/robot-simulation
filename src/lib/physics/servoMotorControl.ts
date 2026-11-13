import * as THREE from 'three';
import type { ImpulseJoint, RevoluteImpulseJoint, World } from '@dimforge/rapier3d-compat';
import { type RapierRigidBody, interactionGroups } from '@react-three/rapier';
import { SPIDER_HIP_REVOLUTE_AXES } from '@/lib/blueprints/spiderBlueprint';
import type { SocketId, Vector3Tuple } from '@/types/simulator';

/**
 * Group 0x0002 (bit 1) collides ONLY with Environment/Floor/Obstacles in Group 0x0001 (bit 0).
 * Equivalent raw Rapier InteractionGroups mask: 0x00020001.
 */
export const ROBOT_COLLISION_GROUPS = interactionGroups([1], [0]);

/**
 * Environment/Floor/Obstacles belong to Group 0x0001 (bit 0) and collide with Environment + Robot.
 */
export const ENV_COLLISION_GROUPS = interactionGroups([0], [0, 1]);

export const MIN_SERVO_ANGLE_DEG = -60;
export const MAX_SERVO_ANGLE_DEG = 60;

/** Realistic MG90S slew rate (~300 deg/s) to avoid single-frame torque spikes. */
export const MAX_SERVO_SPEED = THREE.MathUtils.degToRad(300);
export const MAX_SERVO_SPEED_RAD = MAX_SERVO_SPEED;

export const SERVO_MOTOR_STIFFNESS = 320;
export const SERVO_MOTOR_DAMPING = 28;
export const CHASSIS_LINEAR_DAMPING = 0.8;
export const CHASSIS_ANGULAR_DAMPING = 4.0;

const POWER_STROKE_FRICTION = 1.4;
const RECOVERY_STROKE_FRICTION = 0.08;
const POWER_TRACTION_IMPULSE_SCALE = 0.075;
const LEG_GROUND_CONTACT_MAX_Y = 0.6;
const STEP_ACTIVE_EPSILON = 1e-4;

const _chassisQuat = new THREE.Quaternion();
const _forwardVec = new THREE.Vector3();

/**
 * Checks whether a Rapier RigidBody reference is still alive and registered in the physics world.
 */
export function isValidRigidBody(
  body: RapierRigidBody | null | undefined,
  world?: World,
): body is RapierRigidBody {
  if (!body) return false;
  try {
    const validCheck = body as unknown as { isValid?: () => boolean };
    if (typeof validCheck.isValid === 'function' && !validCheck.isValid()) {
      return false;
    }
    if (world && !world.getRigidBody(body.handle)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a Rapier ImpulseJoint handle is still alive and registered in the physics world.
 */
export function isValidImpulseJoint(
  joint: ImpulseJoint | null | undefined,
  world?: World,
): joint is ImpulseJoint {
  if (!joint) return false;
  try {
    const validCheck = joint as unknown as { isValid?: () => boolean };
    if (typeof validCheck.isValid === 'function' && !validCheck.isValid()) {
      return false;
    }
    if (world && !world.getImpulseJoint(joint.handle)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the normalized, mirrored 20° compound pitch-yaw revolute axis per corner socket.
 */
export function resolveSpiderHipRevoluteAxis(
  servoHostSocketId?: SocketId,
  fallbackAxis: Vector3Tuple = [0, 1, 0],
): Vector3Tuple {
  if (!servoHostSocketId) return fallbackAxis;
  return SPIDER_HIP_REVOLUTE_AXES[servoHostSocketId] ?? fallbackAxis;
}

export function clampServoAngleDeg(angleDeg: number): number {
  return THREE.MathUtils.clamp(angleDeg, MIN_SERVO_ANGLE_DEG, MAX_SERVO_ANGLE_DEG);
}

function setBodyCollidersFriction(body: RapierRigidBody, friction: number): void {
  try {
    const count = body.numColliders();
    for (let i = 0; i < count; i += 1) {
      body.collider(i)?.setFriction(friction);
    }
  } catch {
    // Ignore stale collider access during teardown or mode transitions.
  }
}

export interface StepServoMotorParams {
  rapier: { MotorModel: { AccelerationBased: number } };
  world?: World;
  revoluteJoint: RevoluteImpulseJoint | null | undefined;
  currentAngleRad: number;
  targetAngleDeg: number;
  delta: number;
  parentBody: RapierRigidBody | null | undefined;
  childBody: RapierRigidBody | null | undefined;
  chassisBody?: RapierRigidBody | null | undefined;
}

/**
 * Advances a revolute servo motor smoothly toward targetAngleDeg with MG90S slew-rate limiting,
 * safely wakes valid connected bodies inside useFrame so Rapier never stalls after DELAY holds,
 * and coordinates directional power-stroke traction vs. low-friction recovery swing on grounded legs.
 */
export function stepServoMotorSlewAndTraction({
  rapier,
  revoluteJoint,
  currentAngleRad,
  targetAngleDeg,
  delta,
  parentBody,
  childBody,
  chassisBody,
}: StepServoMotorParams): number {
  const safeTargetDeg = clampServoAngleDeg(targetAngleDeg);
  const targetRad = THREE.MathUtils.degToRad(safeTargetDeg);
  const dt = Math.min(Math.max(delta, 0), 0.05);
  const maxStep = MAX_SERVO_SPEED_RAD * dt;
  const diff = targetRad - currentAngleRad;
  const step = Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
  const nextAngleRad = currentAngleRad + step;

  const hasValidParent = isValidRigidBody(parentBody);
  const hasValidChild = isValidRigidBody(childBody);
  const hasValidChassis = isValidRigidBody(chassisBody);

  if (!hasValidParent || !hasValidChild || !isValidImpulseJoint(revoluteJoint)) {
    return currentAngleRad;
  }

  try {
    revoluteJoint.configureMotorModel(rapier.MotorModel.AccelerationBased);
    revoluteJoint.configureMotorPosition(nextAngleRad, SERVO_MOTOR_STIFFNESS, SERVO_MOTOR_DAMPING);
    parentBody.wakeUp();
    childBody.wakeUp();
    if (hasValidChassis) {
      chassisBody.wakeUp();
    }
  } catch {
    return currentAngleRad;
  }

  if (step > STEP_ACTIVE_EPSILON) {
    setBodyCollidersFriction(childBody, RECOVERY_STROKE_FRICTION);
  } else {
    setBodyCollidersFriction(childBody, POWER_STROKE_FRICTION);
  }

  if (step < -STEP_ACTIVE_EPSILON && hasValidChassis) {
    try {
      const legY = childBody.translation().y;
      if (legY <= LEG_GROUND_CONTACT_MAX_Y) {
        const rot = chassisBody.rotation();
        _chassisQuat.set(rot.x, rot.y, rot.z, rot.w);
        _forwardVec.set(0, 0, 1).applyQuaternion(_chassisQuat);
        _forwardVec.y = 0;
        if (_forwardVec.lengthSq() > 1e-6) {
          _forwardVec.normalize();
          const impulseMag = POWER_TRACTION_IMPULSE_SCALE * Math.abs(step);
          chassisBody.applyImpulse(
            {
              x: _forwardVec.x * impulseMag,
              y: 0,
              z: _forwardVec.z * impulseMag,
            },
            true,
          );
        }
      }
    } catch {
      // Ignore stale body frame access during reset/unmount.
    }
  }

  return nextAngleRad;
}
