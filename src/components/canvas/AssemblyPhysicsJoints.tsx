'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ImpulseJoint } from '@dimforge/rapier3d-compat';
import { useRapier } from '@react-three/rapier';
import { SOCKETS_BY_PART } from '@/lib/constants/socketRegistry';
import { getPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';

/**
 * Instantiates Rapier Fixed impulse joints across rigidly mounted parts when playing
 * and cleans up all joint handles deterministically across repeated play/stop cycles.
 */
export default function AssemblyPhysicsJoints() {
  const { rapier, world } = useRapier();
  const isPlaying = useSimulationStore((state) => state.simulationStatus === 'playing');
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const activeJointsRef = useRef<Map<string, ImpulseJoint>>(new Map());

  useEffect(() => {
    const activeJoints = activeJointsRef.current;

    const cleanupJoints = () => {
      for (const [, joint] of activeJoints) {
        if (world.getImpulseJoint(joint.handle)) {
          world.removeImpulseJoint(joint, true);
        }
      }
      activeJoints.clear();
    };

    cleanupJoints();
    if (!isPlaying) return cleanupJoints;

    const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
    const tempEuler = new THREE.Euler();
    const tempQuat = new THREE.Quaternion();

    for (const child of workspaceParts) {
      if (!child.attachedTo || !child.socketId) continue;

      const parent = partsById.get(child.attachedTo);
      if (!parent) continue;

      const socket = SOCKETS_BY_PART[parent.type].find((entry) => entry.id === child.socketId);
      if (!socket || socket.jointKind !== 'FIXED') continue;

      const jointKey = `${child.id}:${parent.id}:${socket.id}`;
      if (activeJoints.has(jointKey)) continue;

      const parentBody = getPartRigidBody(parent.id);
      const childBody = getPartRigidBody(child.id);
      if (!parentBody || !childBody) continue;
      if (!world.getRigidBody(parentBody.handle) || !world.getRigidBody(childBody.handle)) continue;

      parentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
      childBody.setBodyType(rapier.RigidBodyType.Dynamic, true);

      tempEuler.set(socket.rotation[0], socket.rotation[1], socket.rotation[2], 'XYZ');
      tempQuat.setFromEuler(tempEuler);

      const jointData = rapier.JointData.fixed(
        { x: socket.position[0], y: socket.position[1], z: socket.position[2] },
        { x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
      const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
      joint.setContactsEnabled(false);
      activeJoints.set(jointKey, joint);
    }

    return cleanupJoints;
  }, [isPlaying, rapier, workspaceParts, world]);

  return null;
}
