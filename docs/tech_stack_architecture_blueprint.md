> **SUPERSEDED:** This legacy document is superseded by [/docs/PRD.md](./PRD.md) and [/AGENTS.md](../AGENTS.md). Always follow the rules in AGENTS.md and docs/PRD.md.

# Tech Stack & Architecture Standards

## 1. Core Technology Stack
- **Framework:** Next.js `16.4.6` (App Router, React `19.3.0`, TypeScript `5`)
- **Styling & UI Overlay:** Tailwind CSS `4.3.3`, Lucide React (`lucide-react`)
- **3D Rendering Engine:**
  - `three` & `@types/three` (Core WebGL library)
  - `@react-three/fiber` (React reconciler for Three.js)
  - `@react-three/drei` (Helpers: `OrbitControls`, `DragControls`, `QuadraticBezierLine`, `Html`, `Grid`, `Environment`, `RoundedBox`)
- **Physics Engine:**
  - `@react-three/rapier` (WebAssembly-based rigid body physics, colliders, sensors, and fixed/revolute joints)
- **State Management:**
  - `zustand` (Global state store for assembly tree, wiring graph, undo/redo history, embed props, and simulation telemetry)
- **Code Execution Sandbox:**
  - Isolated **Web Worker** (`src/workers/robotScriptWorker.ts` + inline worker factory `src/lib/worker/createRobotScriptWorker.ts`) with heartbeat watchdog and command quota

---

## 2. Directory Structure
Seluruh file baru dan refactor wajib mengikuti struktur direktori aktual berikut:

```text
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx                        # Root layout and font configuration
│   └── page.tsx                          # Standalone app host (loads SimulationScene/UI with ssr: false)
├── components/
│   ├── RobotSimulatorEmbed.tsx           # Embeddable LMS wrapper (allowedParts, presetSnapshot, readOnly, callbacks)
│   ├── canvas/                           # SEMUA KOMPONEN R3F (Di dalam <Canvas>)
│   │   ├── parts/
│   │   │   ├── shared/                   # Komponen part generik lintas-robot & arena
│   │   │   │   ├── AnchorMarker.tsx      # Socket indicator spheres
│   │   │   │   ├── AssemblyStand.tsx     # Industrial assembly support jig & collider (idle only)
│   │   │   │   ├── DraggableRigidPart.tsx# Rapier RigidBody + XZ DragControls wrapper
│   │   │   │   ├── ESP32Proxy.tsx        # ESP32 mesh + 10 GPIO/Power PinNodes
│   │   │   │   ├── ObstacleProxy.tsx     # Sandbox obstacle collider
│   │   │   │   ├── PartSelectionOverlay.tsx
│   │   │   │   ├── PinNode.tsx           # Interactive pin terminal + wiring raycast target
│   │   │   │   ├── ServoProxy.tsx        # MG90S servo proxy with rotating horn + 3-pin header
│   │   │   │   └── TargetZoneProxy.tsx   # Finish pad sensor for challenge grading
│   │   │   └── robots/
│   │   │       └── spider/               # Komponen khusus robot laba-laba (quadruped)
│   │   │           ├── ChassisBase.tsx   # Spider main chassis body, grounding & sockets
│   │   │           └── SpiderLegProxy.tsx# Articulated tibia leg colliders & foot traction tip
│   │   ├── AssemblyPhysicsJoints.tsx     # Fixed joints for MCU/Battery attachments
│   │   ├── CameraViewController.tsx      # Smooth camera transitions (Wiring View [W] / Reset)
│   │   ├── JointSystem.tsx               # Declarative Revolute joints & motor actuation
│   │   ├── PerformanceMonitorGuard.tsx   # Rolling FPS monitor -> adaptive performanceMode
│   │   ├── PhysicsInspectorOverlay.tsx   # Live COM marker & foot-ground contact visualizers
│   │   ├── SimulationScene.tsx           # R3F Canvas, Rapier <Physics>, lighting, WebGL disposal
│   │   └── WiringSystem.tsx              # 3D quadratic Bezier jumper wires & draft preview
│   └── ui/                               # SEMUA KOMPONEN HTML/TAILWIND (Di luar <Canvas>)
│       ├── CanvasToolbar.tsx             # Wiring View [W], 3-Pin/1-Wire switch, Load Preset, Undo/Redo
│       ├── CircuitDiagnosticAlert.tsx    # Banner & auto-focus pin diagnostics on fault
│       ├── CodeEditorPanel.tsx           # Script editor + Manual Servo Test drawer toggle
│       ├── InventoryPanel.tsx            # Part spawner, allowedParts filtering, theme/reset controls
│       ├── ServoCalibrationPanel.tsx     # Live per-servo manual angle sliders (0..180 deg)
│       └── TelemetryHUD.tsx              # Real-time mass, speed, displacement, current (mA), contacts
├── hooks/
│   ├── useKeyboardShortcuts.ts           # Delete, Esc, Undo/Redo (Ctrl+Z), Wiring View [W]
│   └── usePartDragAndSync.ts             # Imperative drag sync + magnetic XZ snap detection
├── lib/
│   ├── blueprints/
│   │   ├── blueprintRegistry.ts          # Registry map & lookup for installed RobotBlueprintConfig
│   │   └── spiderBlueprint.ts            # Spider chassis dimensions, sockets, BOM & presets
│   ├── constants/
│   │   ├── hardwareCatalog.ts            # Shared part catalog, dimensions, mass, pins & wire colors
│   │   └── socketRegistry.ts             # Central blueprint-aware resolver (reads activeBlueprintId)
│   ├── microcontroller/
│   │   ├── circuitValidator.ts           # BFS topology validator (short circuit, power/ground/PWM)
│   │   └── servoPinMap.ts                # Pin token (PIN_1..8 / ESP_D*) mapping helpers
│   ├── physics/
│   │   ├── rigidBodyRegistry.ts          # Imperative Rapier RigidBody & horn ref registry + velocity reset
│   │   └── telemetryState.ts             # Zero-GC frame telemetry sampling (COM, speed, current, contacts)
│   ├── snapshot/
│   │   ├── presets.ts                    # Built-in assembly presets factory (Empty, Unwired, Ready-to-Walk)
│   │   └── snapshotSerializer.ts         # Schema 1.0.0 JSON export/import & structural validation
│   ├── three/
│   │   └── disposeSceneResources.ts      # Recursive Three.js geometry/material/texture cleanup on unmount
│   └── worker/
│       └── createRobotScriptWorker.ts    # Inline Blob Web Worker bootstrapper (cross-repo safe)
├── store/
│   └── useSimulationStore.ts             # Zustand store utama
├── types/
│   └── simulator.ts                      # Definisi interface TypeScript global
├── utils/
│   ├── snapLogic.ts                      # Socket proximity detection + hierarchy transform resolver
│   └── transformMath.ts                  # Pure world transform math (computeSocketWorldTransform)
└── workers/
    └── robotScriptWorker.ts              # Sandboxed script runtime + watchdog & iteration quota
```

---

## 3. Architectural Patterns & Best Practices

### A. Next.js App Router Boundary (`'use client'`)
Semua komponen yang mengimpor `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, atau `zustand` **WAJIB** mendeklarasikan `'use client'` di baris paling atas. Halaman host atau modul LMS memuat `SimulationScene` / `RobotSimulatorEmbed` secara dinamis dengan `ssr: false` untuk mencegah *hydration error* terkait WebGL/WASM:
```tsx
import dynamic from 'next/dynamic';
const RobotSimulatorEmbed = dynamic(() => import('@/components/RobotSimulatorEmbed'), { ssr: false });
```

### B. Dual-Representation Pattern (Idle vs. Playing)
1. **Saat `simulationStatus === 'idle'` (Assembly & Wiring):**
   `<Physics paused={true}>` mengunci simulasi gravitasi sehingga drag XZ, snapping magnetik, penyesuaian elevasi `AssemblyStand`, dan pemasangan kabel jumper berjalan presisi.
2. **Saat `simulationStatus === 'playing'`:**
   `AssemblyStand` disembunyikan, `<Physics paused={false}>` aktif penuh, `JointSystem` & `AssemblyPhysicsJoints` menggerakkan sendi `Revolute` & `Fixed`, dan skrip pengguna dieksekusi di `robotScriptWorker.ts`.

### C. Multi-Robot Blueprint Architecture (`src/lib/blueprints/`)
- Dimensi sasis, peta koordinat *socket*, BOM inventaris default, dan *built-in presets* setiap tipe robot dipisahkan ke modul blueprint independen yang mengimplementasikan interface `RobotBlueprintConfig` (saat ini `SPIDER_BLUEPRINT` di `src/lib/blueprints/spiderBlueprint.ts`).
- `src/lib/constants/socketRegistry.ts` bertindak sebagai *central resolver* yang membaca `activeBlueprintId` (`'spider'`) dari `useSimulationStore.ts` melalui *lazy reader* (`registerActiveBlueprintIdReader`), sehingga engine inti (`snapLogic.ts`, `JointSystem.tsx`, `WiringSystem.tsx`, `TelemetryHUD.tsx`) tetap agnostik terhadap jenis robot tanpa siklus impor (*zero circular imports*).

### D. 3-Pin vs. 1-Wire Servo Wiring Architecture
- Setiap `ServoProxy.tsx` merender 3 `PinNode` terpisah (`SERVO_PWM` kuning/amber, `SERVO_VCC` merah, `SERVO_GND` slate/hitam) di header atas-belakang servo.
- **`wiringMode === '3-pin'` (Default):** `circuitValidator.ts` mewajibkan tiap servo aktif memiliki jalur lengkap `VCC -> ESP_VIN`, `GND -> ESP_GND`, dan `PWM -> GPIO`, sekaligus mendeteksi *short circuit* (jembatan `5V`–`GND`) dan *role mismatch*.
- **`wiringMode === '1-wire'`:** Mode penyederhanaan kelas dasar yang menyembunyikan terminal `VCC`/`GND` servo dan hanya memvalidasi kabel sinyal `PWM` antara ESP32 dan servo.

### E. `<RobotSimulatorEmbed />` Integration Contract
Untuk integrasi langsung sebagai modul interaktif pada platform *e-learning* Next.js:
- **Props:** `allowedParts?: PartType[]`, `presetSnapshot?: string`, `readOnly?: boolean`, `zeroCollisionMode?: boolean`, `onStateChange?: (snapshotJson: string) => void`, `onChallengeSuccess?: (metrics: { completionTimeMs: number; obstacleHits: number }) => void`, `className?: string`.
- **Lifecycle & Cleanup:** Saat komponen di-*unmount* (misal berpindah materi pelajaran), `SimulationScene.tsx` mengeksekusi `disposeSceneResources` serta membersihkan *RigidBody registry* agar tidak terjadi kebocoran memori WebGL/WASM.

### F. Coordinate System Convention
- Gunakan sistem koordinat **Right-Handed, Y-Up** standar Three.js:
  - Sumbu $+X$: Kanan (*Right*)
  - Sumbu $-X$: Kiri (*Left*)
  - Sumbu $+Y$: Atas (*Up* / melawan arah gravitasi)
  - Sumbu $+Z$: Depan (*Forward* / arah kepala robot)
  - Sumbu $-Z$: Belakang (*Backward* / arah ekor robot)
- Semua satuan panjang di dalam *canvas* direpresentasikan dalam skala $1\text{ unit} = 10\text{ cm}$ ($0.1\text{ m}$) agar presisi *floating-point* di Rapier Physics tetap optimal dan kamera tidak mengalami *near-plane clipping*.