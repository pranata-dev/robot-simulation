import type {
  PartCatalogEntry,
  PartType,
  PinDefinition,
  SocketDefinition,
  Vector3Tuple,
} from '@/types/simulator';

/** Source of truth: docs/3d_asset_socket_coordinate_map.md (1 unit = 10 cm). */

const QUARTER_PI = Math.PI / 4;
const THREE_QUARTER_PI = (3 * Math.PI) / 4;
const HALF_PI = Math.PI / 2;

const AXIS_Y: Vector3Tuple = [0, 1, 0];
const AXIS_Z: Vector3Tuple = [0, 0, 1];

export const PART_TYPES: readonly PartType[] = [
  'CHASSIS_BASE',
  'ESP32_DEVKIT',
  'BATTERY_2S',
  'SERVO_MG90S',
  'LEG_COXA',
  'LEG_TIBIA',
  'OBSTACLE_BLOCK',
  'TARGET_ZONE',
] as const;

export const PART_CATALOG: Readonly<Record<PartType, PartCatalogEntry>> = {
  CHASSIS_BASE: {
    type: 'CHASSIS_BASE',
    label: 'Main Spider Chassis',
    dimensions: [1.2, 0.15, 1.6],
    mass: 0.15,
  },
  ESP32_DEVKIT: {
    type: 'ESP32_DEVKIT',
    label: 'ESP32 Microcontroller',
    dimensions: [0.28, 0.08, 0.55],
    mass: 0.02,
  },
  BATTERY_2S: {
    type: 'BATTERY_2S',
    label: 'LiPo Battery 7.4V + BEC 5V',
    dimensions: [0.35, 0.18, 0.7],
    mass: 0.08,
  },
  SERVO_MG90S: {
    type: 'SERVO_MG90S',
    label: 'Micro Servo MG90S',
    dimensions: [0.22, 0.28, 0.12],
    mass: 0.014,
  },
  LEG_COXA: {
    type: 'LEG_COXA',
    label: 'Coxa Bracket',
    dimensions: [0.3, 0.15, 0.2],
    mass: 0.01,
  },
  LEG_TIBIA: {
    type: 'LEG_TIBIA',
    label: 'Spider Leg',
    dimensions: [0.65, 0.12, 0.12],
    mass: 0.02,
  },
  OBSTACLE_BLOCK: {
    type: 'OBSTACLE_BLOCK',
    label: 'Obstacle Block',
    dimensions: [0.8, 0.35, 0.5],
    mass: 0,
  },
  TARGET_ZONE: {
    type: 'TARGET_ZONE',
    label: 'Target Zone Pad',
    dimensions: [1.8, 0.03, 1.2],
    mass: 0,
  },
};

/** Unified chassis grounding & assembly stand geometry constants (derived from PART_CATALOG). */
export const CHASSIS_DIMENSIONS: Vector3Tuple = PART_CATALOG.CHASSIS_BASE.dimensions;
export const CHASSIS_HALF_WIDTH = CHASSIS_DIMENSIONS[0] / 2;
export const CHASSIS_HALF_HEIGHT = CHASSIS_DIMENSIONS[1] / 2;
export const CHASSIS_HALF_DEPTH = CHASSIS_DIMENSIONS[2] / 2;
export const CHASSIS_COLLIDER_HALF_EXTENTS: Vector3Tuple = [
  CHASSIS_HALF_WIDTH,
  CHASSIS_HALF_HEIGHT,
  CHASSIS_HALF_DEPTH,
];
/** Elevated working Y position during idle assembly when at least one leg is attached. */
export const CHASSIS_ASSEMBLY_WORKING_Y = 0.5;

/** Quadruped 8-DOF bill of materials plus high-quantity sandbox course items. */
export const SPIDER_BILL_OF_MATERIALS: Readonly<Record<PartType, number>> = {
  CHASSIS_BASE: 1,
  ESP32_DEVKIT: 1,
  BATTERY_2S: 1,
  SERVO_MG90S: 8,
  LEG_COXA: 4,
  LEG_TIBIA: 4,
  OBSTACLE_BLOCK: 99,
  TARGET_ZONE: 99,
};

export const CHASSIS_SOCKETS: readonly SocketDefinition[] = [
  {
    id: 'SOCKET_MCU',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['ESP32_DEVKIT'],
    position: [0.0, 0.12, 0.35],
    rotation: [0, 0, 0],
    jointKind: 'FIXED',
    jointAxis: null,
  },
  {
    id: 'SOCKET_BAT',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['BATTERY_2S'],
    position: [0.0, 0.16, -0.35],
    rotation: [0, 0, 0],
    jointKind: 'FIXED',
    jointAxis: null,
  },
  {
    id: 'SOCKET_HIP_FL',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['SERVO_MG90S'],
    position: [-0.55, 0.0, 0.65],
    rotation: [0, -QUARTER_PI, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Y,
  },
  {
    id: 'SOCKET_HIP_FR',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['SERVO_MG90S'],
    position: [0.55, 0.0, 0.65],
    rotation: [0, QUARTER_PI, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Y,
  },
  {
    id: 'SOCKET_HIP_BL',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['SERVO_MG90S'],
    position: [-0.55, 0.0, -0.65],
    rotation: [0, -THREE_QUARTER_PI, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Y,
  },
  {
    id: 'SOCKET_HIP_BR',
    hostPartType: 'CHASSIS_BASE',
    allowedTypes: ['SERVO_MG90S'],
    position: [0.55, 0.0, -0.65],
    rotation: [0, THREE_QUARTER_PI, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Y,
  },
];

export const SERVO_SOCKETS: readonly SocketDefinition[] = [
  {
    id: 'SOCKET_SERVO_HORN',
    hostPartType: 'SERVO_MG90S',
    allowedTypes: ['LEG_TIBIA'],
    position: [0.0, 0.18, 0.0],
    rotation: [0, 0, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Y,
  },
];

export const COXA_SOCKETS: readonly SocketDefinition[] = [
  {
    id: 'SOCKET_COXA_DISTAL',
    hostPartType: 'LEG_COXA',
    allowedTypes: ['SERVO_MG90S'],
    position: [0.25, 0.0, 0.0],
    rotation: [HALF_PI, 0, 0],
    jointKind: 'REVOLUTE',
    jointAxis: AXIS_Z,
  },
];

export const SOCKETS_BY_PART: Readonly<Record<PartType, readonly SocketDefinition[]>> = {
  CHASSIS_BASE: CHASSIS_SOCKETS,
  ESP32_DEVKIT: [],
  BATTERY_2S: [],
  SERVO_MG90S: SERVO_SOCKETS,
  LEG_COXA: COXA_SOCKETS,
  LEG_TIBIA: [],
  OBSTACLE_BLOCK: [],
  TARGET_ZONE: [],
};

const PIN_RED = '#ef4444';
const PIN_BLACK = '#1f2937';
const PIN_YELLOW = '#eab308';
const PIN_ORANGE = '#f97316';

export const ESP32_PINS: readonly PinDefinition[] = [
  { id: 'ESP_VIN', hostPartType: 'ESP32_DEVKIT', label: '5V / VIN', role: 'POWER', position: [-0.12, 0.05, 0.24], color: PIN_RED, gpio: null },
  { id: 'ESP_GND', hostPartType: 'ESP32_DEVKIT', label: 'GND', role: 'GROUND', position: [-0.12, 0.05, 0.18], color: PIN_BLACK, gpio: null },
  { id: 'ESP_D13', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 13', role: 'PWM', position: [-0.12, 0.05, 0.1], color: PIN_YELLOW, gpio: 13 },
  { id: 'ESP_D12', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 12', role: 'PWM', position: [-0.12, 0.05, 0.04], color: PIN_YELLOW, gpio: 12 },
  { id: 'ESP_D14', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 14', role: 'PWM', position: [-0.12, 0.05, -0.02], color: PIN_YELLOW, gpio: 14 },
  { id: 'ESP_D27', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 27', role: 'PWM', position: [-0.12, 0.05, -0.08], color: PIN_YELLOW, gpio: 27 },
  { id: 'ESP_D26', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 26', role: 'PWM', position: [0.12, 0.05, 0.1], color: PIN_YELLOW, gpio: 26 },
  { id: 'ESP_D25', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 25', role: 'PWM', position: [0.12, 0.05, 0.04], color: PIN_YELLOW, gpio: 25 },
  { id: 'ESP_D33', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 33', role: 'PWM', position: [0.12, 0.05, -0.02], color: PIN_YELLOW, gpio: 33 },
  { id: 'ESP_D32', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 32', role: 'PWM', position: [0.12, 0.05, -0.08], color: PIN_YELLOW, gpio: 32 },
];

export const SERVO_PINS: readonly PinDefinition[] = [
  { id: 'SERVO_PWM', hostPartType: 'SERVO_MG90S', label: 'PWM', role: 'PWM', position: [0.0, -0.1, -0.08], color: PIN_ORANGE, gpio: null },
  { id: 'SERVO_VCC', hostPartType: 'SERVO_MG90S', label: 'VCC', role: 'POWER', position: [0.0, -0.1, -0.06], color: PIN_RED, gpio: null },
  { id: 'SERVO_GND', hostPartType: 'SERVO_MG90S', label: 'GND', role: 'GROUND', position: [0.0, -0.1, -0.04], color: PIN_BLACK, gpio: null },
];

export const PINS_BY_PART: Readonly<Record<PartType, readonly PinDefinition[]>> = {
  CHASSIS_BASE: [],
  ESP32_DEVKIT: ESP32_PINS,
  BATTERY_2S: [],
  SERVO_MG90S: SERVO_PINS,
  LEG_COXA: [],
  LEG_TIBIA: [],
  OBSTACLE_BLOCK: [],
  TARGET_ZONE: [],
};

/** Floor-contact point of LEG_TIBIA in local space. */
export const TIBIA_FOOT_TIP: Vector3Tuple = [0.6, -0.15, 0.0];

export function findPinDefinition(partType: PartType, pinId: string): PinDefinition | undefined {
  return PINS_BY_PART[partType].find((pin) => pin.id === pinId);
}
