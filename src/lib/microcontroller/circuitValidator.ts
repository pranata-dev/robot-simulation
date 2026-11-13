import { findPinDefinition } from '@/lib/constants/socketRegistry';
import type {
  CircuitDiagnosticIssue,
  CircuitFaultKind,
  PinDefinition,
  PinId,
  PinNodeKey,
  WireConnection,
  WiringMode,
  WiringValidationResult,
  WorkspacePart,
} from '@/types/simulator';

interface NetEndpoint {
  key: PinNodeKey;
  part: WorkspacePart;
  pin: PinDefinition;
}

interface ElectricalNet {
  endpoints: NetEndpoint[];
  hasPower: boolean;
  hasGround: boolean;
  hasPwm: boolean;
  hasShortCircuit: boolean;
  hasRoleMismatch: boolean;
  espGpioEndpoints: NetEndpoint[];
  hasGpioConflict: boolean;
}

export function makePinNodeKey(partId: string, pinId: PinId): PinNodeKey {
  return `${partId}:${pinId}`;
}

function formatEndpointLabel(endpoint: NetEndpoint): string {
  const location = endpoint.part.socketId ? ` (${endpoint.part.socketId})` : '';
  return `${endpoint.pin.label} on ${endpoint.part.label}${location}`;
}

function formatPartLabel(part: WorkspacePart): string {
  return part.socketId ? `${part.label} [${part.socketId}]` : part.label;
}

function addFaultIfUnset(
  faultyPinKeys: Record<string, CircuitFaultKind>,
  key: PinNodeKey,
  kind: CircuitFaultKind,
): void {
  if (!faultyPinKeys[key]) {
    faultyPinKeys[key] = kind;
  }
}

function buildElectricalNets(
  partsById: ReadonlyMap<string, WorkspacePart>,
  wires: readonly WireConnection[],
  wiringMode: WiringMode,
): {
  netByKey: Map<PinNodeKey, ElectricalNet>;
  nets: ElectricalNet[];
} {
  const adjacency = new Map<PinNodeKey, Set<PinNodeKey>>();
  const endpointByKey = new Map<PinNodeKey, NetEndpoint>();

  const isPowerOrGroundServoPin = (partType: WorkspacePart['type'], pinId: PinId): boolean =>
    partType === 'SERVO_MG90S' && (pinId === 'SERVO_VCC' || pinId === 'SERVO_GND');

  const registerEndpoint = (partId: string, pinId: PinId): PinNodeKey | null => {
    const part = partsById.get(partId);
    if (!part) return null;
    const pin = findPinDefinition(part.type, pinId);
    if (!pin) return null;

    const key = makePinNodeKey(partId, pinId);
    if (!endpointByKey.has(key)) {
      endpointByKey.set(key, { key, part, pin });
    }
    if (!adjacency.has(key)) {
      adjacency.set(key, new Set());
    }
    return key;
  };

  for (const wire of wires) {
    const fromPart = partsById.get(wire.fromPartId);
    const toPart = partsById.get(wire.toPartId);
    if (
      wiringMode === '1-wire' &&
      ((fromPart && isPowerOrGroundServoPin(fromPart.type, wire.fromPinId)) ||
        (toPart && isPowerOrGroundServoPin(toPart.type, wire.toPinId)))
    ) {
      continue;
    }

    const fromKey = registerEndpoint(wire.fromPartId, wire.fromPinId);
    const toKey = registerEndpoint(wire.toPartId, wire.toPinId);
    if (!fromKey || !toKey) continue;

    adjacency.get(fromKey)?.add(toKey);
    adjacency.get(toKey)?.add(fromKey);
  }

  const visited = new Set<PinNodeKey>();
  const netByKey = new Map<PinNodeKey, ElectricalNet>();
  const nets: ElectricalNet[] = [];

  for (const startKey of endpointByKey.keys()) {
    if (visited.has(startKey)) continue;

    const queue: PinNodeKey[] = [startKey];
    visited.add(startKey);
    const endpoints: NetEndpoint[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const endpoint = endpointByKey.get(current);
      if (endpoint) endpoints.push(endpoint);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const hasPower = endpoints.some((e) => e.pin.role === 'POWER');
    const hasGround = endpoints.some((e) => e.pin.role === 'GROUND');
    const hasPwm = endpoints.some((e) => e.pin.role === 'PWM');
    const hasShortCircuit = hasPower && hasGround;
    const espGpioEndpoints = endpoints.filter(
      (e) => e.part.type === 'ESP32_DEVKIT' && e.pin.role === 'PWM' && e.pin.gpio !== null,
    );
    const hasGpioConflict = espGpioEndpoints.length > 1;
    const hasRoleMismatch = (!hasShortCircuit && hasPwm && (hasPower || hasGround)) || hasGpioConflict;

    const net: ElectricalNet = {
      endpoints,
      hasPower,
      hasGround,
      hasPwm,
      hasShortCircuit,
      hasRoleMismatch,
      espGpioEndpoints,
      hasGpioConflict,
    };

    nets.push(net);
    for (const endpoint of endpoints) {
      netByKey.set(endpoint.key, net);
    }
  }

  return { netByKey, nets };
}

/**
 * Validates all jumper wire nets for short circuits, role mismatches, and incomplete
 * VCC/GND/PWM paths across attached ESP32 and Servo components under the active wiringMode.
 */
export function validateWiringTopology(
  workspaceParts: readonly WorkspacePart[],
  wires: readonly WireConnection[],
  wiringMode: WiringMode = '3-pin',
): WiringValidationResult {
  const partsById = new Map(workspaceParts.map((part) => [part.id, part]));
  const { netByKey, nets } = buildElectricalNets(partsById, wires, wiringMode);

  const issues: CircuitDiagnosticIssue[] = [];
  const faultyPinKeys: Record<string, CircuitFaultKind> = {};
  let hasShortCircuit = false;

  for (let netIndex = 0; netIndex < nets.length; netIndex++) {
    const net = nets[netIndex];
    const netKeys = net.endpoints.map((e) => e.key);

    if (net.hasShortCircuit) {
      hasShortCircuit = true;
      for (const key of netKeys) {
        faultyPinKeys[key] = 'SHORT_CIRCUIT';
      }
      const powerPin = net.endpoints.find((e) => e.pin.role === 'POWER');
      const groundPin = net.endpoints.find((e) => e.pin.role === 'GROUND');
      issues.push({
        id: `short-${netIndex}`,
        kind: 'SHORT_CIRCUIT',
        message:
          powerPin && groundPin
            ? `Short circuit: ${formatEndpointLabel(powerPin)} is bridged to ${formatEndpointLabel(groundPin)}.`
            : 'Short circuit detected between power rail (VCC/5V) and GND.',
        pinKeys: netKeys,
      });
    } else if (net.hasGpioConflict) {
      for (const key of netKeys) {
        faultyPinKeys[key] = 'ROLE_MISMATCH';
      }
      const gpioLabels = net.espGpioEndpoints.map((e) => e.pin.label).join(' & ');
      issues.push({
        id: `gpio-conflict-${netIndex}`,
        kind: 'ROLE_MISMATCH',
        message: `GPIO conflict: Multiple ESP32 PWM pins (${gpioLabels}) cannot be bridged on one net.`,
        pinKeys: netKeys,
      });
    } else if (net.hasRoleMismatch) {
      for (const key of netKeys) {
        faultyPinKeys[key] = 'ROLE_MISMATCH';
      }
      const pwmPin = net.endpoints.find((e) => e.pin.role === 'PWM');
      const railPin = net.endpoints.find((e) => e.pin.role !== 'PWM');
      issues.push({
        id: `mismatch-${netIndex}`,
        kind: 'ROLE_MISMATCH',
        message:
          pwmPin && railPin
            ? `Pin mismatch: ${formatEndpointLabel(pwmPin)} cannot be wired to ${formatEndpointLabel(railPin)}.`
            : 'Signal PWM/GPIO pin is miswired to a power or ground rail.',
        pinKeys: netKeys,
      });
    }
  }

  const attachedEsp32s = workspaceParts.filter(
    (part) => part.type === 'ESP32_DEVKIT' && Boolean(part.attachedTo),
  );
  const attachedServos = workspaceParts.filter(
    (part) => part.type === 'SERVO_MG90S' && Boolean(part.attachedTo),
  );

  if (wiringMode === '3-pin') {
    for (const esp of attachedEsp32s) {
      const vinKey = makePinNodeKey(esp.id, 'ESP_VIN');
      const gndKey = makePinNodeKey(esp.id, 'ESP_GND');
      const vinNet = netByKey.get(vinKey);
      const gndNet = netByKey.get(gndKey);

      const hasValidVin =
        Boolean(vinNet) &&
        !vinNet?.hasShortCircuit &&
        !vinNet?.hasRoleMismatch &&
        (vinNet?.endpoints.length ?? 0) >= 2;
      if (!hasValidVin && !faultyPinKeys[vinKey]) {
        addFaultIfUnset(faultyPinKeys, vinKey, 'MISSING_POWER');
        issues.push({
          id: `missing-vin-${esp.id}`,
          kind: 'MISSING_POWER',
          message: `${formatPartLabel(esp)} 5V / VIN has no valid VCC power distribution connection.`,
          pinKeys: [vinKey],
        });
      }

      const hasValidGnd =
        Boolean(gndNet) &&
        !gndNet?.hasShortCircuit &&
        !gndNet?.hasRoleMismatch &&
        (gndNet?.endpoints.length ?? 0) >= 2;
      if (!hasValidGnd && !faultyPinKeys[gndKey]) {
        addFaultIfUnset(faultyPinKeys, gndKey, 'MISSING_GROUND');
        issues.push({
          id: `missing-gnd-${esp.id}`,
          kind: 'MISSING_GROUND',
          message: `${formatPartLabel(esp)} GND has no valid ground return connection.`,
          pinKeys: [gndKey],
        });
      }
    }
  }

  const activeServoIds: string[] = [];
  const pinToServoIdSets = new Map<PinId, Set<string>>();

  for (const servo of attachedServos) {
    const label = formatPartLabel(servo);
    const vccKey = makePinNodeKey(servo.id, 'SERVO_VCC');
    const gndKey = makePinNodeKey(servo.id, 'SERVO_GND');
    const pwmKey = makePinNodeKey(servo.id, 'SERVO_PWM');

    let hasValidPower = true;
    let hasValidGround = true;

    if (wiringMode === '3-pin') {
      const vccNet = netByKey.get(vccKey);
      hasValidPower = Boolean(
        vccNet &&
          !vccNet.hasShortCircuit &&
          !vccNet.hasRoleMismatch &&
          vccNet.endpoints.some((e) => e.part.type === 'ESP32_DEVKIT' && e.pin.role === 'POWER'),
      );
      if (!hasValidPower && !faultyPinKeys[vccKey]) {
        addFaultIfUnset(faultyPinKeys, vccKey, 'MISSING_POWER');
        issues.push({
          id: `servo-vcc-${servo.id}`,
          kind: 'MISSING_POWER',
          message: `${label} VCC pin must be wired to ESP32 5V / VIN.`,
          pinKeys: [vccKey],
        });
      }

      const gndNet = netByKey.get(gndKey);
      hasValidGround = Boolean(
        gndNet &&
          !gndNet.hasShortCircuit &&
          !gndNet.hasRoleMismatch &&
          gndNet.endpoints.some((e) => e.part.type === 'ESP32_DEVKIT' && e.pin.role === 'GROUND'),
      );
      if (!hasValidGround && !faultyPinKeys[gndKey]) {
        addFaultIfUnset(faultyPinKeys, gndKey, 'MISSING_GROUND');
        issues.push({
          id: `servo-gnd-${servo.id}`,
          kind: 'MISSING_GROUND',
          message: `${label} GND pin must be wired to ESP32 GND.`,
          pinKeys: [gndKey],
        });
      }
    }

    const pwmNet = netByKey.get(pwmKey);
    const validGpioEndpoints =
      pwmNet && !pwmNet.hasShortCircuit && !pwmNet.hasRoleMismatch ? pwmNet.espGpioEndpoints : [];
    const hasValidGpio = validGpioEndpoints.length === 1;
    if (!hasValidGpio && !faultyPinKeys[pwmKey]) {
      addFaultIfUnset(faultyPinKeys, pwmKey, 'MISSING_PWM');
      issues.push({
        id: `servo-pwm-${servo.id}`,
        kind: 'MISSING_PWM',
        message: `${label} PWM pin must be wired to a valid ESP32 GPIO pin.`,
        pinKeys: [pwmKey],
      });
    }

    if (hasValidPower && hasValidGround && hasValidGpio) {
      activeServoIds.push(servo.id);
      const espGpioPinId = validGpioEndpoints[0].pin.id;
      const mappedSet = pinToServoIdSets.get(espGpioPinId) ?? new Set<string>();
      mappedSet.add(servo.id);
      pinToServoIdSets.set(espGpioPinId, mappedSet);
    }
  }

  const pinToServoIds: Partial<Record<PinId, readonly string[]>> = {};
  for (const [pinId, servoSet] of pinToServoIdSets.entries()) {
    pinToServoIds[pinId] = Array.from(servoSet);
  }

  return {
    isValid: issues.length === 0,
    hasShortCircuit,
    issues,
    faultyPinKeys,
    activeServoIds,
    pinToServoIds,
  };
}

