# Product Requirements Document (PRD)
## Unified 3D STEM Sandbox & Robotics Simulation Engine

- **Document Version:** 2.0.0
- **Baseline Commit:** `34a2c14`
- **Target Integration:** Web-based STEM E-Learning Platform (Next.js App Router)
- **Pedagogical Paradigm:** Pure Interactive Sandbox ("What-If" Free Exploration & Live Telemetry)

---

## 1. Executive Summary & Product Vision

This repository houses a modular, browser-based 3D interactive simulation engine designed to be embedded into a full-stack STEM E-Learning platform. Originally engineered as an interactive 3D Quadruped Spider Robot simulator with rigid-body physics, microcontroller pin wiring, and custom script execution, the project is architected to scale into a **Unified Multi-Subject 3D STEM Laboratory** covering:

1. **Robotics & Mechatronics** (Current Baseline + Wheeled/Arm Expansions)
2. **Physics** (Mechanics, Rotational Dynamics, Oscillations, Electricity & Magnetism, Geometrical Optics, Thermodynamics)
3. **Mathematics** (3D Vector Space, Linear Algebra Matrix Transformations, Conic Sections, Calculus Volumes, Probability Distributions)
4. **Chemistry** (VSEPR 3D Molecular Modeling, Crystal Lattices, Reaction Kinetics, Electrochemistry, Titration)
5. **Biology** (Musculoskeletal Biomechanics, 3D Cellular/Organ Anatomy, Neural Reflex Pathways, Molecular Genetics, Population Ecology)

### Core Design Philosophy: Pure Sandbox Exploration
Rather than restricting learners with rigid auto-grading locks or pass/fail barriers, every simulation module operates as an open-ended **Virtual Laboratory**:
- **Instant Scenario Presets:** Learners never have to start from a blank canvas; curated presets load complete working apparatuses in one click.
- **Real-Time "What-If" Manipulation:** Learners tweak physical, electrical, chemical, or mathematical parameters mid-simulation and immediately observe the 3D consequences.
- **Visualized Invisible Phenomena:** Forces, velocity vectors, optical rays, electric current, center of mass, and live time-series telemetry are rendered directly in the 3D viewport and HUD.

---

## 2. Current Technical Stack & Baseline Inventory (`34a2c14`)

### 2.1. Core Dependencies
- **Application Framework:** Next.js (App Router), React 18+, TypeScript, Tailwind CSS.
- **3D Rendering Engine:** Three.js, `@react-three/fiber` (R3F), `@react-three/drei`.
- **Physics Engine:** `@react-three/rapier` (Rapier3D WebAssembly rigid-body solver, multibody/impulse joints, and spatial raycasting).
- **State Management:** Zustand (`src/store/useSimulationStore.ts`).
- **Background Computation:** Web Workers (`src/workers/robotScriptWorker.ts`, `src/lib/worker/createRobotScriptWorker.ts`) for non-blocking DSL execution and numerical solvers.

### 2.2. Verified Baseline Modules (Production-Ready)
- **Viewport & Lifecycle:** `SimulationScene.tsx`, `CameraViewController.tsx`, `PerformanceMonitorGuard.tsx`, `PhysicsInspectorOverlay.tsx`, `disposeSceneResources.ts`, `RobotSimulatorEmbed.tsx`.
- **Physics & Joint Orchestration:** `JointSystem.tsx`, `AssemblyPhysicsJoints.tsx`, `jointConstraints.ts`, `rigidBodyRegistry.ts`, `footClearance.ts`, `servoMotorControl.ts`, `telemetryState.ts`.
- **Assembly & Snapping:** `DraggableRigidPart.tsx`, `AssemblyStand.tsx`, `AnchorMarker.tsx`, `PartSelectionOverlay.tsx`, `usePartDragAndSync.ts`, `snapLogic.ts`, `transformMath.ts`.
- **Microcontroller & Wiring:** `WiringSystem.tsx`, `PinNode.tsx`, `ESP32Proxy.tsx`, `ServoProxy.tsx`, `circuitValidator.ts`, `servoPinMap.ts`, `CircuitDiagnosticAlert.tsx`.
- **Hardware Extensions:** `ChassisBase.tsx`, `SpiderLegProxy.tsx`, `BatteryPackProxy.tsx` (mass & power drain), `UltrasonicSensorProxy.tsx` (Rapier raycasting), `ObstacleProxy.tsx`, `TargetZoneProxy.tsx`.
- **Blueprints & Serialization:** `spiderBlueprint.ts`, `blueprintRegistry.ts`, `hardwareCatalog.ts`, `socketRegistry.ts`, `presets.ts`, `snapshotSerializer.ts`.

---

## 3. Target Multi-Subject Directory Architecture

To accommodate Physics, Mathematics, Chemistry, and Biology modules alongside Robotics within a single repository without polluting existing modules, the codebase follows a **Shared Core + Domain Catalog** structure:

~~~text
src/
├── app/                                  # Next.js standalone sandbox test environment
├── components/
│   ├── RobotSimulatorEmbed.tsx           # Host E-Learning embed wrapper (evolves to SimulationLabEmbed)
│   ├── canvas/
│   │   ├── SimulationScene.tsx           # Master 3D Canvas, Lighting, Floor, and Physics provider
│   │   ├── CameraViewController.tsx      # Orbit, preset camera angles, focus transitions
│   │   ├── PerformanceMonitorGuard.tsx   # FPS monitor, DPR scaling, thermal throttling guard
│   │   ├── PhysicsInspectorOverlay.tsx   # 3D vectors (v, a, F), collider wireframes, CoM markers
│   │   ├── JointSystem.tsx               # Rapier Fixed, Revolute, Prismatic, Spherical joint manager
│   │   ├── AssemblyPhysicsJoints.tsx     # Assembly-state joint helpers
│   │   ├── WiringSystem.tsx              # 3D Bezier cable renderer (Power, Ground, GPIO, Circuit nodes)
│   │   └── parts/
│   │       ├── shared/                   # DraggableRigidPart, PinNode, AnchorMarker, ObstacleProxy, TargetZoneProxy
│   │       ├── robots/
│   │       │   ├── spider/               # ChassisBase, SpiderLegProxy
│   │       │   ├── rover/                # (Planned) DifferentialChassis, WheelProxy, IRLineSensorProxy
│   │       │   └── arm/                  # (Planned) BaseTurntable, ArmLinkProxy, GripperProxy
│   │       ├── power/                    # BatteryPackProxy, DCVoltageSourceProxy
│   │       ├── sensors/                  # UltrasonicSensorProxy, LaserEmitterProxy, LDRSensorProxy
│   │       ├── physics/                  # InclinedRampProxy, RollingSolidProxy, PulleyProxy, MirrorLensProxy, SpringMassProxy, MagnetCoilProxy
│   │       ├── math/                     # VectorArrow3D, MatrixTransformMesh, ConicSlicerProxy, GaltonBoardProxy
│   │       ├── chemistry/                # AtomSphereProxy, CovalentBondProxy, VoltaicCellProxy, ReactionChamberProxy
│   │       └── biology/                  # BoneLimbProxy, CellOrganelleProxy, NeuronNodeProxy, DNAHelixProxy
│   └── ui/
│       ├── CanvasToolbar.tsx             # Lab/Preset selector, Play/Pause/Stop, Slow-Mo (0.1x-2.0x), Step-Frame
│       ├── InventoryPanel.tsx            # Categorized part spawner filtered by active Subject Lab
│       ├── ServoCalibrationPanel.tsx     # Evolves into universal "What-If" Live Parameter Control Panel
│       ├── CodeEditorPanel.tsx           # DSL / JS Script Editor & Live Console
│       ├── TelemetryHUD.tsx              # Battery bar, Ultrasonic range, and real-time scrolling charts
│       └── CircuitDiagnosticAlert.tsx    # Non-punitive electrical/assembly diagnostic banners
├── hooks/
│   ├── useKeyboardShortcuts.ts           # Hotkeys for rotate, delete, wire mode, play/pause
│   └── usePartDragAndSync.ts             # 3D plane raycast dragging and socket snap preview
├── lib/
│   ├── blueprints/                       # blueprintRegistry.ts, spiderBlueprint.ts, physicsBlueprints.ts, etc.
│   ├── constants/                        # hardwareCatalog.ts, socketRegistry.ts
│   ├── microcontroller/                  # circuitValidator.ts, servoPinMap.ts
│   ├── physics/                          # footClearance.ts, jointConstraints.ts, rigidBodyRegistry.ts, servoMotorControl.ts, telemetryState.ts
│   ├── snapshot/                         # presets.ts, snapshotSerializer.ts
│   ├── three/                            # disposeSceneResources.ts
│   └── worker/                           # createRobotScriptWorker.ts
├── store/
│   └── useSimulationStore.ts             # Central Zustand store (modularized into domain slices)
├── types/
│   └── simulator.ts                      # TypeScript interfaces for Labs, Parts, Sockets, Wires, Telemetry
├── utils/
│   ├── snapLogic.ts                      # Proximity and quaternion alignment snapping
│   └── transformMath.ts                  # Relative joint frame, matrix, and vector math utilities
└── workers/
    └── robotScriptWorker.ts              # Async script interpreter and numerical simulation worker
~~~

---

## 4. Core Engine Sub-Systems & Technical Requirements

### 4.1. Sub-Engine 1: RigidBody & Joint Physics Engine
- **Collision Group Isolation:**
  - Group `1` (`interactionGroups(1, [0])`): Interconnected apparatus/robot components (`ChassisBase`, `ServoProxy`, `SpiderLegProxy`, `ESP32Proxy`, `BatteryPackProxy`, `UltrasonicSensorProxy`). They must never self-collide.
  - Group `0` (`interactionGroups(0, [0, 1])`): Environment floor (`y = 0`), `ObstacleProxy`, `TargetZoneProxy`, and free-interacting physics objects (rolling spheres/cylinders, colliding pucks, Galton balls).
- **Relative Joint Frame Computation:**
  - `JointSystem.tsx` computes exact local `anchorA`, `anchorB`, `frameA`, and `frameB` from assembled world transforms so transitioning from `isRunning: false` to `isRunning: true` causes zero spatial snapping or collapse.
- **Distal Contact Geometry:**
  - Complex articulated limbs (`SpiderLegProxy.tsx`) disable auto-bounding-box colliders (`colliders={false}`) and place a high-friction `<BallCollider>` strictly at the distal foot tip (`footClearance.ts`).

### 4.2. Sub-Engine 2: Socket & Snap Assembly Engine
- `socketRegistry.ts` and `snapLogic.ts` define typed attachment points (`servo_mount`, `leg_hinge`, `sensor_mount`, `battery_mount`, `weight_hook`, `covalent_bond_socket`, `organelle_slot`).
- When a user drags a compatible part within the snap radius in Assembly Mode, `AnchorMarker.tsx` highlights the target socket and aligns both position and local Euler/Quaternion orientation.

### 4.3. Sub-Engine 3: Node & Bezier Wiring Engine
- `WiringSystem.tsx` and `PinNode.tsx` render color-coded 3D cubic/quadratic Bezier tubes between connected pins that dynamically follow part transforms:
  - **Power Supply (`VCC_OUT`, `VIN`, `5V`, `ANODE`):** Red (`#ef4444`)
  - **Ground (`GND_OUT`, `GND`, `CATHODE`):** Black (`#1c1917`)
  - **Data / Signal / Sensor (`PIN_*`, `TRIG`, `ECHO`, `NEURON_AXON`):** Amber/Yellow/Cyan (`#f59e0b`, `#06b6d4`)

### 4.4. Sub-Engine 4: Raycast, Sensor & Web Worker Engine
- **Spatial Raycasting:** `UltrasonicSensorProxy.tsx` casts rays filtered to Group `0` (`interactionGroups(0, [0])`), throttling distance updates to `useSimulationStore` (`~100ms`) and forwarding readings to `robotScriptWorker.ts`.
- **DSL Interpreter (`robotScriptWorker.ts`):**
  - Supports `PIN_X: <deg>`, `P1..P4: <deg>`, `DELAY: <ms>`, `LOOP`, `IF_OBSTACLE_LESS_THAN: <cm>`, `ELSE`, and `END_IF`.
  - Enforces a minimum `50ms` async yield per loop iteration to prevent thread starvation.
- **Resource & Power Simulation (`BatteryPackProxy.tsx`):**
  - Realistic mass (`0.15` kg) mounted to the chassis to demonstrate Center of Mass shifts.
  - Smooth motor-work battery depletion (`work = Math.min(Math.abs(targetRad - currentRad), 0.5)`) with automatic motor cut-off at `0%`.

---

## 5. Global Cross-Subject Sandbox Features

### 5.1. Curated Scenario Presets (`presets.ts` & `CanvasToolbar.tsx`)
Every laboratory module must include ready-to-run presets selectable from the top toolbar:
- **Robotics Presets:**
  1. *Ready-to-Walk Spider (Autonomous Obstacle Avoidance)* — Complete spider with HC-SR04, LiPo battery, power/data wiring, obstacle block, and `IF_OBSTACLE_LESS_THAN` turning script.
  2. *Push-Up & Servo Calibration Test Rig* — Stationary posture test for exploring joint limits and battery drain.
  3. *Unwired Spider Kit (Assembly Practice)* — Pre-spawned parts ready for manual snapping and wiring.
- **Physics / Math / Chem / Bio Presets:** Each new subject lab must ship with at least 3 distinct presets demonstrating core phenomena immediately upon click.

### 5.2. Simulation Time-Control Bar (`CanvasToolbar.tsx`)
To help learners inspect fast physical phenomena (elastic collisions, pendulum equilibrium crossings, robot foot impact):
- **Play / Stop (Reset to Assembled Snapshot)**
- **Pause / Resume** (freezes Rapier timestep without resetting transforms)
- **Time-Scale Selector:** `0.1x`, `0.25x`, `0.5x`, `1.0x`, `2.0x`
- **Single-Step Button:** Advances the physics world by exactly one fixed timestep (`1/60s`) while paused.

### 5.3. Context-Aware "What-If" Parameter Panel (`ServoCalibrationPanel.tsx` Evolution)
When switching between labs, the right/side control panel adapts its sliders to the active domain:
- **Robotics Mode:** Manual servo angle sliders (`-90°` to `+90°`), motor stiffness/damping, battery drain multiplier.
- **Physics Mode:** Gravity preset selector (Earth $9.81\text{ m/s}^2$, Moon $1.62\text{ m/s}^2$, Mars $3.72\text{ m/s}^2$, Zero-G $0\text{ m/s}^2$), surface friction ($\mu \in [0, 2]$), restitution ($e \in [0, 1]$), ramp inclination angle ($\theta \in [0^\circ, 60^\circ]$), electrical resistance ($\Omega$), refractive index ($n$).
- **Math / Chem / Bio Mode:** $3\times 3$ matrix input cells, conic cutting-plane angle, reaction chamber temperature ($T$), muscle contraction slider ($0\%\text{–}100\%$).

### 5.4. Live Telemetry & 3D Vector Inspector (`TelemetryHUD.tsx` & `PhysicsInspectorOverlay.tsx`)
- **3D Vector Arrows:** Toggleable velocity ($\vec{v}$), acceleration ($\vec{a}$), net force ($\vec{F}$), and trajectory breadcrumb trails on any dynamic `RigidBody`.
- **HUD Mini-Charts:** Real-time scrolling canvas/SVG sparklines for $v\text{-}t$, Kinetic vs. Potential Energy ($E_k, E_p$), Pressure-Volume ($P\text{-}V$), pH titration curves, and Lotka-Volterra population graphs.

---

## 6. Comprehensive Subject Lab Specifications

### 6.1. Lab 1: Robotics & Mechatronics
1. **Quadruped Spider Robot (Completed):** 4x 1-DOF legs with inclined revolute axes, HC-SR04 raycast obstacle avoidance, LiPo battery weight & power wiring.
2. **2WD Differential Drive Rover:** Dual independent wheel velocity motors + downward IR raycast sensor for line-following sandbox experiments.
3. **3-DOF Robotic Arm:** Base yaw, shoulder pitch, elbow pitch, and claw gripper controlled via sliders or sequential script commands.

### 6.2. Lab 2: Physics (Primary Expansion Track)
1. **Mechanics & Dynamics:**
   - **Inclined Plane & Rolling Motion Lab:** Adjustable ramp ($\theta$), surface friction ($\mu$), and simultaneous release gate for a Solid Cylinder ($I = \frac{1}{2}mR^2$), Hollow Cylinder ($I = mR^2$), Solid Sphere ($I = \frac{2}{5}mR^2$), and Frictionless Sliding Block to compare translational vs. rotational acceleration.
   - **3D Projectile Motion Lab:** Cannon with adjustable pitch/yaw, muzzle speed ($v_0$), projectile mass, air drag ($k$), and planetary gravity ($g$), rendering a 3D parabolic trail and live $v_x, v_y$ vector decomposition.
   - **Momentum & Collision Table:** Low-friction 3D air table where learners launch spheres/pucks with configurable masses, velocities, impact parameters, and restitution ($e = 0$ inelastic to $e = 1$ elastic).
   - **Pulley & Simple Machines Builder:** Fixed, movable, and compound pulley blocks connected via tension constraints to observe mechanical advantage.
2. **Rotational Equilibrium & Oscillations:**
   - **Torque & Seesaw Balance ($\sum \tau = 0$):** Pivoted beam (`useRevoluteJoint`) with equidistant `AnchorMarker` sockets; learners snap different masses at various lever arms to test rotational equilibrium.
   - **Pendulum & Harmonic Oscillator Lab:** Simple pendulum, chaotic double pendulum, and vertical spring-mass system plotting real-time phase space and $E_k \leftrightarrow E_p$ energy conservation.
3. **Electricity & Magnetism:**
   - **Virtual DC Breadboard (Ohm's & Kirchhoff's Laws):** Reuses `WiringSystem.tsx` and `PinNode.tsx` to wire batteries, resistors, switches, potentiometers, and LEDs in series/parallel. Short circuits trigger visual alerts via `CircuitDiagnosticAlert.tsx`.
   - **Wheatstone Bridge & Sensor Balancing:** 4-resistor bridge with a sliding potentiometer, LDR sensor, and center galvanometer display.
   - **Faraday Electromagnetic Induction:** Learners drag a 3D bar magnet (`usePartDragAndSync.ts`) in and out of a solenoid coil; faster hand motion generates higher induced EMF ($\mathcal{E} = -N \frac{\Delta \Phi}{\Delta t}$) and illuminates a connected bulb.
4. **Geometrical Optics & Thermodynamics:**
   - **3D Laser Optics Bench:** Multi-bounce raycaster extending `UltrasonicSensorProxy.tsx`. Learners place and rotate flat mirrors, curved mirrors, convex/concave lenses, and prisms to observe reflection ($\theta_i = \theta_r$) and Snell's Law refraction ($n_1 \sin \theta_1 = n_2 \sin \theta_2$).
   - **Ideal Gas Piston Cylinder ($PV = nRT$):** 3D kinetic gas particles colliding inside a variable-volume cylinder with a movable piston and heat slider, plotting Isobaric, Isochoric, Isothermal, and Adiabatic curves on a live $P\text{-}V$ chart.

### 6.3. Lab 3: Mathematics
1. **3D Vector Space ($\mathbb{R}^3$) Playground:** Draggable 3D vector arrowheads rendering vector addition ($\vec{A}+\vec{B}$ parallelogram), dot product orthogonal projection, and cross product normal vector ($\vec{A}\times\vec{B}$).
2. **3D Matrix Transformation Visualizer:** Live $3\times 3$ transformation matrix editor applying real-time rotation, scaling, reflection, and shearing to a 3D unit cube/mesh via `transformMath.ts`.
3. **Conic Sections 3D Slicer:** Translucent double cone intersected by an interactive draggable/tiltable cutting plane that highlights the exact Circle, Ellipse, Parabola, or Hyperbola cross-section.
4. **Solids of Revolution & Riemann Partitions:** 2D curve revolved $360^\circ$ around the X or Y axis with a partition slider ($N$ cylinders/disks) transitioning from coarse approximations to smooth volumes.
5. **3D Galton Board (Binomial & Normal Distribution):** Hundreds of small Rapier spheres dropped through staggered `ObstacleProxy` pegs accumulating into Gaussian bell-curve bins.
6. **3D Polyhedra & Net Unfolder:** Interactive slider that unfolds 3D geometric solids (cube, pyramid, prism, dodecahedron) into flat 2D nets and highlights point-to-plane distances.

### 6.4. Lab 4: Chemistry
1. **3D Virtual Molymod & VSEPR Builder:** Atom spheres (`C, H, O, N, S, Halogens`) and covalent bond rods (single, double, triple, lone pair lobes) snapping at exact VSEPR geometries ($180^\circ$ linear, $120^\circ$ trigonal planar, $109.5^\circ$ tetrahedral, $107^\circ$ pyramidal, $104.5^\circ$ bent).
2. **Atomic Orbitals & Crystal Lattice Explorer:** 3D visualization of $s, p, d, f$ electron probability clouds ($n, l, m$) and unit cell packing (BCC, FCC, HCP).
3. **Collision Theory & Reaction Kinetics Chamber:** 3D particle box where temperature, volume, and catalyst sliders alter molecular collision frequency and activation energy ($E_a$) barrier crossings.
4. **Voltaic Cell & Electrolysis Lab:** Two electrolyte beakers, salt bridge, selectable metal electrodes ($\text{Zn, Cu, Ag, Fe}$), and external wiring (`WiringSystem.tsx`) displaying electron flow direction and cell voltage ($E^\circ_{\text{cell}}$).
5. **Acid-Base Titration Simulator:** Interactive burette drip control into an Erlenmeyer flask with indicator color transitions (Phenolphthalein, Bromothymol Blue, Methyl Red) and live pH curve plotting.

### 6.5. Lab 5: Biology
1. **Antagonistic Muscle & Joint Biomechanics:** 3D skeletal arm (humerus, radius, ulna) connected via a `RevoluteJoint` elbow; bicep and tricep contraction sliders apply opposing torques to lift varying hand weights.
2. **3D Cell & Organ Dissection Puzzle:** Modular animal cell, plant cell, human heart, and eye models built on `DraggableRigidPart.tsx` and `snapLogic.ts` with interactive organelle inspection cards.
3. **Neural Action Potential & Reflex Arc:** Node-based neural wiring (`WiringSystem.tsx`) from sensory receptor $\rightarrow$ afferent neuron $\rightarrow$ spinal cord interneuron $\rightarrow$ efferent motor neuron $\rightarrow$ muscle effector, animating depolarization waves.
4. **DNA Double Helix & Protein Synthesis Snap Builder:** Complementary base-pairing sockets (`A-T`, `G-C`) on a 3D sugar-phosphate backbone with animated transcription/translation playback.
5. **Membrane Osmosis & Diffusion Sandbox:** 3D phospholipid bilayer cross-section with adjustable solute concentrations demonstrating water movement across a semipermeable membrane.
6. **Lotka-Volterra Ecosystem Food Web:** Interactive species nodes connected in a trophic web, solved in `robotScriptWorker.ts` to plot real-time predator-prey population oscillations when a species population is perturbed.

---

## 7. Host E-Learning Platform Integration Contract

`src/components/RobotSimulatorEmbed.tsx` serves as the isolated embed boundary for the parent E-Learning Next.js platform:

~~~tsx
export interface SimulationLabEmbedProps {
  subject?: 'robotics' | 'physics' | 'math' | 'chemistry' | 'biology';
  labId?: string;               // e.g., 'spider-robot', 'inclined-plane', 'dc-breadboard', 'vsepr-molymod'
  initialPresetId?: string;     // Auto-loads preset snapshot on mount
  enableTimeControls?: boolean; // Enables Slow-Mo (0.1x-2.0x), Pause, Step-Frame
  hideCodeEditor?: boolean;     // Hides DSL editor in non-programmable labs
  onTelemetryChange?: (telemetry: Record<string, number>) => void;
}
~~~

### Strict Resource Cleanup Requirement
When a learner navigates away from a lesson page in the host E-Learning SPA:
1. Any active Web Worker instance (`robotScriptWorker.ts`) MUST be immediately terminated (`worker.terminate()`).
2. All custom Three.js geometries, materials, and textures MUST be disposed of via `src/lib/three/disposeSceneResources.ts`.
3. `PerformanceMonitorGuard.tsx` must gracefully release frame listeners to prevent WebGL context exhaustion.

---

## 8. Phased Development Roadmap

- **Phase 1 — Spider Robot & Core Physics Foundation (Completed in `34a2c14`):**
  - 3D Spider assembly, Rapier `FixedJoint` & `RevoluteJoint` relative anchor math, distal `BallCollider` foot clearance, `UltrasonicSensorProxy` raycasting, `BatteryPackProxy` (0.15kg mass + VIN/GND wiring), and conditional `IF_OBSTACLE_LESS_THAN` worker DSL.
- **Phase 2 — Universal Sandbox Controls & Lab Switcher (Next Immediate Step):**
  - Populate `blueprintRegistry.ts` to support multiple `labId` environments.
  - Add Time-Scale (`0.25x`, `0.5x`, `1x`, `2x`), Pause, and Step-Frame controls to `CanvasToolbar.tsx`.
  - Generalize `ServoCalibrationPanel.tsx` to support lab-specific "What-If" sliders.
- **Phase 3 — Physics Lab Expansion:**
  - Launch *Inclined Plane & Rolling Motion*, *3D Projectile Motion*, *Momentum Collision Table*, *Torque Seesaw*, and *Virtual DC Breadboard*.
- **Phase 4 — Math, Chemistry & Biology Sandbox Expansion:**
  - Launch *3D Vector/Matrix Playground*, *Galton Board*, *VSEPR Molymod Builder*, and *Muscle-Joint Biomechanics*.