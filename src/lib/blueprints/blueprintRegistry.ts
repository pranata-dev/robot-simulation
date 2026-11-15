import { SPIDER_BLUEPRINT, SPIDER_PRESETS } from '@/lib/blueprints/spiderBlueprint';
import { PHYSICS_SANDBOX_PRESETS } from '@/lib/snapshot/presets';
import type {
  BuiltInPreset,
  LabBlueprint,
  RobotBlueprintConfig,
  RobotBlueprintId,
} from '@/types/simulator';

export const ROBOT_BLUEPRINTS: Readonly<Record<RobotBlueprintId, RobotBlueprintConfig>> = {
  spider: SPIDER_BLUEPRINT,
};

export const ALL_ROBOT_BLUEPRINTS: readonly RobotBlueprintConfig[] =
  Object.values(ROBOT_BLUEPRINTS);

export function getRobotBlueprint(blueprintId: RobotBlueprintId): RobotBlueprintConfig {
  return ROBOT_BLUEPRINTS[blueprintId];
}

export const DEFAULT_LAB_ID = 'robotics-spider';

export const LAB_REGISTRY: Readonly<Record<string, LabBlueprint>> = {
  'robotics-spider': {
    id: 'robotics-spider',
    name: 'Quadruped Spider Robotics',
    subject: 'robotics',
    description:
      '4-leg quadruped robot assembly, 3-pin ESP32 wiring, ultrasonic obstacle avoidance, and gait scripting.',
    defaultPresetId: 'ready-to-walk',
    uiConfig: {
      showCodeEditor: true,
      showWiringTools: true,
      showBatteryTelemetry: true,
      showUltrasonicTelemetry: true,
      showWhatIfSliders: true,
    },
  },
  'physics-sandbox': {
    id: 'physics-sandbox',
    name: 'Physics Mechanics Sandbox',
    subject: 'physics',
    description:
      'Open 3D rigid-body sandbox for testing gravity, collisions, time-scale slow motion, and free-body forces.',
    defaultPresetId: 'physics-inclined-race',
    uiConfig: {
      showCodeEditor: false,
      showWiringTools: false,
      showBatteryTelemetry: false,
      showUltrasonicTelemetry: false,
      showWhatIfSliders: true,
    },
  },
};

export const ALL_LAB_BLUEPRINTS: readonly LabBlueprint[] = Object.values(LAB_REGISTRY);

export const ALL_LAB_PRESETS: readonly BuiltInPreset[] = [
  ...SPIDER_PRESETS,
  ...PHYSICS_SANDBOX_PRESETS,
];

/** Resolves a registered LabBlueprint by ID, falling back cleanly to `'robotics-spider'`. */
export function getLabBlueprint(labId: string): LabBlueprint {
  return LAB_REGISTRY[labId] ?? LAB_REGISTRY[DEFAULT_LAB_ID];
}

/** Returns all curated presets associated with a specific STEM lab module. */
export function getPresetsForLab(labId: string): readonly BuiltInPreset[] {
  const resolvedLabId = getLabBlueprint(labId).id;
  return ALL_LAB_PRESETS.filter((preset) => preset.labId === resolvedLabId);
}

/** Finds any curated preset across all registered labs by preset ID. */
export function findPresetById(presetId: string): BuiltInPreset | undefined {
  return ALL_LAB_PRESETS.find((preset) => preset.id === presetId);
}

