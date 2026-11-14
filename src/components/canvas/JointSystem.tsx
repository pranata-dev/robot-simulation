'use client';

import { type RefObject, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type RapierRigidBody,
  useFixedJoint,
  useRapier,
  useRevoluteJoint,
} from '@react-three/rapier';
import { PART_CATALOG } from '@/lib/constants/hardwareCatalog';
import {
  measureRevoluteJointAngleRad,
  resolveJointConstraintSpec,
  syncRigidBodyToWorldTransform,
} from '@/lib/physics/jointConstraints';
import {
  clampServoAngleDeg,
  isValidImpulseJoint,
  releaseDepletedServoMotor,
  SERVO_MOTOR_DAMPING,
  SERVO_MOTOR_STIFFNESS,
  stepServoMotorSlewAndTraction,
} from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { QuaternionTuple, Vector3Tuple, WorkspacePart } from '@/types/simulator';

type NonNullBodyRef = RefObject<RapierRigidBody>;

interface PreJointPoseSyncProps {
  workspaceParts: readonly WorkspacePart[];
  rigidBodyRefs: Readonly<Record<string, RefObject<RapierRigidBody | null>>>;
}

/**
 * Ensures every Rapier RigidBody matches its snapped snapLogic world position and
 * quaternion before Fixed/Revolute joints attach on frame 1 of playback.
 */
function PreJointPoseSync({ workspaceParts, rigidBodyRefs }: PreJointPoseSyncProps) {
  const { world } = useRapier();
  const didSyncRef = useRef(false);

  useEffect(() => {
    if (didSyncRef.current) {
      return;
    }
    didSyncRef.current = true;
    for (const part of workspaceParts) {
      const body = rigidBodyRefs[part.id]?.current;
      syncRigidBodyToWorldTransform(body, part.position, part.rotation);
      if (body) {
        try {
          // Ensure dynamic mass & inertia reflect collider masses before joints attach.
          body.recomputeMassPropertiesFromColliders();
          body.wakeUp();
        } catch {
          // Ignore stale RigidBody updates during scene teardown.
        }
      }
    }
    try {
      world.propagateModifiedBodyPositionsToColliders();
    } catch {
      // Ignore Rapier world teardown while resetting scene bodies.
    }
  }, [rigidBodyRefs, workspaceParts, world]);

  return null;
}

interface FixedAttachmentJointProps {
  parentRef: RefObject<RapierRigidBody | null>;
  childRef: RefObject<RapierRigidBody | null>;
  anchorA: Vector3Tuple;
  frameA: QuaternionTuple;
  anchorB: Vector3Tuple;
  frameB: QuaternionTuple;
}

function FixedAttachmentJoint({
  parentRef,
  childRef,
  anchorA,
  frameA,
  anchorB,
  frameB,
}: FixedAttachmentJointProps) {
  useFixedJoint(parentRef as NonNullBodyRef, childRef as NonNullBodyRef, [
    anchorA,
    frameA,
    anchorB,
    frameB,
  ]);

  return null;
}

interface RevoluteMotorJointProps {
  servoId: string;
  parentRef: RefObject<RapierRigidBody | null>;
  childRef: RefObject<RapierRigidBody | null>;
  chassisRef?: RefObject<RapierRigidBody | null>;
  anchorA: Vector3Tuple;
  anchorB: Vector3Tuple;
  axis: Vector3Tuple;
  initialAngleRad: number;
  totalRobotMassKg: number;
}

function RevoluteMotorJoint({
  servoId,
  parentRef,
  childRef,
  chassisRef,
  anchorA,
  anchorB,
  axis,
  initialAngleRad,
  totalRobotMassKg,
}: RevoluteMotorJointProps) {
  const { rapier, world } = useRapier();
  const isRunning = useSimulationStore((state) => state.simulationStatus === 'playing');
  const currentAngleRadRef = useRef<number>(initialAngleRad);

  const joint = useRevoluteJoint(parentRef as NonNullBodyRef, childRef as NonNullBodyRef, [
    anchorA,
    anchorB,
    axis,
  ]);

  useEffect(() => {
    const revoluteJoint = joint.current;
    if (!isRunning) {
      currentAngleRadRef.current = initialAngleRad;
      return;
    }
    if (isValidImpulseJoint(revoluteJoint, world)) {
      try {
        revoluteJoint.configureMotorModel(rapier.MotorModel.ForceBased);
        revoluteJoint.configureMotorPosition(
          initialAngleRad,
          SERVO_MOTOR_STIFFNESS,
          SERVO_MOTOR_DAMPING,
        );
      } catch {
        // Ignore stale joint handle if Rapier world was recreated during Play/Stop toggle.
      }
    }
  }, [initialAngleRad, isRunning, joint, rapier, world]);

  useFrame((_, delta) => {
    const revoluteJoint = joint.current;
    if (!isRunning || !revoluteJoint) return;

    const storeState = useSimulationStore.getState();
    const physicalAngleRad = measureRevoluteJointAngleRad(parentRef.current, childRef.current, axis);
    if (storeState.batteryLevel <= 0) {
      releaseDepletedServoMotor({
        rapier,
        world,
        revoluteJoint,
        parentBody: parentRef.current,
        childBody: childRef.current,
        chassisBody: chassisRef?.current,
        currentAngleRad: physicalAngleRad ?? currentAngleRadRef.current,
      });
      return;
    }

    const clampedDelta = Math.min(Math.max(delta, 0), 0.05);
    const targetDeg = clampServoAngleDeg(storeState.servoTargetAngles[servoId] ?? 0);
    const prevAngleRad = currentAngleRadRef.current;
    const nextAngleRad = stepServoMotorSlewAndTraction({
      rapier,
      world,
      revoluteJoint,
      currentAngleRad: prevAngleRad,
      initialAngleRad,
      targetAngleDeg: targetDeg,
      delta: clampedDelta,
      parentBody: parentRef.current,
      childBody: childRef.current,
      chassisBody: chassisRef?.current,
      totalRobotMassKg,
    });
    currentAngleRadRef.current = nextAngleRad;

    const targetRad = initialAngleRad + THREE.MathUtils.degToRad(targetDeg);
    const hasCommandedMotion =
      Math.abs(targetRad - nextAngleRad) > 1e-3 ||
      Math.abs(nextAngleRad - prevAngleRad) > 1e-4 ||
      (physicalAngleRad !== null && Math.abs(targetRad - physicalAngleRad) > 0.02);

    if (hasCommandedMotion && clampedDelta > 0 && storeState.powerDrainRate > 0) {
      storeState.drainBattery(storeState.powerDrainRate * clampedDelta);
    }
  });

  return null;
}

/**
 * Instantiates Rapier Fixed and Revolute impulse joints across all snapped workspaceParts
 * strictly during active simulation playback after RigidBody poses match snapLogic transforms.
 */
export default function JointSystem() {
  const isRunning = useSimulationStore((state) => state.simulationStatus === 'playing');
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const rigidBodyRefs = useSimulationStore((state) => state.rigidBodyRefs);

  if (!isRunning) {
    return null;
  }

  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
  let totalRobotMassKg = 0;
  for (const part of workspaceParts) {
    if (part.type !== 'OBSTACLE_BLOCK' && part.type !== 'TARGET_ZONE') {
      totalRobotMassKg += PART_CATALOG[part.type]?.mass ?? 0;
    }
  }

  return (
    <>
      <PreJointPoseSync workspaceParts={workspaceParts} rigidBodyRefs={rigidBodyRefs} />
      {workspaceParts.map((child) => {
        if (!child.attachedTo || !child.socketId) return null;

        const parent = partsById.get(child.attachedTo);
        if (!parent) return null;

        const parentRef = rigidBodyRefs[parent.id];
        const childRef = rigidBodyRefs[child.id];
        if (!parentRef || !childRef) return null;

        const spec = resolveJointConstraintSpec(parent, child);
        if (!spec) return null;

        if (spec.kind === 'REVOLUTE') {
          const chassisId = parent.attachedTo;
          const chassisRef = chassisId ? rigidBodyRefs[chassisId] : undefined;

          return (
            <RevoluteMotorJoint
              key={spec.key}
              servoId={parent.id}
              parentRef={parentRef}
              childRef={childRef}
              chassisRef={chassisRef}
              anchorA={spec.anchorA}
              anchorB={spec.anchorB}
              axis={spec.axis}
              initialAngleRad={spec.initialAngleRad}
              totalRobotMassKg={totalRobotMassKg}
            />
          );
        }

        return (
          <FixedAttachmentJoint
            key={spec.key}
            parentRef={parentRef}
            childRef={childRef}
            anchorA={spec.anchorA}
            frameA={spec.frameA}
            anchorB={spec.anchorB}
            frameB={spec.frameB}
          />
        );
      })}
    </>
  );
}
