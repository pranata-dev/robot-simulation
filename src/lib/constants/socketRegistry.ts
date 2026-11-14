import {
  ALL_ROBOT_BLUEPRINTS,
  ROBOT_BLUEPRINTS,
  getRobotBlueprint,
} from '@/lib/blueprints/blueprintRegistry';
import {
  SPIDER_BATTERY_MOUNT_OFFSET,
  SPIDER_BILL_OF_MATERIALS,
  SPIDER_CHASSIS_COLLIDER_HALF_EXTENTS,
  SPIDER_CHASSIS_DIMENSIONS,
  SPIDER_CHASSIS_HALF_DEPTH,
  SPIDER_CHASSIS_HALF_HEIGHT,
  SPIDER_CHASSIS_HALF_WIDTH,
  SPIDER_CHASSIS_SOCKETS,
  SPIDER_CHASSIS_WORKING_Y,
  SPIDER_COXA_SOCKETS,
  SPIDER_FOOT_RADIUS,
  SPIDER_FOOT_TIP_LOCAL,
  SPIDER_HIP_REVOLUTE_AXES,
  SPIDER_LEG_HINGE_OFFSET,
  SPIDER_SERVO_HORN_OFFSET,
  SPIDER_SERVO_SOCKETS,
  SPIDER_SOCKETS_BY_PART,
} from '@/lib/blueprints/spiderBlueprint';
import {
  CHASSIS_ASSEMBLY_WORKING_Y,
  ESP32_PINS,
  PART_CATALOG,
  PART_TYPES,
  PINS_BY_PART,
  SERVO_PINS,
  TIBIA_FOOT_TIP,
  findPinDefinition,
  getWireColorForPinRole,
} from '@/lib/constants/hardwareCatalog';
import type {
  BuiltInPreset,
  PartType,
  RobotBlueprintConfig,
  RobotBlueprintId,
  SocketDefinition,
  Vector3Tuple,
} from '@/types/simulator';

export {
  ALL_ROBOT_BLUEPRINTS,
  CHASSIS_ASSEMBLY_WORKING_Y,
  ESP32_PINS,
  PART_CATALOG,
  PART_TYPES,
  PINS_BY_PART,
  ROBOT_BLUEPRINTS,
  SERVO_PINS,
  SPIDER_BATTERY_MOUNT_OFFSET,
  SPIDER_BILL_OF_MATERIALS,
  SPIDER_CHASSIS_WORKING_Y,
  SPIDER_FOOT_RADIUS,
  SPIDER_FOOT_TIP_LOCAL,
  SPIDER_HIP_REVOLUTE_AXES,
  SPIDER_LEG_HINGE_OFFSET,
  SPIDER_SERVO_HORN_OFFSET,
  TIBIA_FOOT_TIP,
  findPinDefinition,
  getWireColorForPinRole,
};

/** Default spider constants re-exported for legacy direct imports. */
export const CHASSIS_DIMENSIONS = SPIDER_CHASSIS_DIMENSIONS;
export const CHASSIS_HALF_WIDTH = SPIDER_CHASSIS_HALF_WIDTH;
export const CHASSIS_HALF_HEIGHT = SPIDER_CHASSIS_HALF_HEIGHT;
export const CHASSIS_HALF_DEPTH = SPIDER_CHASSIS_HALF_DEPTH;
export const CHASSIS_COLLIDER_HALF_EXTENTS = SPIDER_CHASSIS_COLLIDER_HALF_EXTENTS;
export const BATTERY_MOUNT_OFFSET = SPIDER_BATTERY_MOUNT_OFFSET;
export const CHASSIS_SOCKETS = SPIDER_CHASSIS_SOCKETS;
export const SERVO_SOCKETS = SPIDER_SERVO_SOCKETS;
export const COXA_SOCKETS = SPIDER_COXA_SOCKETS;
export const SOCKETS_BY_PART = SPIDER_SOCKETS_BY_PART;

let readActiveBlueprintId: () => RobotBlueprintId = () => 'spider';

/**
 * Connects `socketRegistry` to `useSimulationStore`'s `activeBlueprintId` without introducing
 * a static circular module import between store and registry.
 */
export function registerActiveBlueprintIdReader(reader: () => RobotBlueprintId): void {
  readActiveBlueprintId = reader;
}

export function getActiveBlueprintId(): RobotBlueprintId {
  try {
    return readActiveBlueprintId();
  } catch {
    return 'spider';
  }
}

export function getActiveBlueprint(blueprintId?: RobotBlueprintId): RobotBlueprintConfig {
  return getRobotBlueprint(blueprintId ?? getActiveBlueprintId());
}

export function getActiveChassisDimensions(blueprintId?: RobotBlueprintId): Vector3Tuple {
  return getActiveBlueprint(blueprintId).chassisDimensions;
}

export function getActiveChassisHalfHeight(blueprintId?: RobotBlueprintId): number {
  return getActiveBlueprint(blueprintId).chassisDimensions[1] / 2;
}

export function getActiveChassisAssemblyWorkingY(blueprintId?: RobotBlueprintId): number {
  return getActiveBlueprint(blueprintId).chassisAssemblyWorkingY;
}

export function getActiveSocketsByPart(
  blueprintId?: RobotBlueprintId,
): Readonly<Record<PartType, readonly SocketDefinition[]>> {
  return getActiveBlueprint(blueprintId).sockets;
}

export function getSocketsForPart(
  partType: PartType,
  blueprintId?: RobotBlueprintId,
): readonly SocketDefinition[] {
  return getActiveBlueprint(blueprintId).sockets[partType];
}

export function getActiveDefaultInventoryCounts(
  blueprintId?: RobotBlueprintId,
): Readonly<Record<PartType, number>> {
  return getActiveBlueprint(blueprintId).defaultInventoryCounts;
}

export function getActivePresets(blueprintId?: RobotBlueprintId): readonly BuiltInPreset[] {
  return getActiveBlueprint(blueprintId).presets;
}

export function findActivePresetById(
  presetId: string,
  blueprintId?: RobotBlueprintId,
): BuiltInPreset | undefined {
  return getActivePresets(blueprintId).find((preset) => preset.id === presetId);
}

export {
  FOOT_GROUND_CLEARANCE,
  TIBIA_FOOT_RADIUS,
} from '@/lib/constants/hardwareCatalog';
