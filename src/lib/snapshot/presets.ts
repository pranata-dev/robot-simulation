import {
  PART_CATALOG,
  POWER_LIPO_BATTERY_ID,
  getWireColorForPinRole,
} from '@/lib/constants/hardwareCatalog';
import { computeFootClearanceLift } from '@/lib/physics/footClearance';
import {
  type BuiltInPreset,
  type PartType,
  type PinId,
  SIMULATION_SCHEMA_VERSION,
  type SocketDefinition,
  type SocketId,
  type WireConnection,
  type WorkspacePart,
} from '@/types/simulator';
import { resolveHierarchyWithSockets } from '@/utils/transformMath';

const CHASSIS_ID = 'preset-chassis-base';
const ESP32_ID = 'preset-esp32-devkit';
const ULTRASONIC_ID = 'preset-ultrasonic-hcsr04';
const OBSTACLE_ID = 'preset-obstacle-block';

interface LegAssemblySpec {
  servoId: string;
  legId: string;
  socketId: SocketId;
  pwmPinId: PinId;
}

const QUADRUPED_LEG_SPECS: readonly LegAssemblySpec[] = [
  { servoId: 'preset-servo-fl', legId: 'preset-leg-fl', socketId: 'SOCKET_HIP_FL', pwmPinId: 'ESP_D13' },
  { servoId: 'preset-servo-fr', legId: 'preset-leg-fr', socketId: 'SOCKET_HIP_FR', pwmPinId: 'ESP_D12' },
  { servoId: 'preset-servo-bl', legId: 'preset-leg-bl', socketId: 'SOCKET_HIP_BL', pwmPinId: 'ESP_D14' },
  { servoId: 'preset-servo-br', legId: 'preset-leg-br', socketId: 'SOCKET_HIP_BR', pwmPinId: 'ESP_D27' },
];

const EMPTY_WORKBENCH_SCRIPT = [
  '# Empty Workbench — mount parts from the Inventory or load a spider preset.',
  'PIN_1: 0',
].join('\n');

const UNWIRED_SPIDER_SCRIPT = [
  '# Wire each servo PWM, VCC (5V), and GND pin to ESP32 before running.',
  'PIN_1: 30',
  'PIN_2: -30',
  'DELAY: 500',
  'PIN_1: -30',
  'PIN_2: 30',
  'DELAY: 500',
  'LOOP',
].join('\n');

const AUTONOMOUS_AVOIDANCE_SCRIPT = [
  '# Autonomous Obstacle Avoidance + Alternating Trot Gait',
  '# FL=PIN_1, FR=PIN_2, BL=PIN_3, BR=PIN_4 | Front HC-SR04 Trig=PIN_5, Echo=PIN_6',
  'LOOP',
  'IF_OBSTACLE_LESS_THAN: 15',
  '  # --- OBSTACLE AVOIDANCE (TURN RIGHT) ---',
  '  # Swing left legs (FL/BL) forward while right legs (FR/BR) hold planted',
  '  PIN_1: 45',
  '  PIN_3: 45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  # Drive left legs (FL/BL) backward to pivot chassis right around obstacle',
  '  PIN_1: -45',
  '  PIN_3: -45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  # Second pivot stroke to clear obstacle width cleanly',
  '  PIN_1: 45',
  '  PIN_3: 45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  PIN_1: -45',
  '  PIN_3: -45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  'ELSE',
  '  # --- NORMAL WALK FORWARD (TROT GAIT) ---',
  '  # Diagonal Pair 1 Forward (FL+BR), Pair 2 Backward (FR+BL)',
  '  PIN_1: 45',
  '  PIN_4: 45',
  '  PIN_2: -45',
  '  PIN_3: -45',
  '  DELAY: 500',
  '  # Diagonal Pair 1 Backward (FL+BR), Pair 2 Forward (FR+BL)',
  '  PIN_1: -45',
  '  PIN_4: -45',
  '  PIN_2: 45',
  '  PIN_3: 45',
  '  DELAY: 500',
  'END_IF',
].join('\n');

function buildFullSpiderParts(
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
  chassisWorkingY: number,
  options: { includeBattery?: boolean } = {},
): WorkspacePart[] {
  const standingY = chassisWorkingY;
  const seedParts: WorkspacePart[] = [
    {
      id: CHASSIS_ID,
      type: 'CHASSIS_BASE',
      label: PART_CATALOG.CHASSIS_BASE.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
    },
    {
      id: ESP32_ID,
      type: 'ESP32_DEVKIT',
      label: PART_CATALOG.ESP32_DEVKIT.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'SOCKET_MCU',
    },
    {
      id: ULTRASONIC_ID,
      type: 'ULTRASONIC_HCSR04',
      label: PART_CATALOG.ULTRASONIC_HCSR04.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'socket-ultrasonic-front',
    },
  ];

  if (options.includeBattery) {
    seedParts.push({
      id: POWER_LIPO_BATTERY_ID,
      type: 'BATTERY_2S',
      label: PART_CATALOG.BATTERY_2S.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'socket-battery-mount',
    });
  }

  for (const spec of QUADRUPED_LEG_SPECS) {
    seedParts.push({
      id: spec.servoId,
      type: 'SERVO_MG90S',
      label: PART_CATALOG.SERVO_MG90S.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: spec.socketId,
    });
    seedParts.push({
      id: spec.legId,
      type: 'LEG_TIBIA',
      label: PART_CATALOG.LEG_TIBIA.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: spec.servoId,
      socketId: 'SOCKET_SERVO_HORN',
    });
  }

  const resolvedParts = resolveHierarchyWithSockets(seedParts, socketsByPart, new Set([CHASSIS_ID]));
  // Guard: never let a resolved foot sphere start below the grid (y < FOOT_GROUND_CLEARANCE).
  const lift = computeFootClearanceLift(resolvedParts);
  if (lift === 0) return resolvedParts;
  return resolvedParts.map((part) => ({
    ...part,
    position: [part.position[0], part.position[1] + lift, part.position[2]],
  }));
}

function buildFullSpiderWires(): WireConnection[] {
  const powerColor = getWireColorForPinRole('POWER');
  const groundColor = getWireColorForPinRole('GROUND');
  const pwmColor = getWireColorForPinRole('PWM');

  const wires: WireConnection[] = [];
  for (const spec of QUADRUPED_LEG_SPECS) {
    wires.push(
      {
        id: `wire-vcc-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: 'ESP_VIN',
        toPartId: spec.servoId,
        toPinId: 'SERVO_VCC',
        color: powerColor,
      },
      {
        id: `wire-gnd-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: 'ESP_GND',
        toPartId: spec.servoId,
        toPinId: 'SERVO_GND',
        color: groundColor,
      },
      {
        id: `wire-pwm-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: spec.pwmPinId,
        toPartId: spec.servoId,
        toPinId: 'SERVO_PWM',
        color: pwmColor,
      },
    );
  }
  wires.push(
    {
      id: `wire-vcc-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_VIN',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_VCC',
      color: powerColor,
    },
    {
      id: `wire-gnd-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_GND',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_GND',
      color: groundColor,
    },
    {
      id: `wire-trig-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_D26',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_TRIG',
      color: pwmColor,
    },
    {
      id: `wire-echo-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_D25',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_ECHO',
      color: pwmColor,
    },
  );
  return wires;
}

/** Builds deterministic built-in assembly presets for the quadruped spider blueprint. */
export function buildSpiderPresets(
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
  chassisHalfHeight: number,
  chassisWorkingY: number,
): readonly BuiltInPreset[] {
  return [
    {
      id: 'empty-workbench',
      name: 'Empty Workbench',
      description: 'Grounded ChassisBase with no attached parts or wires.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: [
          {
            id: CHASSIS_ID,
            type: 'CHASSIS_BASE',
            label: PART_CATALOG.CHASSIS_BASE.label,
            position: [0, chassisHalfHeight, 0],
            rotation: [0, 0, 0],
          },
        ],
        wires: [],
        script: EMPTY_WORKBENCH_SCRIPT,
        wiringMode: '3-pin',
      },
    },
    {
      id: 'assembled-unwired',
      name: 'Assembled Spider (Unwired)',
      description: 'Chassis, ESP32, 4 hip servos, and 4 legs snapped cleanly with 0 wires.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: buildFullSpiderParts(socketsByPart, chassisWorkingY),
        wires: [],
        script: UNWIRED_SPIDER_SCRIPT,
        wiringMode: '3-pin',
      },
    },
    {
      id: 'ready-to-walk',
      name: 'Ready-to-Walk Spider',
      description:
        'Complete spider wired with HC-SR04 ultrasonic sensor, LiPo battery pack, forward obstacle block, and autonomous obstacle-avoidance script.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: [
          ...buildFullSpiderParts(socketsByPart, chassisWorkingY, { includeBattery: true }),
          {
            id: OBSTACLE_ID,
            type: 'OBSTACLE_BLOCK',
            label: PART_CATALOG.OBSTACLE_BLOCK.label,
            position: [0, PART_CATALOG.OBSTACLE_BLOCK.dimensions[1] / 2, 3.5],
            rotation: [0, 0, 0],
          },
        ],
        wires: buildFullSpiderWires(),
        script: AUTONOMOUS_AVOIDANCE_SCRIPT,
        wiringMode: '3-pin',
      },
    },
  ];
}
