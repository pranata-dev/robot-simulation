# AGENTS.md — AI Coding Guidelines & Architectural Guardrails

You are an autonomous AI software engineer working on the **Unified 3D STEM Sandbox & Robotics Simulation Engine** (`robot-simulation`). Before modifying any file, read `/docs/PRD.md` and strictly enforce every architectural and physics invariant documented below.

---

## 1. NON-NEGOTIABLE PHYSICS & RAPIER INVARIANTS (DO NOT BREAK)

### Rule 1: Collision Group Isolation & No Raw WASM Contact Mutation
- **NEVER call `disableJointContacts` or mutate raw Rapier WASM contact pairs inside render or `useFrame` loops.** Doing so causes recursive borrow panics (`RuntimeError: unreachable`) in `@dimforge/rapier3d-compat`.
- **Always use `interactionGroups` from `@react-three/rapier`:**
  - **Group 1 (`interactionGroups(1, [0])`):** Assigned to all interconnected robot or apparatus sub-parts (`ChassisBase`, `ESP32Proxy`, `ServoProxy`, `SpiderLegProxy`, `BatteryPackProxy`, `UltrasonicSensorProxy`). Group 1 parts must **ONLY** collide with Group 0 and **NEVER** collide with other Group 1 parts.
  - **Group 0 (`interactionGroups(0, [0, 1])`):** Assigned to the floor collider (`SimulationScene.tsx`), `ObstacleProxy`, `TargetZoneProxy`, inclined ramps, and free-colliding experimental bodies (rolling spheres, cylinders, collision pucks, Galton balls).
- **Floor Collider Specification (`src/components/canvas/SimulationScene.tsx`):**
  - Always keep the floor as a thick `<RigidBody type="fixed">` with `<CuboidCollider -0.5, 0.5, 0]} 50]} args="{[50," friction="{1.2}" position="{[0," restitution="{0}"/>` and `collisionGroups={interactionGroups(0, [0, 1])}` so its top surface rests strictly at `y = 0` and prevents high-velocity tunneling.

### Rule 2: RigidBody Lifecycle & Transform Sync Separation
- **Assembly Mode (`isRunning === false`):**
  - Parts are manipulated via `usePartDragAndSync.ts` and `snapLogic.ts`, reading transforms from `useSimulationStore`.
- **Simulation Mode (`isRunning === true`):**
  - **NEVER** pass reactive store `position` or `rotation` props directly to `<RigidBody>` or call `setTranslation` / `setRotation` / `setNextKinematicTranslation` inside `useFrame` while `isRunning === true`. Doing so overwrites Rapier's physics solver on every tick and freezes the simulation in mid-air.
  - Sync store transforms to Rapier RigidBodies **ONLY ONCE** inside a `useEffect` when transitioning from `isRunning: false -> true` (or on simulation reset), resetting linear and angular velocities (`setLinvel({x:0,y:0,z:0}, true)`, `setAngvel({x:0,y:0,z:0}, true)`).
  - Always set `canSleep={false}` on dynamic RigidBodies driven by joints, motors, or external forces so Rapier never puts them to sleep during `DELAY` intervals.

### Rule 3: Single Joint Orchestrator, Relative Anchors & Foot Clearance
- **Single Source of Truth:** `src/components/canvas/JointSystem.tsx` is the authoritative joint manager when `isRunning === true`. Do not create duplicate active joints in `AssemblyPhysicsJoints.tsx`.
- **Relative Anchor & Frame Calculation (`src/lib/physics/jointConstraints.ts`):**
  - Never initialize `useFixedJoint` or `useRevoluteJoint` with default `[0, 0, 0]` anchors and identity quaternions `[0, 0, 0, 1]` unless both bodies share the exact same world origin and orientation.
  - Always compute `anchorA` and `frameA` relative to the parent and child assembled transforms (`socketRegistry.ts`, `spiderBlueprint.ts`, `transformMath.ts`):
~~~tsx
const anchorA = childWorldPos.clone().sub(parentWorldPos).applyQuaternion(parentWorldQuat.clone().invert());
const frameA = parentWorldQuat.clone().invert().multiply(childWorldQuat);
~~~
- **Fresh Joint Remounting on Restart:**
  - When toggling `STOP` (`isRunning: false`) and `RUN` (`isRunning: true`), `<RigidBody>` switches between kinematic/fixed and dynamic, invalidating old WASM joint handles. Ensure `<JointSystem/>` remounts cleanly via a run key (`simulationRunId`) whenever a simulation starts.
- **Distal Foot Collider (`src/components/canvas/parts/robots/spider/SpiderLegProxy.tsx` & `src/lib/physics/footClearance.ts`):**
  - Never use a single auto-generated `cuboid` bounding box for the L-shaped `SpiderLegProxy`. Keep `colliders={false}` on the leg `<RigidBody>` and place a dedicated `<BallCollider>` at the exact local coordinates of the distal foot tip sphere so the leg arch and servo body have clear ground clearance above `y = 0`.

### Rule 4: Web Worker Lifecycle & DSL Execution (`src/workers/robotScriptWorker.ts`)
- **Clean Worker Termination:** Always call `worker.terminate()` on `stopSimulation()` and before creating a new worker in `runSimulation()`.
- **Dual Pin Addressing (`src/lib/microcontroller/servoPinMap.ts`):**
  - Support both physical GPIO names (`PIN_2`, `PIN_4`, `PIN_12`, `PIN_13`, `PIN_5`, `PIN_6`, `ESP_D*`) and 1-based indexed servo aliases (`PIN_1`..`PIN_4`, `P1`..`P4`) so both default presets and custom user scripts execute reliably.
- **Supported DSL Control Flow:**
  - Maintain full support for `LOOP`, `DELAY: <ms>`, `IF_OBSTACLE_LESS_THAN: <cm>`, `ELSE`, `END_IF`, and `#` comments.
  - Enforce a minimum fallback `await sleep(50)` per `LOOP` iteration if no explicit `DELAY` was executed, preventing synchronous infinite loops from locking the worker thread.
- **Motor Actuation in `useFrame`:**
  - In `JointSystem.tsx` / `servoMotorControl.ts`, convert target degrees to radians, call `joint.current.configureMotorPosition(targetRad, stiffness, damping)`, and explicitly call `.wakeUp()` on both parent and child RigidBodies.

### Rule 5: Battery Physics, Power Drain & Color-Coded Wiring
- **Realistic Battery Mass (`src/components/canvas/parts/power/BatteryPackProxy.tsx`):**
  - Keep the LiPo battery collider mass around `0.15` (150g). Never set it to multi-kilogram values (like `2.5`), which will stall `Micro Servo MG90S` joints and immobilize the robot.
- **Capped Stall Drain:**
  - Calculate instantaneous motor work as `const work = Math.min(Math.abs(targetRad - currentRad), 0.5)` and drain battery smoothly by `work * powerDrainRate * delta`. When `batteryLevel <= 0`, stop motor actuation and log `BATTERY DEPLETED`.
- **Wire Color Convention (`src/components/canvas/WiringSystem.tsx`):**
  - Power (`VCC_OUT`, `VIN`, `5V`): Red (`#ef4444`)
  - Ground (`GND_OUT`, `GND`): Black (`#1c1917`)
  - GPIO / Sensor Data: Yellow/Orange/Cyan

### Rule 6: Raycast Sensor Filtering & Throttling (`src/components/canvas/parts/sensors/UltrasonicSensorProxy.tsx`)
- Always pass `interactionGroups(0, [0])` to `world.castRay(...)` so ultrasonic and optical rays only detect Group 0 obstacles/environment and never hit the robot's own legs or chassis (Group 1).
- Throttle sensor distance writes to `useSimulationStore` and worker `postMessage` updates to `~100ms` intervals to avoid React re-render bottlenecks.

---

## 2. ARCHITECTURAL RULES FOR ADDING NEW STEM LABS (PHYSICS, MATH, CHEM, BIO)

1. **Pure Sandbox Approach:**
   - Do not introduce hard pass/fail locks or grading barriers unless explicitly instructed.
   - Focus every new lab on: (a) rich Preset scenarios in `presets.ts`, (b) interactive 3D manipulation via `DraggableRigidPart.tsx`, (c) live parameter sliders in `ServoCalibrationPanel.tsx` / `WhatIfControlPanel`, and (d) real-time vectors and telemetry in `PhysicsInspectorOverlay.tsx` and `TelemetryHUD.tsx`.
2. **Prevent Zustand Store Bloat (`src/store/useSimulationStore.ts`):**
   - Do NOT dump domain-specific mathematical solvers (e.g., Snell's law ray tracing, Kirchhoff matrix solvers, VSEPR angle calculators, or Lotka-Volterra RK4 integrators) directly inside `useSimulationStore.ts`.
   - Place all pure domain math and physics calculations inside modular helper files under `src/lib/physics/` or `src/utils/`, and keep `useSimulationStore.ts` strictly for state slices and actions.
3. **Standard Checklist for Adding a New Part or Apparatus:**
   - **Step 1:** Create the 3D proxy component under `src/components/canvas/parts/<domain>/`.
   - **Step 2:** Register part metadata, pin definitions, and default mass/collider config in `src/lib/constants/hardwareCatalog.ts`.
   - **Step 3:** If the part snaps to sockets, register its socket coordinates and orientation in `src/lib/constants/socketRegistry.ts`.
   - **Step 4:** Register the apparatus blueprint in `src/lib/blueprints/blueprintRegistry.ts` and add ready-to-run scenario presets in `src/lib/snapshot/presets.ts`.
4. **WebGL Memory Disposal (`src/lib/three/disposeSceneResources.ts`):**
   - Any dynamically allocated `THREE.BufferGeometry`, `THREE.Material`, or `THREE.Texture` (such as trajectory curves, laser beams, vector arrows, or dynamic wires) must clean up its GPU resources on unmount.

---

## 3. FILE OWNERSHIP & RESPONSIBILITY MATRIX

| File Path | Primary Responsibility |
| :--- | :--- |
| `src/components/RobotSimulatorEmbed.tsx` | Host E-Learning embed boundary & lifecycle cleanup |
| `src/components/canvas/SimulationScene.tsx` | R3F `<Canvas>`, `<Physics>`, lighting, floor collider (`y=0`), and scene orchestration |
| `src/components/canvas/JointSystem.tsx` | Active Rapier `useFixedJoint` & `useRevoluteJoint` instances and `useFrame` motor loop |
| `src/components/canvas/WiringSystem.tsx` | Dynamic 3D Bezier curves connecting `PinNode` endpoints (power, ground, signal) |
| `src/components/canvas/PhysicsInspectorOverlay.tsx` | 3D velocity/force vector arrows, CoM indicators, and debug wireframes |
| `src/components/canvas/parts/shared/DraggableRigidPart.tsx` | Universal wrapper managing `<RigidBody>`, `interactionGroups`, selection, and drag sync |
| `src/components/canvas/parts/robots/spider/SpiderLegProxy.tsx` | L-shaped leg mesh with distal foot-tip `<BallCollider>` |
| `src/components/canvas/parts/power/BatteryPackProxy.tsx` | LiPo battery 3D mesh (`0.15kg`), `VCC_OUT`/`GND_OUT` pins |
| `src/components/canvas/parts/sensors/UltrasonicSensorProxy.tsx` | HC-SR04 3D mesh, Rapier forward raycaster (`Group 0` filter), visual ray cone |
| `src/components/ui/CanvasToolbar.tsx` | Preset loader, Play/Stop/Pause, Time-Scale (`Slow-Mo`), Wiring & Inspector toggles |
| `src/components/ui/CodeEditorPanel.tsx` | DSL / JS script editor, Run/Stop trigger, and live worker console log viewer |
| `src/components/ui/ServoCalibrationPanel.tsx` | Live manual servo sliders & "What-If" sandbox variable controls |
| `src/components/ui/TelemetryHUD.tsx` | Real-time battery gauge, ultrasonic range readout, and live telemetry charts |
| `src/lib/constants/hardwareCatalog.ts` | Master catalog of all spawnable parts, pins, categories, and physical defaults |
| `src/lib/constants/socketRegistry.ts` | Local 3D coordinates and Euler/Quaternion offsets for snapping sockets |
| `src/lib/microcontroller/servoPinMap.ts` | Resolves GPIO (`PIN_2`, `PIN_4`, `PIN_12`, `PIN_13`) and indexed (`PIN_1..4`) commands to part IDs |
| `src/lib/physics/footClearance.ts` | Ground clearance math and initial standing elevation calculator |
| `src/lib/physics/jointConstraints.ts` | Relative `anchorA`/`frameA` math and joint constraint definitions |
| `src/lib/physics/servoMotorControl.ts` | Revolute joint motor target clamping, stiffness/damping, and wakeUp helpers |
| `src/lib/snapshot/presets.ts` | Curated ready-to-run snapshots and default control scripts per lab |
| `src/store/useSimulationStore.ts` | Global Zustand state (parts, wires, script, running state, battery, sensors) |
| `src/workers/robotScriptWorker.ts` | Web Worker DSL parser and async loop/conditional executor |

---

## 4. MANDATORY PRE-COMMIT & VERIFICATION WORKFLOW

Before finishing any task or reporting completion to the user, you MUST perform these checks:
1. **Static Type Check:** Run `npx tsc --noEmit` and resolve all TypeScript errors in `src/types/simulator.ts` and across modified components.
2. **Live Browser Verification (`http://localhost:3000`):**
   - Load the relevant preset from the `Load Preset` dropdown.
   - Click `RUN SIMULATION` and verify smooth 60 FPS physical motion without `RuntimeError: unreachable` WASM panics or console errors.
   - Verify that `TelemetryHUD.tsx` and the console inside `CodeEditorPanel.tsx` update accurately in real time.
   - Click `STOP`, modify a parameter or script line, and click `RUN SIMULATION` a second time to verify clean worker termination and joint remounting.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
