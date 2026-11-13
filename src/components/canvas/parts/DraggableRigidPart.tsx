'use client';

import { type ReactNode, type RefObject, useCallback, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { DragControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  type CollisionEnterHandler,
  CuboidCollider,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  type RapierRigidBody,
  type RigidBodyAutoCollider,
  type RigidBodyTypeString,
  RigidBody,
} from '@react-three/rapier';
import type { ActiveCollisionTypes, InteractionGroups } from '@dimforge/rapier3d-compat';
import PartSelectionOverlay from '@/components/canvas/parts/PartSelectionOverlay';
import { usePartDragAndSync } from '@/hooks/usePartDragAndSync';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartType, Vector3Tuple } from '@/types/simulator';

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
  onIntersectionExit?: IntersectionExitHandler;
  onCollisionEnter?: CollisionEnterHandler;
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
  onIntersectionExit,
  onCollisionEnter,
  children,
}: DraggableRigidPartProps) {
  const internalRigidBodyRef = useRef<RapierRigidBody | null>(null);
  const rigidBodyRef = externalRigidBodyRef ?? internalRigidBodyRef;
  const dragGroupRef = useRef<THREE.Group | null>(null);

  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
  const isSelected = useSimulationStore((state) => state.selectedPartId === id);
  const selectPart = useSimulationStore((state) => state.selectPart);
  const rigidBodyType = rigidBodyTypeOverride ?? 'dynamic';
  const resolvedUserData = useMemo(
    () => ({
      partType,
      partId: id,
      ...userData,
    }),
    [id, partType, userData],
  );

  const { isDragEnabled, handleDragStart, handleDragMove, handleDragEnd } = usePartDragAndSync({
    id,
    partType,
    position,
    rotation,
    attachedTo,
    enableSnapping,
    simulationStatus,
    resetNonce,
    rigidBodyRef,
    dragGroupRef,
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 5) return;
      selectPart(id);
    },
    [id, selectPart],
  );

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
      userData={resolvedUserData}
      sensor={sensor}
      onIntersectionEnter={onIntersectionEnter}
      onIntersectionExit={onIntersectionExit}
      onCollisionEnter={onCollisionEnter}
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
        <group name={partType} onClick={handleClick}>
          {children}
          {isSelected && (
            <PartSelectionOverlay
              partId={id}
              partType={partType}
              showRemoveBadge={isDragEnabled && partType !== 'CHASSIS_BASE'}
            />
          )}
        </group>
      </DragControls>
    </RigidBody>
  );
}
