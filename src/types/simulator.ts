export type Vector3Tuple = [number, number, number];

export type ThemeMode = 'light' | 'dark';

export type PartType =
  | 'CHASSIS_BASE'
  | 'ESP32_DEVKIT'
  | 'BATTERY_2S'
  | 'SERVO_MG90S'
  | 'LEG_COXA'
  | 'LEG_TIBIA'
  | 'ULTRASONIC_HCSR04'
  | 'OBSTACLE_BLOCK'
  | 'TARGET_ZONE'
  | 'physics_inclined_ramp'
  | 'physics_solid_sphere'
  | 'physics_solid_cylinder'
  | 'physics_hollow_cylinder'
  | 'physics_collision_puck'
  | 'physics_seesaw_beam'
  | 'pivot_anchor'
  | 'pendulum_bob'
  | 'helical_spring_mass'
  | 'dc_power_supply'
  | 'breadboard_base'
  | 'resistor_component'
  | 'potentiometer_rheostat'
  | 'galvanometer_ammeter'
  | 'laser_emitter'
  | 'plane_mirror'
  | 'convex_lens'
  | 'concave_lens'
  | 'glass_prism'
  | 'optical_target_screen';

export type SubjectCategory = 'robotics' | 'physics' | 'math' | 'chemistry' | 'biology';

export type CollisionLayer = 'robot_part' | 'free_body' | 'environment';

export interface LabUIConfig {
  showCodeEditor: boolean;
  showWiringTools: boolean;
  showBatteryTelemetry: boolean;
  showUltrasonicTelemetry: boolean;
  showWhatIfSliders: boolean;
}

export interface LabBlueprint {
  id: string;
  name: string;
  subject: SubjectCategory;
  description: string;
  allowedCategories?: string[];
  defaultPresetId: string;
  uiConfig: LabUIConfig;
}

export type SimulationStatus = 'idle' | 'playing' | 'paused';

export type WiringMode = '3-pin' | '1-wire';

export type ViewMode = 'normal' | 'wiring_xray';

export type ChassisSocketId =
  | 'SOCKET_MCU'
  | 'SOCKET_BAT'
  | 'socket-battery-mount'
  | 'SOCKET_HIP_FL'
  | 'SOCKET_HIP_FR'
  | 'SOCKET_HIP_BL'
  | 'SOCKET_HIP_BR'
  | 'socket-ultrasonic-front';

export type SubSocketId =
  | 'SOCKET_SERVO_HORN'
  | 'SOCKET_COXA_DISTAL'
  | 'socket-harmonic-pivot'
  | 'socket-harmonic-spring';

export type SocketId = ChassisSocketId | SubSocketId;

export type Esp32PinId =
  | 'ESP_VIN'
  | 'ESP_GND'
  | 'ESP_D13'
  | 'ESP_D12'
  | 'ESP_D14'
  | 'ESP_D27'
  | 'ESP_D26'
  | 'ESP_D25'
  | 'ESP_D33'
  | 'ESP_D32';

export type ServoPinId = 'SERVO_PWM' | 'SERVO_VCC' | 'SERVO_GND';

export type UltrasonicPinId = 'US_VCC' | 'US_TRIG' | 'US_ECHO' | 'US_GND';

export type BatteryPinId = 'VCC_OUT' | 'GND_OUT';

export type DcSupplyPinId = 'DC_POS' | 'DC_NEG';

export type BreadboardPinId = 'BB_POS' | 'BB_NEG' | 'BB_A' | 'BB_B' | 'BB_C' | 'BB_D';

export type ResistorPinId = 'RES_1' | 'RES_2';

export type PotentiometerPinId = 'POT_1' | 'POT_2';

export type GalvanometerPinId = 'GALV_POS' | 'GALV_NEG';

export type PinId =
  | Esp32PinId
  | ServoPinId
  | UltrasonicPinId
  | BatteryPinId
  | DcSupplyPinId
  | BreadboardPinId
  | ResistorPinId
  | PotentiometerPinId
  | GalvanometerPinId;

export type PinRole = 'POWER' | 'GROUND' | 'PWM' | 'TERMINAL';

export type JointKind = 'FIXED' | 'REVOLUTE' | 'SPHERICAL';

export interface PartCatalogEntry {
  type: PartType;
  label: string;
  /** Subject domain that owns this part (or `'shared'` across labs). */
  category: SubjectCategory | 'shared';
  /** Proxy bounding dimensions [x, y, z] in scene units (1 unit = 10 cm). */
  dimensions: Vector3Tuple;
  /** Mass in kg. */
  mass: number;
  /** Rapier collision isolation layer for this part. */
  collisionLayer: CollisionLayer;
  /** Optional default surface friction coefficient. */
  defaultFriction?: number;
  /** Optional default restitution coefficient in [0, 1]. */
  defaultRestitution?: number;
  /** Pin identifiers exposed by this part, if interactive. */
  pins?: readonly PinId[];
}

export interface SocketDefinition {
  id: SocketId;
  hostPartType: PartType;
  allowedTypes: readonly PartType[];
  /** Local position relative to the host part origin. */
  position: Vector3Tuple;
  /** Local Euler rotation (radians) relative to the host part. */
  rotation: Vector3Tuple;
  jointKind: JointKind;
  /** Revolute axis in socket-local space; null for fixed sockets. */
  jointAxis: Vector3Tuple | null;
}

export interface PinDefinition {
  id: PinId;
  hostPartType: PartType;
  label: string;
  role: PinRole;
  /** Local position relative to the host part origin. */
  position: Vector3Tuple;
  /** Indicator hex color from the asset map. */
  color: string;
  /** GPIO number for PWM-capable MCU pins; null otherwise. */
  gpio: number | null;
}

export interface InventoryItem {
  type: PartType;
  label: string;
  /** Units still available to spawn into the workspace. */
  quantity: number;
}

export interface WorkspacePart {
  id: string;
  type: PartType;
  label: string;
  /** World position [x, y, z]. */
  position: Vector3Tuple;
  /** World Euler rotation [x, y, z] in radians. */
  rotation: Vector3Tuple;
  /** Optional initial linear velocity [vx, vy, vz] in m/s applied when simulation starts. */
  initialVelocity?: Vector3Tuple;
  /** Optional circuit bridge role identifier for resistors/potentiometers. */
  circuitRole?: 'r1' | 'r2' | 'r3' | 'rvar' | 'rx';
  /** Optional explicit resistance in Ohms for passive bench components. */
  resistanceOhms?: number;
  /** UUID of the parent part this part is snapped to. */
  attachedTo?: string;
  /** Identifier of the parent socket this part is snapped to. */
  socketId?: SocketId;
}

export interface ActiveSnapTarget {
  parentId: string;
  socketId: SocketId;
  isValid: boolean;
}

export interface DraftWire {
  startPartId: string;
  startPinId: PinId;
  startPos: Vector3Tuple;
}

export interface WireConnection {
  id: string;
  fromPartId: string;
  fromPinId: PinId;
  toPartId: string;
  toPinId: PinId;
  color: string;
}

export type NewWireConnection = Omit<WireConnection, 'id' | 'color'> & {
  color?: string;
};

export interface PartSelectionBounds {
  center: Vector3Tuple;
  size: Vector3Tuple;
}

export type QuaternionTuple = [number, number, number, number];

export type PinNodeKey = `${string}:${PinId}`;

export type CircuitFaultKind =
  | 'SHORT_CIRCUIT'
  | 'ROLE_MISMATCH'
  | 'MISSING_POWER'
  | 'MISSING_GROUND'
  | 'MISSING_PWM'
  | 'OPEN_BRANCH';

export interface CircuitDiagnosticIssue {
  id: string;
  kind: CircuitFaultKind;
  message: string;
  pinKeys: readonly PinNodeKey[];
}

export interface WiringValidationResult {
  isValid: boolean;
  hasShortCircuit: boolean;
  issues: readonly CircuitDiagnosticIssue[];
  faultyPinKeys: Readonly<Record<string, CircuitFaultKind>>;
  activeServoIds: readonly string[];
  pinToServoIds: Readonly<Partial<Record<PinId, readonly string[]>>>;
}

export type WorkerLogLevel = 'info' | 'warn' | 'error';

export interface ScriptConsoleEntry {
  id: string;
  level: WorkerLogLevel;
  message: string;
  timestamp: number;
}

export type WorkerInboundMessage =
  | {
      type: 'START';
      runId: number;
      script: string;
      sensorDistances?: Record<string, number>;
      batteryLevel?: number;
    }
  | {
      type: 'SENSOR_DATA';
      sensorDistances: Record<string, number>;
      batteryLevel?: number;
    }
  | {
      type: 'STOP';
    };

export type WorkerOutboundMessage =
  | {
      type: 'HEARTBEAT';
      runId: number;
    }
  | {
      type: 'SET_SERVO_ANGLE';
      runId: number;
      servoTarget: string;
      angleDeg: number;
    }
  | {
      type: 'SET_SERVO_BATCH';
      runId: number;
      commands: Array<{
        servoTarget: string;
        angleDeg: number;
      }>;
    }
  | {
      type: 'LOG';
      runId: number;
      level: WorkerLogLevel;
      message: string;
    }
  | {
      type: 'COMPLETED';
      runId: number;
    }
  | {
      type: 'ERROR';
      runId: number;
      message: string;
    };

export const SIMULATION_SCHEMA_VERSION = '1.0.0' as const;

export type SimulationSchemaVersion = typeof SIMULATION_SCHEMA_VERSION;

export type ChallengeStatus = 'idle' | 'in_progress' | 'completed' | 'failed';

export interface ChallengeMetrics {
  completionTimeMs: number;
  obstacleHits: number;
}

export interface SnapshotImportResult {
  success: boolean;
  error?: string;
}

export interface SimulationSnapshot {
  schemaVersion: SimulationSchemaVersion;
  workspaceParts: WorkspacePart[];
  wires: WireConnection[];
  script: string;
  theme?: ThemeMode;
  wiringMode?: WiringMode;
}

export interface SimulationEmbedConfig {
  allowedParts?: PartType[] | null;
  readOnly?: boolean;
  zeroCollisionMode?: boolean;
}

export interface BuiltInPreset {
  id: string;
  labId: string;
  name: string;
  description: string;
  snapshot: SimulationSnapshot;
}

export type RobotBlueprintId = 'spider';

export interface RobotBlueprintConfig {
  id: RobotBlueprintId;
  name: string;
  chassisDimensions: Vector3Tuple;
  chassisAssemblyWorkingY: number;
  sockets: Readonly<Record<PartType, readonly SocketDefinition[]>>;
  defaultInventoryCounts: Readonly<Record<PartType, number>>;
  presets: readonly BuiltInPreset[];
}

export interface MnaBranchReading {
  partId: string;
  label: string;
  resistanceOhms: number;
  currentAmps: number;
  voltageDropVolts: number;
  powerWatts: number;
}

export interface MnaCircuitSolution {
  hasDcCircuit: boolean;
  hasShortCircuit: boolean;
  hasOpenBranch: boolean;
  isBalanced: boolean;
  sourceVoltage: number;
  equivalentResistanceOhms: number | null;
  sourceCurrentAmps: number;
  nodeVoltages: {
    nodeA: number | null;
    nodeB: number | null;
    nodeC: number | null;
    nodeD: number | null;
  };
  bridgeDiffVolts: number;
  galvanometerCurrentAmps: number;
  branches: readonly MnaBranchReading[];
  diagnostics: readonly string[];
}

export interface OpticsRaySegment {
  start: Vector3Tuple;
  end: Vector3Tuple;
  hitPoint: Vector3Tuple | null;
  hitNormal: Vector3Tuple | null;
  hitPartId: string | null;
  hitPartType: PartType | null;
  interaction: 'NONE' | 'REFLECT' | 'REFRACT' | 'TIR' | 'LENS' | 'ABSORB' | 'TARGET';
  incidentDeg: number | null;
  outgoingDeg: number | null;
  criticalDeg: number | null;
}

export interface OpticsRaytraceResult {
  hasOpticsBench: boolean;
  segments: readonly OpticsRaySegment[];
  targetHit: boolean;
  targetHitPoint: Vector3Tuple | null;
  primaryIncidentDeg: number | null;
  primaryOutgoingDeg: number | null;
  criticalAngleDeg: number | null;
  totalInternalReflection: boolean;
}

