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

