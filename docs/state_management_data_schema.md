# State Management & Data Schema (Zustand)

Seluruh *state* aplikasi dikelola menggunakan satu *store* terpusat di `src/store/useSimulatorStore.ts` menggunakan **Zustand**. 

## 1. TypeScript Interfaces (`src/types/simulator.ts`)

```typescript
export type SimulatorMode = 'assembly' | 'wiring' | 'coding' | 'simulate';

export type PartType =
  | 'CHASSIS_BASE'
  | 'ESP32_DEVKIT'
  | 'BATTERY_2S'
  | 'SERVO_MG90S'
  | 'LEG_COXA'
  | 'LEG_TIBIA';

export type Vector3Tuple = [number, number, number];

export interface PlacedPart {
  instanceId: string;           // UUID unik part di workspace (misal: "servo_fl_hip")
  type: PartType;
  label: string;                // Nama tampilan (misal: "Servo Front-Left Hip")
  position: Vector3Tuple;       // Posisi world [x, y, z] saat belum di-snap
  rotation: Vector3Tuple;       // Rotasi Euler [x, y, z]
  parentPartId: string | null;  // ID part induk tempat part ini menempel
  snappedSocketId: string | null; // ID socket tempat part ini menempel (misal: "SOCKET_HIP_FL")
}

export interface WireConnection {
  id: string;
  fromPartId: string;           // Instance ID part asal
  fromPinId: string;            // Pin ID asal (misal: "ESP_D13")
  toPartId: string;             // Instance ID part tujuan
  toPinId: string;              // Pin ID tujuan (misal: "SERVO_PWM")
  color: string;                // Hex color kabel (#ef4444, #eab308, dll)
}

export interface CircuitValidationResult {
  isValid: boolean;
  errors: string[];             // Pesan error jika ada kabel salah pasang / short circuit
  warnings: string[];           // Peringatan jika ada servo yang belum diberi kabel PWM
  pinToServoMap: Record<number, string>; // Mapping nomor GPIO (misal: 13) ke instanceId Servo
}

export interface PhysicsSandboxConfig {
  gravityY: number;             // Default: -9.81 (m/s^2)
  floorFriction: number;        // Default: 0.8
  inclineAngleDeg: number;      // Sudut kemiringan bidang untuk eksperimen fisika (0 - 45 derajat)
  blockMass: number;            // Massa benda uji (kg)
}
```

---

## 2. Struktur Store Zustand (`useSimulatorStore.ts`)

```typescript
export interface SimulatorState {
  // --- Mode & UI State ---
  mode: SimulatorMode;
  selectedPartId: string | null;
  activeDraggingPartId: string | null;
  pendingWireStart: { partId: string; pinId: string } | null;

  // --- Assembly & Wiring Data ---
  parts: Record<string, PlacedPart>;
  wires: WireConnection[];

  // --- Microcontroller & Kinematics State ---
  userCode: string;
  isCodeRunning: boolean;
  // Menyimpan target sudut servo dalam derajat [0, 180], default 90 (posisi netral)
  servoTargetAngles: Record<string, number>; 
  validationResult: CircuitValidationResult | null;

  // --- General Physics Lab State ---
  physicsConfig: PhysicsSandboxConfig;

  // --- Actions ---
  setMode: (mode: SimulatorMode) => void;
  addPart: (type: PartType, initialPos?: Vector3Tuple) => string;
  removePart: (instanceId: string) => void;
  updatePartTransform: (instanceId: string, pos: Vector3Tuple, rot: Vector3Tuple) => void;
  snapPartToSocket: (childId: string, parentId: string, socketId: string) => void;
  unsnapPart: (instanceId: string) => void;

  // --- Wiring Actions ---
  startWire: (partId: string, pinId: string) => void;
  completeWire: (toPartId: string, toPinId: string) => void;
  cancelWire: () => void;
  removeWire: (wireId: string) => void;
  autoWireDefaultPreset: () => void; // Helper untuk testing cepat

  // --- Simulation & Servo Actions ---
  setUserCode: (code: string) => void;
  setServoAngle: (servoInstanceId: string, angleDeg: number) => void;
  setServoAngleByGpio: (gpioNumber: number, angleDeg: number) => void;
  validateAndStartSimulation: () => boolean;
  resetSimulation: () => void;
  loadCompleteSpiderPreset: () => void; // Memuat robot yang sudah terakit penuh untuk demo instan
}
```

---

## 3. Aturan Logika Validasi & Transisi State

### A. Aturan Snapping (`snapPartToSocket`)
1. Sebuah *socket* hanya boleh ditempati oleh maksimal **satu** komponen anak pada satu waktu.
2. Tipe komponen yang di-*drag* (`part.type`) harus cocok dengan `acceptedPartType` milik *socket* tujuan.
3. Saat `snapPartToSocket` dipanggil, posisi dan rotasi komponen anak dikunci mengikuti matriks transformasi dunia (*world matrix*) dari *socket* induknya.

### B. Aturan Validasi Rangkaian (`circuitValidator.ts`)
Sebelum mengizinkan transisi ke `mode === 'simulate'`, fungsi `validateCircuit(parts, wires)` harus memeriksa:
1. **Short Circuit Check:** Apakah ada kabel yang menghubungkan pin `VCC`/`5V` langsung ke `GND`? Jika ya, batalkan simulasi dan tampilkan visualisasi percikan/peringatan *Short Circuit!*.
2. **MCU Power Check:** Apakah `ESP32_DEVKIT` sudah terhubung ke `BATTERY_2S` melalui pin `ESP_VIN` dan `ESP_GND`?
3. **Servo Mapping:** Untuk setiap `SERVO_MG90S` yang terpasang, periksa apakah `SERVO_VCC`, `SERVO_GND`, dan `SERVO_PWM` sudah terhubung. Petakan nomor GPIO ESP32 ke `instanceId` servo terkait di dalam `pinToServoMap`.

### C. Konversi Sudut Servo ke Radian Fisika
Motor servo fisik menerima input derajat $\theta_{\text{deg}} \in [0^\circ, 180^\circ]$ dengan titik tengah netral pada $90^\circ$. Saat nilai ini diteruskan ke *RevoluteJoint* di Rapier Physics, konversikan ke radian $\theta_{\text{rad}} \in [-\frac{\pi}{2}, \frac{\pi}{2}]$ menggunakan rumus:
$$\theta_{\text{rad}} = (\theta_{\text{deg}} - 90^\circ) \times \frac{\pi}{180^\circ}$$