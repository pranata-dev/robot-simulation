import {
  PART_CATALOG,
  SOCKETS_BY_PART,
  findPinDefinition,
} from '@/lib/constants/socketRegistry';
import {
  type PartType,
  SIMULATION_SCHEMA_VERSION,
  type SimulationSnapshot,
  type SocketDefinition,
  type SocketId,
  type ThemeMode,
  type Vector3Tuple,
  type WireConnection,
  type WorkspacePart,
} from '@/types/simulator';

export type ParsedSnapshotResult =
  | { success: true; snapshot: SimulationSnapshot }
  | { success: false; error: string };

const IMPLEMENTED_PART_TYPES = new Set<PartType>([
  'CHASSIS_BASE',
  'ESP32_DEVKIT',
  'SERVO_MG90S',
  'LEG_TIBIA',
  'OBSTACLE_BLOCK',
  'TARGET_ZONE',
]);

const SOCKET_DEFINITIONS_BY_ID = new Map<SocketId, SocketDefinition>(
  Object.values(SOCKETS_BY_PART)
    .flat()
    .map((socketDef) => [socketDef.id, socketDef]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteVector3Tuple(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    typeof value[2] === 'number' &&
    Number.isFinite(value[2])
  );
}

function isPartType(value: unknown): value is PartType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PART_CATALOG, value) &&
    IMPLEMENTED_PART_TYPES.has(value as PartType)
  );
}

function isSocketId(value: unknown): value is SocketId {
  return typeof value === 'string' && SOCKET_DEFINITIONS_BY_ID.has(value as SocketId);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function hasParentCycle(
  partId: string,
  partsById: ReadonlyMap<string, WorkspacePart>,
): boolean {
  const visited = new Set<string>([partId]);
  let current = partsById.get(partId);
  while (current?.attachedTo) {
    if (visited.has(current.attachedTo)) {
      return true;
    }
    visited.add(current.attachedTo);
    current = partsById.get(current.attachedTo);
  }
  return false;
}

export function serializeSimulationSnapshot(snapshot: {
  schemaVersion: typeof SIMULATION_SCHEMA_VERSION;
  workspaceParts: readonly WorkspacePart[];
  wires: readonly WireConnection[];
  script: string;
  theme?: ThemeMode;
}): string {
  const payload: SimulationSnapshot = {
    schemaVersion: snapshot.schemaVersion,
    workspaceParts: snapshot.workspaceParts.map((part) => ({
      id: part.id,
      type: part.type,
      label: part.label,
      position: [part.position[0], part.position[1], part.position[2]],
      rotation: [part.rotation[0], part.rotation[1], part.rotation[2]],
      ...(part.attachedTo !== undefined ? { attachedTo: part.attachedTo } : {}),
      ...(part.socketId !== undefined ? { socketId: part.socketId } : {}),
    })),
    wires: snapshot.wires.map((wire) => ({
      id: wire.id,
      fromPartId: wire.fromPartId,
      fromPinId: wire.fromPinId,
      toPartId: wire.toPartId,
      toPinId: wire.toPinId,
      color: wire.color,
    })),
    script: snapshot.script,
    ...(snapshot.theme ? { theme: snapshot.theme } : {}),
  };

  return JSON.stringify(payload, null, 2);
}

export function parseAndValidateSimulationSnapshot(jsonString: string): ParsedSnapshotResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Malformed JSON payload';
    return { success: false, error: `Invalid JSON snapshot: ${detail}` };
  }

  if (!isRecord(raw)) {
    return { success: false, error: 'Snapshot root must be a JSON object.' };
  }

  if (raw.schemaVersion !== SIMULATION_SCHEMA_VERSION) {
    return {
      success: false,
      error: `Unsupported or missing schemaVersion. Expected "${SIMULATION_SCHEMA_VERSION}".`,
    };
  }

  if (typeof raw.script !== 'string') {
    return { success: false, error: 'Snapshot "script" must be a string.' };
  }

  if (!Array.isArray(raw.workspaceParts)) {
    return { success: false, error: 'Snapshot "workspaceParts" must be an array.' };
  }

  if (!Array.isArray(raw.wires)) {
    return { success: false, error: 'Snapshot "wires" must be an array.' };
  }

  if (raw.theme !== undefined && !isThemeMode(raw.theme)) {
    return { success: false, error: 'Snapshot "theme" must be "light" or "dark".' };
  }

  const parsedParts: WorkspacePart[] = [];
  const seenPartIds = new Set<string>();

  for (let i = 0; i < raw.workspaceParts.length; i += 1) {
    const entry = raw.workspaceParts[i];
    if (!isRecord(entry)) {
      return { success: false, error: `workspaceParts[${i}] must be an object.` };
    }
    if (!isNonEmptyString(entry.id)) {
      return { success: false, error: `workspaceParts[${i}].id must be a non-empty string.` };
    }
    if (seenPartIds.has(entry.id)) {
      return { success: false, error: `Duplicate part ID "${entry.id}" in workspaceParts.` };
    }
    if (!isPartType(entry.type)) {
      return { success: false, error: `Unsupported part type in workspaceParts[${i}].` };
    }
    if (!isNonEmptyString(entry.label)) {
      return { success: false, error: `workspaceParts[${i}].label must be a non-empty string.` };
    }
    if (!isFiniteVector3Tuple(entry.position) || !isFiniteVector3Tuple(entry.rotation)) {
      return {
        success: false,
        error: `workspaceParts[${i}] must have valid 3D finite number tuples for position and rotation.`,
      };
    }

    const hasAttachedTo = entry.attachedTo !== undefined;
    const hasSocketId = entry.socketId !== undefined;
    if (hasAttachedTo && !isNonEmptyString(entry.attachedTo)) {
      return { success: false, error: `workspaceParts[${i}].attachedTo must be a non-empty string.` };
    }
    if (hasSocketId && !isSocketId(entry.socketId)) {
      return { success: false, error: `workspaceParts[${i}].socketId is not a known socket.` };
    }
    if (hasAttachedTo !== hasSocketId) {
      return {
        success: false,
        error: `workspaceParts[${i}] must provide both attachedTo and socketId when attached.`,
      };
    }

    seenPartIds.add(entry.id);
    parsedParts.push({
      id: entry.id,
      type: entry.type,
      label: entry.label,
      position: [entry.position[0], entry.position[1], entry.position[2]],
      rotation: [entry.rotation[0], entry.rotation[1], entry.rotation[2]],
      ...(hasAttachedTo ? { attachedTo: entry.attachedTo as string } : {}),
      ...(hasSocketId ? { socketId: entry.socketId as SocketId } : {}),
    });
  }

  const partsById = new Map(parsedParts.map((part) => [part.id, part]));
  const occupiedSockets = new Set<string>();

  for (const part of parsedParts) {
    if (!part.attachedTo || !part.socketId) continue;

    const parent = partsById.get(part.attachedTo);
    if (!parent) {
      return {
        success: false,
        error: `Part "${part.id}" references missing parent "${part.attachedTo}".`,
      };
    }

    const socketDef = SOCKET_DEFINITIONS_BY_ID.get(part.socketId);
    if (
      !socketDef ||
      socketDef.hostPartType !== parent.type ||
      !socketDef.allowedTypes.includes(part.type)
    ) {
      return {
        success: false,
        error: `Part "${part.id}" (${part.type}) is incompatible with socket "${part.socketId}".`,
      };
    }

    const occupancyKey = `${part.attachedTo}:${part.socketId}`;
    if (occupiedSockets.has(occupancyKey)) {
      return {
        success: false,
        error: `Socket "${part.socketId}" on "${part.attachedTo}" is occupied by multiple parts.`,
      };
    }
    occupiedSockets.add(occupancyKey);

    if (hasParentCycle(part.id, partsById)) {
      return {
        success: false,
        error: `Circular parent-child attachment detected involving "${part.id}".`,
      };
    }
  }

  const parsedWires: WireConnection[] = [];
  const seenWireIds = new Set<string>();

  for (let i = 0; i < raw.wires.length; i += 1) {
    const wire = raw.wires[i];
    if (!isRecord(wire)) {
      return { success: false, error: `wires[${i}] must be an object.` };
    }
    if (!isNonEmptyString(wire.id) || seenWireIds.has(wire.id)) {
      return { success: false, error: `wires[${i}].id must be a unique non-empty string.` };
    }
    if (
      !isNonEmptyString(wire.fromPartId) ||
      !isNonEmptyString(wire.fromPinId) ||
      !isNonEmptyString(wire.toPartId) ||
      !isNonEmptyString(wire.toPinId) ||
      !isNonEmptyString(wire.color)
    ) {
      return { success: false, error: `wires[${i}] is missing required endpoint or color fields.` };
    }

    const fromPart = partsById.get(wire.fromPartId);
    const toPart = partsById.get(wire.toPartId);
    if (!fromPart || !toPart) {
      return { success: false, error: `wires[${i}] references a non-existent part.` };
    }

    const fromPinDef = findPinDefinition(fromPart.type, wire.fromPinId);
    const toPinDef = findPinDefinition(toPart.type, wire.toPinId);
    if (!fromPinDef || !toPinDef) {
      return { success: false, error: `wires[${i}] references an invalid pin ID for its part.` };
    }

    seenWireIds.add(wire.id);
    parsedWires.push({
      id: wire.id,
      fromPartId: wire.fromPartId,
      fromPinId: fromPinDef.id,
      toPartId: wire.toPartId,
      toPinId: toPinDef.id,
      color: wire.color,
    });
  }

  return {
    success: true,
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: parsedParts,
      wires: parsedWires,
      script: raw.script,
      ...(raw.theme !== undefined ? { theme: raw.theme } : {}),
    },
  };
}
