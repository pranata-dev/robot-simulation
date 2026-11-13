export type Vector3Tuple = [number, number, number];

export type ThemeMode = 'light' | 'dark';

export type PartType =
  | 'CHASSIS_BASE'
  | 'ESP32_DEVKIT'
  | 'BATTERY_2S'
  | 'SERVO_MG90S'
  | 'LEG_COXA'
  | 'LEG_TIBIA'
  | 'OBSTACLE_BLOCK'
  | 'TARGET_ZONE';

export type SimulationStatus = 'idle' | 'playing' | 'paused';

export type ChassisSocketId =
  | 'SOCKET_MCU'
  | 'SOCKET_BAT'
  | 'SOCKET_HIP_FL'
  | 'SOCKET_HIP_FR'
  | 'SOCKET_HIP_BL'
  | 'SOCKET_HIP_BR';

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

export type PinId = Esp32PinId | ServoPinId;

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

