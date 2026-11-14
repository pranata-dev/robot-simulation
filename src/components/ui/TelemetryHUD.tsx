'use client';

import { useEffect, useState } from 'react';
import { Activity, Battery, Cpu, Gauge, Radar, Scale, X, Zap } from 'lucide-react';
import {
  INITIAL_PHYSICS_TELEMETRY,
  type PhysicsTelemetrySnapshot,
  physicsTelemetryRef,
} from '@/lib/physics/telemetryState';
import { useSimulationStore } from '@/store/useSimulationStore';

const HUD_REFRESH_MS = 100;

function getBatteryVisualState(level: number, isDark: boolean) {
  if (level > 50) {
    return {
      barClass: 'bg-emerald-500',
      textClass: isDark ? 'text-emerald-400' : 'text-emerald-600',
      statusLabel: 'NOMINAL',
    };
  }
  if (level > 20) {
    return {
      barClass: 'bg-amber-400',
      textClass: isDark ? 'text-amber-400' : 'text-amber-600',
      statusLabel: 'LOW',
    };
  }
  return {
    barClass: 'bg-rose-500',
    textClass: isDark ? 'text-rose-400' : 'text-rose-600',
    statusLabel: level <= 0 ? 'DEPLETED' : 'CRITICAL',
  };
}

/**
 * Floating scientific telemetry HUD displayed when Physics Inspector is toggled on.
 * Polls `physicsTelemetryRef` at 10 Hz for live mass, speed, displacement, and current draw.
 */
export default function TelemetryHUD() {
  const physicsInspectorOpen = useSimulationStore((state) => state.physicsInspectorOpen);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const sensorDistances = useSimulationStore((state) => state.sensorDistances);
  const batteryLevel = useSimulationStore((state) => state.batteryLevel);
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const theme = useSimulationStore((state) => state.theme);
  const setPhysicsInspectorOpen = useSimulationStore((state) => state.setPhysicsInspectorOpen);

  const [telemetry, setTelemetry] = useState<PhysicsTelemetrySnapshot>(INITIAL_PHYSICS_TELEMETRY);

  useEffect(() => {
    if (!physicsInspectorOpen) return;

    const syncTelemetry = () => {
      const snap = physicsTelemetryRef.current;
      setTelemetry({
        ...snap,
        centerOfMass: [...snap.centerOfMass],
      });
    };

    syncTelemetry();
    const timerId = setInterval(syncTelemetry, HUD_REFRESH_MS);
    return () => {
      clearInterval(timerId);
    };
  }, [physicsInspectorOpen]);

  const isDark = theme === 'dark';
  const isPlaying = simulationStatus === 'playing';
  const hasUltrasonic = workspaceParts.some((part) => part.type === 'ULTRASONIC_HCSR04');
  const readings = Object.values(sensorDistances).filter(
    (val) => typeof val === 'number' && Number.isFinite(val),
  );
  const minDistanceCm = readings.length > 0 ? Math.min(...readings) : null;
  const hasObstacleHit = minDistanceCm !== null && minDistanceCm < 999;
  const clampedBattery = Math.max(0, Math.min(100, batteryLevel));
  const batteryStyle = getBatteryVisualState(clampedBattery, isDark);

  if (!physicsInspectorOpen) {
    if (!isPlaying) return null;
    const pillClass = isDark
      ? 'border-slate-700/85 bg-slate-950/90 text-slate-100'
      : 'border-slate-300/90 bg-white/92 text-slate-800';
    const subClass = isDark ? 'text-slate-400' : 'text-slate-500';
    const trackClass = isDark ? 'bg-slate-800' : 'bg-slate-200';
    return (
      <aside
        aria-label="Live Robot Telemetry"
        className={`absolute top-16 right-4 z-10 flex items-center gap-3 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${pillClass}`}
      >
        <div className="flex items-center gap-2">
          <Battery className={`h-4 w-4 ${batteryStyle.textClass}`} />
          <div className="min-w-[88px] leading-tight">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold uppercase ${subClass}`}>Battery</span>
              <span className={`font-mono text-[11px] font-bold ${batteryStyle.textClass}`}>
                {clampedBattery <= 0 ? '0% DEPLETED' : `${clampedBattery.toFixed(0)}%`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Battery Level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(clampedBattery)}
              className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}
            >
              <div
                className={`h-full transition-all duration-150 ${batteryStyle.barClass}`}
                style={{ width: `${clampedBattery}%` }}
              />
            </div>
          </div>
        </div>

        {hasUltrasonic && (
          <>
            <div className="h-6 w-px bg-current/15" />
            <div className="flex items-center gap-2">
              <Radar className={`h-4 w-4 ${hasObstacleHit ? 'text-amber-400' : 'text-sky-400'}`} />
              <div className="leading-tight">
                <div className={`text-[10px] font-semibold uppercase ${subClass}`}>HC-SR04 Range</div>
                <div className="font-mono text-xs font-bold">
                  {minDistanceCm === null
                    ? 'Scanning...'
                    : hasObstacleHit
                      ? `${minDistanceCm.toFixed(1)} cm (${(minDistanceCm / 10).toFixed(2)} u)`
                      : '999 cm (Clear)'}
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    );
  }

  const cardClass = isDark
    ? 'border-slate-700/85 bg-slate-950/90 text-slate-100'
    : 'border-slate-300/90 bg-white/92 text-slate-800';
  const tileClass = isDark
    ? 'border-slate-800 bg-slate-900/80'
    : 'border-slate-200 bg-slate-50/90';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <aside
      aria-label="Physics & Electrical Telemetry Inspector"
      className={`absolute top-16 right-4 z-10 flex w-72 flex-col gap-2.5 rounded-xl border p-3.5 shadow-xl backdrop-blur-md ${cardClass}`}
    >
      <div className="flex items-center justify-between border-b border-current/10 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" />
          <div>
            <h3 className="text-xs font-bold tracking-wide uppercase">Physics Inspector</h3>
            <p className={`text-[10px] ${mutedClass}`}>
              {isPlaying ? 'Live telemetry active' : 'Press Run Simulation for dynamics'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPhysicsInspectorOpen(false)}
          aria-label="Close Physics Inspector"
          className={`rounded p-1 transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className={`rounded-lg border p-2 ${tileClass}`}>
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
            <Scale className="h-3 w-3 text-amber-400" />
            <span>Robot Mass</span>
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold">
            {telemetry.totalMassGrams.toFixed(0)} <span className="text-[11px] font-normal">g</span>
          </div>
          <div className={`font-mono text-[10px] ${mutedClass}`}>
            W = {telemetry.weightNewtons.toFixed(2)} N
          </div>
        </div>

        <div className={`rounded-lg border p-2 ${tileClass}`}>
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
            <Zap className="h-3 w-3 text-cyan-400" />
            <span>Current Draw</span>
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-cyan-400">
            {Math.round(telemetry.estimatedCurrentMa)}{' '}
            <span className="text-[11px] font-normal">mA</span>
          </div>
          <div className={`font-mono text-[10px] ${mutedClass}`}>
            {telemetry.activeServosMoving}/{telemetry.poweredServoCount} servos active
          </div>
        </div>

        <div className={`rounded-lg border p-2 ${tileClass}`}>
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
            <Gauge className="h-3 w-3 text-emerald-400" />
            <span>Linear Speed</span>
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold">
            {telemetry.chassisSpeedCmPerSec.toFixed(1)}{' '}
            <span className="text-[11px] font-normal">cm/s</span>
          </div>
          <div className={`font-mono text-[10px] ${mutedClass}`}>
            Contacts: {telemetry.groundedContacts}
          </div>
        </div>

        <div className={`rounded-lg border p-2 ${tileClass}`}>
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
            <Cpu className="h-3 w-3 text-rose-400" />
            <span>Displacement</span>
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold">
            {telemetry.displacementCm.toFixed(1)}{' '}
            <span className="text-[11px] font-normal">cm</span>
          </div>
          <div className={`font-mono text-[10px] ${mutedClass}`}>From origin (XZ)</div>
        </div>
      </div>

      <div className={`rounded-lg border p-2 text-xs ${tileClass}`}>
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
            <Battery className={`h-3.5 w-3.5 ${batteryStyle.textClass}`} />
            <span>Battery Level</span>
          </div>
          <div className={`font-mono text-xs font-bold ${batteryStyle.textClass}`}>
            {clampedBattery.toFixed(0)}% ({batteryStyle.statusLabel})
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Battery Level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clampedBattery)}
          className={`mt-1.5 h-2 w-full overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}
        >
          <div
            className={`h-full transition-all duration-150 ${batteryStyle.barClass}`}
            style={{ width: `${clampedBattery}%` }}
          />
        </div>
      </div>

      {hasUltrasonic && (
        <div className={`flex items-center justify-between rounded-lg border p-2 text-xs ${tileClass}`}>
          <div>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
              <Radar className={`h-3 w-3 ${hasObstacleHit ? 'text-amber-400' : 'text-sky-400'}`} />
              <span>Ultrasonic HC-SR04</span>
            </div>
            <div className={`mt-0.5 font-mono text-[10px] ${mutedClass}`}>
              {!isPlaying
                ? 'Idle — run simulation to ping'
                : hasObstacleHit
                  ? `${(minDistanceCm / 10).toFixed(2)} scene units ahead`
                  : 'No obstacle detected'}
            </div>
          </div>
          <div className={`font-mono text-sm font-bold ${hasObstacleHit ? 'text-amber-400' : 'text-sky-400'}`}>
            {!isPlaying
              ? '--'
              : minDistanceCm === null
                ? '...'
                : `${hasObstacleHit ? minDistanceCm.toFixed(1) : '999'} cm`}
          </div>
        </div>
      )}

      <div className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[10px] ${tileClass}`}>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
          CoM
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
          mg
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Normal
        </span>
        <span className={`font-mono ${mutedClass}`}>
          [{telemetry.centerOfMass.map((v) => v.toFixed(2)).join(', ')}]
        </span>
      </div>
    </aside>
  );
}

