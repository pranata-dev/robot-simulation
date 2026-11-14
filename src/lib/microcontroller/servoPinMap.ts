import { ESP32_PINS } from '@/lib/constants/socketRegistry';
import { makePinNodeKey } from '@/lib/microcontroller/circuitValidator';
import type { PinId, PinNodeKey, WireConnection, WorkspacePart } from '@/types/simulator';

const ESP32_PWM_PINS = ESP32_PINS.filter((pin) => pin.role === 'PWM');
const SOCKET_DISPLAY_ORDER = new Map<string, number>([
  ['SOCKET_HIP_FL', 0],
  ['SOCKET_HIP_FR', 1],
  ['SOCKET_HIP_BL', 2],
  ['SOCKET_HIP_BR', 3],
]);

export interface ServoPinAssignment {
  servoId: string;
  socketLabel: string;
  gpioLabel: string;
  dslToken: string | null;
  espPinId: PinId | null;
  isPowered: boolean;
}

/**
 * Resolves each mounted ServoProxy's socket label and connected ESP32 PWM pin (`P1`–`P8` or `Unwired`)
 * by traversing wire nets in the current workspace.
 */
export function getServoPinAssignments(
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
  activeServoIds: readonly string[],
): ServoPinAssignment[] {
  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
  const activeSet = new Set(activeServoIds);
  const adjacency = new Map<PinNodeKey, Set<PinNodeKey>>();

  for (const wire of wires) {
    const fromKey = makePinNodeKey(wire.fromPartId, wire.fromPinId);
    const toKey = makePinNodeKey(wire.toPartId, wire.toPinId);
    const fromNeighbors = adjacency.get(fromKey) ?? new Set<PinNodeKey>();
    fromNeighbors.add(toKey);
    adjacency.set(fromKey, fromNeighbors);

    const toNeighbors = adjacency.get(toKey) ?? new Set<PinNodeKey>();
    toNeighbors.add(fromKey);
    adjacency.set(toKey, toNeighbors);
  }

  const espPinIndexById = new Map<PinId, number>(
    ESP32_PWM_PINS.map((pin, idx) => [pin.id, idx]),
  );

  const mountedServos = workspaceParts
    .filter((part) => part.type === 'SERVO_MG90S' && Boolean(part.attachedTo))
    .sort((a, b) => {
      const orderA = a.socketId ? (SOCKET_DISPLAY_ORDER.get(a.socketId) ?? 99) : 99;
      const orderB = b.socketId ? (SOCKET_DISPLAY_ORDER.get(b.socketId) ?? 99) : 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

  return mountedServos.map((servo) => {
    const startKey = makePinNodeKey(servo.id, 'SERVO_PWM');
    const visited = new Set<PinNodeKey>([startKey]);
    const queue: PinNodeKey[] = [startKey];
    let resolvedEspPinId: PinId | null = null;
    let resolvedIndex = -1;

    while (queue.length > 0 && !resolvedEspPinId) {
      const current = queue.shift();
      if (!current) continue;

      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const separatorIdx = neighbor.lastIndexOf(':');
        if (separatorIdx > 0) {
          const partId = neighbor.slice(0, separatorIdx);
          const pinId = neighbor.slice(separatorIdx + 1) as PinId;
          const part = partsById.get(partId);
          const pwmIdx = espPinIndexById.get(pinId);
          if (part?.type === 'ESP32_DEVKIT' && pwmIdx !== undefined) {
            resolvedEspPinId = pinId;
            resolvedIndex = pwmIdx;
            break;
          }
        }
        queue.push(neighbor);
      }
    }

    const pinNumber = resolvedIndex >= 0 ? resolvedIndex + 1 : null;
    return {
      servoId: servo.id,
      socketLabel: servo.socketId ?? servo.label,
      gpioLabel: pinNumber !== null ? `P${pinNumber}` : 'Unwired',
      dslToken: pinNumber !== null ? `PIN_${pinNumber}` : null,
      espPinId: resolvedEspPinId,
      isPowered: activeSet.has(servo.id),
    };
  });
}

export interface ResolveServoTargetParams {
  target: string;
  workspaceParts: readonly WorkspacePart[];
  wires: readonly WireConnection[];
  pinToServoIds?: Readonly<Partial<Record<PinId, readonly string[]>>>;
  activeServoIds?: readonly string[];
  peerTargets?: readonly string[];
}

const PIN_TOKEN_REGEX = /\b(?:PIN_\d+|P\d+|ESP_D\d+|D\d+)\b|^\s*\d+(?=\s*:)/gmi;

/**
 * Extracts unique uppercase pin aliases referenced in a user control script
 * so single-pin calls can disambiguate mixed GPIO vs 1-based channel tokens.
 */
export function extractPinTokensFromScript(script: string): string[] {
  const matches = script.match(PIN_TOKEN_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches.map((token) => token.trim().toUpperCase())));
}

/**
 * Resolves explicit ESP32 pin IDs (`ESP_D12`) or ESP32 GPIO numbers (`PIN_12`, `D12`, `12` -> `ESP_D12`,
 * `PIN_13`, `D13`, `13` -> `ESP_D13`) without colliding 1-based channels (`PIN_2`) against `ESP_D12`.
 */
export function resolveExplicitEspPinId(rawToken: string): PinId | null {
  const normalized = rawToken.trim().toUpperCase();
  const exactPin = ESP32_PINS.find((pin) => pin.id === normalized);
  if (exactPin) {
    return exactPin.id;
  }

  const gpioPinMatch = /^(?:PIN_|D)?(\d+)$/.exec(normalized);
  if (gpioPinMatch) {
    const gpio = Number.parseInt(gpioPinMatch[1], 10);
    const matchingPwmPin = ESP32_PWM_PINS.find((pin) => pin.gpio === gpio);
    if (matchingPwmPin) {
      return matchingPwmPin.id;
    }
  }

  const highChannelMatch = /^P(\d+)$/.exec(normalized);
  if (highChannelMatch) {
    const num = Number.parseInt(highChannelMatch[1], 10);
    if (num > ESP32_PWM_PINS.length) {
      const matchingPwmPin = ESP32_PWM_PINS.find((pin) => pin.gpio === num);
      if (matchingPwmPin) {
        return matchingPwmPin.id;
      }
    }
  }

  return null;
}

function getMappedServosForPin(
  pinId: PinId,
  assignments: readonly ServoPinAssignment[],
  pinToServoIds: Readonly<Partial<Record<PinId, readonly string[]>>> | undefined,
  activeSet: ReadonlySet<string>,
): string[] {
  const wiredServoIds = assignments
    .filter((entry) => entry.espPinId === pinId)
    .map((entry) => entry.servoId);
  const validatedServoIds = pinToServoIds?.[pinId] ?? [];
  const combined = Array.from(new Set([...validatedServoIds, ...wiredServoIds]));

  if (activeSet.size > 0) {
    const poweredMatches = combined.filter((servoId) => activeSet.has(servoId));
    if (poweredMatches.length > 0) {
      return poweredMatches;
    }
  }
  return combined;
}

function getOrderedActiveWiredAssignments(
  assignments: readonly ServoPinAssignment[],
  activeSet: ReadonlySet<string>,
): ServoPinAssignment[] {
  const wired = assignments.filter((entry) => entry.espPinId !== null);
  if (activeSet.size > 0) {
    const activeWired = wired.filter((entry) => entry.isPowered);
    if (activeWired.length > 0) {
      return activeWired;
    }
  }
  return wired;
}

function parseIndexedChannelNumber(normalized: string): number | null {
  const match = /^(?:PIN_|P|D)?(\d+)$/.exec(normalized);
  if (!match) return null;
  const idx = Number.parseInt(match[1], 10);
  if (idx >= 1 && idx <= ESP32_PWM_PINS.length) {
    return idx;
  }
  return null;
}

function resolveDirectWiredGpioServos(
  normalized: string,
  assignments: readonly ServoPinAssignment[],
  pinToServoIds: Readonly<Partial<Record<PinId, readonly string[]>>> | undefined,
  activeSet: ReadonlySet<string>,
): string[] {
  const explicitPinId = resolveExplicitEspPinId(normalized);
  if (!explicitPinId) return [];
  return getMappedServosForPin(explicitPinId, assignments, pinToServoIds, activeSet);
}

function resolveIndexedActiveServoIds(
  normalizedTarget: string,
  channelIdx: number,
  assignments: readonly ServoPinAssignment[],
  activeWiredPool: readonly ServoPinAssignment[],
  pinToServoIds: Readonly<Partial<Record<PinId, readonly string[]>>> | undefined,
  activeSet: ReadonlySet<string>,
  peerTargets: readonly string[],
): string[] {
  if (channelIdx <= 4 && channelIdx <= activeWiredPool.length) {
    const preferredServoId = activeWiredPool[channelIdx - 1].servoId;
    const explicitClaimedServoIds = new Set<string>();

    for (const rawPeer of peerTargets) {
      const peer = rawPeer.trim().toUpperCase();
      for (const sid of resolveDirectWiredGpioServos(peer, assignments, pinToServoIds, activeSet)) {
        explicitClaimedServoIds.add(sid);
      }
    }

    if (!explicitClaimedServoIds.has(preferredServoId)) {
      return [preferredServoId];
    }

    const nonCollidingIndexServoIds = new Set<string>();
    const collidingTokens: string[] = [];
    const uniquePeers = Array.from(new Set(peerTargets.map((peer) => peer.trim().toUpperCase())));

    for (const peer of uniquePeers) {
      if (resolveDirectWiredGpioServos(peer, assignments, pinToServoIds, activeSet).length > 0) {
        continue;
      }
      const peerIdx = parseIndexedChannelNumber(peer);
      if (!peerIdx || peerIdx > 4 || peerIdx > activeWiredPool.length) continue;
      const peerPreferredId = activeWiredPool[peerIdx - 1].servoId;
      if (explicitClaimedServoIds.has(peerPreferredId)) {
        collidingTokens.push(peer);
      } else {
        nonCollidingIndexServoIds.add(peerPreferredId);
      }
    }

    if (!collidingTokens.includes(normalizedTarget)) {
      collidingTokens.push(normalizedTarget);
    }
    collidingTokens.sort();

    const unclaimedPool = activeWiredPool.filter(
      (entry) =>
        !explicitClaimedServoIds.has(entry.servoId) &&
        !nonCollidingIndexServoIds.has(entry.servoId),
    );
    const collisionIdx = collidingTokens.indexOf(normalizedTarget);
    if (collisionIdx >= 0 && collisionIdx < unclaimedPool.length) {
      return [unclaimedPool[collisionIdx].servoId];
    }

    return [preferredServoId];
  }

  const pwmPin = ESP32_PWM_PINS[channelIdx - 1];
  return pwmPin ? getMappedServosForPin(pwmPin.id, assignments, pinToServoIds, activeSet) : [];
}

/**
 * Resolves worker pin commands (`PIN_2`, `D2`, `2`, `PIN_4`, `PIN_12`, `D12`, `PIN_13`, `P1`–`P8`, `ESP_D*`)
 * or direct servo IDs/socket IDs to mounted servo part IDs using active wiring topology:
 * 1. Exact wired GPIO pin matches first.
 * 2. 1-based index fallback (`PIN_1`–`PIN_4` / `P1`–`P4` -> sorted active wired servos FL, FR, BL, BR).
 */
export function resolveServoIdsForPinTarget({
  target,
  workspaceParts,
  wires,
  pinToServoIds,
  activeServoIds = [],
  peerTargets = [],
}: ResolveServoTargetParams): string[] {
  const normalized = target.trim().toUpperCase();
  if (!normalized) return [];

  const assignments = getServoPinAssignments(workspaceParts, wires, activeServoIds);
  const activeSet = new Set(activeServoIds);

  const directWired = resolveDirectWiredGpioServos(normalized, assignments, pinToServoIds, activeSet);
  if (directWired.length > 0) {
    return directWired;
  }

  const channelIdx = parseIndexedChannelNumber(normalized);
  if (channelIdx !== null) {
    const activeWiredPool = getOrderedActiveWiredAssignments(assignments, activeSet);
    const indexedMatches = resolveIndexedActiveServoIds(
      normalized,
      channelIdx,
      assignments,
      activeWiredPool,
      pinToServoIds,
      activeSet,
      peerTargets,
    );
    if (indexedMatches.length > 0) {
      return indexedMatches;
    }
  }

  const rawTrimmed = target.trim();
  return workspaceParts
    .filter(
      (part) =>
        part.type === 'SERVO_MG90S' &&
        (part.id === rawTrimmed || part.socketId === rawTrimmed),
    )
    .map((part) => part.id);
}

/**
 * Formats the current manual calibration slider angles into a DSL step block (`PIN_1: ...`).
 */
export function formatServoStepDsl(
  assignments: readonly ServoPinAssignment[],
  servoAngles: Readonly<Record<string, number>>,
): string {
  const lines: string[] = [];
  for (const entry of assignments) {
    if (!entry.dslToken) continue;
    const angle = Math.round(servoAngles[entry.servoId] ?? 0);
    lines.push(`${entry.dslToken}: ${angle}`);
  }
  return lines.join('\n');
}

