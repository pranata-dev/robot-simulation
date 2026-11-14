import type {
  PartCatalogEntry,
  PartType,
  PinDefinition,
  PinRole,
  Vector3Tuple,
} from '@/types/simulator';

/** Source of truth: docs/3d_asset_socket_coordinate_map.md (1 unit = 10 cm). */

export const POWER_LIPO_BATTERY_ID = 'power_lipo_battery';
export const BATTERY_PACK_MASS = 0.15;

export const PART_TYPES: readonly PartType[] = [
  'CHASSIS_BASE',
  'ESP32_DEVKIT',
  'BATTERY_2S',
  'SERVO_MG90S',
  'LEG_COXA',
  'LEG_TIBIA',
  'ULTRASONIC_HCSR04',
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
    pins: [
      'ESP_VIN',
      'ESP_GND',
      'ESP_D13',
      'ESP_D12',
      'ESP_D14',
      'ESP_D27',
      'ESP_D26',
      'ESP_D25',
      'ESP_D33',
      'ESP_D32',
    ],
  },
  BATTERY_2S: {
    type: 'BATTERY_2S',
    label: 'LiPo Battery Pack',
    dimensions: [0.35, 0.18, 0.7],
    mass: BATTERY_PACK_MASS,
    pins: ['VCC_OUT', 'GND_OUT'],
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
  ULTRASONIC_HCSR04: {
    type: 'ULTRASONIC_HCSR04',
    label: 'Ultrasonic Sensor HC-SR04',
    dimensions: [0.45, 0.2, 0.15],
    mass: 0.01,
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

/** Servo horn (leg pivot) height above the servo body origin. */
export const SERVO_HORN_TOP_Y = 0.18;
/** Local centre of the distal tibia foot sphere, relative to the leg's servo-horn origin. */
export const TIBIA_FOOT_TIP: Vector3Tuple = [0.0, -0.76, 0.52];
/** Radius of the rubber foot sphere (mesh and BallCollider share this value). */
export const TIBIA_FOOT_RADIUS = 0.06;
/** Gap between the bottom of every foot sphere and the floor (y = 0) in assembly mode. */
export const FOOT_GROUND_CLEARANCE = 0.03;

/**
 * Chassis centre height that rests all four foot-sphere bottoms at y = FOOT_GROUND_CLEARANCE:
 * chassisY + hornY + footTipY - footRadius = clearance  ->  0.03 + 0.06 + 0.76 - 0.18 = 0.67.
 */
export const CHASSIS_ASSEMBLY_WORKING_Y =
  FOOT_GROUND_CLEARANCE + TIBIA_FOOT_RADIUS - TIBIA_FOOT_TIP[1] - SERVO_HORN_TOP_Y;

const PIN_RED = '#ef4444';
const PIN_SLATE = '#475569';
const PIN_YELLOW = '#eab308';
const PIN_AMBER = '#f59e0b';
const PIN_SKY = '#38bdf8';
const PIN_GREEN = '#22c55e';
const WIRE_GROUND_COLOR = '#1c1917';

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

/** 4-pin header on the top rear edge of the HC-SR04 ultrasonic rangefinder module. */
export const ULTRASONIC_PINS: readonly PinDefinition[] = [
  { id: 'US_VCC', hostPartType: 'ULTRASONIC_HCSR04', label: 'VCC', role: 'POWER', position: [-0.09, 0.14, -0.055], color: PIN_RED, gpio: null },
  { id: 'US_TRIG', hostPartType: 'ULTRASONIC_HCSR04', label: 'TRIG', role: 'PWM', position: [-0.03, 0.14, -0.055], color: PIN_SKY, gpio: null },
  { id: 'US_ECHO', hostPartType: 'ULTRASONIC_HCSR04', label: 'ECHO', role: 'PWM', position: [0.03, 0.14, -0.055], color: PIN_GREEN, gpio: null },
  { id: 'US_GND', hostPartType: 'ULTRASONIC_HCSR04', label: 'GND', role: 'GROUND', position: [0.09, 0.14, -0.055], color: PIN_SLATE, gpio: null },
];

/** 2S LiPo XT60 power output leads on the front (+Z) end of the battery pack. */
export const BATTERY_PINS: readonly PinDefinition[] = [
  { id: 'VCC_OUT', hostPartType: 'BATTERY_2S', label: 'VCC_OUT', role: 'POWER', position: [0.035, 0.027, 0.425], color: PIN_RED, gpio: null },
  { id: 'GND_OUT', hostPartType: 'BATTERY_2S', label: 'GND_OUT', role: 'GROUND', position: [0.085, 0.027, 0.425], color: PIN_SLATE, gpio: null },
];

export const PINS_BY_PART: Readonly<Record<PartType, readonly PinDefinition[]>> = {
  CHASSIS_BASE: [],
  ESP32_DEVKIT: ESP32_PINS,
  BATTERY_2S: BATTERY_PINS,
  SERVO_MG90S: SERVO_PINS,
  LEG_COXA: [],
  LEG_TIBIA: [],
  ULTRASONIC_HCSR04: ULTRASONIC_PINS,
  OBSTACLE_BLOCK: [],
  TARGET_ZONE: [],
};

export function findPinDefinition(partType: PartType, pinId: string): PinDefinition | undefined {
  const direct = PINS_BY_PART[partType].find((pin) => pin.id === pinId);
  if (direct) return direct;

  if (partType === 'ESP32_DEVKIT') {
    const upper = pinId.toUpperCase();
    if (upper === 'VIN' || upper === '5V') return ESP32_PINS[0];
    if (upper === 'GND') return ESP32_PINS[1];
  }

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

