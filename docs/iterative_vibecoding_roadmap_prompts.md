# Iterative Vibecoding Roadmap & Prompting Guide

**PENTING:** Jangan pernah meminta AI membangun seluruh aplikasi dalam satu *prompt*. Ikuti 5 fase iteratif di bawah ini secara berurutan. Pastikan setiap fase berjalan tanpa *error* di browser sebelum lanjut ke fase berikutnya.

---

## Fase 1: Foundation, Physics Sandbox & State Store
**Tujuan:** Menyiapkan arsitektur Next.js, *store* Zustand, simulasi arena fisika (`ObstacleProxy`, `TargetZoneProxy`), serta *workspace* 3D laboratorium robotika.

**Deliverables:**
- `src/types/simulator.ts` & `src/store/useSimulationStore.ts`
- `src/components/canvas/SimulationScene.tsx` (Dilengkapi `OrbitControls`, `Grid`, pencahayaan, `<Physics>` dari `@react-three/rapier`, serta cleanup memori WebGL melalui `src/lib/three/disposeSceneResources.ts`)
- `src/components/canvas/parts/shared/ObstacleProxy.tsx` & `src/components/canvas/parts/shared/TargetZoneProxy.tsx`
- `src/components/ui/InventoryPanel.tsx` & `src/components/ui/CanvasToolbar.tsx`

---

## Fase 2: Multi-Robot Blueprints, 3D Robot Parts & Magnetic Snapping
**Tujuan:** Membangun komponen 3D modular lintas-robot (`parts/shared/` dan `parts/robots/spider/`) beserta sistem *drag-and-drop*, *assembly stand* otomatis, dan *magnetic socket snapping*.

**Deliverables:**
- `src/lib/blueprints/spiderBlueprint.ts`, `src/lib/blueprints/blueprintRegistry.ts`, `src/lib/constants/hardwareCatalog.ts`, & `src/lib/constants/socketRegistry.ts`
- Komponen *mesh* prosedural di `src/components/canvas/parts/shared/*` (`ESP32Proxy.tsx`, `ServoProxy.tsx`, `DraggableRigidPart.tsx`, `AssemblyStand.tsx`) dan `src/components/canvas/parts/robots/spider/*` (`ChassisBase.tsx`, `SpiderLegProxy.tsx`)
- `src/components/canvas/parts/shared/AnchorMarker.tsx` & `src/hooks/usePartDragAndSync.ts`
- `src/lib/snapshot/presets.ts` & **"Load Preset"** di `CanvasToolbar.tsx` (`Empty Workbench`, `Assembled Spider (Unwired)`, `Ready-to-Walk Spider`)

---

## Fase 3: 3D Interactive 3-Pin Wiring System & X-Ray Mode
**Tujuan:** Mengizinkan pengguna menyambungkan kabel jumper 3D antara pin daya/GPIO ESP32 dan header 3-pin servo (`PWM`, `VCC`, `GND`) dengan validasi topologi rangkaian sebelum simulasi berjalan.

**Deliverables:**
- `src/components/canvas/parts/shared/PinNode.tsx` & 3-pin header (`${partId}_PWM`, `${partId}_VCC`, `${partId}_GND`) pada `ServoProxy.tsx`
- `src/components/canvas/WiringSystem.tsx` (Kabel `<QuadraticBezierLine>` 3D dengan dukungan *wiring mode* `'3-pin'` dan `'1-wire'`)
- `src/lib/microcontroller/circuitValidator.ts` & `src/components/ui/CircuitDiagnosticAlert.tsx`
- **Wiring View (`W`)** pada `SimulationScene.tsx` & `CameraViewController.tsx` (membuat mesh struktural semi-transparan non-raycast agar pin mudah diklik)

---

## Fase 4: Rapier Physics Rig, Revolute Joints & Live Telemetry
**Tujuan:** Mengubah robot yang sudah dirakit menjadi struktur fisik aktif di `@react-three/rapier` yang digerakkan oleh sendi motor (*Fixed & Revolute Joints*) dengan inspeksi telemetri *real-time*.

**Deliverables:**
- `src/components/canvas/JointSystem.tsx`, `src/components/canvas/AssemblyPhysicsJoints.tsx`, & `src/lib/physics/rigidBodyRegistry.ts`
- `src/components/ui/ServoCalibrationPanel.tsx` (*Manual Servo Test* slider $0^\circ$–$180^\circ$ / $-180^\circ$–$180^\circ$ untuk menguji gerakan sendi secara langsung)
- `src/components/ui/TelemetryHUD.tsx`, `src/lib/physics/telemetryState.ts`, & `src/components/canvas/PhysicsInspectorOverlay.tsx` (Menampilkan massa, kecepatan, perpindahan, arus `mA`, Center of Mass, dan kontak lantai kaki)

---

## Fase 5: Worker-Isolated Code IDE, Snapshot Serialization & LMS Embed
**Tujuan:** Menjalankan skrip kontrol robot secara aman di Web Worker terisolasi dan membungkus simulator sebagai modul *plug-and-play* untuk platform *e-learning* Next.js.

**Deliverables:**
- `src/components/ui/CodeEditorPanel.tsx`, `src/workers/robotScriptWorker.ts`, & `src/lib/worker/createRobotScriptWorker.ts` (Dilengkapi *watchdog timer* dan batas kuota iterasi)
- `src/lib/microcontroller/servoPinMap.ts` (Pemetaan perintah `PIN_1..8` & `ESP_D*` serta template *Quadruped Gait* bawaan pada preset *Ready-to-Walk*)
- `src/lib/snapshot/snapshotSerializer.ts` (`exportSimulationSnapshot` & `importSimulationSnapshot` berversi `schemaVersion: "1.0.0"` + *Undo/Redo* history stack)
- `src/components/RobotSimulatorEmbed.tsx` (Mendukung `allowedParts`, `presetSnapshot`, `readOnly`, `zeroCollisionMode`, `onStateChange`, dan `onChallengeSuccess`)