'use client';

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { type RapierRigidBody, useRapier } from '@react-three/rapier';
import { registerPartRigidBody, unregisterPartRigidBody } from '@/lib/physics/rigidBodyRegistry';
import {
  eulerToQuaternionTuple,
  syncRigidBodyToWorldTransform,
} from '@/lib/physics/jointConstraints';
import { applyRollingSolidMassProperties } from '@/lib/physics/rampGeometry';
import { isValidRigidBody } from '@/lib/physics/servoMotorControl';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartType, SimulationStatus, Vector3Tuple } from '@/types/simulator';
import {
  type GlobalSocketTarget,
  evaluateSocketProximity,
  findNearestSnapTarget,
  getUnoccupiedSocketsInWorld,
} from '@/utils/snapLogic';

interface UsePartDragAndSyncOptions {
  id: string;
  partType: PartType;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  initialVelocity?: Vector3Tuple;
  attachedTo?: string;
  enableSnapping: boolean;
  simulationStatus: SimulationStatus;
  resetNonce: number;
  rigidBodyRef: RefObject<RapierRigidBody | null>;
  dragGroupRef: RefObject<THREE.Group | null>;
}

/**
 * Keeps a DraggableRigidPart synced with store transforms during idle mode and
 * drives XZ-plane drag movement, attached child following, and socket snapping.
 */
export function usePartDragAndSync({
  id,
  partType,
  position,
  rotation,
  initialVelocity,
  attachedTo,
  enableSnapping,
  simulationStatus,
  resetNonce,
  rigidBodyRef,
  dragGroupRef,
}: UsePartDragAndSyncOptions) {
  const { world } = useRapier();
  const { scene } = useThree();
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef<Vector3Tuple>([...position]);
  const latestPositionRef = useRef<Vector3Tuple>([...position]);
  const tempDeltaRef = useRef(new THREE.Vector3());
  const availableSocketsRef = useRef<GlobalSocketTarget[]>([]);
  const attachedChildrenRef = useRef<Array<{ object3D: THREE.Object3D; origin: Vector3Tuple }>>([]);
  const lastSyncedRef = useRef<{
    pos: Vector3Tuple;
    rot: Vector3Tuple;
    resetNonce: number;
    simulationStatus: SimulationStatus;
  }>({
    pos: [...position],
    rot: [...rotation],
    resetNonce,
    simulationStatus,
  });

  const isReadOnly = useSimulationStore((state) => state.readOnly);
  const isDragEnabled = simulationStatus === 'idle' && !isReadOnly;

  useEffect(() => {
    const body = rigidBodyRef.current;
    if (!body) return;
    registerPartRigidBody(id, body);
    return () => {
      unregisterPartRigidBody(id, body);
    };
  }, [id, rigidBodyRef]);

  useEffect(() => {
    const prev = lastSyncedRef.current;
    const transformChanged =
      prev.pos[0] !== position[0] ||
      prev.pos[1] !== position[1] ||
      prev.pos[2] !== position[2] ||
      prev.rot[0] !== rotation[0] ||
      prev.rot[1] !== rotation[1] ||
      prev.rot[2] !== rotation[2];
    const resetTriggered = prev.resetNonce !== resetNonce && resetNonce > 0;
    const statusChanged = prev.simulationStatus !== simulationStatus;
    const enteredPlaying = prev.simulationStatus !== 'playing' && simulationStatus === 'playing';
    const stayingInPlayMode = simulationStatus === 'playing' && !enteredPlaying;

    if (
      stayingInPlayMode ||
      (!transformChanged && !resetTriggered && !statusChanged) ||
      (!isDragEnabled && !statusChanged && !resetTriggered) ||
      isDraggingRef.current
    ) {
      lastSyncedRef.current = {
        ...prev,
        simulationStatus,
      };
      return;
    }

    lastSyncedRef.current = {
      pos: [...position],
      rot: [...rotation],
      resetNonce,
      simulationStatus,
    };

    syncRigidBodyToWorldTransform(rigidBodyRef.current, position, rotation);
    if (enteredPlaying && rigidBodyRef.current) {
      try {
        // Rapier skips collider mass aggregation while kinematicPosition; recompute once dynamic.
        rigidBodyRef.current.recomputeMassPropertiesFromColliders();
        applyRollingSolidMassProperties(
          { type: partType, initialVelocity },
          rigidBodyRef.current,
          {
            applyInitialVelocity: true,
            launchSpeed: useSimulationStore.getState().launchSpeed,
          },
        );
        rigidBodyRef.current.wakeUp();
      } catch {
        // Ignore stale RigidBody wake-up during scene reset.
      }
    }

    const [qx, qy, qz, qw] = eulerToQuaternionTuple(rotation);
    const partObject = scene.getObjectByName(id);
    if (partObject) {
      partObject.position.set(position[0], position[1], position[2]);
      partObject.quaternion.set(qx, qy, qz, qw);
    }

    try {
      world.propagateModifiedBodyPositionsToColliders();
    } catch {
      // Ignore Rapier world teardown while resetting scene bodies.
    }
  }, [id, initialVelocity, isDragEnabled, partType, position, resetNonce, rigidBodyRef, rotation, scene, simulationStatus, world]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  const handleDragStart = useCallback(() => {
    if (!isDragEnabled) return;
    isDraggingRef.current = false;

    const body = rigidBodyRef.current;
    if (isValidRigidBody(body)) {
      try {
        const t = body.translation();
        dragOriginRef.current = [t.x, t.y, t.z];
      } catch {
        dragOriginRef.current = [...position];
      }
    } else {
      dragOriginRef.current = [...position];
    }
    latestPositionRef.current = [...dragOriginRef.current];
    document.body.style.cursor = 'grabbing';

    const { workspaceParts } = useSimulationStore.getState();
    const descendantIds = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const parentId = queue.shift();
      for (const part of workspaceParts) {
        if (part.attachedTo === parentId && !descendantIds.has(part.id)) {
          descendantIds.add(part.id);
          queue.push(part.id);
        }
      }
    }

    attachedChildrenRef.current = [...descendantIds].flatMap((childId) => {
      const obj = scene.getObjectByName(childId);
      if (!obj) return [];
      return [{ object3D: obj, origin: [obj.position.x, obj.position.y, obj.position.z] }];
    });

    if (enableSnapping) {
      availableSocketsRef.current = getUnoccupiedSocketsInWorld(id, workspaceParts);
    }
  }, [enableSnapping, id, isDragEnabled, position, rigidBodyRef, scene]);

  const handleDragMove = useCallback(
    (localMatrix: THREE.Matrix4) => {
      if (!isDragEnabled) return;
      const delta = tempDeltaRef.current.setFromMatrixPosition(localMatrix);
      const nextX = dragOriginRef.current[0] + delta.x;
      const nextY = dragOriginRef.current[1];
      const nextZ = dragOriginRef.current[2] + delta.z;

      latestPositionRef.current = [nextX, nextY, nextZ];
      isDraggingRef.current = true;

      const rigidBodyObject = dragGroupRef.current?.parent;
      if (rigidBodyObject) {
        rigidBodyObject.position.set(nextX, nextY, nextZ);
      }

      for (const child of attachedChildrenRef.current) {
        child.object3D.position.set(
          child.origin[0] + delta.x,
          child.origin[1],
          child.origin[2] + delta.z,
        );
      }

      if (isValidRigidBody(rigidBodyRef.current)) {
        try {
          rigidBodyRef.current.setTranslation({ x: nextX, y: nextY, z: nextZ }, false);
          world.propagateModifiedBodyPositionsToColliders();
        } catch {
          // Ignore transient Rapier handle access while dragging during teardown.
        }
      }

      if (enableSnapping) {
        const proximity = evaluateSocketProximity(
          partType,
          latestPositionRef.current,
          availableSocketsRef.current,
        );
        useSimulationStore.getState().setActiveSnapTarget(proximity);
      }
    },
    [dragGroupRef, enableSnapping, isDragEnabled, partType, rigidBodyRef, world],
  );

  const handleDragEnd = useCallback(() => {
    document.body.style.cursor = 'auto';
    attachedChildrenRef.current = [];
    const store = useSimulationStore.getState();
    if (enableSnapping) {
      store.setActiveSnapTarget(null);
    }

    if (!isDragEnabled || !isDraggingRef.current) return;
    isDraggingRef.current = false;

    const finalPosition = latestPositionRef.current;

    if (!enableSnapping) {
      store.updatePartPosition(id, finalPosition);
      return;
    }

    const unoccupiedSockets = getUnoccupiedSocketsInWorld(id, store.workspaceParts);
    const snapMatch = findNearestSnapTarget(partType, finalPosition, unoccupiedSockets);

    if (snapMatch) {
      store.snapPartToSocket(
        id,
        snapMatch.parentId,
        snapMatch.socketId,
        snapMatch.position,
        snapMatch.rotation,
      );
      return;
    }

    if (attachedTo) {
      store.detachPart(id, finalPosition);
      return;
    }

    store.updatePartPosition(id, finalPosition);
  }, [attachedTo, enableSnapping, id, isDragEnabled, partType]);

  return {
    isDragEnabled,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}

