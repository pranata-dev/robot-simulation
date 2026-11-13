'use client';

import { type RefObject, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  type RapierRigidBody,
  useFixedJoint,
  useRapier,
  useRevoluteJoint,
} from '@react-three/rapier';
import { SOCKETS_BY_PART } from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1];
const ZERO_ANCHOR: Vector3Tuple = [0, 0, 0];
const DEFAULT_REVOLUTE_AXIS: Vector3Tuple = [0, 1, 0];

/** High Rapier motor PD gains so dynamic servo-leg joints behave like rigid metal gears without sagging. */
const MOTOR_STIFFNESS = 500000;
const MOTOR_DAMPING = 20000;

type NonNullBodyRef = RefObject<RapierRigidBody>;

interface FixedAttachmentJointProps {
  parentRef: RefObject<RapierRigidBody | null>;
  childRef: RefObject<RapierRigidBody | null>;
  anchor: Vector3Tuple;
  parentRotation: Vector3Tuple;
}

function FixedAttachmentJoint({
  parentRef,
  childRef,
  anchor,
  parentRotation,
}: FixedAttachmentJointProps) {
  const parentQuat = useMemo<[number, number, number, number]>(() => {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(parentRotation[0], parentRotation[1], parentRotation[2]),
    );
    return [q.x, q.y, q.z, q.w];
  }, [parentRotation]);

  const joint = useFixedJoint(
    parentRef as NonNullBodyRef,
    childRef as NonNullBodyRef,
    [anchor, parentQuat, ZERO_ANCHOR, IDENTITY_QUAT],
  );

  useEffect(() => {
    joint.current?.setContactsEnabled(false);
  }, [joint]);

  return null;
}

interface RevoluteMotorJointProps {
  servoId: string;
  parentRef: RefObject<RapierRigidBody | null>;
  childRef: RefObject<RapierRigidBody | null>;
  anchor: Vector3Tuple;
  axis: Vector3Tuple;
}

function RevoluteMotorJoint({
  servoId,
  parentRef,
  childRef,
  anchor,
  axis,
}: RevoluteMotorJointProps) {
  const { rapier } = useRapier();
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const targetAngleDeg = useSimulationStore((state) => state.servoAngles[servoId] ?? 0);

  const joint = useRevoluteJoint(
    parentRef as NonNullBodyRef,
    childRef as NonNullBodyRef,
    [anchor, ZERO_ANCHOR, axis],
  );

  useEffect(() => {
    const revoluteJoint = joint.current;
    if (!revoluteJoint) return;

    revoluteJoint.setContactsEnabled(false);
    revoluteJoint.configureMotorModel(rapier.MotorModel.AccelerationBased);

    const activeAngleDeg = simulationStatus === 'playing' ? targetAngleDeg : 0;
    const angleInRadians = (activeAngleDeg * Math.PI) / 180;
    revoluteJoint.configureMotorPosition(angleInRadians, MOTOR_STIFFNESS, MOTOR_DAMPING);

    parentRef.current?.wakeUp();
    childRef.current?.wakeUp();
  }, [childRef, joint, parentRef, rapier, simulationStatus, targetAngleDeg]);

  useFrame(() => {
    if (simulationStatus === 'playing') {
      parentRef.current?.wakeUp();
      childRef.current?.wakeUp();
    }
  });

  return null;
}

/**
 * Instantiates Rapier Fixed and Revolute impulse joints across all snapped workspaceParts
 * inside <Physics> and drives revolute leg joints natively via configureMotorPosition.
 */
export default function JointSystem() {
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const rigidBodyRefs = useSimulationStore((state) => state.rigidBodyRefs);
  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));

  return (
    <>
      {workspaceParts.map((child) => {
        if (!child.attachedTo || !child.socketId) return null;

        const parent = partsById.get(child.attachedTo);
        if (!parent) return null;

        const parentRef = rigidBodyRefs[parent.id];
        const childRef = rigidBodyRefs[child.id];
        if (!parentRef || !childRef) return null;

        const socket = SOCKETS_BY_PART[parent.type].find((entry) => entry.id === child.socketId);
        if (!socket) return null;

        const jointKey = `${child.id}:${parent.id}:${socket.id}`;

        if (child.type === 'LEG_TIBIA' && parent.type === 'SERVO_MG90S') {
          return (
            <RevoluteMotorJoint
              key={jointKey}
              servoId={parent.id}
              parentRef={parentRef}
              childRef={childRef}
              anchor={socket.position}
              axis={socket.jointAxis ?? DEFAULT_REVOLUTE_AXIS}
            />
          );
        }

        return (
          <FixedAttachmentJoint
            key={jointKey}
            parentRef={parentRef}
            childRef={childRef}
            anchor={socket.position}
            parentRotation={socket.rotation}
          />
        );
      })}
    </>
  );
}

