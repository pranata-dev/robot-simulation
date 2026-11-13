# 3D Spider Robot Simulation Lab

Browser-based 3D quadruped robot assembly, wiring, and rigid-body physics sandbox built with Next.js, React Three Fiber, and Rapier.

## Overview

The simulator lets you assemble a spider robot from modular parts, wire microcontroller PWM pins to servo motors, place custom obstacles and finish pads on the floor, and drive the articulated joints with a lightweight control script.

Key functionality implemented in the workspace:

- **Socket-Snapping Assembly & Blueprints**: Modular robot blueprint architecture (`src/lib/blueprints/`) currently configured for the 8-DOF quadruped spider (`CHASSIS_BASE`, `ESP32_DEVKIT`, `SERVO_MG90S`, `LEG_TIBIA`). Drag parts on the XZ floor plane with automatic elevation to `AssemblyStand` working height (`y = 0.5`) when legs attach, or load instant starter configs via **Load Preset** (`Empty Workbench`, `Assembled Spider (Unwired)`, `Ready-to-Walk Spider`).
- **Interactive 3-Pin Wiring & X-Ray Mode**: Click 3D pin terminals on the ESP32 and 3-pin servo headers (`SERVO_PWM`, `SERVO_VCC`, `SERVO_GND` in `3-Pin` mode, or `PWM`-only in `1-Wire` mode) with live BFS short-circuit/topology validation. Press `W` (or click **Wiring View [W]**) to make structural parts semi-transparent and click-through while wiring, and press `Ctrl+Z` / `Ctrl+Shift+Z` for undo/redo.
- **Manual Servo Test & Live Physics Telemetry**: Test mounted servos directly with per-servo angle sliders (`ServoCalibrationPanel.tsx`), run isolated Web Worker scripts, toggle **Physics Inspector** for live Center of Mass and ground-contact markers, and monitor mass, velocity, displacement, and estimated current (`TelemetryHUD.tsx`).
- **Articulated Rigid-Body Physics**: Physics remain paused while dragging/wiring (`simulationStatus === 'idle'`) and step dynamically during simulation (`simulationStatus === 'playing'`). Mounted parts are connected via Rapier `useFixedJoint` and `useRevoluteJoint` constraints with collision group filtering (`interactionGroups`) between the environment (`group 0`) and robot parts (`group 1`).
- **Sandbox Obstacles and Theme Toggle**: Spawn and reposition `OBSTACLE_BLOCK` barriers and `TARGET_ZONE` finish pads (sensor volume detecting chassis entry). Toggle between dark (`#0f172a`) and light (`#f8fafc`) environments, reset robot part positions without removing placed obstacles, or clear the full workspace.

## Tech Stack

- **Framework**: Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript `5`
- **3D Rendering**: Three.js (`^0.187.0`), `@react-three/fiber` (`^9.8.2`), `@react-three/drei` (`^10.7.9`)
- **Physics Engine**: `@react-three/rapier` (`^2.2.0`)
- **State Management**: Zustand (`^5.1.0`)
- **Styling and Icons**: Tailwind CSS `4.3.3`, `lucide-react` (`^1.72.0`)

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm

### Installation and Commands

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. The 3D scene loads client-side (`ssr: false`) via `next/dynamic`.

Other available scripts:

```bash
npm run lint    # Run ESLint
npm run build   # Create production build
npm run start   # Serve production build
```

## Control Script Syntax

The script editor (`src/components/ui/CodeEditorPanel.tsx`) feeds `runSimulation` in `src/store/useSimulationStore.ts`. Commands are parsed line-by-line (case-insensitive):

| Command | Description | Range / Notes |
| --- | --- | --- |
| `PIN_<n>: <deg>` | Sets target angle on servos wired to PWM index `1..8` | Angles clamped to `-180..180` degrees |
| `ESP_D<gpio>: <deg>` | Sets target angle using explicit ESP32 pin ID | Example: `ESP_D13: 90` |
| `DELAY: <ms>` | Pauses script execution before the next command | Non-negative milliseconds |
| `LOOP` | Jumps back to the first line of the script | Continues until **Stop** is clicked |
| `# ...` / `// ...` | Comment lines | Ignored by parser |

PWM index mapping:

| Script Token | ESP32 Pin ID | GPIO |
| --- | --- | --- |
| `PIN_1` | `ESP_D13` | `13` |
| `PIN_2` | `ESP_D12` | `12` |
| `PIN_3` | `ESP_D14` | `14` |
| `PIN_4` | `ESP_D27` | `27` |
| `PIN_5` | `ESP_D26` | `26` |
| `PIN_6` | `ESP_D25` | `25` |
| `PIN_7` | `ESP_D33` | `33` |
| `PIN_8` | `ESP_D32` | `32` |

Example gait loop:

```text
# Servo control script (degrees, DELAY ms, LOOP)
PIN_1: 90
PIN_2: -45
DELAY: 800
PIN_1: 0
PIN_2: 0
DELAY: 800
LOOP
```

## Usage Workflow

1. **Spawn Chassis and Components**: Use the **Parts Inventory** panel (top-left) to spawn a `Main Spider Chassis`, `ESP32 Microcontroller`, `Micro Servo MG90S` units, and `Spider Leg` parts.
2. **Snap Assembly Together**: Drag the ESP32 over `SOCKET_MCU` on the chassis, drag servos onto the four corner hip sockets (`SOCKET_HIP_*`), and snap legs onto servo horns (`SOCKET_SERVO_HORN`). Green markers indicate valid socket targets; red markers indicate incompatible targets.
3. **Wire Servos to ESP32**: Click an ESP32 PWM pin node and then click a servo `SERVO_PWM` pin node to create a wire connection.
4. **Build a Sandbox Course (Optional)**: Spawn `Obstacle Block` and `Target Zone Pad` items and drag them anywhere on the floor grid.
5. **Run and Iterate**: Edit commands in **Control Script** (bottom-right) and click **Run Simulation**. Click **Stop** to pause physics, **Reset Position** (crosshair icon) to return robot parts to `[0, 0.5, 0]` while keeping placed obstacles/targets, or **Clear Workspace** (reset icon) to empty the scene.

## Project Structure

```text
robot-simulation/
├── docs/                                        # Design specs, coordinate maps, and state schemas
├── public/                                      # Static SVG assets
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx                           # Root layout and font configuration
    │   └── page.tsx                             # Main client page hosting UI overlays and 3D canvas
    ├── components/
    │   ├── RobotSimulatorEmbed.tsx              # Embeddable LMS wrapper with grading & snapshot props
    │   ├── canvas/
    │   │   ├── parts/
    │   │   │   ├── shared/                      # Robot-agnostic 3D parts & arena proxies
    │   │   │   │   ├── AnchorMarker.tsx         # Socket indicator spheres
    │   │   │   │   ├── AssemblyStand.tsx        # Semi-transparent assembly support jig & collider
    │   │   │   │   ├── DraggableRigidPart.tsx   # Shared Rapier RigidBody + XZ DragControls wrapper
    │   │   │   │   ├── ESP32Proxy.tsx           # ESP32 mesh and interactive power/GPIO pin nodes
    │   │   │   │   ├── ObstacleProxy.tsx        # Fixed draggable obstacle block
    │   │   │   │   ├── PartSelectionOverlay.tsx # Highlight bounds around selected part
    │   │   │   │   ├── PinNode.tsx              # Clickable pin terminal for wiring
    │   │   │   │   ├── ServoProxy.tsx           # MG90S servo proxy with horn socket and 3-pin header
    │   │   │   │   └── TargetZoneProxy.tsx      # Sensor finish pad triggering challenge completion
    │   │   │   └── robots/
    │   │   │       └── spider/                  # Spider quadruped robot parts
    │   │   │           ├── ChassisBase.tsx      # Spider chassis body, grounding & hip/MCU sockets
    │   │   │           └── SpiderLegProxy.tsx   # Articulated tibia leg colliders and foot tip
    │   │   ├── AssemblyPhysicsJoints.tsx        # Imperative fixed-joint helper
    │   │   ├── CameraViewController.tsx         # Camera transitions for Wiring View & reset
    │   │   ├── JointSystem.tsx                  # Declarative Fixed/Revolute joints and motor driver
    │   │   ├── PerformanceMonitorGuard.tsx      # Rolling FPS tracker -> adaptive performanceMode
    │   │   ├── PhysicsInspectorOverlay.tsx      # Live COM sphere & grounded contact indicators
    │   │   ├── SimulationScene.tsx              # Canvas, lights, floor, Rapier world & WebGL cleanup
    │   │   └── WiringSystem.tsx                 # Dynamic 3D quadratic Bezier jumper wires
    │   └── ui/
    │       ├── CanvasToolbar.tsx                # Wiring View [W], 3-Pin/1-Wire toggle, Presets, Undo/Redo
    │       ├── CircuitDiagnosticAlert.tsx       # Short-circuit / missing-wire diagnostic banner
    │       ├── CodeEditorPanel.tsx              # Control script editor + Manual Servo Test toggle
    │       ├── InventoryPanel.tsx               # Allowed-part spawner, theme switch, and reset controls
    │       ├── ServoCalibrationPanel.tsx        # Manual per-servo test sliders (Center / Start Test)
    │       └── TelemetryHUD.tsx                 # Live mass, speed, displacement, current, COM overlay
    ├── hooks/
    │   ├── useKeyboardShortcuts.ts              # Undo/Redo, Delete, Esc, Wiring View [W] hotkeys
    │   └── usePartDragAndSync.ts                # Pointer drag sync + socket snap targeting
    ├── lib/
    │   ├── blueprints/
    │   │   ├── blueprintRegistry.ts             # Lookup map for registered robot blueprints
    │   │   └── spiderBlueprint.ts               # Spider dimensions, sockets, BOM counts & presets
    │   ├── constants/
    │   │   ├── hardwareCatalog.ts               # Shared part specs, pin roles, and wire colors
    │   │   └── socketRegistry.ts                # Central blueprint-aware socket/preset resolver
    │   ├── microcontroller/
    │   │   ├── circuitValidator.ts              # BFS short-circuit and 3-pin/1-wire topology checks
    │   │   └── servoPinMap.ts                   # PIN_1..8 / ESP_D* pin mapping helpers
    │   ├── physics/
    │   │   ├── rigidBodyRegistry.ts             # Imperative RigidBody/horn lookup & velocity reset
    │   │   └── telemetryState.ts                # Zero-GC frame telemetry calculation helper
    │   ├── snapshot/
    │   │   ├── presets.ts                       # Built-in workbench & Ready-to-Walk presets
    │   │   └── snapshotSerializer.ts            # Schema 1.0.0 export/import JSON validator
    │   ├── three/
    │   │   └── disposeSceneResources.ts         # Recursive Three.js WebGL resource disposal
    │   └── worker/
    │       └── createRobotScriptWorker.ts       # Inline Blob Web Worker factory for script sandbox
    ├── store/
    │   └── useSimulationStore.ts                # Zustand store (parts, wires, blueprint, script, history)
    ├── types/
    │   └── simulator.ts                         # Shared TypeScript interfaces and union types
    ├── utils/
    │   ├── snapLogic.ts                         # XZ-plane socket proximity & hierarchy resolver
    │   └── transformMath.ts                     # Pure world transform math for sockets & presets
    └── workers/
        └── robotScriptWorker.ts                 # Isolated script worker with watchdog & quota guard
```

## Architecture Notes

- **Scale**: `1` scene unit equals `10 cm` (`0.1 m`), defined in `docs/3d_asset_socket_coordinate_map.md` and `src/lib/constants/socketRegistry.ts`.
- **Motor Tuning**: `JointSystem.tsx` drives `LEG_TIBIA` revolute joints using `AccelerationBased` motor control (`MOTOR_STIFFNESS = 500000`, `MOTOR_DAMPING = 20000`) and wakes connected bodies on every `servoAngles` update and physics frame while playing.
- **Worker Sandbox**: Control scripts run inside `src/workers/robotScriptWorker.ts` with a `1.5s` heartbeat watchdog (`worker.terminate()` on tight loops) and command rate quota.
- **Adaptive Performance**: `PerformanceMonitorGuard.tsx` samples rolling FPS in the render loop and automatically enables `performanceMode` (disabling real-time shadows and clamping `dpr` to `[1, 1]`) if FPS remains below 30 for over 2 seconds.

## E-Learning Platform Embedding (`<RobotSimulatorEmbed />`)

Import `<RobotSimulatorEmbed />` dynamically with SSR disabled inside Next.js lesson pages so Three.js, Rapier WASM, and Web Workers initialize strictly on the client:

```tsx
'use client';

import dynamic from 'next/dynamic';

const RobotSimulatorEmbed = dynamic(
  () => import('@/components/RobotSimulatorEmbed'),
  { ssr: false },
);

export function RoboticsLessonModule({ starterJson }: { starterJson?: string }) {
  return (
    <div className="h-[680px] w-full rounded-xl overflow-hidden border">
      <RobotSimulatorEmbed
        allowedParts={['CHASSIS_BASE', 'ESP32_DEVKIT', 'SERVO_MG90S', 'LEG_TIBIA']}
        presetSnapshot={starterJson}
        zeroCollisionMode
        onStateChange={(snapshotJson) => {
          // Persist debounced snapshot JSON (schemaVersion "1.0.0") to your LMS backend
          console.log('Saved progress snapshot:', snapshotJson);
        }}
        onChallengeSuccess={({ completionTimeMs, obstacleHits }) => {
          // Award lesson completion credit once the chassis dwells in TargetZoneProxy for 1.5s
          console.log('Challenge passed:', completionTimeMs, obstacleHits);
        }}
      />
    </div>
  );
}
```

### `<RobotSimulatorEmbed />` Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `allowedParts` | `PartType[]` | `undefined` (all) | Restricts parts listed in `InventoryPanel` and `spawnPart` to match the lesson scope. |
| `presetSnapshot` | `string` | `undefined` | Validated `1.0.0` JSON snapshot loaded on mount/change for starter assemblies or broken-circuit debugging tasks. |
| `readOnly` | `boolean` | `false` | Locks part spawning, dragging, snapping, wiring, deletion, workspace clearing, and script editing while allowing simulation playback. |
| `zeroCollisionMode` | `boolean` | `false` | Marks `challengeStatus` as `'failed'` if any robot part collides with an `ObstacleProxy`. |
| `onStateChange` | `(snapshotJson: string) => void` | `undefined` | Debounced (`400ms`) callback emitting serialized JSON (`schemaVersion: "1.0.0"`, `workspaceParts`, `wires`, `script`, `theme`). |
| `onChallengeSuccess` | `(metrics: { completionTimeMs: number; obstacleHits: number }) => void` | `undefined` | Fired once when `CHASSIS_BASE` dwells inside `TargetZoneProxy` for `1.5s` during active simulation (`challengeStatus === 'completed'`). |
| `className` | `string` | fills container | Custom wrapper classes for sizing inside responsive LMS lesson layouts. |

### Snapshot Schema Validation

`useSimulationStore` exposes `exportSimulationSnapshot()` and `importSimulationSnapshot(jsonString)` backed by `parseAndValidateSimulationSnapshot` in `src/lib/snapshot/snapshotSerializer.ts`. Payloads with missing/outdated `schemaVersion` (other than `"1.0.0"`), invalid vectors, broken parent-child attachment cycles, or unknown part/socket/pin IDs fail gracefully with `{ success: false, error }` without modifying active store state.
