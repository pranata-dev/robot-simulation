# State Management & Data Schema (Zustand)

Seluruh *state* aplikasi dikelola menggunakan satu *store* terpusat di `src/store/useSimulationStore.ts` menggunakan **Zustand**.

## 1. TypeScript Interfaces (`src/types/simulator.ts`)

```typescript
export type SimulationStatus = 'idle' | 'playing' | 'paused';

export type ThemeMode = 'light' | 'dark';

export type RobotBlueprintId = 'spider';

export type WiringMode = '3-pin' | '1-wire';

export type PartType =
  | 'CHASSIS_BASE'
  | 'ESP32_DEVKIT'
  | 'BATTERY_2S'
  | 'SERVO_MG90S'
  | 'LEG_COXA'
  | 'LEG_TIBIA'
  | 'OBSTACLE_BLOCK'
  | 'TARGET_ZONE';

export type Vector3Tuple = [number, number, number];

export interface WorkspacePart {
  id: string;                 // UUID unik part di workspace
  type: PartType;
  label: string;              // Nama tampilan (misal: "Micro Servo MG90S")
  position: Vector3Tuple;     // Posisi world [x, y, z]
  rotation: Vector3Tuple;     // Rotasi Euler [x, y, z] dalam radian
  attachedTo?: string;        // ID part induk tempat part ini menempel
  socketId?: SocketId;        // ID socket tempat part ini menempel (misal: "SOCKET_HIP_FL")
}

export interface WireConnection {
  id: string;
  fromPartId: string;         // Instance ID part asal
  fromPinId: PinId;           // Pin ID asal (misal: "ESP_D13")
  toPartId: string;           // Instance ID part tujuan
  toPinId: PinId;             // Pin ID tujuan (misal: "SERVO_PWM")
  color: string;              // Hex color kabel (#ef4444, #eab308, dll)
}

export interface PartSelectionBounds {
  center: Vector3Tuple;
  size: Vector3Tuple;
}

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
```

---

## 2. Struktur Store Zustand (`src/store/useSimulationStore.ts`)

```typescript
export interface SimulationData {
  // --- Schema, Blueprint, Inventory & Assembly Data ---
  schemaVersion: '1.0.0';
  activeBlueprintId: RobotBlueprintId;
  inventory: InventoryItem[];
  workspaceParts: WorkspacePart[];
  wires: WireConnection[];
  activeDraftWire: DraftWire | null;

  // --- Embed, Challenge Grading & Performance State ---
  allowedParts: PartType[] | null;
  readOnly: boolean;
  zeroCollisionMode: boolean;
  challengeStatus: ChallengeStatus;
  obstacleHits: number;
  simulationStartedAt: number | null;
  completionTimeMs: number | null;
  performanceMode: boolean;

  // --- Simulation, Selection & UI State ---
  simulationStatus: SimulationStatus;
  selectedPartId: string | null;
  activeSnapTarget: ActiveSnapTarget | null;
  viewMode: 'normal' | 'wiring_xray';
  physicsInspectorOpen: boolean;
  wiringMode: WiringMode;
  canUndo: boolean;
  canRedo: boolean;
  wiringValidation: WiringValidationResult;
  showCircuitDiagnostics: boolean;

  // --- Microcontroller & Physics State ---
  script: string;
  scriptLogs: ScriptConsoleEntry[];
  scriptError: string | null;
  servoAngles: Record<string, number>;
  rigidBodyRefs: Record<string, RefObject<RapierRigidBody | null>>;
  resetNonce: number;
  isLevelComplete: boolean;
  theme: ThemeMode;
}

export interface SimulationActions {
  spawnPart: (type: PartType, position?: Vector3Tuple, rotation?: Vector3Tuple) => string | null;
  selectPart: (partId: string | null) => void;
  removePart: (partId: string) => void;
  updatePartPosition: (partId: string, position: Vector3Tuple) => void;
  updatePartTransform: (partId: string, position: Vector3Tuple, rotation: Vector3Tuple) => void;
  snapPartToSocket: (
    partId: string,
    parentId: string,
    socketId: SocketId,
    position: Vector3Tuple,
    rotation: Vector3Tuple,
  ) => void;
  detachPart: (partId: string, position: Vector3Tuple, rotation?: Vector3Tuple) => void;
  setActiveSnapTarget: (target: ActiveSnapTarget | null) => void;
  startWiring: (startPartId: string, startPinId: PinId, startPos: Vector3Tuple) => void;
  completeWiring: (toPartId: string, toPinId: PinId) => string | null;
  cancelWiring: () => void;
  removeWire: (wireId: string) => void;
  setWiringMode: (mode: WiringMode) => void;
  setViewMode: (mode: 'normal' | 'wiring_xray') => void;
  toggleViewMode: () => void;
  setPhysicsInspectorOpen: (open: boolean) => void;
  togglePhysicsInspector: () => void;
  setServoAngle: (servoId: string, angleDeg: number) => void;
  centerAllServos: () => void;
  startManualServoTest: () => void;
  loadPreset: (presetId: string) => boolean;
  setActiveBlueprint: (blueprintId: RobotBlueprintId) => void;
  undo: () => void;
  redo: () => void;
  dismissCircuitDiagnostics: () => void;
  setScript: (script: string) => void;
  clearScriptLogs: () => void;
  clearScriptError: () => void;
  runSimulation: () => void;
  stopSimulation: () => void;
  setSimulationStatus: (status: SimulationStatus) => void;
  registerRigidBody: (id: string, ref: RefObject<RapierRigidBody | null>) => void;
  unregisterRigidBody: (id: string, ref?: RefObject<RapierRigidBody | null>) => void;
  completeLevel: () => void;
  completeChallenge: () => void;
  recordObstacleHit: () => void;
  setEmbedConfig: (config: SimulationEmbedConfig) => void;
  setPerformanceMode: (enabled: boolean) => void;
  exportSimulationSnapshot: () => string;
  importSimulationSnapshot: (jsonString: string) => SnapshotImportResult;
  toggleTheme: () => void;
  resetPositions: () => void;
  resetWorkspace: () => void;
}
```

---

## 3. Aturan Logika Perakitan, Seleksi & Penghapusan State

### A. Grounding & Elevasi Sasis (`CHASSIS_BASE`)
1. `CHASSIS_BASE` pertama kali di-*spawn* pada `y = CHASSIS_HALF_HEIGHT` (`0.075`) sehingga menempel rata di atas lantai (`y = 0`).
2. Ketika kaki (`LEG_TIBIA`) tersambung ke hierarki `CHASSIS_BASE` melalui `snapPartToSocket`, fungsi `reconcileChassisElevations` menaikkan `CHASSIS_BASE` (beserta seluruh *descendant*-nya) ke `CHASSIS_ASSEMBLY_WORKING_Y` (`0.50`) dan menampilkan `AssemblyStand` selama `simulationStatus === 'idle'`.
3. Jika seluruh kaki dilepas (`detachPart`) atau dihapus (`removePart`), `CHASSIS_BASE` otomatis turun kembali ke `y = CHASSIS_HALF_HEIGHT`.

### B. Seleksi & Cascading Deletion (`selectPart`, `removePart`)
1. Mengklik part 3D memanggil `selectPart(id)`; mengklik area kanvas kosong (`onPointerMissed`) memanggil `selectPart(null)`.
2. `removePart(partId)` hanya berjalan saat `simulationStatus === 'idle'` dan **melindungi `CHASSIS_BASE`** agar tidak dapat dihapus.
3. Untuk part modular (`SERVO_MG90S`, `LEG_TIBIA`, `ESP32_DEVKIT`, dll.), `removePart(partId)` melakukan **Cascading Cleanup**:
   - Menghapus part target beserta seluruh *descendant* yang menempel padanya secara rekursif (misal menghapus servo otomatis menghapus kaki pada *horn*-nya) dan mengembalikan stoknya ke `inventory`.
   - Membebaskan okupansi *socket* induk di `workspaceParts` agar part baru dapat di-*snap* kembali.
   - Menghapus seluruh kabel (`wires`) dan *draft wire* yang terhubung ke pin milik part terhapus maupun *descendant*-nya.
   - Membersihkan referensi *physics body* dan *horn ref* di `src/lib/physics/rigidBodyRegistry.ts` serta `rigidBodyRefs` / `servoAngles` di *store*, lalu mereset `selectedPartId` ke `null` jika part terpilih ikut terhapus.

### C. Aturan Snapping (`snapPartToSocket`)
1. Sebuah *socket* hanya boleh ditempati oleh maksimal **satu** komponen anak pada satu waktu.
2. Tipe komponen yang di-*drag* (`part.type`) harus cocok dengan `allowedTypes` milik *socket* tujuan.
3. Saat `snapPartToSocket` dipanggil, posisi dan rotasi komponen anak dikunci mengikuti matriks transformasi dunia (*world matrix*) dari *socket* induknya melalui `computeSocketWorldTransform`.

### D. Pre-Flight Wiring Topology Validation (`validateWiringTopology`)
1. Berjalan setiap kali kabel atau konektivitas part berubah serta sebelum memasuki `simulationStatus === 'playing'`.
2. **Mode `'3-pin'` vs `'1-wire'`:** Pada mode `'3-pin'` (default), seluruh terminal `VCC`, `GND`, dan `PWM` wajib terhubung lengkap dan aman; pada mode `'1-wire'`, pin daya servo disembunyikan dan validator hanya mengecek jalur `PWM` menuju pin GPIO ESP32.
3. **Short-Circuit & Role-Mismatch Detection:** Menelusuri graf konektivitas kabel (*BFS*) untuk mendeteksi jembatan langsung maupun transitif antara jalur daya (`POWER`) dan `GROUND`, serta pencampuran rel daya/ground dengan sinyal `PWM`.
4. **Incomplete Power/Signal Check:** Memastikan setiap `ESP32_DEVKIT` dan `SERVO_MG90S` yang terpasang memiliki jalur `VCC` (`ESP_VIN`), `GND` (`ESP_GND`), dan sinyal `PWM` menuju pin GPIO ESP32 yang valid (sesuai `wiringMode` aktif).
5. Jika terdapat kesalahan, transisi ke `'playing'` diblokir, `PinNode` bermasalah berkedip merah, dan `CircuitDiagnosticAlert` menampilkan ringkasan kesalahan.

### E. Deterministic Physics & Transform Reset (`stopSimulation`, `resetPositions`)
1. Saat beralih dari `'playing'` ke `'idle'` melalui **Stop** atau **Reset**, seluruh `RapierRigidBody` di-nol-kan `linvel` dan `angvel`-nya via `resetAllRigidBodiesPhysicsState()`.
2. Posisi dan rotasi kuaternion seluruh part anak dihitung ulang secara deterministik menggunakan matriks transformasi socket di `snapLogic.ts` & `socketRegistry.ts`, serta *joint* fisika pada `JointSystem` dan `AssemblyPhysicsJoints` dibersihkan dan dibuat ulang tanpa duplikasi.

### F. Multi-Robot Blueprint Resolution & LMS Embed Integration
1. `activeBlueprintId` (default `'spider'`) menentukan dimensi sasis, BOM inventaris default, daftar socket, serta *built-in presets* melalui `src/lib/constants/socketRegistry.ts` dan `src/lib/blueprints/blueprintRegistry.ts`; memanggil `setActiveBlueprint(id)` me-reset workspace dan membangun ulang inventaris berdasarkan blueprint terpilih.
2. Komponen `<RobotSimulatorEmbed />` (`src/components/RobotSimulatorEmbed.tsx`) menyinkronkan `allowedParts`, `presetSnapshot`, `readOnly`, dan `zeroCollisionMode` ke store melalui `setEmbedConfig`, memancarkan `onStateChange` (debounced JSON snapshot berversi `schemaVersion: "1.0.0"`), serta melaporkan `onChallengeSuccess` ketika sasis berada di dalam `TargetZoneProxy` selama 1,5 detik.