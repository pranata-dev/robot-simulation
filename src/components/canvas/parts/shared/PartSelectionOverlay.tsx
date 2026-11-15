'use client';

import { memo } from 'react';
import { Edges, Html } from '@react-three/drei';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartSelectionBounds, PartType } from '@/types/simulator';

interface PartSelectionOverlayProps {
  partId: string;
  partType: PartType;
  showRemoveBadge: boolean;
}

const DISABLE_RAYCAST = () => null;

const SELECTION_BOUNDS_BY_PART: Readonly<Record<PartType, PartSelectionBounds>> = {
  CHASSIS_BASE: { center: [0, 0, 0], size: [1.24, 0.19, 1.64] },
  ESP32_DEVKIT: { center: [0, 0.015, 0], size: [0.32, 0.1, 0.59] },
  BATTERY_2S: { center: [0, 0, 0], size: [0.39, 0.22, 0.74] },
  SERVO_MG90S: { center: [0, 0.02, -0.01], size: [0.36, 0.36, 0.28] },
  LEG_COXA: { center: [0.12, 0, 0], size: [0.34, 0.19, 0.24] },
  LEG_TIBIA: { center: [0, -0.17, 0.25], size: [0.14, 0.48, 0.64] },
  ULTRASONIC_HCSR04: { center: [0, 0.02, 0.01], size: [0.49, 0.28, 0.22] },
  OBSTACLE_BLOCK: { center: [0, 0, 0], size: [0.84, 0.39, 0.54] },
  TARGET_ZONE: { center: [0, 0.22, 0], size: [1.84, 0.48, 1.24] },
  physics_inclined_ramp: { center: [-0.4, 0.75, 0], size: [5.3, 1.6, 2.6] },
  physics_solid_sphere: { center: [0, 0, 0], size: [0.56, 0.56, 0.56] },
  physics_solid_cylinder: { center: [0, 0, 0], size: [0.56, 0.56, 0.46] },
  physics_hollow_cylinder: { center: [0, 0, 0], size: [0.56, 0.56, 0.46] },
  physics_collision_puck: { center: [0, 0, 0], size: [0.56, 0.56, 0.56] },
  physics_seesaw_beam: { center: [0, 0.36, 0], size: [3.1, 0.8, 0.8] },
  pivot_anchor: { center: [0, 0, 0], size: [0.6, 0.4, 0.6] },
  pendulum_bob: { center: [0, 0, 0], size: [0.65, 0.65, 0.65] },
  helical_spring_mass: { center: [0, 0, 0], size: [0.7, 0.7, 0.7] },
  dc_power_supply: { center: [0, 0.45, 0], size: [1.6, 0.9, 1.0] },
  breadboard_base: { center: [0, 0.08, 0], size: [2.4, 0.16, 1.5] },
  resistor_component: { center: [0, 0.12, 0], size: [0.85, 0.25, 0.28] },
  potentiometer_rheostat: { center: [0, 0.22, 0], size: [0.75, 0.45, 0.75] },
  galvanometer_ammeter: { center: [0, 0.4, 0], size: [1.1, 0.85, 0.9] },
  laser_emitter: { center: [0, 0.35, 0], size: [1.3, 0.7, 0.6] },
  plane_mirror: { center: [0, 0.6, 0], size: [0.25, 1.25, 1.5] },
  convex_lens: { center: [0, 0.6, 0], size: [0.35, 1.25, 1.4] },
  concave_lens: { center: [0, 0.6, 0], size: [0.35, 1.25, 1.4] },
  glass_prism: { center: [0, 0.55, 0], size: [1.2, 1.1, 1.2] },
  optical_target_screen: { center: [0, 0.6, 0], size: [0.3, 1.3, 1.6] },
};

function PartSelectionOverlay({ partId, partType, showRemoveBadge }: PartSelectionOverlayProps) {
  const bounds = SELECTION_BOUNDS_BY_PART[partType];
  const badgeY = bounds.center[1] + bounds.size[1] / 2 + 0.16;

  return (
    <group name={`${partId}_SELECTION_OVERLAY`}>
      <mesh position={bounds.center} raycast={DISABLE_RAYCAST}>
        <boxGeometry args={bounds.size} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.08} depthWrite={false} />
        <Edges color="#38bdf8" threshold={15} lineWidth={1.75} raycast={DISABLE_RAYCAST} />
      </mesh>

      {showRemoveBadge && (
        <Html position={[bounds.center[0], badgeY, bounds.center[2]]} center zIndexRange={[20, 0]}>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              useSimulationStore.getState().removePart(partId);
            }}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-400/50 bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-sky-100 shadow-lg backdrop-blur-sm transition-colors hover:border-rose-400 hover:bg-rose-600 hover:text-white"
          >
            <kbd className="rounded bg-slate-700/90 px-1.5 py-0.5 font-mono text-[10px] text-sky-200">
              Del / Backspace
            </kbd>
            <span>Remove</span>
          </button>
        </Html>
      )}
    </group>
  );
}

export default memo(PartSelectionOverlay);

