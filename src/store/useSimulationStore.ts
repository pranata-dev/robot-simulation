'use client';

import type { RefObject } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import {
  CHASSIS_ASSEMBLY_WORKING_Y,
  CHASSIS_HALF_HEIGHT,
  ESP32_PINS,
  PART_CATALOG,
  SPIDER_BILL_OF_MATERIALS,
  findPinDefinition,
} from '@/lib/constants/socketRegistry';
import { validateWiringTopology } from '@/lib/microcontroller/circuitValidator';
import {
  clearPhysicsRegistry,
  resetAllRigidBodiesPhysicsState,
  setPartDragging,
  unregisterPartRigidBody,
  unregisterServoHornRef,
} from '@/lib/physics/rigidBodyRegistry';
import {
  parseAndValidateSimulationSnapshot,
  serializeSimulationSnapshot,
} from '@/lib/snapshot/snapshotSerializer';
import {
  type ActiveSnapTarget,
  type ChallengeStatus,
  type DraftWire,
  type InventoryItem,
  type PartType,
  type PinId,
  SIMULATION_SCHEMA_VERSION,
  type ScriptConsoleEntry,
  type SimulationEmbedConfig,
  type SimulationSchemaVersion,
  type SimulationStatus,
  type SnapshotImportResult,
  type SocketId,
  type ThemeMode,
  type Vector3Tuple,
  type WireConnection,
  type WiringValidationResult,
  type WorkerInboundMessage,
  type WorkerLogLevel,
  type WorkerOutboundMessage,
  type WorkspacePart,
} from '@/types/simulator';
import { resolveHierarchyWorldTransforms } from '@/utils/snapLogic';

export interface SimulationData {
  schemaVersion: SimulationSchemaVersion;
  inventory: InventoryItem[];
  workspaceParts: WorkspacePart[];
  wires: WireConnection[];
  activeDraftWire: DraftWire | null;
  simulationStatus: SimulationStatus;
  selectedPartId: string | null;
  activeSnapTarget: ActiveSnapTarget | null;
  wiringValidation: WiringValidationResult;
  showCircuitDiagnostics: boolean;
  allowedParts: PartType[] | null;
  readOnly: boolean;
  zeroCollisionMode: boolean;
  challengeStatus: ChallengeStatus;
  obstacleHits: number;
  simulationStartedAt: number | null;
  completionTimeMs: number | null;
  performanceMode: boolean;
  script: string;
  scriptLogs: ScriptConsoleEntry[];
  scriptError: string | null;
  servoAngles: Record<string, number>;
  rigidBodyRefs: Record<string, RefObject<RapierRigidBody | null>>;
  resetNonce: number;
  isLevelComplete: boolean;
  theme: ThemeMode;
}

export interface SimulationActions {
  /** Spawns a part from inventory into workspaceParts with a UUID and default grounded/working position. */
  spawnPart: (type: PartType, position?: Vector3Tuple, rotation?: Vector3Tuple) => string | null;
  /** Selects or clears the active 3D part selection. */
  selectPart: (partId: string | null) => void;
  /** Removes a non-chassis part, cascades to attached descendants, frees sockets, drops wires, and cleans physics refs. */
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
  dismissCircuitDiagnostics: () => void;
  setScript: (script: string) => void;
  clearScriptLogs: () => void;
  clearScriptError: () => void;
  runSimulation: () => void;
  stopSimulation: () => void;
  setSimulationStatus: (status: SimulationStatus) => void;
  registerRigidBody: (id: string, ref: RefObject<RapierRigidBody | null>) => void;
  unregisterRigidBody: (id: string, ref?: RefObject<RapierRigidBody | null>) => void;
  completeLevel: () => void;
  completeChallenge: () => void;
  recordObstacleHit: () => void;
  setEmbedConfig: (config: SimulationEmbedConfig) => void;
  setPerformanceMode: (enabled: boolean) => void;
  exportSimulationSnapshot: () => string;
  importSimulationSnapshot: (jsonString: string) => SnapshotImportResult;
  toggleTheme: () => void;
  resetPositions: () => void;
  resetWorkspace: () => void;
}

export type SimulationState = SimulationData & SimulationActions;

const DEFAULT_SPAWN_POSITION: Vector3Tuple = [0, 0.5, 0];
const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const DEFAULT_WIRE_COLOR = '#eab308';
const DEFAULT_SCRIPT = [
  '# Servo control script (PIN DSL or JS: setServoAngle, delay, loop, log)',
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
const WORKER_WATCHDOG_TIMEOUT_MS = 1500;
const WORKER_WATCHDOG_POLL_MS = 250;
const MAX_SCRIPT_LOG_ENTRIES = 100;

let activeExecutionRunId = 0;
let activeScriptWorker: Worker | null = null;
let activeWatchdogTimerId: ReturnType<typeof setInterval> | null = null;

function terminateActiveScriptWorker(): void {
  if (activeWatchdogTimerId !== null) {
    clearInterval(activeWatchdogTimerId);
    activeWatchdogTimerId = null;
  }
  if (activeScriptWorker !== null) {
    try {
      activeScriptWorker.postMessage({ type: 'STOP' } satisfies WorkerInboundMessage);
    } catch {
      // Ignore postMessage failure if worker already exited.
    }
    activeScriptWorker.terminate();
    activeScriptWorker = null;
  }
}

function createScriptLogEntry(level: WorkerLogLevel, message: string): ScriptConsoleEntry {
  return {
    id: uuidv4(),
    level,
    message,
    timestamp: Date.now(),
  };
}

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
  if (type === 'CHASSIS_BASE') {
    return [0, CHASSIS_HALF_HEIGHT, 0];
  }
  if (type === 'OBSTACLE_BLOCK') {
    return [0, PART_CATALOG.OBSTACLE_BLOCK.dimensions[1] / 2, 1.5];
  }
  if (type === 'TARGET_ZONE') {
    return [0, 0, 2.8];
  }
  return DEFAULT_SPAWN_POSITION;
}

function collectDescendantIds(rootId: string, workspaceParts: readonly WorkspacePart[]): Set<string> {
  const descendantIds = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const currentParent = queue.shift();
    for (const part of workspaceParts) {
      if (part.attachedTo === currentParent && !descendantIds.has(part.id)) {
        descendantIds.add(part.id);
        queue.push(part.id);
      }
    }
  }
  return descendantIds;
}

function hasAttachedLegDescendant(
  chassisId: string,
  workspaceParts: readonly WorkspacePart[],
): boolean {
  const descendants = collectDescendantIds(chassisId, workspaceParts);
  return workspaceParts.some((part) => descendants.has(part.id) && part.type === 'LEG_TIBIA');
}

const EMPTY_WIRING_VALIDATION: WiringValidationResult = {
  isValid: true,
  hasShortCircuit: false,
  issues: [],
  faultyPinKeys: {},
};

function evaluateWiringState(
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
  prevShowDiagnostics: boolean,
  forceShowOnFailure: boolean = false,
): { wiringValidation: WiringValidationResult; showCircuitDiagnostics: boolean } {
  const wiringValidation = validateWiringTopology(workspaceParts, wires);
  if (wiringValidation.isValid) {
    return { wiringValidation, showCircuitDiagnostics: false };
  }
  const showCircuitDiagnostics =
    forceShowOnFailure ||
    wiringValidation.hasShortCircuit ||
    wires.length > 0 ||
    prevShowDiagnostics;
  return { wiringValidation, showCircuitDiagnostics };
}

function zeroRigidBodyVelocities(
  rigidBodyRefs: Readonly<Record<string, RefObject<RapierRigidBody | null>>>,
): void {
  resetAllRigidBodiesPhysicsState();
  for (const bodyRef of Object.values(rigidBodyRefs)) {
    try {
      bodyRef.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current?.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } catch {
      // Ignore unmounted rigid body refs.
    }
  }
}

function reconcileChassisElevations(workspaceParts: WorkspacePart[]): WorkspacePart[] {
  let nextParts = workspaceParts;
  for (const part of nextParts) {
    if (part.type !== 'CHASSIS_BASE') continue;
    const targetY = hasAttachedLegDescendant(part.id, nextParts)
      ? CHASSIS_ASSEMBLY_WORKING_Y
      : CHASSIS_HALF_HEIGHT;
    const dy = targetY - part.position[1];
    if (Math.abs(dy) <= 1e-6) continue;

    const affectedIds = collectDescendantIds(part.id, nextParts);
    affectedIds.add(part.id);
    nextParts = nextParts.map((entry) =>
      affectedIds.has(entry.id)
        ? { ...entry, position: [entry.position[0], entry.position[1] + dy, entry.position[2]] }
        : entry,
    );
  }
  return nextParts;
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
    schemaVersion: SIMULATION_SCHEMA_VERSION,
    inventory: createInitialInventory(),
    workspaceParts: [],
    wires: [],
    activeDraftWire: null,
    simulationStatus: 'idle',
    selectedPartId: null,
    activeSnapTarget: null,
    wiringValidation: EMPTY_WIRING_VALIDATION,
    showCircuitDiagnostics: false,
    allowedParts: null,
    readOnly: false,
    zeroCollisionMode: false,
    challengeStatus: 'idle',
    obstacleHits: 0,
    simulationStartedAt: null,
    completionTimeMs: null,
    performanceMode: false,
    script: DEFAULT_SCRIPT,
    scriptLogs: [],
    scriptError: null,
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

function resolveTargetServoIds(
  servoTarget: string,
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
): string[] {
  const pinId = resolveEsp32PinId(servoTarget);
  if (pinId) {
    return getWiredServoIdsForPin(pinId, workspaceParts, wires);
  }

  const normalized = servoTarget.trim();
  const directMatches = workspaceParts
    .filter(
      (part) =>
        part.type === 'SERVO_MG90S' &&
        (part.id === normalized || part.socketId === normalized),
    )
    .map((part) => part.id);
  return directMatches;
}

function getWiredServoIdsForPin(
  pinId: PinId,
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
): string[] {
  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
  const adjacency = new Map<string, string[]>();

  for (const wire of wires) {
    const fromKey = `${wire.fromPartId}:${wire.fromPinId}`;
    const toKey = `${wire.toPartId}:${wire.toPinId}`;
    const fromNeighbors = adjacency.get(fromKey) ?? [];
    fromNeighbors.push(toKey);
    adjacency.set(fromKey, fromNeighbors);

    const toNeighbors = adjacency.get(toKey) ?? [];
    toNeighbors.push(fromKey);
    adjacency.set(toKey, toNeighbors);
  }

  const servoIds = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const part of workspaceParts) {
    if (part.type === 'ESP32_DEVKIT') {
      const startKey = `${part.id}:${pinId}`;
      visited.add(startKey);
      queue.push(startKey);
    }
  }

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) continue;

    for (const neighborKey of adjacency.get(currentKey) ?? []) {
      if (visited.has(neighborKey)) continue;
      visited.add(neighborKey);
      queue.push(neighborKey);

      const separatorIdx = neighborKey.lastIndexOf(':');
      if (separatorIdx !== -1) {
        const neighborPartId = neighborKey.slice(0, separatorIdx);
        const neighborPinId = neighborKey.slice(separatorIdx + 1);
        const neighborPart = partsById.get(neighborPartId);
        if (neighborPart?.type === 'SERVO_MG90S' && neighborPinId === 'SERVO_PWM') {
          servoIds.add(neighborPart.id);
        }
      }
    }
  }

  return Array.from(servoIds);
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
    const { inventory, simulationStatus, readOnly, allowedParts } = get();
    if (simulationStatus !== 'idle' || readOnly) return null;
    if (allowedParts && !allowedParts.includes(type)) return null;

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

  selectPart: (partId) => {
    if (get().selectedPartId === partId) return;
    set({ selectedPartId: partId });
  },

  removePart: (partId) => {
    const {
      workspaceParts,
      simulationStatus,
      readOnly,
      activeDraftWire,
      activeSnapTarget,
      selectedPartId,
    } = get();
    if (simulationStatus !== 'idle' || readOnly) return;

    const target = workspaceParts.find((part) => part.id === partId);
    if (!target || target.type === 'CHASSIS_BASE') return;

    const idsToRemove = collectDescendantIds(partId, workspaceParts);
    idsToRemove.add(partId);

    const removedCountByType = new Map<PartType, number>();
    for (const part of workspaceParts) {
      if (idsToRemove.has(part.id)) {
        removedCountByType.set(part.type, (removedCountByType.get(part.type) ?? 0) + 1);
      }
    }

    for (const removedId of idsToRemove) {
      unregisterPartRigidBody(removedId);
      unregisterServoHornRef(removedId);
      setPartDragging(removedId, false);
    }

    const remainingParts = reconcileChassisElevations(
      workspaceParts.filter((part) => !idsToRemove.has(part.id)),
    );

    set((state) => {
      const nextRigidBodyRefs = { ...state.rigidBodyRefs };
      const nextServoAngles = { ...state.servoAngles };
      for (const removedId of idsToRemove) {
        delete nextRigidBodyRefs[removedId];
        delete nextServoAngles[removedId];
      }

      const nextWires = state.wires.filter(
        (w) => !idsToRemove.has(w.fromPartId) && !idsToRemove.has(w.toPartId),
      );
      const wiringState = evaluateWiringState(
        remainingParts,
        nextWires,
        state.showCircuitDiagnostics,
      );

      return {
        workspaceParts: remainingParts,
        inventory: state.inventory.map((entry) => {
          const returnedCount = removedCountByType.get(entry.type) ?? 0;
          return returnedCount > 0 ? { ...entry, quantity: entry.quantity + returnedCount } : entry;
        }),
        wires: nextWires,
        ...wiringState,
        activeDraftWire:
          activeDraftWire && idsToRemove.has(activeDraftWire.startPartId)
            ? null
            : state.activeDraftWire,
        activeSnapTarget:
          activeSnapTarget && idsToRemove.has(activeSnapTarget.parentId)
            ? null
            : state.activeSnapTarget,
        selectedPartId:
          selectedPartId && idsToRemove.has(selectedPartId) ? null : state.selectedPartId,
        rigidBodyRefs: nextRigidBodyRefs,
        servoAngles: nextServoAngles,
      };
    });
  },

  updatePartPosition: (partId, position) => {
    if (get().readOnly) return;
    set((state) => {
      const target = state.workspaceParts.find((part) => part.id === partId);
      if (!target) return state;

      const dx = position[0] - target.position[0];
      const dy = position[1] - target.position[1];
      const dz = position[2] - target.position[2];
      const descendantIds = collectDescendantIds(partId, state.workspaceParts);

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
    if (get().readOnly) return;
    set((state) => ({
      workspaceParts: state.workspaceParts.map((part) =>
        part.id === partId
          ? { ...part, position: [...position], rotation: [...rotation] }
          : part,
      ),
    }));
  },

  snapPartToSocket: (partId, parentId, socketId, position, rotation) => {
    if (get().readOnly) return;
    set((state) => {
      const snappedParts: WorkspacePart[] = state.workspaceParts.map((part) =>
        part.id === partId
          ? {
              ...part,
              position: [...position],
              rotation: [...rotation],
              attachedTo: parentId,
              socketId,
            }
          : part,
      );
      const resolvedRoots = new Set<string>(
        snappedParts.filter((part) => !part.attachedTo || part.id === partId).map((p) => p.id),
      );
      const withDescendants = resolveHierarchyWorldTransforms(snappedParts, resolvedRoots);
      const nextParts = reconcileChassisElevations(withDescendants);
      return {
        workspaceParts: nextParts,
        ...evaluateWiringState(nextParts, state.wires, state.showCircuitDiagnostics),
      };
    });
  },

  detachPart: (partId, position, rotation = DEFAULT_ROTATION) => {
    if (get().readOnly) return;
    set((state) => {
      const detachedParts: WorkspacePart[] = state.workspaceParts.map((part) =>
        part.id === partId
          ? {
              ...part,
              position: [...position],
              rotation: [...rotation],
              attachedTo: undefined,
              socketId: undefined,
            }
          : part,
      );
      const nextParts = reconcileChassisElevations(detachedParts);
      return {
        workspaceParts: nextParts,
        ...evaluateWiringState(nextParts, state.wires, state.showCircuitDiagnostics),
      };
    });
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
    if (get().readOnly || get().simulationStatus !== 'idle') return;
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
    if (get().readOnly || get().simulationStatus !== 'idle') return null;
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

    set((state) => {
      const nextWires = [...state.wires, wire];
      return {
        wires: nextWires,
        activeDraftWire: null,
        ...evaluateWiringState(state.workspaceParts, nextWires, state.showCircuitDiagnostics),
      };
    });
    return wire.id;
  },

  cancelWiring: () => {
    if (!get().activeDraftWire) return;
    set({ activeDraftWire: null });
  },

  removeWire: (wireId) => {
    if (get().readOnly || get().simulationStatus !== 'idle') return;
    set((state) => {
      const nextWires = state.wires.filter((w) => w.id !== wireId);
      return {
        wires: nextWires,
        ...evaluateWiringState(state.workspaceParts, nextWires, state.showCircuitDiagnostics),
      };
    });
  },

  dismissCircuitDiagnostics: () => {
    if (!get().showCircuitDiagnostics) return;
    set({ showCircuitDiagnostics: false });
  },

  setScript: (script) => {
    if (get().readOnly) return;
    set({ script, scriptError: null });
  },

  clearScriptLogs: () => {
    set({ scriptLogs: [] });
  },

  clearScriptError: () => {
    if (get().scriptError === null) return;
    set({ scriptError: null });
  },

  runSimulation: () => {
    const { workspaceParts, wires, script } = get();
    const wiringValidation = validateWiringTopology(workspaceParts, wires);
    if (!wiringValidation.isValid) {
      set({
        wiringValidation,
        showCircuitDiagnostics: true,
      });
      return;
    }

    terminateActiveScriptWorker();
    const runId = ++activeExecutionRunId;

    set({
      wiringValidation,
      showCircuitDiagnostics: false,
      scriptLogs: [],
      scriptError: null,
      servoAngles: {},
      simulationStatus: 'playing',
      challengeStatus: 'in_progress',
      obstacleHits: 0,
      simulationStartedAt: Date.now(),
      completionTimeMs: null,
      isLevelComplete: false,
      activeDraftWire: null,
      activeSnapTarget: null,
    });

    if (typeof Worker === 'undefined') {
      set({
        simulationStatus: 'idle',
        scriptError: 'Web Worker execution is not available in this environment.',
      });
      return;
    }

    const worker = new Worker(new URL('../workers/robotScriptWorker.ts', import.meta.url));
    activeScriptWorker = worker;
    let lastHeartbeatAt = Date.now();

    const failRunWithMessage = (message: string) => {
      terminateActiveScriptWorker();
      activeExecutionRunId += 1;
      get().stopSimulation();
      set((state) => ({
        scriptError: message,
        scriptLogs: [
          ...state.scriptLogs.slice(-(MAX_SCRIPT_LOG_ENTRIES - 1)),
          createScriptLogEntry('error', message),
        ],
      }));
    };

    activeWatchdogTimerId = setInterval(() => {
      if (
        activeScriptWorker !== worker ||
        runId !== activeExecutionRunId ||
        get().simulationStatus !== 'playing'
      ) {
        return;
      }
      if (Date.now() - lastHeartbeatAt > WORKER_WATCHDOG_TIMEOUT_MS) {
        failRunWithMessage(
          `Watchdog terminated unresponsive script after ${WORKER_WATCHDOG_TIMEOUT_MS}ms without yielding (infinite loop detected).`,
        );
      }
    }, WORKER_WATCHDOG_POLL_MS);

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const payload = event.data;
      if (
        activeScriptWorker !== worker ||
        runId !== activeExecutionRunId ||
        payload.runId !== runId
      ) {
        return;
      }

      lastHeartbeatAt = Date.now();

      switch (payload.type) {
        case 'HEARTBEAT':
          return;
        case 'SET_SERVO_ANGLE': {
          const { workspaceParts: currentParts, wires: currentWires } = get();
          const targetServoIds = resolveTargetServoIds(
            payload.servoTarget,
            currentParts,
            currentWires,
          );
          if (targetServoIds.length === 0) {
            return;
          }
          const clampedAngle = Math.max(
            MIN_SERVO_ANGLE_DEG,
            Math.min(MAX_SERVO_ANGLE_DEG, payload.angleDeg),
          );
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
          return;
        }
        case 'LOG': {
          const entry = createScriptLogEntry(payload.level, payload.message);
          set((state) => ({
            scriptLogs: [...state.scriptLogs.slice(-(MAX_SCRIPT_LOG_ENTRIES - 1)), entry],
          }));
          return;
        }
        case 'COMPLETED': {
          terminateActiveScriptWorker();
          if (runId === activeExecutionRunId) {
            set({ simulationStatus: 'idle' });
          }
          return;
        }
        case 'ERROR': {
          failRunWithMessage(payload.message);
          return;
        }
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      if (activeScriptWorker !== worker || runId !== activeExecutionRunId) {
        return;
      }
      const message = event.message ? `Script worker error: ${event.message}` : 'Script worker crashed.';
      failRunWithMessage(message);
    };

    worker.postMessage({
      type: 'START',
      runId,
      script,
    } satisfies WorkerInboundMessage);
  },

  stopSimulation: () => {
    activeExecutionRunId += 1;
    terminateActiveScriptWorker();
    zeroRigidBodyVelocities(get().rigidBodyRefs);
    set((state) => ({
      simulationStatus: 'idle',
      challengeStatus: state.challengeStatus === 'in_progress' ? 'idle' : state.challengeStatus,
      servoAngles: {},
      activeSnapTarget: null,
      activeDraftWire: null,
      workspaceParts: reconcileChassisElevations(
        resolveHierarchyWorldTransforms(state.workspaceParts),
      ),
      resetNonce: state.resetNonce + 1,
    }));
  },

  setSimulationStatus: (status) => {
    const currentStatus = get().simulationStatus;
    if (currentStatus === status) return;
    if (status === 'playing') {
      const { workspaceParts, wires } = get();
      const wiringValidation = validateWiringTopology(workspaceParts, wires);
      if (!wiringValidation.isValid) {
        set({ wiringValidation, showCircuitDiagnostics: true });
        return;
      }
      set({
        wiringValidation,
        showCircuitDiagnostics: false,
        simulationStatus: 'playing',
        challengeStatus: 'in_progress',
        obstacleHits: 0,
        simulationStartedAt: Date.now(),
        completionTimeMs: null,
        isLevelComplete: false,
      });
      return;
    }
    if (status === 'idle' && currentStatus === 'playing') {
      get().stopSimulation();
      return;
    }
    activeExecutionRunId += 1;
    terminateActiveScriptWorker();
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
    get().completeChallenge();
  },

  completeChallenge: () => {
    const state = get();
    if (state.challengeStatus === 'completed' || state.challengeStatus === 'failed') return;
    const elapsedMs = state.simulationStartedAt
      ? Math.max(0, Date.now() - state.simulationStartedAt)
      : 0;
    set({
      challengeStatus: 'completed',
      isLevelComplete: true,
      completionTimeMs: elapsedMs,
    });
  },

  recordObstacleHit: () => {
    const state = get();
    if (state.simulationStatus !== 'playing') return;
    const nextHits = state.obstacleHits + 1;
    const shouldFail = state.zeroCollisionMode && state.challengeStatus === 'in_progress';
    set({
      obstacleHits: nextHits,
      challengeStatus: shouldFail ? 'failed' : state.challengeStatus,
    });
  },

  setEmbedConfig: (config) => {
    set((state) => ({
      allowedParts:
        config.allowedParts !== undefined
          ? config.allowedParts
            ? [...config.allowedParts]
            : null
          : state.allowedParts,
      readOnly: config.readOnly !== undefined ? Boolean(config.readOnly) : state.readOnly,
      zeroCollisionMode:
        config.zeroCollisionMode !== undefined
          ? Boolean(config.zeroCollisionMode)
          : state.zeroCollisionMode,
    }));
  },

  setPerformanceMode: (enabled) => {
    if (get().performanceMode === enabled) return;
    set({ performanceMode: enabled });
  },

  exportSimulationSnapshot: () => {
    const state = get();
    return serializeSimulationSnapshot({
      schemaVersion: state.schemaVersion,
      workspaceParts: state.workspaceParts,
      wires: state.wires,
      script: state.script,
      theme: state.theme,
    });
  },

  importSimulationSnapshot: (jsonString) => {
    const parsed = parseAndValidateSimulationSnapshot(jsonString);
    if (!parsed.success) {
      return { success: false, error: parsed.error };
    }

    activeExecutionRunId += 1;
    terminateActiveScriptWorker();
    clearPhysicsRegistry();

    const { snapshot } = parsed;
    const countsByType = new Map<PartType, number>();
    for (const part of snapshot.workspaceParts) {
      countsByType.set(part.type, (countsByType.get(part.type) ?? 0) + 1);
    }

    const nextInventory = createInitialInventory().map((item) => {
      const usedCount = countsByType.get(item.type) ?? 0;
      return {
        ...item,
        quantity: Math.max(0, item.quantity - usedCount),
      };
    });

    const rootIds = new Set(
      snapshot.workspaceParts.filter((part) => !part.attachedTo).map((part) => part.id),
    );
    const resolvedParts = reconcileChassisElevations(
      resolveHierarchyWorldTransforms(snapshot.workspaceParts, rootIds),
    );
    const wiringState = evaluateWiringState(resolvedParts, snapshot.wires, false);

    set((state) => ({
      schemaVersion: snapshot.schemaVersion,
      inventory: nextInventory,
      workspaceParts: resolvedParts,
      wires: snapshot.wires,
      script: snapshot.script,
      theme: snapshot.theme ?? state.theme,
      ...wiringState,
      activeDraftWire: null,
      activeSnapTarget: null,
      selectedPartId: null,
      simulationStatus: 'idle',
      challengeStatus: 'idle',
      obstacleHits: 0,
      simulationStartedAt: null,
      completionTimeMs: null,
      isLevelComplete: false,
      servoAngles: {},
      rigidBodyRefs: {},
      scriptLogs: [],
      scriptError: null,
      resetNonce: state.resetNonce + 1,
    }));

    return { success: true };
  },

  toggleTheme: () => {
    set((state) => ({
      theme: state.theme === 'dark' ? 'light' : 'dark',
    }));
  },

  resetPositions: () => {
    activeExecutionRunId += 1;
    terminateActiveScriptWorker();
    zeroRigidBodyVelocities(get().rigidBodyRefs);
    set((state) => {
      const zeroServoAngles: Record<string, number> = {};
      for (const servoId of Object.keys(state.servoAngles)) {
        zeroServoAngles[servoId] = 0;
      }

      const resetRoots = state.workspaceParts.map((part) => {
        if (!part.attachedTo && !isSandboxCoursePart(part.type)) {
          const defaultPos = getDefaultSpawnPosition(part.type);
          const resetY =
            part.type === 'CHASSIS_BASE' &&
            hasAttachedLegDescendant(part.id, state.workspaceParts)
              ? CHASSIS_ASSEMBLY_WORKING_Y
              : defaultPos[1];
          return {
            ...part,
            position: [defaultPos[0], resetY, defaultPos[2]] as Vector3Tuple,
            rotation: [...DEFAULT_ROTATION] as Vector3Tuple,
          };
        }
        return {
          ...part,
          position: [...part.position] as Vector3Tuple,
          rotation: [...part.rotation] as Vector3Tuple,
        };
      });

      const rootIds = new Set(resetRoots.filter((p) => !p.attachedTo).map((p) => p.id));
      const resolvedParts = reconcileChassisElevations(
        resolveHierarchyWorldTransforms(resetRoots, rootIds),
      );

      return {
        servoAngles: zeroServoAngles,
        workspaceParts: resolvedParts,
        simulationStatus: 'idle',
        challengeStatus: 'idle',
        obstacleHits: 0,
        simulationStartedAt: null,
        completionTimeMs: null,
        activeSnapTarget: null,
        activeDraftWire: null,
        isLevelComplete: false,
        resetNonce: state.resetNonce + 1,
      };
    });
  },

  resetWorkspace: () => {
    if (get().readOnly) return;
    activeExecutionRunId += 1;
    terminateActiveScriptWorker();
    for (const part of get().workspaceParts) {
      unregisterPartRigidBody(part.id);
      unregisterServoHornRef(part.id);
      setPartDragging(part.id, false);
    }
    const { theme, allowedParts, readOnly, zeroCollisionMode, performanceMode } = get();
    set({
      ...createInitialData(),
      theme,
      allowedParts,
      readOnly,
      zeroCollisionMode,
      performanceMode,
    });
  },
}));
