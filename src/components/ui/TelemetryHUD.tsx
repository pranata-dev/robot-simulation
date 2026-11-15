'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Battery, Clock, Cpu, Gauge, Radar, Scale, Sparkles, X, Zap } from 'lucide-react';
import { getLabBlueprint } from '@/lib/blueprints/blueprintRegistry';
import { solveDcCircuitMna } from '@/lib/microcontroller/dcCircuitSolver';
import { traceOpticsBench } from '@/lib/physics/opticsRaytracer';
import {
  INITIAL_PHYSICS_TELEMETRY,
  type PhysicsTelemetrySnapshot,
  harmonicHistoryRef,
  physicsTelemetryRef,
} from '@/lib/physics/telemetryState';
import { useSimulationStore } from '@/store/useSimulationStore';

const HUD_REFRESH_MS = 100;

function HarmonicOscilloscope({
  samples,
  isDark,
}: {
  samples: typeof harmonicHistoryRef.samples;
  isDark: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.2)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      const gy = (h * g) / 4;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    if (samples.length < 2) return;
    let maxE = 0.5;
    for (const s of samples) {
      if (s.etotJ > maxE) maxE = s.etotJ;
      if (s.ekJ > maxE) maxE = s.ekJ;
      if (s.epJ > maxE) maxE = s.epJ;
    }
    maxE *= 1.1;

    const drawSeries = (getter: (s: (typeof samples)[number]) => number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / Math.max(1, samples.length - 1)) * (w - 4) + 2;
        const val = Math.max(0, getter(samples[i]));
        const y = h - 4 - (val / maxE) * (h - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawSeries((s) => s.epJ, '#f59e0b');
    drawSeries((s) => s.ekJ, '#38bdf8');
    drawSeries((s) => s.etotJ, '#22c55e');
  }, [samples, isDark]);

  return (
    <canvas
      ref={canvasRef}
      width={276}
      height={84}
      aria-label="Harmonic Energy Oscilloscope"
      className="w-full rounded-md border border-current/15"
    />
  );
}

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
  const activeLabId = useSimulationStore((state) => state.activeLabId);
  const physicsInspectorOpen = useSimulationStore((state) => state.physicsInspectorOpen);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const isPaused = useSimulationStore((state) => state.isPaused);
  const timeScale = useSimulationStore((state) => state.timeScale);
  const gravity = useSimulationStore((state) => state.gravity);
  const surfaceFriction = useSimulationStore((state) => state.surfaceFriction);
  const restitution = useSimulationStore((state) => state.restitution);
  const sensorDistances = useSimulationStore((state) => state.sensorDistances);
  const batteryLevel = useSimulationStore((state) => state.batteryLevel);
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const wires = useSimulationStore((state) => state.wires);
  const sourceVoltage = useSimulationStore((state) => state.sourceVoltage);
  const r1Ohms = useSimulationStore((state) => state.r1Ohms);
  const r2Ohms = useSimulationStore((state) => state.r2Ohms);
  const r3Ohms = useSimulationStore((state) => state.r3Ohms);
  const rVarOhms = useSimulationStore((state) => state.rVarOhms);
  const rxOhms = useSimulationStore((state) => state.rxOhms);
  const laserYawDeg = useSimulationStore((state) => state.laserYawDeg);
  const laserPitchDeg = useSimulationStore((state) => state.laserPitchDeg);
  const opticalElementYawDeg = useSimulationStore((state) => state.opticalElementYawDeg);
  const refractiveIndex = useSimulationStore((state) => state.refractiveIndex);
  const lensFocalLength = useSimulationStore((state) => state.lensFocalLength);
  const theme = useSimulationStore((state) => state.theme);
  const setPhysicsInspectorOpen = useSimulationStore((state) => state.setPhysicsInspectorOpen);

  const activeLab = getLabBlueprint(activeLabId);
  const labUiConfig = activeLab.uiConfig;
  const isPhysicsLab = activeLab.subject === 'physics';
  const isPlaying = simulationStatus === 'playing';
  const hasCircuitBench = workspaceParts.some(
    (p) => p.type === 'dc_power_supply' || p.type === 'breadboard_base',
  );
  const hasOpticsBench = workspaceParts.some(
    (p) => p.type === 'laser_emitter' || p.type === 'optical_target_screen',
  );
  const hasHarmonicBench = workspaceParts.some(
    (p) => p.type === 'pendulum_bob' || p.type === 'helical_spring_mass',
  );
  const shouldPollTelemetry = physicsInspectorOpen || (isPhysicsLab && isPlaying);

  const mnaSolution = useMemo(
    () =>
      hasCircuitBench
        ? solveDcCircuitMna(workspaceParts, wires, {
            sourceVoltage,
            r1Ohms,
            r2Ohms,
            r3Ohms,
            rVarOhms,
            rxOhms,
          })
        : null,
    [hasCircuitBench, workspaceParts, wires, sourceVoltage, r1Ohms, r2Ohms, r3Ohms, rVarOhms, rxOhms],
  );

  const opticsTrace = useMemo(
    () =>
      hasOpticsBench
        ? traceOpticsBench(workspaceParts, {
            laserYawDeg,
            laserPitchDeg,
            opticalElementYawDeg,
            refractiveIndex,
            lensFocalLength,
          })
        : null,
    [
      hasOpticsBench,
      workspaceParts,
      laserYawDeg,
      laserPitchDeg,
      opticalElementYawDeg,
      refractiveIndex,
      lensFocalLength,
    ],
  );

  const [telemetry, setTelemetry] = useState<PhysicsTelemetrySnapshot>(INITIAL_PHYSICS_TELEMETRY);
  const [harmonicSamples, setHarmonicSamples] = useState(() => [...harmonicHistoryRef.samples]);

  useEffect(() => {
    if (!shouldPollTelemetry) return;

    const syncTelemetry = () => {
      const snap = physicsTelemetryRef.current;
      setTelemetry({
        ...snap,
        centerOfMass: [...snap.centerOfMass],
      });
      setHarmonicSamples([...harmonicHistoryRef.samples]);
    };

    syncTelemetry();
    const timerId = setInterval(syncTelemetry, HUD_REFRESH_MS);
    return () => {
      clearInterval(timerId);
    };
  }, [shouldPollTelemetry]);

  const isDark = theme === 'dark';
  const gravityMagnitude = Math.hypot(gravity[0], gravity[1], gravity[2]);
  const hasUltrasonic =
    labUiConfig.showUltrasonicTelemetry &&
    workspaceParts.some((part) => part.type === 'ULTRASONIC_HCSR04');
  const readings = Object.values(sensorDistances).filter(
    (val) => typeof val === 'number' && Number.isFinite(val),
  );
  const minDistanceCm = readings.length > 0 ? Math.min(...readings) : null;
  const hasObstacleHit = minDistanceCm !== null && minDistanceCm < 999;
  const clampedBattery = Math.max(0, Math.min(100, batteryLevel));
  const batteryStyle = getBatteryVisualState(clampedBattery, isDark);

  if (isPhysicsLab) {
    const showSpecializedBench = hasCircuitBench || hasOpticsBench || hasHarmonicBench;
    if (!physicsInspectorOpen && !isPlaying && !hasCircuitBench && !hasOpticsBench) return null;

    const cardClass = isDark
      ? 'border-slate-700/85 bg-slate-950/90 text-slate-100'
      : 'border-slate-300/90 bg-white/92 text-slate-800';
    const tileClass = isDark
      ? 'border-slate-800 bg-slate-900/80'
      : 'border-slate-200 bg-slate-50/90';
    const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
    const totalEnergyJ = telemetry.freeBodyKineticEnergyJ + telemetry.freeBodyPotentialEnergyJ;

    if (mnaSolution?.hasDcCircuit) {
      const currentMa = mnaSolution.galvanometerCurrentAmps * 1000;
      const totalPowerMw =
        mnaSolution.branches.reduce((acc, branch) => acc + branch.powerWatts, 0) * 1000;
      return (
        <aside
          aria-label="DC Circuit & Wheatstone Telemetry"
          className={`absolute top-16 right-4 z-10 flex w-80 flex-col gap-2.5 rounded-xl border p-3.5 shadow-xl backdrop-blur-md ${cardClass}`}
        >
          <div className="flex items-center justify-between border-b border-current/10 pb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <div>
                <h3 className="text-xs font-bold tracking-wide uppercase">DC Circuit Telemetry</h3>
                <p className={`text-[10px] ${mutedClass}`}>Modified Nodal Analysis (MNA)</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                mnaSolution.hasShortCircuit
                  ? 'bg-rose-500/20 text-rose-400'
                  : mnaSolution.isBalanced
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : mnaSolution.hasOpenBranch
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {mnaSolution.hasShortCircuit
                ? 'SHORT'
                : mnaSolution.isBalanced
                  ? 'BRIDGE BALANCED'
                  : mnaSolution.hasOpenBranch
                    ? 'OPEN BRANCH'
                    : 'UNBALANCED'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Galvanometer Ig
              </div>
              <div
                className={`mt-0.5 font-mono text-sm font-bold ${
                  mnaSolution.isBalanced ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {currentMa >= 0 ? '+' : ''}
                {currentMa.toFixed(2)} <span className="text-[11px] font-normal">mA</span>
              </div>
              <div className={`font-mono text-[10px] ${mutedClass}`}>
                &Delta;V_BD = {mnaSolution.bridgeDiffVolts.toFixed(3)} V
              </div>
            </div>

            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Equivalent R_eq
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-sky-400">
                {mnaSolution.equivalentResistanceOhms !== null
                  ? `${mnaSolution.equivalentResistanceOhms.toFixed(1)} Ω`
                  : '∞ Ω'}
              </div>
              <div className={`font-mono text-[10px] ${mutedClass}`}>
                P = {totalPowerMw.toFixed(1)} mW
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-4 gap-1.5 rounded-lg border p-2 font-mono text-[10px] ${tileClass}`}>
            <div>
              <div className={mutedClass}>V_A</div>
              <div className="font-bold text-amber-400">
                {mnaSolution.nodeVoltages.nodeA?.toFixed(2) ?? '--'}V
              </div>
            </div>
            <div>
              <div className={mutedClass}>V_B</div>
              <div className="font-bold text-sky-400">
                {mnaSolution.nodeVoltages.nodeB?.toFixed(2) ?? '--'}V
              </div>
            </div>
            <div>
              <div className={mutedClass}>V_C</div>
              <div className="font-bold text-slate-400">
                {mnaSolution.nodeVoltages.nodeC?.toFixed(2) ?? '--'}V
              </div>
            </div>
            <div>
              <div className={mutedClass}>V_D</div>
              <div className="font-bold text-purple-400">
                {mnaSolution.nodeVoltages.nodeD?.toFixed(2) ?? '--'}V
              </div>
            </div>
          </div>
        </aside>
      );
    }

    if (opticsTrace?.hasOpticsBench) {
      return (
        <aside
          aria-label="Geometrical Optics Telemetry"
          className={`absolute top-16 right-4 z-10 flex w-80 flex-col gap-2.5 rounded-xl border p-3.5 shadow-xl backdrop-blur-md ${cardClass}`}
        >
          <div className="flex items-center justify-between border-b border-current/10 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-rose-400" />
              <div>
                <h3 className="text-xs font-bold tracking-wide uppercase">Optics Bench Telemetry</h3>
                <p className={`text-[10px] ${mutedClass}`}>
                  632nm He-Ne ({opticsTrace.segments.length} ray segments)
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                opticsTrace.targetHit
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : opticsTrace.totalInternalReflection
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-500/20 text-slate-400'
              }`}
            >
              {opticsTrace.targetHit
                ? 'TARGET HIT'
                : opticsTrace.totalInternalReflection
                  ? 'TIR ACTIVE'
                  : 'ALIGN BEAM'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Incident &theta;i
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-sky-400">
                {opticsTrace.primaryIncidentDeg !== null
                  ? `${opticsTrace.primaryIncidentDeg.toFixed(1)}°`
                  : '--'}
              </div>
            </div>

            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Refract / Reflect &theta;t
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-amber-400">
                {opticsTrace.primaryOutgoingDeg !== null
                  ? `${opticsTrace.primaryOutgoingDeg.toFixed(1)}°`
                  : '--'}
              </div>
            </div>

            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Critical Angle &theta;c
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-emerald-400">
                {opticsTrace.criticalAngleDeg !== null
                  ? `${opticsTrace.criticalAngleDeg.toFixed(1)}°`
                  : 'N/A'}
              </div>
            </div>

            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>
                Internal Reflection
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-rose-400">
                {opticsTrace.totalInternalReflection ? 'YES (TIR)' : 'NO'}
              </div>
            </div>
          </div>
        </aside>
      );
    }

    if (showSpecializedBench && (hasHarmonicBench || telemetry.hasHarmonicOscillator)) {
      return (
        <aside
          aria-label="Harmonic Oscillator Telemetry"
          className={`absolute top-16 right-4 z-10 flex w-80 flex-col gap-2.5 rounded-xl border p-3.5 shadow-xl backdrop-blur-md ${cardClass}`}
        >
          <div className="flex items-center justify-between border-b border-current/10 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-sky-400" />
              <div>
                <h3 className="text-xs font-bold tracking-wide uppercase">Harmonic Oscilloscope</h3>
                <p className={`text-[10px] ${mutedClass}`}>
                  {telemetry.harmonicMode === 'spring'
                    ? 'Hooke Spring Mass System'
                    : 'Simple Spherical Pendulum'}
                </p>
              </div>
            </div>
            <span className="font-mono text-[10px] font-bold text-emerald-400">
              {timeScale}x
            </span>
          </div>

          <HarmonicOscilloscope samples={harmonicSamples} isDark={isDark} />

          <div className="flex items-center justify-between font-mono text-[10px]">
            <span className="text-sky-400">Ek: {telemetry.harmonicEkJ.toFixed(2)} J</span>
            <span className="text-amber-400">Ep: {telemetry.harmonicEpJ.toFixed(2)} J</span>
            <span className="text-emerald-400">Etot: {telemetry.harmonicEtotJ.toFixed(2)} J</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>Period (T)</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-sky-400">
                {telemetry.harmonicPeriodSec.toFixed(2)} <span className="text-[11px] font-normal">s</span>
              </div>
            </div>
            <div className={`rounded-lg border p-2 ${tileClass}`}>
              <div className={`text-[10px] font-semibold uppercase ${mutedClass}`}>Frequency (f)</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-amber-400">
                {telemetry.harmonicFrequencyHz.toFixed(2)} <span className="text-[11px] font-normal">Hz</span>
              </div>
            </div>
          </div>
        </aside>
      );
    }

    return (
      <aside
        aria-label="Physics Kinematics Telemetry HUD"
        className={`absolute top-16 right-4 z-10 flex w-80 flex-col gap-2.5 rounded-xl border p-3.5 shadow-xl backdrop-blur-md ${cardClass}`}
      >
        <div className="flex items-center justify-between border-b border-current/10 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            <div>
              <h3 className="text-xs font-bold tracking-wide uppercase">Kinematics Telemetry</h3>
              <p className={`max-w-52 truncate text-[10px] ${mutedClass}`}>
                {telemetry.freeBodyCount > 0
                  ? `Tracked: ${telemetry.freeBodyTrackedLabel} (${telemetry.freeBodyCount} bodies)`
                  : 'Spawn or select a rolling/collision body'}
              </p>
            </div>
          </div>
          {physicsInspectorOpen && (
            <button
              type="button"
              onClick={() => setPhysicsInspectorOpen(false)}
              aria-label="Close Physics Inspector"
              className={`rounded p-1 transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`rounded-lg border p-2 ${tileClass}`}>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
              <Gauge className="h-3 w-3 text-sky-400" />
              <span>Linear Speed |v|</span>
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-sky-400">
              {telemetry.freeBodyLinearSpeedMps.toFixed(2)}{' '}
              <span className="text-[11px] font-normal">m/s</span>
            </div>
          </div>

          <div className={`rounded-lg border p-2 ${tileClass}`}>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
              <Activity className="h-3 w-3 text-amber-400" />
              <span>Angular Speed |&omega;|</span>
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-amber-400">
              {telemetry.freeBodyAngularSpeedRadPerSec.toFixed(2)}{' '}
              <span className="text-[11px] font-normal">rad/s</span>
            </div>
          </div>

          <div className={`rounded-lg border p-2 ${tileClass}`}>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
              <Zap className="h-3 w-3 text-emerald-400" />
              <span>Translational KE</span>
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-emerald-400">
              {telemetry.freeBodyKineticEnergyJ.toFixed(2)}{' '}
              <span className="text-[11px] font-normal">J</span>
            </div>
            <div className={`font-mono text-[10px] ${mutedClass}`}>&frac12;mv&sup2; system sum</div>
          </div>

          <div className={`rounded-lg border p-2 ${tileClass}`}>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase ${mutedClass}`}>
              <Scale className="h-3 w-3 text-rose-400" />
              <span>Potential Energy</span>
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-rose-400">
              {telemetry.freeBodyPotentialEnergyJ.toFixed(2)}{' '}
              <span className="text-[11px] font-normal">J</span>
            </div>
            <div className={`font-mono text-[10px] ${mutedClass}`}>
              E&#8348; + E&#8342; = {totalEnergyJ.toFixed(2)} J
            </div>
          </div>
        </div>

        {/* Active Environment Badge */}
        <div
          className={`flex flex-wrap items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] ${tileClass}`}
        >
          <span>g={gravityMagnitude.toFixed(2)}</span>
          <span>&mu;={surfaceFriction.toFixed(2)}</span>
          <span>e={restitution.toFixed(2)}</span>
          <span className={isPaused ? 'font-bold text-amber-400' : 'font-bold text-emerald-400'}>
            {isPaused ? `PAUSED (${timeScale}x)` : `${timeScale}x`}
          </span>
        </div>

        {physicsInspectorOpen && (
          <div className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[10px] ${tileClass}`}>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
              CoM
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
              mg
              <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
              v
            </span>
            <span className={`font-mono ${mutedClass}`}>
              [{telemetry.centerOfMass.map((v) => v.toFixed(2)).join(', ')}]
            </span>
          </div>
        )}
      </aside>
    );
  }

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
          <Clock className={`h-4 w-4 ${isPaused ? 'text-amber-400' : 'text-emerald-400'}`} />
          <div className="leading-tight">
            <div className={`text-[10px] font-semibold uppercase ${subClass}`}>
              {isPaused ? 'Paused' : 'Sim Rate'}
            </div>
            <div className="font-mono text-xs font-bold">
              {timeScale}x &middot; g={gravityMagnitude.toFixed(2)}
            </div>
          </div>
        </div>

        {labUiConfig.showBatteryTelemetry && (
          <>
            <div className="h-6 w-px bg-current/15" />
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
          </>
        )}

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
              {isPlaying
                ? isPaused
                  ? `Paused (${timeScale}x) · g = ${gravityMagnitude.toFixed(2)} m/s²`
                  : `Live (${timeScale}x) · g = ${gravityMagnitude.toFixed(2)} m/s²`
                : `Idle (${timeScale}x) · g = ${gravityMagnitude.toFixed(2)} m/s²`}
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

      {labUiConfig.showBatteryTelemetry && (
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
      )}

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

