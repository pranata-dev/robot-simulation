# 3D Spider Robot Simulation Lab

Browser-based 3D quadruped robot assembly, wiring, and rigid-body physics sandbox built with Next.js, React Three Fiber, and Rapier.

## Overview

The simulator lets you assemble a spider robot from modular parts, wire microcontroller PWM pins to servo motors, place custom obstacles and finish pads on the floor, and drive the articulated joints with a lightweight control script.

Key functionality implemented in the workspace:

- **Socket-Snapping Assembly**: Spawn `CHASSIS_BASE`, `ESP32_DEVKIT`, `SERVO_MG90S`, and `LEG_TIBIA` parts from the inventory panel, drag them parallel to the XZ floor plane, and snap them onto compatible host sockets (`SOCKET_MCU`, `SOCKET_HIP_FL/FR/BL/BR`, and `SOCKET_SERVO_HORN`) using XZ-plane proximity checks (`SNAP_THRESHOLD = 0.5`).
- **Interactive Pin Wiring**: Click pin nodes on the ESP32 and servos to connect `ESP_VIN`, `ESP_GND`, and eight PWM GPIO pins (`ESP_D13`, `ESP_D12`, `ESP_D14`, `ESP_D27`, `ESP_D26`, `ESP_D25`, `ESP_D33`, `ESP_D32`) to servo `SERVO_PWM`, `SERVO_VCC`, and `SERVO_GND` terminals. Press `Esc` or click empty canvas space to cancel a draft wire.
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
├── docs/                                   # Design specs, coordinate maps, and state schemas
├── public/                                 # Static SVG assets
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx                      # Root layout and font configuration
    │   └── page.tsx                        # Main client page hosting UI overlays and 3D canvas
    ├── components/
    │   ├── canvas/
    │   │   ├── parts/
    │   │   │   ├── AnchorMarker.tsx        # Socket indicator spheres
    │   │   │   ├── ChassisBase.tsx         # Dynamic main chassis body and sockets
    │   │   │   ├── DraggableRigidPart.tsx  # Shared Rapier RigidBody + XZ DragControls wrapper
    │   │   │   ├── ESP32Proxy.tsx          # ESP32 mesh and interactive pin nodes
    │   │   │   ├── ObstacleProxy.tsx       # Fixed draggable obstacle block
    │   │   │   ├── PinNode.tsx             # Clickable pin terminal for wiring
    │   │   │   ├── ServoProxy.tsx          # MG90S servo proxy with horn socket and pins
    │   │   │   ├── SpiderLegProxy.tsx      # Articulated tibia leg colliders and foot tip
    │   │   │   └── TargetZoneProxy.tsx     # Sensor finish pad triggering level completion
    │   │   ├── AssemblyPhysicsJoints.tsx   # Legacy imperative fixed-joint helper
    │   │   ├── JointSystem.tsx             # Declarative Fixed/Revolute joints and motor driver
    │   │   ├── SimulationScene.tsx         # Canvas, lights, environment, floor, and physics world
    │   │   └── WiringSystem.tsx            # Dynamic 3D quadratic Bezier wires
    │   └── ui/
    │       ├── CodeEditorPanel.tsx         # Control script textarea and Run/Stop toggle
    │       └── InventoryPanel.tsx          # Spawner buttons, theme switch, and reset controls
    ├── lib/
    │   ├── constants/
    │   │   └── socketRegistry.ts           # Part catalog, BOM quantities, sockets, and pins
    │   └── physics/
    │       └── rigidBodyRegistry.ts        # Imperative RigidBody lookup helper
    ├── store/
    │   └── useSimulationStore.ts           # Zustand store for parts, wires, script, and theme
    ├── types/
    │   └── simulator.ts                    # Shared TypeScript interfaces and union types
    └── utils/
        └── snapLogic.ts                    # XZ-plane socket proximity and world transforms
```

## Architecture Notes

- **Scale**: `1` scene unit equals `10 cm` (`0.1 m`), defined in `docs/3d_asset_socket_coordinate_map.md` and `src/lib/constants/socketRegistry.ts`.
- **Motor Tuning**: `JointSystem.tsx` drives `LEG_TIBIA` revolute joints using `AccelerationBased` motor control (`MOTOR_STIFFNESS = 500000`, `MOTOR_DAMPING = 20000`) and wakes connected bodies on every `servoAngles` update and physics frame while playing.
