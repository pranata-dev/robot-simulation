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
  | 'TARGET_ZONE';

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

export type SubSocketId = 'SOCKET_SERVO_HORN' | 'SOCKET_COXA_DISTAL';

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

export type PinId = Esp32PinId | ServoPinId | UltrasonicPinId;

export type PinRole = 'POWER' | 'GROUND' | 'PWM';

export type JointKind = 'FIXED' | 'REVOLUTE';

export interface PartCatalogEntry {
  type: PartType;
  label: string;
  /** Proxy bounding dimensions [x, y, z] in scene units (1 unit = 10 cm). */
  dimensions: Vector3Tuple;
  /** Mass in kg. */
  mass: number;
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
  | 'MISSING_PWM';

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

