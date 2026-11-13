import { PART_CATALOG, getWireColorForPinRole } from '@/lib/constants/hardwareCatalog';
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

const WALKING_GAIT_SCRIPT = [
  '# Quadruped Alternating Diagonal Trot Gait (FL=P1, FR=P2, BL=P3, BR=P4)',
  '# Normalized axis convention: +deg = leg swings forward, -deg = leg pushes backward',
  'PIN_2: 45',
  'PIN_3: 45',
  'PIN_1: -45',
  'PIN_4: -45',
  'DELAY: 600',
  'PIN_2: -45',
  'PIN_3: -45',
  'PIN_1: 45',
  'PIN_4: 45',
  'DELAY: 600',
  'LOOP',
].join('\n');

function buildFullSpiderParts(
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
  chassisWorkingY: number,
): WorkspacePart[] {
  const seedParts: WorkspacePart[] = [
    {
      id: CHASSIS_ID,
      type: 'CHASSIS_BASE',
      label: PART_CATALOG.CHASSIS_BASE.label,
      position: [0, chassisWorkingY, 0],
      rotation: [0, 0, 0],
    },
    {
      id: ESP32_ID,
      type: 'ESP32_DEVKIT',
      label: PART_CATALOG.ESP32_DEVKIT.label,
      position: [0, chassisWorkingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'SOCKET_MCU',
    },
  ];

  for (const spec of QUADRUPED_LEG_SPECS) {
    seedParts.push({
      id: spec.servoId,
      type: 'SERVO_MG90S',
      label: PART_CATALOG.SERVO_MG90S.label,
      position: [0, chassisWorkingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: spec.socketId,
    });
    seedParts.push({
      id: spec.legId,
      type: 'LEG_TIBIA',
      label: PART_CATALOG.LEG_TIBIA.label,
      position: [0, chassisWorkingY, 0],
      rotation: [0, 0, 0],
      attachedTo: spec.servoId,
      socketId: 'SOCKET_SERVO_HORN',
    });
  }

  return resolveHierarchyWithSockets(seedParts, socketsByPart, new Set([CHASSIS_ID]));
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
      description: 'Complete spider with valid 3-pin wiring and alternating trot gait script.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: buildFullSpiderParts(socketsByPart, chassisWorkingY),
        wires: buildFullSpiderWires(),
        script: WALKING_GAIT_SCRIPT,
        wiringMode: '3-pin',
      },
    },
  ];
}
