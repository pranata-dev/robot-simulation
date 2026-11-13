'use client';

import { useEffect } from 'react';
import * as THREE from 'three';
import { useRapier } from '@react-three/rapier';
import { SOCKETS_BY_PART } from '@/lib/constants/socketRegistry';
import { getPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';

/**
 * Instantiates Rapier Fixed impulse joints across rigidly mounted parts (MCU & servos on chassis)
 * when playing; attached legs are driven via kinematicPosition tracking in SpiderLegProxy.
 */
export default function AssemblyPhysicsJoints() {
  const { rapier, world } = useRapier();
  const isPlaying = useSimulationStore((state) => state.simulationStatus === 'playing');
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);

  useEffect(() => {
    if (!isPlaying) return;

    const createdJoints: ReturnType<typeof world.createImpulseJoint>[] = [];
    const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
    const tempEuler = new THREE.Euler();
    const tempQuat = new THREE.Quaternion();

    for (const child of workspaceParts) {
      if (!child.attachedTo || !child.socketId) continue;

      const parent = partsById.get(child.attachedTo);
      if (!parent) continue;

      const socket = SOCKETS_BY_PART[parent.type].find((entry) => entry.id === child.socketId);
      if (!socket || socket.jointKind !== 'FIXED') continue;

      const parentBody = getPartRigidBody(parent.id);
      const childBody = getPartRigidBody(child.id);
      if (!parentBody || !childBody) continue;

      parentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
      childBody.setBodyType(rapier.RigidBodyType.Dynamic, true);

      tempEuler.set(socket.rotation[0], socket.rotation[1], socket.rotation[2]);
      tempQuat.setFromEuler(tempEuler);

      const jointData = rapier.JointData.fixed(
        { x: socket.position[0], y: socket.position[1], z: socket.position[2] },
        { x: tempQuat.x, y: tempQuat.y, z: tempQuat.z, w: tempQuat.w },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
      const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
      joint.setContactsEnabled(false);
      createdJoints.push(joint);
    }

    return () => {
      for (const joint of createdJoints) {
        if (world.getImpulseJoint(joint.handle)) {
          world.removeImpulseJoint(joint, true);
        }
      }
    };
  }, [isPlaying, rapier, workspaceParts, world]);

  return null;
}
