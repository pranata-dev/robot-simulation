import type { RefObject } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import type * as THREE from 'three';

const rigidBodyByPartId = new Map<string, RapierRigidBody>();
const servoHornRefByPartId = new Map<string, RefObject<THREE.Object3D | null>>();
const draggingPartIds = new Set<string>();

export function registerPartRigidBody(partId: string, body: RapierRigidBody): void {
  rigidBodyByPartId.set(partId, body);
}

export function unregisterPartRigidBody(partId: string, body?: RapierRigidBody | null): void {
  if (!body || rigidBodyByPartId.get(partId) === body) {
    rigidBodyByPartId.delete(partId);
  }
}

export function getPartRigidBody(partId: string): RapierRigidBody | undefined {
  return rigidBodyByPartId.get(partId);
}

export function registerServoHornRef(
  servoId: string,
  hornRef: RefObject<THREE.Object3D | null>,
): void {
  servoHornRefByPartId.set(servoId, hornRef);
}

export function unregisterServoHornRef(
  servoId: string,
  hornRef?: RefObject<THREE.Object3D | null>,
): void {
  if (!hornRef || servoHornRefByPartId.get(servoId) === hornRef) {
    servoHornRefByPartId.delete(servoId);
  }
}

export function getServoHornRef(servoId: string): RefObject<THREE.Object3D | null> | undefined {
  return servoHornRefByPartId.get(servoId);
}

export function setPartDragging(partId: string, isDragging: boolean): void {
  if (isDragging) {
    draggingPartIds.add(partId);
  } else {
    draggingPartIds.delete(partId);
  }
}

export function isPartDragging(partId: string): boolean {
  return draggingPartIds.has(partId);
}

