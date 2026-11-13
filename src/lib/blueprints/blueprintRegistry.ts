import { SPIDER_BLUEPRINT } from '@/lib/blueprints/spiderBlueprint';
import type { RobotBlueprintConfig, RobotBlueprintId } from '@/types/simulator';

export const ROBOT_BLUEPRINTS: Readonly<Record<RobotBlueprintId, RobotBlueprintConfig>> = {
  spider: SPIDER_BLUEPRINT,
};

export const ALL_ROBOT_BLUEPRINTS: readonly RobotBlueprintConfig[] =
  Object.values(ROBOT_BLUEPRINTS);

export function getRobotBlueprint(blueprintId: RobotBlueprintId): RobotBlueprintConfig {
  return ROBOT_BLUEPRINTS[blueprintId];
}

