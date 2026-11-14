'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { QuadraticBezierLine, type QuadraticBezierLineRef } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { findPinDefinition, getWireColorForPinRole } from '@/lib/constants/socketRegistry';
import { makePinNodeKey } from '@/lib/microcontroller/circuitValidator';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple, WireConnection, WorkspacePart } from '@/types/simulator';

const MIN_SAG_Y = 0.02;
const MIN_SAG_OFFSET = 0.04;
const MAX_SAG_OFFSET = 0.24;
const POSITION_EPSILON_SQ = 1e-8;
const POWER_CABLE_RED = '#ef4444';
const POWER_CABLE_BLACK = '#1c1917';
const POWER_PIN_TOKENS = new Set(['VCC_OUT', 'VIN', '5V', 'ESP_VIN', 'SERVO_VCC', 'US_VCC']);
const GROUND_PIN_TOKENS = new Set(['GND_OUT', 'GND', 'ESP_GND', 'SERVO_GND', 'US_GND']);
const BATTERY_FEED_PINS = new Set(['VCC_OUT', 'GND_OUT']);

const _euler = new THREE.Euler();
const _localOffset = new THREE.Vector3();
const _startScratch = new THREE.Vector3();
const _endScratch = new THREE.Vector3();
const _midScratch = new THREE.Vector3();

function computeMidPoint(start: THREE.Vector3, end: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const distance = start.distanceTo(end);
  const sag = distance > 0 ? Math.min(MAX_SAG_OFFSET, Math.max(MIN_SAG_OFFSET, distance * 0.22)) : 0;
  const midY = Math.max(MIN_SAG_Y, (start.y + end.y) * 0.5 - sag);
  return target.set((start.x + end.x) * 0.5, midY, (start.z + end.z) * 0.5);
}

function computePinWorldPosition(
  part: WorkspacePart | undefined,
  pinId: string,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (!part) return target.set(0, 0, 0);
  const pin = findPinDefinition(part.type, pinId);
  target.set(part.position[0], part.position[1], part.position[2]);
  if (!pin) return target;

  _euler.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  _localOffset.set(pin.position[0], pin.position[1], pin.position[2]).applyEuler(_euler);
  return target.add(_localOffset);
}

function DynamicWire({ wire }: { wire: WireConnection }) {
  const fromPart = useSimulationStore((state) =>
    state.workspaceParts.find((part) => part.id === wire.fromPartId),
  );
  const toPart = useSimulationStore((state) =>
    state.workspaceParts.find((part) => part.id === wire.toPartId),
  );
  const isFaultyWire = useSimulationStore((state) => {
    if (!state.showCircuitDiagnostics) return false;
    const fromFault =
      state.wiringValidation.faultyPinKeys[makePinNodeKey(wire.fromPartId, wire.fromPinId)];
    const toFault =
      state.wiringValidation.faultyPinKeys[makePinNodeKey(wire.toPartId, wire.toPinId)];
    return (
      fromFault === 'SHORT_CIRCUIT' ||
      toFault === 'SHORT_CIRCUIT' ||
      fromFault === 'ROLE_MISMATCH' ||
      toFault === 'ROLE_MISMATCH'
    );
  });

  const lineRef = useRef<QuadraticBezierLineRef | null>(null);
  const fromObjRef = useRef<THREE.Object3D | null>(null);
  const toObjRef = useRef<THREE.Object3D | null>(null);
  const lastStartRef = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastEndRef = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const frameStartRef = useRef(new THREE.Vector3());
  const frameEndRef = useRef(new THREE.Vector3());
  const frameMidRef = useRef(new THREE.Vector3());

  const curvePoints = useMemo(() => {
    const startVec = computePinWorldPosition(fromPart, wire.fromPinId, _startScratch);
    const endVec = computePinWorldPosition(toPart, wire.toPinId, _endScratch);
    const midVec = computeMidPoint(startVec, endVec, _midScratch);

    return {
      start: [startVec.x, startVec.y, startVec.z] as Vector3Tuple,
      end: [endVec.x, endVec.y, endVec.z] as Vector3Tuple,
      mid: [midVec.x, midVec.y, midVec.z] as Vector3Tuple,
    };
  }, [fromPart, toPart, wire.fromPinId, wire.toPinId]);

  useEffect(() => {
    lastStartRef.current.set(curvePoints.start[0], curvePoints.start[1], curvePoints.start[2]);
    lastEndRef.current.set(curvePoints.end[0], curvePoints.end[1], curvePoints.end[2]);
    fromObjRef.current = null;
    toObjRef.current = null;
  }, [curvePoints]);

  useFrame(({ scene }) => {
    const line = lineRef.current;
    if (!line) return;

    if (!fromObjRef.current || !fromObjRef.current.parent) {
      fromObjRef.current =
        scene.getObjectByName(wire.fromPartId)?.getObjectByName(wire.fromPinId) ?? null;
    }
    if (!toObjRef.current || !toObjRef.current.parent) {
      toObjRef.current =
        scene.getObjectByName(wire.toPartId)?.getObjectByName(wire.toPinId) ?? null;
    }

    if (!fromObjRef.current || !toObjRef.current) return;

    fromObjRef.current.getWorldPosition(frameStartRef.current);
    toObjRef.current.getWorldPosition(frameEndRef.current);

    const hasMoved =
      frameStartRef.current.distanceToSquared(lastStartRef.current) > POSITION_EPSILON_SQ ||
      frameEndRef.current.distanceToSquared(lastEndRef.current) > POSITION_EPSILON_SQ;

    if (!hasMoved) return;

    lastStartRef.current.copy(frameStartRef.current);
    lastEndRef.current.copy(frameEndRef.current);
    computeMidPoint(frameStartRef.current, frameEndRef.current, frameMidRef.current);

    line.setPoints(frameStartRef.current, frameEndRef.current, frameMidRef.current);
  });

  const isBatteryFeedWire =
    BATTERY_FEED_PINS.has(wire.fromPinId) || BATTERY_FEED_PINS.has(wire.toPinId);

  const wireColor = useMemo(() => {
    if (isFaultyWire) return POWER_CABLE_RED;
    const fromIdUpper = wire.fromPinId.toUpperCase();
    const toIdUpper = wire.toPinId.toUpperCase();
    if (POWER_PIN_TOKENS.has(fromIdUpper) || POWER_PIN_TOKENS.has(toIdUpper)) {
      return POWER_CABLE_RED;
    }
    if (GROUND_PIN_TOKENS.has(fromIdUpper) || GROUND_PIN_TOKENS.has(toIdUpper)) {
      return POWER_CABLE_BLACK;
    }
    const fromPin = fromPart ? findPinDefinition(fromPart.type, wire.fromPinId) : undefined;
    const toPin = toPart ? findPinDefinition(toPart.type, wire.toPinId) : undefined;
    const primaryRole =
      fromPin?.role === 'POWER' || toPin?.role === 'POWER'
        ? 'POWER'
        : fromPin?.role === 'GROUND' || toPin?.role === 'GROUND'
          ? 'GROUND'
          : (fromPin?.role ?? toPin?.role);
    return primaryRole ? getWireColorForPinRole(primaryRole) : wire.color;
  }, [fromPart, isFaultyWire, toPart, wire.color, wire.fromPinId, wire.toPinId]);

  return (
    <QuadraticBezierLine
      ref={lineRef}
      start={curvePoints.start}
      end={curvePoints.end}
      mid={curvePoints.mid}
      color={wireColor}
      lineWidth={isBatteryFeedWire ? 4 : isFaultyWire ? 3.5 : 2.5}
    />
  );
}

const MemoDynamicWire = memo(DynamicWire);

function isServoPowerOrGroundPin(pinId: string): boolean {
  return pinId === 'SERVO_VCC' || pinId === 'SERVO_GND';
}

export default function WiringSystem() {
  const wires = useSimulationStore((state) => state.wires);
  const wiringMode = useSimulationStore((state) => state.wiringMode);
  const visibleWires = useMemo(
    () =>
      wiringMode === '1-wire'
        ? wires.filter(
            (w) => !isServoPowerOrGroundPin(w.fromPinId) && !isServoPowerOrGroundPin(w.toPinId),
          )
        : wires,
    [wires, wiringMode],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        useSimulationStore.getState().cancelWiring();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <group name="WIRING_SYSTEM">
      {visibleWires.map((wire) => (
        <MemoDynamicWire key={wire.id} wire={wire} />
      ))}
    </group>
  );
}
