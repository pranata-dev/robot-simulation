'use client';

import { useEffect, useRef } from 'react';
import type { ImpulseJoint, RevoluteImpulseJoint } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import {
  resolveJointConstraintSpec,
  syncRigidBodyToWorldTransform,
} from '@/lib/physics/jointConstraints';
import { getPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import {
  isValidImpulseJoint,
  isValidRigidBody,
  stepServoMotorSlewAndTraction,
} from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';

interface ActiveRevoluteMeta {
  servoId: string;
  legId: string;
  chassisId?: string;
  joints: RevoluteImpulseJoint[];
}

/**
 * Instantiates imperative Rapier Fixed and Revolute impulse joints across mounted parts
 * when playing, drives slew-rate interpolated leg actuation inside useFrame, and cleans up handles cleanly.
 */
export default function AssemblyPhysicsJoints() {
  const { rapier, world } = useRapier();
  const isPlaying = useSimulationStore((state) => state.simulationStatus === 'playing');
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const activeJointsRef = useRef<Map<string, ImpulseJoint>>(new Map());
  const revoluteMetaByServoRef = useRef<Map<string, ActiveRevoluteMeta>>(new Map());
  const currentAngleRadByServoRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const activeJoints = activeJointsRef.current;
    const revoluteMetaByServo = revoluteMetaByServoRef.current;
    const currentAngles = currentAngleRadByServoRef.current;

    const cleanupJoints = () => {
      for (const [, joint] of activeJoints) {
        try {
          if (isValidImpulseJoint(joint, world)) {
            world.removeImpulseJoint(joint, true);
          }
        } catch {
          // Ignore already-disposed joints during unmount or world reset.
        }
      }
      activeJoints.clear();
      revoluteMetaByServo.clear();
      currentAngles.clear();
    };

    cleanupJoints();
    if (!isPlaying) return cleanupJoints;

    const partsById = new Map(workspaceParts.map((part) => [part.id, part]));

    for (const part of workspaceParts) {
      syncRigidBodyToWorldTransform(getPartRigidBody(part.id), part.position, part.rotation);
    }
    try {
      world.propagateModifiedBodyPositionsToColliders();
    } catch {
      // Ignore Rapier world teardown while resetting scene bodies.
    }

    for (const child of workspaceParts) {
      if (!child.attachedTo || !child.socketId) continue;

      const parent = partsById.get(child.attachedTo);
      if (!parent) continue;

      const spec = resolveJointConstraintSpec(parent, child);
      if (!spec || activeJoints.has(spec.key)) continue;

      const parentBody = getPartRigidBody(parent.id);
      const childBody = getPartRigidBody(child.id);
      if (!isValidRigidBody(parentBody, world) || !isValidRigidBody(childBody, world)) continue;

      try {
        parentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
        childBody.setBodyType(rapier.RigidBodyType.Dynamic, true);

        if (spec.kind === 'REVOLUTE') {
          const jointData = rapier.JointData.revolute(
            { x: spec.anchorA[0], y: spec.anchorA[1], z: spec.anchorA[2] },
            { x: spec.anchorB[0], y: spec.anchorB[1], z: spec.anchorB[2] },
            { x: spec.axis[0], y: spec.axis[1], z: spec.axis[2] },
          );
          const revoluteJoint = world.createImpulseJoint(
            jointData,
            parentBody,
            childBody,
            true,
          ) as RevoluteImpulseJoint;
          activeJoints.set(spec.key, revoluteJoint);

          const existing = revoluteMetaByServo.get(parent.id);
          if (existing) {
            existing.joints.push(revoluteJoint);
          } else {
            revoluteMetaByServo.set(parent.id, {
              servoId: parent.id,
              legId: child.id,
              chassisId: parent.attachedTo,
              joints: [revoluteJoint],
            });
            currentAngles.set(parent.id, 0);
          }
          continue;
        }

        const jointData = rapier.JointData.fixed(
          { x: spec.anchorA[0], y: spec.anchorA[1], z: spec.anchorA[2] },
          { x: spec.frameA[0], y: spec.frameA[1], z: spec.frameA[2], w: spec.frameA[3] },
          { x: spec.anchorB[0], y: spec.anchorB[1], z: spec.anchorB[2] },
          { x: spec.frameB[0], y: spec.frameB[1], z: spec.frameB[2], w: spec.frameB[3] },
        );
        const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
        activeJoints.set(spec.key, joint);
      } catch {
        // Ignore stale WASM joint/body handle creation during transitions.
      }
    }

    return cleanupJoints;
  }, [isPlaying, rapier, workspaceParts, world]);

  useFrame((_, delta) => {
    if (!isPlaying) return;
    const servoTargetAngles = useSimulationStore.getState().servoTargetAngles;

    for (const [servoId, meta] of revoluteMetaByServoRef.current.entries()) {
      const targetDeg = servoTargetAngles[servoId] ?? 0;
      const currentRad = currentAngleRadByServoRef.current.get(servoId) ?? 0;
      const servoBody = getPartRigidBody(servoId);
      const legBody = getPartRigidBody(meta.legId);
      const chassisBody = meta.chassisId ? getPartRigidBody(meta.chassisId) : undefined;

      let nextRad = currentRad;
      for (const joint of meta.joints) {
        nextRad = stepServoMotorSlewAndTraction({
          rapier,
          world,
          revoluteJoint: joint,
          currentAngleRad: currentRad,
          targetAngleDeg: targetDeg,
          delta,
          parentBody: servoBody,
          childBody: legBody,
          chassisBody,
        });
      }
      currentAngleRadByServoRef.current.set(servoId, nextRad);
    }
  });

  return null;
}
