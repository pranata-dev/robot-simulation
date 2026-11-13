'use client';

import { type RefObject, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  type RapierRigidBody,
  useFixedJoint,
  useRapier,
  useRevoluteJoint,
} from '@react-three/rapier';
import {
  resolveJointConstraintSpec,
  syncRigidBodyToWorldTransform,
} from '@/lib/physics/jointConstraints';
import { stepServoMotorSlewAndTraction } from '@/lib/physics/servoMotorControl';
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

  useEffect(() => {
    for (const part of workspaceParts) {
      syncRigidBodyToWorldTransform(rigidBodyRefs[part.id]?.current, part.position, part.rotation);
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
}

function RevoluteMotorJoint({
  servoId,
  parentRef,
  childRef,
  chassisRef,
  anchorA,
  anchorB,
  axis,
}: RevoluteMotorJointProps) {
  const { rapier, world } = useRapier();
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const currentAngleRadRef = useRef<number>(0);

  const joint = useRevoluteJoint(parentRef as NonNullBodyRef, childRef as NonNullBodyRef, [
    anchorA,
    anchorB,
    axis,
  ]);

  useEffect(() => {
    if (simulationStatus !== 'playing') {
      currentAngleRadRef.current = 0;
    }
  }, [simulationStatus]);

  useFrame((_, delta) => {
    const revoluteJoint = joint.current;
    if (simulationStatus !== 'playing' || !revoluteJoint) return;

    const targetDeg = useSimulationStore.getState().servoTargetAngles[servoId] ?? 0;
    currentAngleRadRef.current = stepServoMotorSlewAndTraction({
      rapier,
      world,
      revoluteJoint,
      currentAngleRad: currentAngleRadRef.current,
      targetAngleDeg: targetDeg,
      delta,
      parentBody: parentRef.current,
      childBody: childRef.current,
      chassisBody: chassisRef?.current,
    });
  });

  return null;
}

/**
 * Instantiates Rapier Fixed and Revolute impulse joints across all snapped workspaceParts
 * strictly during active simulation playback after RigidBody poses match snapLogic transforms.
 */
export default function JointSystem() {
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const rigidBodyRefs = useSimulationStore((state) => state.rigidBodyRefs);

  if (simulationStatus !== 'playing') {
    return null;
  }

  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));

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
