'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Award, Lock, ShieldAlert } from 'lucide-react';
import CanvasToolbar from '@/components/ui/CanvasToolbar';
import CircuitDiagnosticAlert from '@/components/ui/CircuitDiagnosticAlert';
import CodeEditorPanel from '@/components/ui/CodeEditorPanel';
import InventoryPanel from '@/components/ui/InventoryPanel';
import TelemetryHUD from '@/components/ui/TelemetryHUD';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { ChallengeMetrics, PartType } from '@/types/simulator';

const SimulationScene = dynamic(() => import('@/components/canvas/SimulationScene'), {
  ssr: false,
});

export interface RobotSimulatorEmbedProps {
  /** Optional allowlist of PartType values shown in the InventoryPanel for scoped lessons. */
  allowedParts?: PartType[];
  /** Serialized SimulationSnapshot JSON string for troubleshooting or starter scenes. */
  presetSnapshot?: string;
  /** Locks assembly, wiring, and script editing for read-only demonstrations. */
  readOnly?: boolean;
  /** Fails the active challenge immediately on any obstacle collision when true. */
  zeroCollisionMode?: boolean;
  /** Debounced callback invoked with serialized JSON whenever parts, wires, or script change. */
  onStateChange?: (snapshotJson: string) => void;
  /** Invoked once when the robot dwells inside TargetZoneProxy and completes the challenge. */
  onChallengeSuccess?: (metrics: ChallengeMetrics) => void;
  /** Optional container CSS classes (defaults to filling parent container). */
  className?: string;
}

const STATE_CHANGE_DEBOUNCE_MS = 400;

export default function RobotSimulatorEmbed({
  allowedParts,
  presetSnapshot,
  readOnly = false,
  zeroCollisionMode = false,
  onStateChange,
  onChallengeSuccess,
  className,
}: RobotSimulatorEmbedProps) {
  const theme = useSimulationStore((state) => state.theme);
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const wires = useSimulationStore((state) => state.wires);
  const script = useSimulationStore((state) => state.script);
  const challengeStatus = useSimulationStore((state) => state.challengeStatus);
  const obstacleHits = useSimulationStore((state) => state.obstacleHits);
  const completionTimeMs = useSimulationStore((state) => state.completionTimeMs);

  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const lastEmittedSnapshotRef = useRef<string | null>(null);
  const completionReportedRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onChallengeSuccessRef = useRef(onChallengeSuccess);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onChallengeSuccessRef.current = onChallengeSuccess;
  }, [onChallengeSuccess]);

  useEffect(() => {
    const store = useSimulationStore.getState();
    store.setEmbedConfig({
      allowedParts: allowedParts ?? null,
      readOnly,
      zeroCollisionMode,
    });
  }, [allowedParts, readOnly, zeroCollisionMode]);

  useEffect(() => {
    return () => {
      useSimulationStore.getState().setEmbedConfig({
        allowedParts: null,
        readOnly: false,
        zeroCollisionMode: false,
      });
    };
  }, []);

  useEffect(() => {
    if (!presetSnapshot) {
      return;
    }
    const store = useSimulationStore.getState();
    const result = store.importSimulationSnapshot(presetSnapshot);
    if (!result.success) {
      queueMicrotask(() => {
        setSnapshotError(result.error ?? 'Failed to load preset simulation snapshot.');
      });
      return;
    }
    lastEmittedSnapshotRef.current = store.exportSimulationSnapshot();
    queueMicrotask(() => {
      setSnapshotError(null);
    });
  }, [presetSnapshot]);

  useEffect(() => {
    if (!onStateChangeRef.current) return;

    const timerId = window.setTimeout(() => {
      const serialized = useSimulationStore.getState().exportSimulationSnapshot();
      if (serialized === lastEmittedSnapshotRef.current) {
        return;
      }
      lastEmittedSnapshotRef.current = serialized;
      onStateChangeRef.current?.(serialized);
    }, STATE_CHANGE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [workspaceParts, wires, script]);

  useEffect(() => {
    if (challengeStatus !== 'completed') {
      completionReportedRef.current = false;
      return;
    }
    if (completionReportedRef.current) return;
    completionReportedRef.current = true;
    onChallengeSuccessRef.current?.({
      completionTimeMs: completionTimeMs ?? 0,
      obstacleHits,
    });
  }, [challengeStatus, completionTimeMs, obstacleHits]);

  return (
    <div
      className={
        className ??
        `relative h-full w-full overflow-hidden ${
          theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'
        }`
      }
    >
      <InventoryPanel allowedParts={allowedParts} readOnly={readOnly} />
      <CanvasToolbar />
      <CircuitDiagnosticAlert />
      <TelemetryHUD />
      <CodeEditorPanel />
      <SimulationScene />

      <div className="pointer-events-none absolute top-16 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
        {readOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/40 bg-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-100 shadow-md backdrop-blur-sm">
            <Lock className="h-3.5 w-3.5 text-amber-300" />
            Read-Only Demo
          </span>
        )}
        {challengeStatus === 'completed' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-950/85 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-md backdrop-blur-sm">
            <Award className="h-3.5 w-3.5 text-yellow-300" />
            Challenge Passed ({((completionTimeMs ?? 0) / 1000).toFixed(1)}s, {obstacleHits}{' '}
            hit{obstacleHits === 1 ? '' : 's'})
          </span>
        )}
        {challengeStatus === 'failed' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/50 bg-rose-950/90 px-3 py-1 text-xs font-semibold text-rose-200 shadow-md backdrop-blur-sm">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            Collision Fault ({obstacleHits} hit{obstacleHits === 1 ? '' : 's'})
          </span>
        )}
      </div>

      {snapshotError && (
        <div
          role="alert"
          className="absolute top-28 left-1/2 z-20 max-w-md -translate-x-1/2 rounded-lg border border-rose-500/50 bg-rose-950/95 px-3.5 py-2 text-xs text-rose-100 shadow-xl backdrop-blur-sm"
        >
          {snapshotError}
        </div>
      )}
    </div>
  );
}

