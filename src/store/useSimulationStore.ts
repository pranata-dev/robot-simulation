'use client';

import type { RefObject } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import {
  ESP32_PINS,
  PART_CATALOG,
  SOCKETS_BY_PART,
  SPIDER_BILL_OF_MATERIALS,
  findPinDefinition,
} from '@/lib/constants/socketRegistry';
import type {
  ActiveSnapTarget,
  DraftWire,
  InventoryItem,
  PartType,
  PinId,
  SimulationStatus,
  SocketId,
  ThemeMode,
  Vector3Tuple,
  WireConnection,
  WorkspacePart,
} from '@/types/simulator';

export interface SimulationData {
  inventory: InventoryItem[];
  workspaceParts: WorkspacePart[];
  wires: WireConnection[];
  activeDraftWire: DraftWire | null;
  simulationStatus: SimulationStatus;
  activeSnapTarget: ActiveSnapTarget | null;
  script: string;
  servoAngles: Record<string, number>;
  rigidBodyRefs: Record<string, RefObject<RapierRigidBody | null>>;
  resetNonce: number;
  isLevelComplete: boolean;
  theme: ThemeMode;
}

export interface SimulationActions {
  /** Spawns a part from inventory into workspaceParts with a UUID and default [0, 0.5, 0] position. */
  spawnPart: (type: PartType, position?: Vector3Tuple, rotation?: Vector3Tuple) => string | null;
  /** Removes a part, returns it to inventory, detaches its children, and drops its wires. */
  removePart: (partId: string) => void;
  updatePartPosition: (partId: string, position: Vector3Tuple) => void;
  updatePartTransform: (partId: string, position: Vector3Tuple, rotation: Vector3Tuple) => void;
  snapPartToSocket: (
    partId: string,
    parentId: string,
    socketId: SocketId,
    position: Vector3Tuple,
    rotation: Vector3Tuple,
  ) => void;
  detachPart: (partId: string, position: Vector3Tuple, rotation?: Vector3Tuple) => void;
  setActiveSnapTarget: (target: ActiveSnapTarget | null) => void;
  startWiring: (startPartId: string, startPinId: PinId, startPos: Vector3Tuple) => void;
  completeWiring: (toPartId: string, toPinId: PinId) => string | null;
  cancelWiring: () => void;
  removeWire: (wireId: string) => void;
  setScript: (script: string) => void;
  runSimulation: () => Promise<void>;
  stopSimulation: () => void;
  setSimulationStatus: (status: SimulationStatus) => void;
  registerRigidBody: (id: string, ref: RefObject<RapierRigidBody | null>) => void;
  unregisterRigidBody: (id: string, ref?: RefObject<RapierRigidBody | null>) => void;
  completeLevel: () => void;
  toggleTheme: () => void;
  resetPositions: () => void;
  resetWorkspace: () => void;
}

export type SimulationState = SimulationData & SimulationActions;

const DEFAULT_SPAWN_POSITION: Vector3Tuple = [0, 0.5, 0];
const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const DEFAULT_WIRE_COLOR = '#eab308';
const DEFAULT_SCRIPT = [
  '# Servo control script (degrees, DELAY ms, LOOP)',
  'PIN_1: 90',
  'PIN_2: -45',
  'DELAY: 800',
  'PIN_1: 0',
  'PIN_2: 0',
  'DELAY: 800',
  'LOOP',
].join('\n');

const ESP32_PWM_PINS = ESP32_PINS.filter((pin) => pin.role === 'PWM');
const MIN_SERVO_ANGLE_DEG = -180;
const MAX_SERVO_ANGLE_DEG = 180;
const MIN_LOOP_YIELD_MS = 16;

let activeExecutionRunId = 0;

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Part types with implemented 3D procedural proxies available for spawning in the sandbox. */
const ACTIVE_INVENTORY_TYPES: readonly PartType[] = [
  'CHASSIS_BASE',
  'ESP32_DEVKIT',
  'SERVO_MG90S',
  'LEG_TIBIA',
  'OBSTACLE_BLOCK',
  'TARGET_ZONE',
];

function getDefaultSpawnPosition(type: PartType): Vector3Tuple {
  if (type === 'OBSTACLE_BLOCK') {
    return [0, PART_CATALOG.OBSTACLE_BLOCK.dimensions[1] / 2, 1.5];
  }
  if (type === 'TARGET_ZONE') {
    return [0, 0, 2.8];
  }
  return DEFAULT_SPAWN_POSITION;
}

function isSandboxCoursePart(type: PartType): boolean {
  return type === 'OBSTACLE_BLOCK' || type === 'TARGET_ZONE';
}

function createInitialInventory(): InventoryItem[] {
  return ACTIVE_INVENTORY_TYPES.map((type) => ({
    type,
    label: PART_CATALOG[type].label,
    quantity: SPIDER_BILL_OF_MATERIALS[type],
  }));
}

function createPart(type: PartType, position: Vector3Tuple, rotation: Vector3Tuple): WorkspacePart {
  return {
    id: uuidv4(),
    type,
    label: PART_CATALOG[type].label,
    position: [...position],
    rotation: [...rotation],
  };
}

function createInitialData(): SimulationData {
  return {
    inventory: createInitialInventory(),
    workspaceParts: [],
    wires: [],
    activeDraftWire: null,
    simulationStatus: 'idle',
    activeSnapTarget: null,
    script: DEFAULT_SCRIPT,
    servoAngles: {},
    rigidBodyRefs: {},
    resetNonce: 0,
    isLevelComplete: false,
    theme: 'dark',
  };
}

function resolveEsp32PinId(rawToken: string): PinId | null {
  const normalized = rawToken.trim().toUpperCase();
  const exactPin = ESP32_PINS.find((pin) => pin.id === normalized);
  if (exactPin) return exactPin.id;

  const pinMatch = /^PIN_?(\d+)$/.exec(normalized);
  if (pinMatch) {
    const indexOrGpio = Number.parseInt(pinMatch[1], 10);
    if (indexOrGpio >= 1 && indexOrGpio <= ESP32_PWM_PINS.length) {
      return ESP32_PWM_PINS[indexOrGpio - 1].id;
    }
    const gpioPin = ESP32_PWM_PINS.find((pin) => pin.gpio === indexOrGpio);
    return gpioPin ? gpioPin.id : null;
  }

  return null;
}

function getWiredServoIdsForPin(
  pinId: PinId,
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
): string[] {
  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
  const servoIds: string[] = [];

  for (const wire of wires) {
    const fromPart = partsById.get(wire.fromPartId);
    const toPart = partsById.get(wire.toPartId);

    if (
      fromPart?.type === 'ESP32_DEVKIT' &&
      wire.fromPinId === pinId &&
      toPart?.type === 'SERVO_MG90S'
    ) {
      servoIds.push(toPart.id);
    } else if (
      toPart?.type === 'ESP32_DEVKIT' &&
      wire.toPinId === pinId &&
      fromPart?.type === 'SERVO_MG90S'
    ) {
      servoIds.push(fromPart.id);
    }
  }

  return servoIds;
}

function isSameEndpoint(partA: string, pinA: string, partB: string, pinB: string): boolean {
  return partA === partB && pinA === pinB;
}

function isDuplicateWire(
  wires: readonly WireConnection[],
  fromPartId: string,
  fromPinId: PinId,
  toPartId: string,
  toPinId: PinId,
): boolean {
  return wires.some(
    (w) =>
      (isSameEndpoint(w.fromPartId, w.fromPinId, fromPartId, fromPinId) &&
        isSameEndpoint(w.toPartId, w.toPinId, toPartId, toPinId)) ||
      (isSameEndpoint(w.fromPartId, w.fromPinId, toPartId, toPinId) &&
        isSameEndpoint(w.toPartId, w.toPinId, fromPartId, fromPinId)),
  );
}

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  ...createInitialData(),

  spawnPart: (type, position, rotation = DEFAULT_ROTATION) => {
    const { inventory, simulationStatus } = get();
    if (simulationStatus !== 'idle') return null;

    const item = inventory.find((entry) => entry.type === type);
    if (!item || item.quantity <= 0) return null;

    const spawnPosition = position ?? getDefaultSpawnPosition(type);
    const part = createPart(type, spawnPosition, rotation);
    set((state) => ({
      inventory: state.inventory.map((entry) =>
        entry.type === type ? { ...entry, quantity: entry.quantity - 1 } : entry,
      ),
      workspaceParts: [...state.workspaceParts, part],
    }));
    return part.id;
  },

  removePart: (partId) => {
    const { workspaceParts, simulationStatus, activeDraftWire } = get();
    const target = workspaceParts.find((part) => part.id === partId);
    if (!target || simulationStatus !== 'idle') return;

    set((state) => ({
      workspaceParts: state.workspaceParts
        .filter((part) => part.id !== partId)
        .map((part) =>
          part.attachedTo === partId
            ? { ...part, attachedTo: undefined, socketId: undefined }
            : part,
        ),
      inventory: state.inventory.map((entry) =>
        entry.type === target.type ? { ...entry, quantity: entry.quantity + 1 } : entry,
      ),
      wires: state.wires.filter((w) => w.fromPartId !== partId && w.toPartId !== partId),
      activeDraftWire: activeDraftWire?.startPartId === partId ? null : state.activeDraftWire,
    }));
  },

  updatePartPosition: (partId, position) => {
    set((state) => {
      const target = state.workspaceParts.find((part) => part.id === partId);
      if (!target) return state;

      const dx = position[0] - target.position[0];
      const dy = position[1] - target.position[1];
      const dz = position[2] - target.position[2];

      const descendantIds = new Set<string>();
      const queue = [partId];
      while (queue.length > 0) {
        const currentParent = queue.shift();
        for (const part of state.workspaceParts) {
          if (part.attachedTo === currentParent && !descendantIds.has(part.id)) {
            descendantIds.add(part.id);
            queue.push(part.id);
          }
        }
      }

      return {
        workspaceParts: state.workspaceParts.map((part) => {
          if (part.id === partId) {
            return { ...part, position: [...position] };
          }
          if (descendantIds.has(part.id)) {
            return {
              ...part,
              position: [
                part.position[0] + dx,
                part.position[1] + dy,
                part.position[2] + dz,
              ],
            };
          }
          return part;
        }),
      };
    });
  },

  updatePartTransform: (partId, position, rotation) => {
    set((state) => ({
      workspaceParts: state.workspaceParts.map((part) =>
        part.id === partId
          ? { ...part, position: [...position], rotation: [...rotation] }
          : part,
      ),
    }));
  },

  snapPartToSocket: (partId, parentId, socketId, position, rotation) => {
    set((state) => ({
      workspaceParts: state.workspaceParts.map((part) =>
        part.id === partId
          ? {
              ...part,
              position: [...position],
              rotation: [...rotation],
              attachedTo: parentId,
              socketId,
            }
          : part,
      ),
    }));
  },

  detachPart: (partId, position, rotation = DEFAULT_ROTATION) => {
    set((state) => ({
      workspaceParts: state.workspaceParts.map((part) =>
        part.id === partId
          ? {
              ...part,
              position: [...position],
              rotation: [...rotation],
              attachedTo: undefined,
              socketId: undefined,
            }
          : part,
      ),
    }));
  },

  setActiveSnapTarget: (target) => {
    const current = get().activeSnapTarget;
    if (
      current?.parentId === target?.parentId &&
      current?.socketId === target?.socketId &&
      current?.isValid === target?.isValid
    ) {
      return;
    }
    set({ activeSnapTarget: target });
  },

  startWiring: (startPartId, startPinId, startPos) => {
    const part = get().workspaceParts.find((p) => p.id === startPartId);
    if (!part || !findPinDefinition(part.type, startPinId)) return;
    set({
      activeDraftWire: {
        startPartId,
        startPinId,
        startPos: [...startPos],
      },
    });
  },

  completeWiring: (toPartId, toPinId) => {
    const { activeDraftWire, workspaceParts, wires } = get();
    if (!activeDraftWire) return null;

    const { startPartId, startPinId } = activeDraftWire;
    const fromPart = workspaceParts.find((part) => part.id === startPartId);
    const toPart = workspaceParts.find((part) => part.id === toPartId);
    const fromPin = fromPart ? findPinDefinition(fromPart.type, startPinId) : undefined;
    const toPin = toPart ? findPinDefinition(toPart.type, toPinId) : undefined;

    if (
      !fromPart ||
      !toPart ||
      !fromPin ||
      !toPin ||
      isSameEndpoint(startPartId, startPinId, toPartId, toPinId) ||
      isDuplicateWire(wires, startPartId, startPinId, toPartId, toPinId)
    ) {
      set({ activeDraftWire: null });
      return null;
    }

    const wire: WireConnection = {
      id: uuidv4(),
      fromPartId: startPartId,
      fromPinId: startPinId,
      toPartId,
      toPinId,
      color: toPin.color || fromPin.color || DEFAULT_WIRE_COLOR,
    };

    set((state) => ({
      wires: [...state.wires, wire],
      activeDraftWire: null,
    }));
    return wire.id;
  },

  cancelWiring: () => {
    if (!get().activeDraftWire) return;
    set({ activeDraftWire: null });
  },

  removeWire: (wireId) => {
    set((state) => ({ wires: state.wires.filter((w) => w.id !== wireId) }));
  },

  setScript: (script) => {
    set({ script });
  },

  runSimulation: async () => {
    const runId = ++activeExecutionRunId;
    const lines = get()
      .script.split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    set({
      servoAngles: {},
      simulationStatus: 'playing',
      activeDraftWire: null,
      activeSnapTarget: null,
    });

    let i = 0;
    let didDelayInPass = false;

    while (i < lines.length && get().simulationStatus === 'playing') {
      if (runId !== activeExecutionRunId) {
        break;
      }

      const command = lines[i].trim().toUpperCase();

      if (command.startsWith('#') || command.startsWith('//')) {
        i++;
        continue;
      }

      if (command.includes('LOOP')) {
        if (!didDelayInPass) {
          await sleep(MIN_LOOP_YIELD_MS);
          if (get().simulationStatus !== 'playing' || runId !== activeExecutionRunId) {
            break;
          }
        }
        didDelayInPass = false;
        i = 0;
        continue;
      } else if (command.startsWith('PIN_')) {
        const colonIndex = command.indexOf(':');
        if (colonIndex !== -1) {
          const rawPin = command.slice(0, colonIndex).trim();
          const rawAngle = command.slice(colonIndex + 1).trim();
          const parsedAngle = Number.parseFloat(rawAngle);
          const pinId = resolveEsp32PinId(rawPin);

          if (pinId && Number.isFinite(parsedAngle)) {
            const clampedAngle = Math.max(
              MIN_SERVO_ANGLE_DEG,
              Math.min(MAX_SERVO_ANGLE_DEG, parsedAngle),
            );
            const { workspaceParts, wires } = get();
            const targetServoIds = getWiredServoIdsForPin(pinId, workspaceParts, wires);

            if (targetServoIds.length > 0) {
              set((state) => {
                const nextServoAngles = { ...state.servoAngles };
                for (const servoId of targetServoIds) {
                  nextServoAngles[servoId] = clampedAngle;
                }
                return { servoAngles: nextServoAngles };
              });

              for (const bodyRef of Object.values(get().rigidBodyRefs)) {
                bodyRef.current?.wakeUp();
              }
            }
          }
        }
        i++;
      } else if (command.startsWith('DELAY:')) {
        const parsedMs = Number.parseFloat(command.slice('DELAY:'.length).trim());
        const ms = Number.isFinite(parsedMs) ? Math.max(0, parsedMs) : 0;
        if (ms > 0) {
          didDelayInPass = true;
        }
        await sleep(ms);
        if (get().simulationStatus !== 'playing' || runId !== activeExecutionRunId) {
          break;
        }
        i++;
      } else {
        i++;
      }
    }

    if (runId === activeExecutionRunId) {
      set({ simulationStatus: 'idle' });
    }
  },

  stopSimulation: () => {
    activeExecutionRunId += 1;
    set({
      simulationStatus: 'idle',
      servoAngles: {},
      activeSnapTarget: null,
    });
  },

  setSimulationStatus: (status) => {
    if (get().simulationStatus === status) return;
    if (status !== 'playing') {
      activeExecutionRunId += 1;
    }
    set({ simulationStatus: status });
  },

  registerRigidBody: (id, ref) => {
    if (get().rigidBodyRefs[id] === ref) return;
    set((state) => ({
      rigidBodyRefs: { ...state.rigidBodyRefs, [id]: ref },
    }));
  },

  unregisterRigidBody: (id, ref) => {
    const current = get().rigidBodyRefs[id];
    if (!current || (ref && current !== ref)) return;
    set((state) => {
      const next = { ...state.rigidBodyRefs };
      delete next[id];
      return { rigidBodyRefs: next };
    });
  },

  completeLevel: () => {
    if (get().isLevelComplete) return;
    set({ isLevelComplete: true });
  },

  toggleTheme: () => {
    set((state) => ({
      theme: state.theme === 'dark' ? 'light' : 'dark',
    }));
  },

  resetPositions: () => {
    activeExecutionRunId += 1;
    set((state) => {
      const zeroServoAngles: Record<string, number> = {};
      for (const servoId of Object.keys(state.servoAngles)) {
        zeroServoAngles[servoId] = 0;
      }

      const updatedById = new Map<string, WorkspacePart>();
      for (const part of state.workspaceParts) {
        if (!part.attachedTo && !isSandboxCoursePart(part.type)) {
          updatedById.set(part.id, {
            ...part,
            position: [...DEFAULT_SPAWN_POSITION],
            rotation: [...DEFAULT_ROTATION],
          });
        } else {
          updatedById.set(part.id, {
            ...part,
            position: [...part.position],
            rotation: [...part.rotation],
          });
        }
      }

      const hostPosition = new THREE.Vector3();
      const hostEuler = new THREE.Euler();
      const hostQuat = new THREE.Quaternion();
      const socketPos = new THREE.Vector3();
      const socketEuler = new THREE.Euler();
      const socketQuat = new THREE.Quaternion();
      const worldQuat = new THREE.Quaternion();
      const worldEuler = new THREE.Euler();

      const resolvedIds = new Set<string>();
      for (const part of updatedById.values()) {
        if (!part.attachedTo) resolvedIds.add(part.id);
      }

      let madeProgress = true;
      while (madeProgress) {
        madeProgress = false;
        for (const [partId, part] of updatedById.entries()) {
          if (resolvedIds.has(partId) || !part.attachedTo) continue;
          const parent = updatedById.get(part.attachedTo);
          if (!parent || !resolvedIds.has(parent.id)) continue;

          const socket = SOCKETS_BY_PART[parent.type].find((entry) => entry.id === part.socketId);
          if (socket) {
            hostPosition.set(parent.position[0], parent.position[1], parent.position[2]);
            hostEuler.set(parent.rotation[0], parent.rotation[1], parent.rotation[2]);
            hostQuat.setFromEuler(hostEuler);

            socketPos
              .set(socket.position[0], socket.position[1], socket.position[2])
              .applyQuaternion(hostQuat)
              .add(hostPosition);

            socketEuler.set(socket.rotation[0], socket.rotation[1], socket.rotation[2]);
            socketQuat.setFromEuler(socketEuler);
            worldQuat.copy(hostQuat).multiply(socketQuat);
            worldEuler.setFromQuaternion(worldQuat);

            updatedById.set(partId, {
              ...part,
              position: [socketPos.x, socketPos.y, socketPos.z],
              rotation: [worldEuler.x, worldEuler.y, worldEuler.z],
            });
          }

          resolvedIds.add(partId);
          madeProgress = true;
        }
      }

      return {
        servoAngles: zeroServoAngles,
        workspaceParts: state.workspaceParts.map((part) => updatedById.get(part.id) ?? part),
        simulationStatus: 'idle',
        activeSnapTarget: null,
        activeDraftWire: null,
        isLevelComplete: false,
        resetNonce: state.resetNonce + 1,
      };
    });
  },

  resetWorkspace: () => {
    activeExecutionRunId += 1;
    const currentTheme = get().theme;
    set({ ...createInitialData(), theme: currentTheme });
  },
}));
