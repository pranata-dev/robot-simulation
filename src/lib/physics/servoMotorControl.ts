import * as THREE from 'three';
import type { ImpulseJoint, RevoluteImpulseJoint, World } from '@dimforge/rapier3d-compat';
import { type RapierRigidBody, interactionGroups } from '@react-three/rapier';
import { SPIDER_HIP_REVOLUTE_AXES } from '@/lib/blueprints/spiderBlueprint';
import type { SocketId, Vector3Tuple } from '@/types/simulator';

/**
 * Group 1 collides ONLY with Environment/Floor/Obstacles in Group 0.
 * Equivalent raw Rapier InteractionGroups mask: 0x00020001.
 */
export const ROBOT_COLLISION_GROUPS = interactionGroups(1, [0]);

/**
 * Environment/Floor/Obstacles belong to Group 0 and collide with Environment (0) + Robot (1).
 */
export const ENV_COLLISION_GROUPS = interactionGroups(0, [0, 1]);

export const MIN_SERVO_ANGLE_DEG = -45;
export const MAX_SERVO_ANGLE_DEG = 45;

/** Realistic MG90S slew rate (~300 deg/s) to avoid single-frame torque spikes. */
export const MAX_SERVO_SPEED = THREE.MathUtils.degToRad(300);
export const MAX_SERVO_SPEED_RAD = MAX_SERVO_SPEED;

export const SERVO_MOTOR_STIFFNESS = 150;
export const SERVO_MOTOR_DAMPING = 12;
export const CHASSIS_LINEAR_DAMPING = 0.5;
export const CHASSIS_ANGULAR_DAMPING = 2.0;

const POWER_STROKE_FRICTION = 1.5;
const RECOVERY_STROKE_FRICTION = 0.08;
const DEPLETED_FOOT_FRICTION = 0.04;
const POWER_TRACTION_IMPULSE_SCALE = 0.26;
const BASE_UNLOADED_SPIDER_MASS_KG = 0.316;
const HEAVY_MASS_STIFFNESS = 850;
const HEAVY_MASS_DAMPING = 62;
const HEAVY_RECOVERY_FRICTION = 0.4;
const HEAVY_POWER_FRICTION = 0.75;
const HEAVY_MASS_TRACTION_TUNING = 0.85;
const DIFFERENTIAL_YAW_TORQUE_SCALE = 2.3;
const HEAVY_YAW_TORQUE_SCALE = 3.2;
const HEAVY_HIP_LIMIT_RAD = THREE.MathUtils.degToRad(45);
const HEAVY_LEG_ANGULAR_DAMPING = 5.0;
const HEAVY_CHASSIS_ANGULAR_DAMPING = 2.5;
const HEAVY_UPRIGHT_TRIM_TORQUE = 46;

const _trimUpVec = new THREE.Vector3();
const _trimWorldUp = new THREE.Vector3(0, 1, 0);
const _trimCorrVec = new THREE.Vector3();

function resolvePayloadGains(totalRobotMassKg?: number) {
  if (
    typeof totalRobotMassKg !== 'number' ||
    !Number.isFinite(totalRobotMassKg) ||
    totalRobotMassKg <= BASE_UNLOADED_SPIDER_MASS_KG * 1.25
  ) {
    return {
      stiffness: SERVO_MOTOR_STIFFNESS,
      damping: SERVO_MOTOR_DAMPING,
      recoveryFriction: RECOVERY_STROKE_FRICTION,
      powerFriction: POWER_STROKE_FRICTION,
      tractionScale: 1,
      yawScale: DIFFERENTIAL_YAW_TORQUE_SCALE,
      hipLimitRad: 0,
      legAngularDamping: 0,
      chassisAngularDamping: 0,
      uprightTrimTorque: 0,
    };
  }
  const massRatio = Math.min(12, totalRobotMassKg / BASE_UNLOADED_SPIDER_MASS_KG);
  const loadScale = THREE.MathUtils.clamp((massRatio - 1) / 7.91, 0, 1);
  return {
    stiffness: SERVO_MOTOR_STIFFNESS + (HEAVY_MASS_STIFFNESS - SERVO_MOTOR_STIFFNESS) * loadScale,
    damping: SERVO_MOTOR_DAMPING + (HEAVY_MASS_DAMPING - SERVO_MOTOR_DAMPING) * loadScale,
    recoveryFriction:
      RECOVERY_STROKE_FRICTION + (HEAVY_RECOVERY_FRICTION - RECOVERY_STROKE_FRICTION) * loadScale,
    powerFriction: POWER_STROKE_FRICTION + (HEAVY_POWER_FRICTION - POWER_STROKE_FRICTION) * loadScale,
    tractionScale: massRatio * HEAVY_MASS_TRACTION_TUNING,
    yawScale: DIFFERENTIAL_YAW_TORQUE_SCALE + (HEAVY_YAW_TORQUE_SCALE - DIFFERENTIAL_YAW_TORQUE_SCALE) * loadScale,
    hipLimitRad: HEAVY_HIP_LIMIT_RAD,
    legAngularDamping: HEAVY_LEG_ANGULAR_DAMPING,
    chassisAngularDamping: HEAVY_CHASSIS_ANGULAR_DAMPING,
    uprightTrimTorque: HEAVY_UPRIGHT_TRIM_TORQUE * loadScale,
  };
}
const FOOT_GROUND_CONTACT_MAX_Y = 0.25;
const LEG_ORIGIN_FALLBACK_MAX_Y = 0.95;
const STEP_ACTIVE_EPSILON = 1e-4;

const _chassisQuat = new THREE.Quaternion();
const _chassisInvQuat = new THREE.Quaternion();
const _forwardVec = new THREE.Vector3();
const _localHipVec = new THREE.Vector3();
const _stabilizeQuat = new THREE.Quaternion();
const _stabilizeEuler = new THREE.Euler(0, 0, 0, 'YXZ');

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
 * Resolves the normalized, mirrored 35°-inclined corner revolute axis per socket.
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

/**
 * Prevents the chassis from tipping onto its side (>25 deg roll/pitch) while preserving yaw.
 */
export function stabilizeChassisUpright(
  chassisBody: RapierRigidBody | null | undefined,
  maxTiltDeg = 25,
): void {
  if (!chassisBody) return;
  const rot = chassisBody.rotation();
  _stabilizeQuat.set(rot.x, rot.y, rot.z, rot.w);
  _stabilizeEuler.setFromQuaternion(_stabilizeQuat, 'YXZ');

  const maxTiltRad = THREE.MathUtils.degToRad(maxTiltDeg);
  const softDampRad = THREE.MathUtils.degToRad(8);
  const clampedX = THREE.MathUtils.clamp(_stabilizeEuler.x, -maxTiltRad, maxTiltRad);
  const clampedZ = THREE.MathUtils.clamp(_stabilizeEuler.z, -maxTiltRad, maxTiltRad);
  const exceedsHardTilt = clampedX !== _stabilizeEuler.x || clampedZ !== _stabilizeEuler.z;
  const exceedsSoftTilt =
    Math.abs(_stabilizeEuler.x) > softDampRad || Math.abs(_stabilizeEuler.z) > softDampRad;

  if (exceedsHardTilt) {
    _stabilizeEuler.x = clampedX;
    _stabilizeEuler.z = clampedZ;
    _stabilizeQuat.setFromEuler(_stabilizeEuler);
    chassisBody.setRotation(
      { x: _stabilizeQuat.x, y: _stabilizeQuat.y, z: _stabilizeQuat.z, w: _stabilizeQuat.w },
      false,
    );
  }

  if (exceedsHardTilt || exceedsSoftTilt) {
    const angVel = chassisBody.angvel();
    const tiltDamp = exceedsHardTilt ? 0.25 : 0.75;
    chassisBody.setAngvel(
      { x: angVel.x * tiltDamp, y: angVel.y, z: angVel.z * tiltDamp },
      false,
    );
  }
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
  rapier: { MotorModel: { ForceBased: number } };
  world?: World;
  revoluteJoint: RevoluteImpulseJoint | null | undefined;
  currentAngleRad: number;
  initialAngleRad?: number;
  targetAngleDeg: number;
  delta: number;
  parentBody: RapierRigidBody | null | undefined;
  childBody: RapierRigidBody | null | undefined;
  chassisBody?: RapierRigidBody | null | undefined;
  totalRobotMassKg?: number;
}

export interface ReleaseDepletedServoMotorParams {
  rapier: { MotorModel: { ForceBased: number } };
  world?: World;
  revoluteJoint: RevoluteImpulseJoint | null | undefined;
  parentBody: RapierRigidBody | null | undefined;
  childBody: RapierRigidBody | null | undefined;
  chassisBody?: RapierRigidBody | null | undefined;
  currentAngleRad?: number;
}

/**
 * Releases motor holding stiffness/damping and drops foot friction when the battery is depleted
 * so the unpowered robot sags under its own weight and CoM.
 */
export function releaseDepletedServoMotor({
  rapier,
  world,
  revoluteJoint,
  parentBody,
  childBody,
  chassisBody,
  currentAngleRad = 0,
}: ReleaseDepletedServoMotorParams): void {
  if (!isValidImpulseJoint(revoluteJoint, world)) return;
  try {
    revoluteJoint.setLimits(-Math.PI, Math.PI);
    revoluteJoint.configureMotorModel(rapier.MotorModel.ForceBased);
    revoluteJoint.configureMotorPosition(currentAngleRad, 0, 0);
    if (isValidRigidBody(childBody, world)) {
      childBody.setAngularDamping(0.35);
      setBodyCollidersFriction(childBody, DEPLETED_FOOT_FRICTION);
      childBody.wakeUp();
    }
    if (isValidRigidBody(parentBody, world)) {
      parentBody.wakeUp();
    }
    if (isValidRigidBody(chassisBody, world)) {
      chassisBody.setAngularDamping(2.0);
      chassisBody.wakeUp();
    }
  } catch {
    // Ignore stale physics handles during teardown or reset transitions.
  }
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
  initialAngleRad = 0,
  targetAngleDeg,
  delta,
  parentBody,
  childBody,
  chassisBody,
  totalRobotMassKg,
}: StepServoMotorParams): number {
  const safeTargetDeg = clampServoAngleDeg(targetAngleDeg);
  const targetRad = initialAngleRad + THREE.MathUtils.degToRad(safeTargetDeg);
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

  const gains = resolvePayloadGains(totalRobotMassKg);

  try {
    if (gains.hipLimitRad > 0) {
      revoluteJoint.setLimits(initialAngleRad - gains.hipLimitRad, initialAngleRad + gains.hipLimitRad);
    }
    revoluteJoint.configureMotorModel(rapier.MotorModel.ForceBased);
    revoluteJoint.configureMotorPosition(nextAngleRad, gains.stiffness, gains.damping);
    if (gains.legAngularDamping > 0) {
      childBody.setAngularDamping(gains.legAngularDamping);
    }
    parentBody.wakeUp();
    childBody.wakeUp();
    if (hasValidChassis) {
      if (gains.chassisAngularDamping > 0) {
        chassisBody.setAngularDamping(gains.chassisAngularDamping);
      }
      chassisBody.wakeUp();
    }
  } catch {
    return currentAngleRad;
  }

  if (step > STEP_ACTIVE_EPSILON) {
    setBodyCollidersFriction(childBody, gains.recoveryFriction);
  } else {
    setBodyCollidersFriction(childBody, gains.powerFriction);
  }

  if (step < -STEP_ACTIVE_EPSILON && hasValidChassis) {
    try {
      const footCollider = childBody.numColliders() > 0 ? childBody.collider(0) : null;
      const isGrounded = footCollider
        ? footCollider.translation().y <= FOOT_GROUND_CONTACT_MAX_Y
        : childBody.translation().y <= LEG_ORIGIN_FALLBACK_MAX_Y;
      if (isGrounded) {
        const rot = chassisBody.rotation();
        _chassisQuat.set(rot.x, rot.y, rot.z, rot.w);
        _forwardVec.set(0, 0, 1).applyQuaternion(_chassisQuat);
        _forwardVec.y = 0;
        if (_forwardVec.lengthSq() > 1e-6) {
          _forwardVec.normalize();
          const impulseMag = POWER_TRACTION_IMPULSE_SCALE * gains.tractionScale * Math.abs(step);
          const hipPos = parentBody.translation();
          const chPos = chassisBody.translation();
          _chassisInvQuat.copy(_chassisQuat).invert();
          _localHipVec
            .set(hipPos.x - chPos.x, hipPos.y - chPos.y, hipPos.z - chPos.z)
            .applyQuaternion(_chassisInvQuat);

          chassisBody.applyImpulse(
            {
              x: _forwardVec.x * impulseMag,
              y: 0,
              z: _forwardVec.z * impulseMag,
            },
            true,
          );
          // Apply differential yaw torque around Y proportional to lateral hip lever arm (-localX)
          chassisBody.applyTorqueImpulse(
            {
              x: 0,
              y: -_localHipVec.x * impulseMag * gains.yawScale,
              z: 0,
            },
            true,
          );
        }
      }
    } catch {
      // Ignore stale body frame access during reset/unmount.
    }
  }

  if (hasValidChassis && gains.uprightTrimTorque > 0) {
    try {
      const rot = chassisBody.rotation();
      _chassisQuat.set(rot.x, rot.y, rot.z, rot.w);
      _trimUpVec.set(0, 1, 0).applyQuaternion(_chassisQuat);
      _trimCorrVec.crossVectors(_trimUpVec, _trimWorldUp);
      chassisBody.applyTorqueImpulse(
        {
          x: _trimCorrVec.x * gains.uprightTrimTorque * dt,
          y: 0,
          z: _trimCorrVec.z * gains.uprightTrimTorque * dt,
        },
        true,
      );
    } catch {
      // Ignore stale body frame access during reset/unmount.
    }
  }

  return nextAngleRad;
}
