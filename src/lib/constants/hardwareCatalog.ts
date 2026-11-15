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
export const ROLLING_SOLID_RADIUS = 0.25;
export const ROLLING_CYLINDER_HALF_WIDTH = 0.2;
export const SEESAW_BEAM_LENGTH = 3.0;
export const SEESAW_BEAM_HALF_HEIGHT = 0.04;
export const SEESAW_BEAM_HALF_DEPTH = 0.35;
export const SEESAW_PIVOT_Y = 0.65;
export const DEFAULT_PHYSICS_LAUNCH_SPEED = 4.0;

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
  'physics_inclined_ramp',
  'physics_solid_sphere',
  'physics_solid_cylinder',
  'physics_hollow_cylinder',
  'physics_collision_puck',
  'physics_seesaw_beam',
  'pivot_anchor',
  'pendulum_bob',
  'helical_spring_mass',
  'dc_power_supply',
  'breadboard_base',
  'resistor_component',
  'potentiometer_rheostat',
  'galvanometer_ammeter',
  'laser_emitter',
  'plane_mirror',
  'convex_lens',
  'concave_lens',
  'glass_prism',
  'optical_target_screen',
] as const;

export const PART_CATALOG: Readonly<Record<PartType, PartCatalogEntry>> = {
  CHASSIS_BASE: {
    type: 'CHASSIS_BASE',
    label: 'Main Spider Chassis',
    category: 'robotics',
    dimensions: [1.2, 0.15, 1.6],
    mass: 0.15,
    collisionLayer: 'robot_part',
  },
  ESP32_DEVKIT: {
    type: 'ESP32_DEVKIT',
    label: 'ESP32 Microcontroller',
    category: 'robotics',
    dimensions: [0.28, 0.08, 0.55],
    mass: 0.02,
    collisionLayer: 'robot_part',
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
    category: 'robotics',
    dimensions: [0.35, 0.18, 0.7],
    mass: BATTERY_PACK_MASS,
    collisionLayer: 'robot_part',
    pins: ['VCC_OUT', 'GND_OUT'],
  },
  SERVO_MG90S: {
    type: 'SERVO_MG90S',
    label: 'Micro Servo MG90S',
    category: 'robotics',
    dimensions: [0.22, 0.28, 0.12],
    mass: 0.014,
    collisionLayer: 'robot_part',
  },
  LEG_COXA: {
    type: 'LEG_COXA',
    label: 'Coxa Bracket',
    category: 'robotics',
    dimensions: [0.3, 0.15, 0.2],
    mass: 0.01,
    collisionLayer: 'robot_part',
  },
  LEG_TIBIA: {
    type: 'LEG_TIBIA',
    label: 'Spider Leg',
    category: 'robotics',
    dimensions: [0.65, 0.12, 0.12],
    mass: 0.02,
    collisionLayer: 'robot_part',
  },
  ULTRASONIC_HCSR04: {
    type: 'ULTRASONIC_HCSR04',
    label: 'Ultrasonic Sensor HC-SR04',
    category: 'robotics',
    dimensions: [0.45, 0.2, 0.15],
    mass: 0.01,
    collisionLayer: 'robot_part',
  },
  OBSTACLE_BLOCK: {
    type: 'OBSTACLE_BLOCK',
    label: 'Obstacle Block',
    category: 'shared',
    dimensions: [0.8, 0.35, 0.5],
    mass: 0,
    collisionLayer: 'environment',
    defaultFriction: 0.9,
    defaultRestitution: 0,
  },
  TARGET_ZONE: {
    type: 'TARGET_ZONE',
    label: 'Target Zone Pad',
    category: 'shared',
    dimensions: [1.8, 0.03, 1.2],
    mass: 0,
    collisionLayer: 'environment',
    defaultFriction: 0.8,
    defaultRestitution: 0,
  },
  physics_inclined_ramp: {
    type: 'physics_inclined_ramp',
    label: 'Inclined Plane Ramp',
    category: 'physics',
    dimensions: [5.4, 1.6, 2.5],
    mass: 0,
    collisionLayer: 'environment',
    defaultFriction: 0.6,
    defaultRestitution: 0.05,
  },
  physics_solid_sphere: {
    type: 'physics_solid_sphere',
    label: 'Solid Sphere (2/5 mR², 1 kg)',
    category: 'physics',
    dimensions: [ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2],
    mass: 1.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.6,
    defaultRestitution: 0.2,
  },
  physics_solid_cylinder: {
    type: 'physics_solid_cylinder',
    label: 'Solid Cylinder (1/2 mR², 1 kg)',
    category: 'physics',
    dimensions: [ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2, ROLLING_CYLINDER_HALF_WIDTH * 2],
    mass: 1.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.6,
    defaultRestitution: 0.2,
  },
  physics_hollow_cylinder: {
    type: 'physics_hollow_cylinder',
    label: 'Hollow Cylinder (mR², 1 kg)',
    category: 'physics',
    dimensions: [ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2, ROLLING_CYLINDER_HALF_WIDTH * 2],
    mass: 1.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.6,
    defaultRestitution: 0.2,
  },
  physics_collision_puck: {
    type: 'physics_collision_puck',
    label: 'Collision Sphere (2 kg)',
    category: 'physics',
    dimensions: [ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2, ROLLING_SOLID_RADIUS * 2],
    mass: 2.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.15,
    defaultRestitution: 0.8,
  },
  physics_seesaw_beam: {
    type: 'physics_seesaw_beam',
    label: 'Torque Seesaw Fulcrum',
    category: 'physics',
    dimensions: [SEESAW_BEAM_LENGTH, SEESAW_PIVOT_Y + SEESAW_BEAM_HALF_HEIGHT, SEESAW_BEAM_HALF_DEPTH * 2],
    mass: 0,
    collisionLayer: 'environment',
    defaultFriction: 0.85,
    defaultRestitution: 0.05,
  },
  pivot_anchor: {
    type: 'pivot_anchor',
    label: 'Oscillator Pivot Stand',
    category: 'physics',
    dimensions: [0.5, 0.3, 0.5],
    mass: 0,
    collisionLayer: 'environment',
    defaultFriction: 0.5,
    defaultRestitution: 0.1,
  },
  pendulum_bob: {
    type: 'pendulum_bob',
    label: 'Pendulum Bob (Sphere)',
    category: 'physics',
    dimensions: [0.5, 0.5, 0.5],
    mass: 1.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.1,
    defaultRestitution: 0.2,
  },
  helical_spring_mass: {
    type: 'helical_spring_mass',
    label: 'Helical Spring Mass',
    category: 'physics',
    dimensions: [0.55, 0.55, 0.55],
    mass: 1.0,
    collisionLayer: 'free_body',
    defaultFriction: 0.2,
    defaultRestitution: 0.1,
  },
  dc_power_supply: {
    type: 'dc_power_supply',
    label: 'DC Power Supply (Vs)',
    category: 'physics',
    dimensions: [1.5, 0.85, 0.95],
    mass: 0,
    collisionLayer: 'environment',
    pins: ['DC_POS', 'DC_NEG'],
  },
  breadboard_base: {
    type: 'breadboard_base',
    label: '400-Tie Breadboard',
    category: 'physics',
    dimensions: [2.3, 0.14, 1.4],
    mass: 0,
    collisionLayer: 'environment',
    pins: ['BB_POS', 'BB_NEG', 'BB_A', 'BB_B', 'BB_C', 'BB_D'],
  },
  resistor_component: {
    type: 'resistor_component',
    label: 'Precision Resistor',
    category: 'physics',
    dimensions: [0.8, 0.2, 0.22],
    mass: 0,
    collisionLayer: 'environment',
    pins: ['RES_1', 'RES_2'],
  },
  potentiometer_rheostat: {
    type: 'potentiometer_rheostat',
    label: 'Rheostat Potentiometer',
    category: 'physics',
    dimensions: [0.7, 0.4, 0.7],
    mass: 0,
    collisionLayer: 'environment',
    pins: ['POT_1', 'POT_2'],
  },
  galvanometer_ammeter: {
    type: 'galvanometer_ammeter',
    label: 'Bridge Galvanometer',
    category: 'physics',
    dimensions: [1.05, 0.8, 0.85],
    mass: 0,
    collisionLayer: 'environment',
    pins: ['GALV_POS', 'GALV_NEG'],
  },
  laser_emitter: {
    type: 'laser_emitter',
    label: '632nm He-Ne Laser',
    category: 'physics',
    dimensions: [1.2, 0.65, 0.5],
    mass: 0,
    collisionLayer: 'environment',
  },
  plane_mirror: {
    type: 'plane_mirror',
    label: 'Plane Front Mirror',
    category: 'physics',
    dimensions: [0.16, 1.2, 1.4],
    mass: 0,
    collisionLayer: 'environment',
  },
  convex_lens: {
    type: 'convex_lens',
    label: 'Convex Converging Lens',
    category: 'physics',
    dimensions: [0.24, 1.2, 1.3],
    mass: 0,
    collisionLayer: 'environment',
  },
  concave_lens: {
    type: 'concave_lens',
    label: 'Concave Diverging Lens',
    category: 'physics',
    dimensions: [0.24, 1.2, 1.3],
    mass: 0,
    collisionLayer: 'environment',
  },
  glass_prism: {
    type: 'glass_prism',
    label: '60° Equilateral Prism',
    category: 'physics',
    dimensions: [1.1, 1.0, 1.1],
    mass: 0,
    collisionLayer: 'environment',
  },
  optical_target_screen: {
    type: 'optical_target_screen',
    label: 'Optical Target Screen',
    category: 'physics',
    dimensions: [0.2, 1.25, 1.5],
    mass: 0,
    collisionLayer: 'environment',
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

export const DC_SUPPLY_PINS: readonly PinDefinition[] = [
  { id: 'DC_POS', hostPartType: 'dc_power_supply', label: '+Vs (Red)', role: 'POWER', position: [0.35, 0.25, 0.49], color: PIN_RED, gpio: null },
  { id: 'DC_NEG', hostPartType: 'dc_power_supply', label: 'GND (Black)', role: 'GROUND', position: [0.56, 0.25, 0.49], color: PIN_SLATE, gpio: null },
];

export const BREADBOARD_PINS: readonly PinDefinition[] = [
  { id: 'BB_POS', hostPartType: 'breadboard_base', label: '+V Rail', role: 'POWER', position: [-0.88, 0.12, -0.45], color: PIN_RED, gpio: null },
  { id: 'BB_NEG', hostPartType: 'breadboard_base', label: 'GND Rail', role: 'GROUND', position: [-0.88, 0.12, 0.45], color: PIN_SLATE, gpio: null },
  { id: 'BB_A', hostPartType: 'breadboard_base', label: 'Node A (Top)', role: 'TERMINAL', position: [0.0, 0.12, -0.45], color: PIN_AMBER, gpio: null },
  { id: 'BB_B', hostPartType: 'breadboard_base', label: 'Node B (Left)', role: 'TERMINAL', position: [-0.48, 0.12, 0.0], color: PIN_SKY, gpio: null },
  { id: 'BB_C', hostPartType: 'breadboard_base', label: 'Node C (Bot)', role: 'TERMINAL', position: [0.0, 0.12, 0.45], color: PIN_SLATE, gpio: null },
  { id: 'BB_D', hostPartType: 'breadboard_base', label: 'Node D (Right)', role: 'TERMINAL', position: [0.48, 0.12, 0.0], color: '#a855f7', gpio: null },
];

export const RESISTOR_PINS: readonly PinDefinition[] = [
  { id: 'RES_1', hostPartType: 'resistor_component', label: 'Lead 1', role: 'TERMINAL', position: [-0.36, 0.09, 0.0], color: PIN_AMBER, gpio: null },
  { id: 'RES_2', hostPartType: 'resistor_component', label: 'Lead 2', role: 'TERMINAL', position: [0.36, 0.09, 0.0], color: PIN_AMBER, gpio: null },
];

export const POTENTIOMETER_PINS: readonly PinDefinition[] = [
  { id: 'POT_1', hostPartType: 'potentiometer_rheostat', label: 'Term A', role: 'TERMINAL', position: [-0.22, 0.14, 0.34], color: PIN_YELLOW, gpio: null },
  { id: 'POT_2', hostPartType: 'potentiometer_rheostat', label: 'Wiper B', role: 'TERMINAL', position: [0.22, 0.14, 0.34], color: PIN_SKY, gpio: null },
];

export const GALVANOMETER_PINS: readonly PinDefinition[] = [
  { id: 'GALV_POS', hostPartType: 'galvanometer_ammeter', label: 'Galv +', role: 'TERMINAL', position: [-0.25, 0.12, 0.44], color: PIN_RED, gpio: null },
  { id: 'GALV_NEG', hostPartType: 'galvanometer_ammeter', label: 'Galv -', role: 'TERMINAL', position: [0.25, 0.12, 0.44], color: PIN_SLATE, gpio: null },
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
  physics_inclined_ramp: [],
  physics_solid_sphere: [],
  physics_solid_cylinder: [],
  physics_hollow_cylinder: [],
  physics_collision_puck: [],
  physics_seesaw_beam: [],
  pivot_anchor: [],
  pendulum_bob: [],
  helical_spring_mass: [],
  dc_power_supply: DC_SUPPLY_PINS,
  breadboard_base: BREADBOARD_PINS,
  resistor_component: RESISTOR_PINS,
  potentiometer_rheostat: POTENTIOMETER_PINS,
  galvanometer_ammeter: GALVANOMETER_PINS,
  laser_emitter: [],
  plane_mirror: [],
  convex_lens: [],
  concave_lens: [],
  glass_prism: [],
  optical_target_screen: [],
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
    case 'TERMINAL':
      return PIN_SKY;
  }
}

