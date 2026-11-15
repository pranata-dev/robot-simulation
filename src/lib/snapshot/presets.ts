import {
  PART_CATALOG,
  POWER_LIPO_BATTERY_ID,
  ROLLING_SOLID_RADIUS,
  SEESAW_BEAM_HALF_HEIGHT,
  SEESAW_PIVOT_Y,
  getWireColorForPinRole,
} from '@/lib/constants/hardwareCatalog';
import { computeFootClearanceLift } from '@/lib/physics/footClearance';
import {
  DEFAULT_RAMP_ANGLE_DEG,
  computeBodyOnRampStartPose,
} from '@/lib/physics/rampGeometry';
import {
  type BuiltInPreset,
  type PartType,
  type PinId,
  SIMULATION_SCHEMA_VERSION,
  type SocketDefinition,
  type SocketId,
  type WireConnection,
  type WorkspacePart,
} from '@/types/simulator';
import { resolveHierarchyWithSockets } from '@/utils/transformMath';

const CHASSIS_ID = 'preset-chassis-base';
const ESP32_ID = 'preset-esp32-devkit';
const ULTRASONIC_ID = 'preset-ultrasonic-hcsr04';
const OBSTACLE_ID = 'preset-obstacle-block';

interface LegAssemblySpec {
  servoId: string;
  legId: string;
  socketId: SocketId;
  pwmPinId: PinId;
}

const QUADRUPED_LEG_SPECS: readonly LegAssemblySpec[] = [
  { servoId: 'preset-servo-fl', legId: 'preset-leg-fl', socketId: 'SOCKET_HIP_FL', pwmPinId: 'ESP_D13' },
  { servoId: 'preset-servo-fr', legId: 'preset-leg-fr', socketId: 'SOCKET_HIP_FR', pwmPinId: 'ESP_D12' },
  { servoId: 'preset-servo-bl', legId: 'preset-leg-bl', socketId: 'SOCKET_HIP_BL', pwmPinId: 'ESP_D14' },
  { servoId: 'preset-servo-br', legId: 'preset-leg-br', socketId: 'SOCKET_HIP_BR', pwmPinId: 'ESP_D27' },
];

const EMPTY_WORKBENCH_SCRIPT = [
  '# Empty Workbench — mount parts from the Inventory or load a spider preset.',
  'PIN_1: 0',
].join('\n');

const UNWIRED_SPIDER_SCRIPT = [
  '# Wire each servo PWM, VCC (5V), and GND pin to ESP32 before running.',
  'PIN_1: 30',
  'PIN_2: -30',
  'DELAY: 500',
  'PIN_1: -30',
  'PIN_2: 30',
  'DELAY: 500',
  'LOOP',
].join('\n');

const AUTONOMOUS_AVOIDANCE_SCRIPT = [
  '# Autonomous Obstacle Avoidance + Alternating Trot Gait',
  '# FL=PIN_1, FR=PIN_2, BL=PIN_3, BR=PIN_4 | Front HC-SR04 Trig=PIN_5, Echo=PIN_6',
  'LOOP',
  'IF_OBSTACLE_LESS_THAN: 15',
  '  # --- OBSTACLE AVOIDANCE (TURN RIGHT) ---',
  '  # Swing left legs (FL/BL) forward while right legs (FR/BR) hold planted',
  '  PIN_1: 45',
  '  PIN_3: 45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  # Drive left legs (FL/BL) backward to pivot chassis right around obstacle',
  '  PIN_1: -45',
  '  PIN_3: -45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  # Second pivot stroke to clear obstacle width cleanly',
  '  PIN_1: 45',
  '  PIN_3: 45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  '  PIN_1: -45',
  '  PIN_3: -45',
  '  PIN_2: 0',
  '  PIN_4: 0',
  '  DELAY: 400',
  'ELSE',
  '  # --- NORMAL WALK FORWARD (TROT GAIT) ---',
  '  # Diagonal Pair 1 Forward (FL+BR), Pair 2 Backward (FR+BL)',
  '  PIN_1: 45',
  '  PIN_4: 45',
  '  PIN_2: -45',
  '  PIN_3: -45',
  '  DELAY: 500',
  '  # Diagonal Pair 1 Backward (FL+BR), Pair 2 Forward (FR+BL)',
  '  PIN_1: -45',
  '  PIN_4: -45',
  '  PIN_2: 45',
  '  PIN_3: 45',
  '  DELAY: 500',
  'END_IF',
].join('\n');

function buildFullSpiderParts(
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
  chassisWorkingY: number,
  options: { includeBattery?: boolean } = {},
): WorkspacePart[] {
  const standingY = chassisWorkingY;
  const seedParts: WorkspacePart[] = [
    {
      id: CHASSIS_ID,
      type: 'CHASSIS_BASE',
      label: PART_CATALOG.CHASSIS_BASE.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
    },
    {
      id: ESP32_ID,
      type: 'ESP32_DEVKIT',
      label: PART_CATALOG.ESP32_DEVKIT.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'SOCKET_MCU',
    },
    {
      id: ULTRASONIC_ID,
      type: 'ULTRASONIC_HCSR04',
      label: PART_CATALOG.ULTRASONIC_HCSR04.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'socket-ultrasonic-front',
    },
  ];

  if (options.includeBattery) {
    seedParts.push({
      id: POWER_LIPO_BATTERY_ID,
      type: 'BATTERY_2S',
      label: PART_CATALOG.BATTERY_2S.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: 'socket-battery-mount',
    });
  }

  for (const spec of QUADRUPED_LEG_SPECS) {
    seedParts.push({
      id: spec.servoId,
      type: 'SERVO_MG90S',
      label: PART_CATALOG.SERVO_MG90S.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: CHASSIS_ID,
      socketId: spec.socketId,
    });
    seedParts.push({
      id: spec.legId,
      type: 'LEG_TIBIA',
      label: PART_CATALOG.LEG_TIBIA.label,
      position: [0, standingY, 0],
      rotation: [0, 0, 0],
      attachedTo: spec.servoId,
      socketId: 'SOCKET_SERVO_HORN',
    });
  }

  const resolvedParts = resolveHierarchyWithSockets(seedParts, socketsByPart, new Set([CHASSIS_ID]));
  // Guard: never let a resolved foot sphere start below the grid (y < FOOT_GROUND_CLEARANCE).
  const lift = computeFootClearanceLift(resolvedParts);
  if (lift === 0) return resolvedParts;
  return resolvedParts.map((part) => ({
    ...part,
    position: [part.position[0], part.position[1] + lift, part.position[2]],
  }));
}

function buildFullSpiderWires(): WireConnection[] {
  const powerColor = getWireColorForPinRole('POWER');
  const groundColor = getWireColorForPinRole('GROUND');
  const pwmColor = getWireColorForPinRole('PWM');

  const wires: WireConnection[] = [
    {
      id: 'wire-bat-vcc',
      fromPartId: POWER_LIPO_BATTERY_ID,
      fromPinId: 'VCC_OUT',
      toPartId: ESP32_ID,
      toPinId: 'ESP_VIN',
      color: powerColor,
    },
    {
      id: 'wire-bat-gnd',
      fromPartId: POWER_LIPO_BATTERY_ID,
      fromPinId: 'GND_OUT',
      toPartId: ESP32_ID,
      toPinId: 'ESP_GND',
      color: groundColor,
    },
  ];
  for (const spec of QUADRUPED_LEG_SPECS) {
    wires.push(
      {
        id: `wire-vcc-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: 'ESP_VIN',
        toPartId: spec.servoId,
        toPinId: 'SERVO_VCC',
        color: powerColor,
      },
      {
        id: `wire-gnd-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: 'ESP_GND',
        toPartId: spec.servoId,
        toPinId: 'SERVO_GND',
        color: groundColor,
      },
      {
        id: `wire-pwm-${spec.servoId}`,
        fromPartId: ESP32_ID,
        fromPinId: spec.pwmPinId,
        toPartId: spec.servoId,
        toPinId: 'SERVO_PWM',
        color: pwmColor,
      },
    );
  }
  wires.push(
    {
      id: `wire-vcc-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_VIN',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_VCC',
      color: powerColor,
    },
    {
      id: `wire-gnd-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_GND',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_GND',
      color: groundColor,
    },
    {
      id: `wire-trig-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_D26',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_TRIG',
      color: pwmColor,
    },
    {
      id: `wire-echo-${ULTRASONIC_ID}`,
      fromPartId: ESP32_ID,
      fromPinId: 'ESP_D25',
      toPartId: ULTRASONIC_ID,
      toPinId: 'US_ECHO',
      color: pwmColor,
    },
  );
  return wires;
}

/** Builds deterministic built-in assembly presets for the quadruped spider blueprint. */
export function buildSpiderPresets(
  socketsByPart: Readonly<Record<PartType, readonly SocketDefinition[]>>,
  chassisHalfHeight: number,
  chassisWorkingY: number,
): readonly BuiltInPreset[] {
  return [
    {
      id: 'empty-workbench',
      labId: 'robotics-spider',
      name: 'Empty Workbench',
      description: 'Grounded ChassisBase with no attached parts or wires.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: [
          {
            id: CHASSIS_ID,
            type: 'CHASSIS_BASE',
            label: PART_CATALOG.CHASSIS_BASE.label,
            position: [0, chassisHalfHeight, 0],
            rotation: [0, 0, 0],
          },
        ],
        wires: [],
        script: EMPTY_WORKBENCH_SCRIPT,
        wiringMode: '3-pin',
      },
    },
    {
      id: 'assembled-unwired',
      labId: 'robotics-spider',
      name: 'Assembled Spider (Unwired)',
      description: 'Chassis, ESP32, 4 hip servos, and 4 legs snapped cleanly with 0 wires.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: buildFullSpiderParts(socketsByPart, chassisWorkingY),
        wires: [],
        script: UNWIRED_SPIDER_SCRIPT,
        wiringMode: '3-pin',
      },
    },
    {
      id: 'ready-to-walk',
      labId: 'robotics-spider',
      name: 'Ready-to-Walk Spider',
      description:
        'Complete spider wired with HC-SR04 ultrasonic sensor, LiPo battery pack, forward obstacle block, and autonomous obstacle-avoidance script.',
      snapshot: {
        schemaVersion: SIMULATION_SCHEMA_VERSION,
        workspaceParts: [
          ...buildFullSpiderParts(socketsByPart, chassisWorkingY, { includeBattery: true }),
          {
            id: OBSTACLE_ID,
            type: 'OBSTACLE_BLOCK',
            label: PART_CATALOG.OBSTACLE_BLOCK.label,
            position: [0, PART_CATALOG.OBSTACLE_BLOCK.dimensions[1] / 2, 3.5],
            rotation: [0, 0, 0],
          },
        ],
        wires: buildFullSpiderWires(),
        script: AUTONOMOUS_AVOIDANCE_SCRIPT,
        wiringMode: '3-pin',
      },
    },
  ];
}

const SEESAW_SURFACE_Y = SEESAW_PIVOT_Y + SEESAW_BEAM_HALF_HEIGHT;
const SEESAW_MASS_Y = SEESAW_SURFACE_Y + ROLLING_SOLID_RADIUS + 0.005;

/** Curated Physics Mechanics & Rotational Dynamics Sandbox presets. */
export const PHYSICS_SANDBOX_PRESETS: readonly BuiltInPreset[] = [
  {
    id: 'physics-inclined-race',
    labId: 'physics-sandbox',
    name: 'Inclined Plane: Moment of Inertia Race',
    description:
      'Release a Solid Sphere (2/5 mR²), Solid Cylinder (1/2 mR²), and Hollow Cylinder (mR²) down an adjustable ramp simultaneously.',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'physics-race-ramp',
          type: 'physics_inclined_ramp',
          label: PART_CATALOG.physics_inclined_ramp.label,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-race-sphere',
          type: 'physics_solid_sphere',
          label: PART_CATALOG.physics_solid_sphere.label,
          position: computeBodyOnRampStartPose([0, 0, 0], DEFAULT_RAMP_ANGLE_DEG, -0.7, 0.35),
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-race-solid-cyl',
          type: 'physics_solid_cylinder',
          label: PART_CATALOG.physics_solid_cylinder.label,
          position: computeBodyOnRampStartPose([0, 0, 0], DEFAULT_RAMP_ANGLE_DEG, 0.0, 0.35),
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-race-hollow-cyl',
          type: 'physics_hollow_cylinder',
          label: PART_CATALOG.physics_hollow_cylinder.label,
          position: computeBodyOnRampStartPose([0, 0, 0], DEFAULT_RAMP_ANGLE_DEG, 0.7, 0.35),
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-race-finish',
          type: 'TARGET_ZONE',
          label: PART_CATALOG.TARGET_ZONE.label,
          position: [3.6, 0, 0],
          rotation: [0, Math.PI / 2, 0],
        },
      ],
      wires: [],
      script: '',
      wiringMode: '3-pin',
    },
  },
  {
    id: 'physics-momentum-collision',
    labId: 'physics-sandbox',
    name: 'Momentum & Elastic/Inelastic Collisions',
    description:
      'Head-on 2 kg spheres colliding along the X axis. Adjust Restitution (e = 0 to 1), Launch Speed, and 0.25x Slow-Mo.',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'physics-puck-left',
          type: 'physics_collision_puck',
          label: PART_CATALOG.physics_collision_puck.label,
          position: [-2.2, ROLLING_SOLID_RADIUS, 0],
          rotation: [0, 0, 0],
          initialVelocity: [4.0, 0, 0],
        },
        {
          id: 'physics-puck-right',
          type: 'physics_collision_puck',
          label: PART_CATALOG.physics_collision_puck.label,
          position: [2.2, ROLLING_SOLID_RADIUS, 0],
          rotation: [0, 0, 0],
          initialVelocity: [-4.0, 0, 0],
        },
        {
          id: 'physics-collision-zone',
          type: 'TARGET_ZONE',
          label: PART_CATALOG.TARGET_ZONE.label,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
      ],
      wires: [],
      script: '',
      wiringMode: '3-pin',
    },
  },
  {
    id: 'physics-torque-equilibrium',
    labId: 'physics-sandbox',
    name: 'Torque & Seesaw Balance',
    description:
      '3.0m balance beam (-1.5m to +1.5m). Balanced 1 kg at -1.0m vs. 2 kg at +0.5m (Στ = 0) — drag either mass in Idle Mode to tip it!',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'physics-seesaw-main',
          type: 'physics_seesaw_beam',
          label: PART_CATALOG.physics_seesaw_beam.label,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-seesaw-left-1kg',
          type: 'physics_solid_sphere',
          label: PART_CATALOG.physics_solid_sphere.label,
          position: [-1.0, SEESAW_MASS_Y, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-seesaw-right-2kg',
          type: 'physics_collision_puck',
          label: PART_CATALOG.physics_collision_puck.label,
          position: [0.5, SEESAW_MASS_Y, 0],
          rotation: [0, 0, 0],
        },
      ],
      wires: [],
      script: '',
      wiringMode: '3-pin',
    },
  },
  {
    id: 'physics-harmonic-oscillator',
    labId: 'physics-sandbox',
    name: "Simple Pendulum & Hooke's Spring Oscillator",
    description:
      'Dual SHM bench pairing a spherical pendulum (L=2.0m) and vertical helical spring-mass system with live energy conservation oscilloscope.',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'physics-pivot-pendulum',
          type: 'pivot_anchor',
          label: 'Pendulum Pivot Stand',
          position: [-1.5, 3.6, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-pendulum-bob-1',
          type: 'pendulum_bob',
          label: PART_CATALOG.pendulum_bob.label,
          position: [
            -1.5 + 2.0 * Math.sin((25 * Math.PI) / 180),
            3.5 - 2.0 * Math.cos((25 * Math.PI) / 180),
            0,
          ],
          rotation: [0, 0, 0],
          attachedTo: 'physics-pivot-pendulum',
        },
        {
          id: 'physics-pivot-spring',
          type: 'pivot_anchor',
          label: 'Spring Pivot Stand',
          position: [1.5, 3.6, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'physics-spring-mass-1',
          type: 'helical_spring_mass',
          label: PART_CATALOG.helical_spring_mass.label,
          position: [1.5, 1.0, 0],
          rotation: [0, 0, 0],
          attachedTo: 'physics-pivot-spring',
        },
      ],
      wires: [],
      script: '',
      wiringMode: '3-pin',
    },
  },
  {
    id: 'physics-wheatstone-bridge',
    labId: 'physics-sandbox',
    name: 'Virtual DC Breadboard & Wheatstone Bridge',
    description:
      '4-arm bridge circuit powered at 10V. Tune R_var toward 300 Ω to null the galvanometer current (Ig = 0 mA).',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'circuit-dc-supply',
          type: 'dc_power_supply',
          label: 'DC Power Supply (10V)',
          position: [-2.7, 0, -0.6],
          rotation: [0, 0.3, 0],
        },
        {
          id: 'circuit-breadboard',
          type: 'breadboard_base',
          label: PART_CATALOG.breadboard_base.label,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'circuit-r1',
          type: 'resistor_component',
          label: 'R1 (Arm A-B)',
          position: [-0.85, 0, -0.95],
          rotation: [0, 0, 0],
          circuitRole: 'r1',
          resistanceOhms: 100,
        },
        {
          id: 'circuit-r2',
          type: 'resistor_component',
          label: 'R2 (Arm A-D)',
          position: [0.85, 0, -0.95],
          rotation: [0, 0, 0],
          circuitRole: 'r2',
          resistanceOhms: 200,
        },
        {
          id: 'circuit-r3',
          type: 'resistor_component',
          label: 'R3 (Arm B-C)',
          position: [-0.85, 0, 1.05],
          rotation: [0, 0, 0],
          circuitRole: 'r3',
          resistanceOhms: 150,
        },
        {
          id: 'circuit-rvar',
          type: 'potentiometer_rheostat',
          label: 'R_var (Arm D-C)',
          position: [0.95, 0, 1.15],
          rotation: [0, 0, 0],
          circuitRole: 'rvar',
          resistanceOhms: 220,
        },
        {
          id: 'circuit-galv',
          type: 'galvanometer_ammeter',
          label: 'Center-Zero Galvanometer',
          position: [2.6, 0, 0],
          rotation: [0, -0.35, 0],
        },
      ],
      wires: [
        {
          id: 'wb-wire-pos',
          fromPartId: 'circuit-dc-supply',
          fromPinId: 'DC_POS',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_A',
          color: '#ef4444',
        },
        {
          id: 'wb-wire-neg',
          fromPartId: 'circuit-dc-supply',
          fromPinId: 'DC_NEG',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_C',
          color: '#1c1917',
        },
        {
          id: 'wb-wire-r1-a',
          fromPartId: 'circuit-r1',
          fromPinId: 'RES_2',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_A',
          color: '#f59e0b',
        },
        {
          id: 'wb-wire-r1-b',
          fromPartId: 'circuit-r1',
          fromPinId: 'RES_1',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_B',
          color: '#38bdf8',
        },
        {
          id: 'wb-wire-r2-a',
          fromPartId: 'circuit-r2',
          fromPinId: 'RES_1',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_A',
          color: '#f59e0b',
        },
        {
          id: 'wb-wire-r2-d',
          fromPartId: 'circuit-r2',
          fromPinId: 'RES_2',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_D',
          color: '#a855f7',
        },
        {
          id: 'wb-wire-r3-b',
          fromPartId: 'circuit-r3',
          fromPinId: 'RES_1',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_B',
          color: '#38bdf8',
        },
        {
          id: 'wb-wire-r3-c',
          fromPartId: 'circuit-r3',
          fromPinId: 'RES_2',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_C',
          color: '#64748b',
        },
        {
          id: 'wb-wire-rvar-d',
          fromPartId: 'circuit-rvar',
          fromPinId: 'POT_1',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_D',
          color: '#a855f7',
        },
        {
          id: 'wb-wire-rvar-c',
          fromPartId: 'circuit-rvar',
          fromPinId: 'POT_2',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_C',
          color: '#64748b',
        },
        {
          id: 'wb-wire-galv-pos',
          fromPartId: 'circuit-galv',
          fromPinId: 'GALV_POS',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_B',
          color: '#ef4444',
        },
        {
          id: 'wb-wire-galv-neg',
          fromPartId: 'circuit-galv',
          fromPinId: 'GALV_NEG',
          toPartId: 'circuit-breadboard',
          toPinId: 'BB_D',
          color: '#334155',
        },
      ],
      script: '',
      wiringMode: '3-pin',
    },
  },
  {
    id: 'physics-laser-optics',
    labId: 'physics-sandbox',
    name: '3D Laser Geometrical Optics Bench',
    description:
      '632nm He-Ne laser refracting through a convex lens and 60° crown-glass prism, reflecting off a plane mirror onto the target detector.',
    snapshot: {
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      workspaceParts: [
        {
          id: 'optics-laser',
          type: 'laser_emitter',
          label: PART_CATALOG.laser_emitter.label,
          position: [-3.2, 0, 0.18],
          rotation: [0, 0, 0],
        },
        {
          id: 'optics-convex-lens',
          type: 'convex_lens',
          label: PART_CATALOG.convex_lens.label,
          position: [-1.5, 0, 0.18],
          rotation: [0, 0, 0],
        },
        {
          id: 'optics-prism',
          type: 'glass_prism',
          label: PART_CATALOG.glass_prism.label,
          position: [0.0, 0, 0.0],
          rotation: [0, 0, 0],
        },
        {
          id: 'optics-mirror',
          type: 'plane_mirror',
          label: PART_CATALOG.plane_mirror.label,
          position: [2.0, 0, -0.58],
          rotation: [0, -0.58, 0],
        },
        {
          id: 'optics-target',
          type: 'optical_target_screen',
          label: PART_CATALOG.optical_target_screen.label,
          position: [0.95, 0, 1.35],
          rotation: [0, 1.1, 0],
        },
      ],
      wires: [],
      script: '',
      wiringMode: '3-pin',
    },
  },
];
