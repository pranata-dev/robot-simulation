'use client';

import { type ReactNode, type RefObject, useCallback, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { DragControls } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import {
  CHASSIS_ANGULAR_DAMPING,
  CHASSIS_LINEAR_DAMPING,
} from '@/lib/physics/servoMotorControl';
import {
  type CollisionEnterHandler,
  CuboidCollider,
  interactionGroups,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  type RapierRigidBody,
  type RigidBodyAutoCollider,
  type RigidBodyTypeString,
  RigidBody,
} from '@react-three/rapier';
import type { ActiveCollisionTypes, InteractionGroups } from '@dimforge/rapier3d-compat';
import PartSelectionOverlay from '@/components/canvas/parts/shared/PartSelectionOverlay';
import { usePartDragAndSync } from '@/hooks/usePartDragAndSync';
import { BATTERY_PACK_MASS } from '@/lib/constants/hardwareCatalog';
import { eulerToQuaternionTuple } from '@/lib/physics/jointConstraints';
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
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  canSleep?: boolean;
  rigidBodyTypeOverride?: RigidBodyTypeString;
  activeCollisionTypes?: ActiveCollisionTypes;
  collisionGroups?: InteractionGroups;
  rigidBodyRef?: RefObject<RapierRigidBody | null>;
  userData?: Record<string, unknown>;
  sensor?: boolean;
  onIntersectionEnter?: IntersectionEnterHandler;
  onIntersectionExit?: IntersectionExitHandler;
  onCollisionEnter?: CollisionEnterHandler;
  customColliders?: ReactNode;
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
  restitution = 0,
  linearDamping = 0,
  angularDamping = 0,
  canSleep,
  rigidBodyTypeOverride,
  activeCollisionTypes,
  collisionGroups,
  rigidBodyRef: externalRigidBodyRef,
  userData,
  sensor,
  onIntersectionEnter,
  onIntersectionExit,
  onCollisionEnter,
  customColliders,
  children,
}: DraggableRigidPartProps) {
  const internalRigidBodyRef = useRef<RapierRigidBody | null>(null);
  const rigidBodyRef = externalRigidBodyRef ?? internalRigidBodyRef;
  const dragGroupRef = useRef<THREE.Group | null>(null);

  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const resetNonce = useSimulationStore((state) => state.resetNonce);
  const isSelected = useSimulationStore((state) => state.selectedPartId === id);
  const selectPart = useSimulationStore((state) => state.selectPart);
  const rigidBodyType =
    rigidBodyTypeOverride ??
    (simulationStatus === 'playing' ? 'dynamic' : 'kinematicPosition');
  const resolvedQuaternion = useMemo(
    () => eulerToQuaternionTuple(rotation),
    [rotation],
  );
  const resolvedUserData = useMemo(
    () => ({
      partType,
      partId: id,
      ...userData,
    }),
    [id, partType, userData],
  );

  const resolvedCollisionGroups =
    partType === 'BATTERY_2S'
      ? interactionGroups(1, [0])
      : (collisionGroups ??
        (partType === 'OBSTACLE_BLOCK' || partType === 'TARGET_ZONE'
          ? interactionGroups(0, [0, 1])
          : interactionGroups(1, [0])));
  const resolvedMass = partType === 'BATTERY_2S' ? BATTERY_PACK_MASS : mass;
  const resolvedCanSleep = canSleep ?? false;

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

  const isPlayingChassis = simulationStatus === 'playing' && partType === 'CHASSIS_BASE';
  const resolvedRestitution =
    partType === 'OBSTACLE_BLOCK' || partType === 'TARGET_ZONE' ? restitution : 0;
  const resolvedLinearDamping = isPlayingChassis
    ? CHASSIS_LINEAR_DAMPING
    : linearDamping;
  const resolvedAngularDamping = isPlayingChassis
    ? CHASSIS_ANGULAR_DAMPING
    : angularDamping;

  return (
    <RigidBody
      ref={rigidBodyRef}
      name={id}
      type={rigidBodyType}
      colliders={colliders}
      canSleep={resolvedCanSleep}
      restitution={resolvedRestitution}
      friction={colliders ? friction : undefined}
      position={position}
      quaternion={resolvedQuaternion}
      linearDamping={resolvedLinearDamping}
      angularDamping={resolvedAngularDamping}
      activeCollisionTypes={activeCollisionTypes}
      collisionGroups={resolvedCollisionGroups}
      solverGroups={resolvedCollisionGroups}
      userData={resolvedUserData}
      sensor={sensor}
      onIntersectionEnter={onIntersectionEnter}
      onIntersectionExit={onIntersectionExit}
      onCollisionEnter={onCollisionEnter}
    >
      {includeDefaultCollider && colliders === false && (
        <CuboidCollider
          args={colliderHalfExtents}
          mass={resolvedMass}
          friction={friction}
          restitution={resolvedRestitution}
          collisionGroups={resolvedCollisionGroups}
          solverGroups={resolvedCollisionGroups}
          sensor={sensor}
        />
      )}
      {customColliders}
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
