import type {
  PartCatalogEntry,
  PartType,
  PinDefinition,
  PinRole,
  Vector3Tuple,
} from '@/types/simulator';

/** Source of truth: docs/3d_asset_socket_coordinate_map.md (1 unit = 10 cm). */

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

export const CHASSIS_ASSEMBLY_WORKING_Y = 0.5;
export const TIBIA_FOOT_TIP: Vector3Tuple = [0.6, -0.15, 0.0];

const PIN_RED = '#ef4444';
const PIN_SLATE = '#475569';
const PIN_YELLOW = '#eab308';
const PIN_AMBER = '#f59e0b';
const WIRE_GROUND_COLOR = '#334155';

export const ESP32_PINS: readonly PinDefinition[] = [
  { id: 'ESP_VIN', hostPartType: 'ESP32_DEVKIT', label: '5V / VIN', role: 'POWER', position: [-0.12, 0.05, 0.24], color: PIN_RED, gpio: null },
  { id: 'ESP_GND', hostPartType: 'ESP32_DEVKIT', label: 'GND', role: 'GROUND', position: [-0.12, 0.05, 0.18], color: PIN_SLATE, gpio: null },
  { id: 'ESP_D13', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 13', role: 'PWM', position: [-0.12, 0.05, 0.1], color: PIN_YELLOW, gpio: 13 },
  { id: 'ESP_D12', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 12', role: 'PWM', position: [-0.12, 0.05, 0.04], color: PIN_YELLOW, gpio: 12 },
  { id: 'ESP_D14', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 14', role: 'PWM', position: [-0.12, 0.05, -0.02], color: PIN_YELLOW, gpio: 14 },
  { id: 'ESP_D27', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 27', role: 'PWM', position: [-0.12, 0.05, -0.08], color: PIN_YELLOW, gpio: 27 },
  { id: 'ESP_D26', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 26', role: 'PWM', position: [0.12, 0.05, 0.1], color: PIN_YELLOW, gpio: 26 },
  { id: 'ESP_D25', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 25', role: 'PWM', position: [0.12, 0.05, 0.04], color: PIN_YELLOW, gpio: 25 },
  { id: 'ESP_D33', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 33', role: 'PWM', position: [0.12, 0.05, -0.02], color: PIN_YELLOW, gpio: 33 },
  { id: 'ESP_D32', hostPartType: 'ESP32_DEVKIT', label: 'GPIO 32', role: 'PWM', position: [0.12, 0.05, -0.08], color: PIN_YELLOW, gpio: 32 },
];

/** 3-pin header offset cleanly on the upper inward ridge (-Z) away from the chassis deck and rotating horn/leg. */
export const SERVO_PINS: readonly PinDefinition[] = [
  { id: 'SERVO_PWM', hostPartType: 'SERVO_MG90S', label: 'PWM', role: 'PWM', position: [-0.08, 0.125, -0.105], color: PIN_AMBER, gpio: null },
  { id: 'SERVO_VCC', hostPartType: 'SERVO_MG90S', label: 'VCC', role: 'POWER', position: [0.0, 0.125, -0.105], color: PIN_RED, gpio: null },
  { id: 'SERVO_GND', hostPartType: 'SERVO_MG90S', label: 'GND', role: 'GROUND', position: [0.08, 0.125, -0.105], color: PIN_SLATE, gpio: null },
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

export function findPinDefinition(partType: PartType, pinId: string): PinDefinition | undefined {
  const direct = PINS_BY_PART[partType].find((pin) => pin.id === pinId);
  if (direct) return direct;

  if (partType === 'SERVO_MG90S') {
    const upper = pinId.toUpperCase();
    if (upper.endsWith('_PWM')) return SERVO_PINS[0];
    if (upper.endsWith('_VCC')) return SERVO_PINS[1];
    if (upper.endsWith('_GND')) return SERVO_PINS[2];
  }
  return undefined;
}

export function getWireColorForPinRole(role: PinRole): string {
  switch (role) {
    case 'POWER':
      return PIN_RED;
    case 'GROUND':
      return WIRE_GROUND_COLOR;
    case 'PWM':
      return PIN_AMBER;
  }
}

