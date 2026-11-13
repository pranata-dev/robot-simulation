'use client';

import { type ReactNode, type RefObject, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DragControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import {
  CuboidCollider,
  type IntersectionEnterHandler,
  type RapierRigidBody,
  type RigidBodyAutoCollider,
  type RigidBodyTypeString,
  RigidBody,
  useRapier,
} from '@react-three/rapier';
import type { ActiveCollisionTypes, InteractionGroups } from '@dimforge/rapier3d-compat';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartType, Vector3Tuple } from '@/types/simulator';
import {
  type GlobalSocketTarget,
  evaluateSocketProximity,
  findNearestSnapTarget,
  getUnoccupiedSocketsInWorld,
} from '@/utils/snapLogic';

interface DraggableRigidPartProps {
  id: string;
  partType: PartType;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  attachedTo?: string;
  enableSnapping?: boolean;
  colliders?: RigidBodyAutoCollider | false;
  includeDefaultCollider?: boolean;
  colliderHalfExtents?: Vector3Tuple;
  mass?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
  rigidBodyTypeOverride?: RigidBodyTypeString;
  activeCollisionTypes?: ActiveCollisionTypes;
  collisionGroups?: InteractionGroups;
  rigidBodyRef?: RefObject<RapierRigidBody | null>;
  userData?: Record<string, unknown>;
  sensor?: boolean;
  onIntersectionEnter?: IntersectionEnterHandler;
  children: ReactNode;
}

const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const DEFAULT_HALF_EXTENTS: Vector3Tuple = [0.1, 0.1, 0.1];

/**
 * Combines a Rapier RigidBody + Collider with @react-three/drei DragControls
 * constrained strictly parallel to the XZ floor plane, with optional type-strict socket snapping.
 */
export default function DraggableRigidPart({
  id,
  partType,
  position,
  rotation = DEFAULT_ROTATION,
  attachedTo,
  enableSnapping = false,
  colliders = false,
  includeDefaultCollider = true,
  colliderHalfExtents = DEFAULT_HALF_EXTENTS,
  mass = 0.02,
  friction = 0.5,
  linearDamping = 0,
  angularDamping = 0,
  rigidBodyTypeOverride,
  activeCollisionTypes,
  collisionGroups,
  rigidBodyRef: externalRigidBodyRef,
  userData,
  sensor,
  onIntersectionEnter,
  children,
}: DraggableRigidPartProps) {
  const { world } = useRapier();
  const { scene } = useThree();
  const internalRigidBodyRef = useRef<RapierRigidBody | null>(null);
  const rigidBodyRef = externalRigidBodyRef ?? internalRigidBodyRef;
  const dragGroupRef = useRef<THREE.Group | null>(null);
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef<Vector3Tuple>([...position]);
  const latestPositionRef = useRef<Vector3Tuple>([...position]);
  const tempDeltaRef = useRef(new THREE.Vector3());
  const availableSocketsRef = useRef<GlobalSocketTarget[]>([]);
  const attachedChildrenRef = useRef<Array<{ object3D: THREE.Object3D; origin: Vector3Tuple }>>([]);

  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
  const isDragEnabled = simulationStatus === 'idle';
  const rigidBodyType = rigidBodyTypeOverride ?? 'dynamic';

  useEffect(() => {
    if (resetNonce === 0) return;
    const body = rigidBodyRef.current;
    const targetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2]),
    );

    if (body) {
      body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      body.setRotation({ x: targetQuat.x, y: targetQuat.y, z: targetQuat.z, w: targetQuat.w }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const partObject = scene.getObjectByName(id);
    if (partObject) {
      partObject.position.set(position[0], position[1], position[2]);
      partObject.quaternion.copy(targetQuat);
    }

    world.propagateModifiedBodyPositionsToColliders();
  }, [id, position, resetNonce, rigidBodyRef, rotation, scene, world]);

  useEffect(() => {
    world.propagateModifiedBodyPositionsToColliders();
  }, [position, rotation, rigidBodyType, world]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  const handleDragStart = useCallback(() => {
    if (!isDragEnabled) return;
    isDraggingRef.current = false;

    const body = rigidBodyRef.current;
    if (body) {
      const t = body.translation();
      dragOriginRef.current = [t.x, t.y, t.z];
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

      if (rigidBodyRef.current) {
        rigidBodyRef.current.setTranslation({ x: nextX, y: nextY, z: nextZ }, false);
        world.propagateModifiedBodyPositionsToColliders();
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
    [enableSnapping, isDragEnabled, partType, rigidBodyRef, world],
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

  return (
    <RigidBody
      ref={rigidBodyRef}
      name={id}
      type={rigidBodyType}
      colliders={colliders}
      friction={colliders ? friction : undefined}
      position={position}
      rotation={rotation}
      linearDamping={linearDamping}
      angularDamping={angularDamping}
      activeCollisionTypes={activeCollisionTypes}
      collisionGroups={collisionGroups}
      userData={userData}
      sensor={sensor}
      onIntersectionEnter={onIntersectionEnter}
    >
      {includeDefaultCollider && colliders === false && (
        <CuboidCollider
          args={colliderHalfExtents}
          mass={mass}
          friction={friction}
          sensor={sensor}
        />
      )}
      <DragControls
        ref={dragGroupRef}
        autoTransform={false}
        axisLock="y"
        dragConfig={{ enabled: isDragEnabled }}
        onHover={(hovering) => {
          if (!isDragEnabled) return;
          document.body.style.cursor = hovering ? 'grab' : 'auto';
        }}
        onDragStart={handleDragStart}
        onDrag={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <group name={partType}>{children}</group>
      </DragControls>
    </RigidBody>
  );
}
