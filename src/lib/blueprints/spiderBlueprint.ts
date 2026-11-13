import {
  CHASSIS_ASSEMBLY_WORKING_Y,
  PART_CATALOG,
} from '@/lib/constants/hardwareCatalog';
import { buildSpiderPresets } from '@/lib/snapshot/presets';
import type {
  PartType,
  RobotBlueprintConfig,
  SocketDefinition,
  Vector3Tuple,
} from '@/types/simulator';

const QUARTER_PI = Math.PI / 4;
const THREE_QUARTER_PI = (3 * Math.PI) / 4;
const HALF_PI = Math.PI / 2;

const AXIS_Y: Vector3Tuple = [0, 1, 0];
const AXIS_Z: Vector3Tuple = [0, 0, 1];

function normalizeAxis(x: number, y: number, z: number): Vector3Tuple {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Compound revolute axis for 4-servo single-DOF corner hip servos.
 * Primary Y-axis [0, 1, 0] tilted ~18 deg outward/pitch ([±0.3, ±1, ±0.3] normalized):
 * - Left corners (FL, BL): [-0.3, 1, 0.3] normalized -> +angle swings leg forward (+Z) AND lifts foot (+Y);
 *   -angle sweeps leg backward (-Z) AND presses foot down (-Y) into the floor for traction.
 * - Right corners (FR, BR): [-0.3, -1, -0.3] normalized -> +angle swings leg forward (+Z) AND lifts foot (+Y);
 *   -angle sweeps leg backward (-Z) AND presses foot down (-Y) into the floor for traction.
 */
export const SPIDER_HIP_REVOLUTE_AXES: Readonly<Partial<Record<SocketDefinition['id'], Vector3Tuple>>> = {
  SOCKET_HIP_FL: normalizeAxis(-0.3, 1, 0.3),
  SOCKET_HIP_BL: normalizeAxis(-0.3, 1, 0.3),
  SOCKET_HIP_FR: normalizeAxis(-0.3, -1, -0.3),
  SOCKET_HIP_BR: normalizeAxis(-0.3, -1, -0.3),
};

export const SPIDER_CHASSIS_DIMENSIONS: Vector3Tuple = PART_CATALOG.CHASSIS_BASE.dimensions;
export const SPIDER_CHASSIS_HALF_WIDTH = SPIDER_CHASSIS_DIMENSIONS[0] / 2;
export const SPIDER_CHASSIS_HALF_HEIGHT = SPIDER_CHASSIS_DIMENSIONS[1] / 2;
export const SPIDER_CHASSIS_HALF_DEPTH = SPIDER_CHASSIS_DIMENSIONS[2] / 2;
export const SPIDER_CHASSIS_COLLIDER_HALF_EXTENTS: Vector3Tuple = [
  SPIDER_CHASSIS_HALF_WIDTH,
  SPIDER_CHASSIS_HALF_HEIGHT,
  SPIDER_CHASSIS_HALF_DEPTH,
];

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

export const SPIDER_CHASSIS_SOCKETS: readonly SocketDefinition[] = [
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

export const SPIDER_SERVO_SOCKETS: readonly SocketDefinition[] = [
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

export const SPIDER_COXA_SOCKETS: readonly SocketDefinition[] = [
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

export const SPIDER_SOCKETS_BY_PART: Readonly<Record<PartType, readonly SocketDefinition[]>> = {
  CHASSIS_BASE: SPIDER_CHASSIS_SOCKETS,
  ESP32_DEVKIT: [],
  BATTERY_2S: [],
  SERVO_MG90S: SPIDER_SERVO_SOCKETS,
  LEG_COXA: SPIDER_COXA_SOCKETS,
  LEG_TIBIA: [],
  OBSTACLE_BLOCK: [],
  TARGET_ZONE: [],
};

export const SPIDER_PRESETS = buildSpiderPresets(
  SPIDER_SOCKETS_BY_PART,
  SPIDER_CHASSIS_HALF_HEIGHT,
  CHASSIS_ASSEMBLY_WORKING_Y,
);

export const SPIDER_BLUEPRINT: RobotBlueprintConfig = {
  id: 'spider',
  name: 'Quadruped Spider (4-Leg / 8-DOF)',
  chassisDimensions: SPIDER_CHASSIS_DIMENSIONS,
  chassisAssemblyWorkingY: CHASSIS_ASSEMBLY_WORKING_Y,
  sockets: SPIDER_SOCKETS_BY_PART,
  defaultInventoryCounts: SPIDER_BILL_OF_MATERIALS,
  presets: SPIDER_PRESETS,
};

