'use client';

import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

export type SocketFeedbackState = 'idle' | 'valid' | 'invalid';

const DISABLE_RAYCAST = () => null;

interface AnchorMarkerProps {
  /** Socket or pin id; mirrored onto the Three.js object name for scene-graph lookups. */
  name: string;
  position: Vector3Tuple;
  rotation?: Vector3Tuple;
  radius?: number;
  color?: string;
  feedbackState?: SocketFeedbackState;
}

const FEEDBACK_STYLE: Record<
  SocketFeedbackState,
  { color: string; emissiveIntensity: number; scale: number }
> = {
  idle: { color: '#fca5a5', emissiveIntensity: 0.15, scale: 1 },
  valid: { color: '#A5AF79', emissiveIntensity: 0.85, scale: 1.35 },
  invalid: { color: '#ef4444', emissiveIntensity: 0.85, scale: 1.2 },
};

export default function AnchorMarker({
  name,
  position,
  rotation = [0, 0, 0],
  radius = 0.05,
  color,
  feedbackState = 'idle',
}: AnchorMarkerProps) {
  const isWiringXray = useSimulationStore((state) => state.viewMode === 'wiring_xray');
  const feedback = FEEDBACK_STYLE[feedbackState];
  const resolvedColor = color ?? feedback.color;
  const resolvedIntensity = color ? 0.4 : feedback.emissiveIntensity;
  const resolvedScale = color ? 1 : feedback.scale;

  return (
    <group name={name} position={position} rotation={rotation}>
      <mesh scale={resolvedScale} raycast={isWiringXray ? DISABLE_RAYCAST : undefined}>
        <sphereGeometry args={[radius]} />
        <meshStandardMaterial
          color={resolvedColor}
          emissive={resolvedColor}
          emissiveIntensity={resolvedIntensity}
        />
      </mesh>
    </group>
  );
}
