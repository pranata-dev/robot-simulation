'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Globe, Play, RotateCcw, Sliders, Square } from 'lucide-react';
import { getLabBlueprint } from '@/lib/blueprints/blueprintRegistry';
import { formatServoStepDsl, getServoPinAssignments } from '@/lib/microcontroller/servoPinMap';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { Vector3Tuple } from '@/types/simulator';

const SLIDER_MIN_DEG = -45;
const SLIDER_MAX_DEG = 45;

const ROBOTICS_GRAVITY_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  readout: string;
  vector: Vector3Tuple;
}> = [
  { id: 'earth', label: 'Earth', readout: '9.81 m/s²', vector: [0, -9.81, 0] },
  { id: 'moon', label: 'Moon', readout: '1.62 m/s²', vector: [0, -1.62, 0] },
  { id: 'mars', label: 'Mars', readout: '3.72 m/s²', vector: [0, -3.72, 0] },
  { id: 'zero-g', label: 'Zero-G', readout: '0 m/s²', vector: [0, 0, 0] },
];

const PHYSICS_GRAVITY_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  readout: string;
  vector: Vector3Tuple;
}> = [
  { id: 'earth', label: 'Earth', readout: '9.81 m/s²', vector: [0, -9.81, 0] },
  { id: 'moon', label: 'Moon', readout: '1.62 m/s²', vector: [0, -1.62, 0] },
  { id: 'mars', label: 'Mars', readout: '3.72 m/s²', vector: [0, -3.72, 0] },
  { id: 'jupiter', label: 'Jupiter', readout: '24.79 m/s²', vector: [0, -24.79, 0] },
  { id: 'zero-g', label: 'Zero-G', readout: '0 m/s²', vector: [0, 0, 0] },
];

/**
 * Interactive What-If parameter and manual servo calibration drawer allowing learners
 * to switch planetary gravity presets, sweep mounted ServoProxy joints (-45° to +45°),
 * center all joints, or append current angles into the control script as a DSL step.
 */
export default function ServoCalibrationPanel() {
  const activeLabId = useSimulationStore((state) => state.activeLabId);
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const wires = useSimulationStore((state) => state.wires);
  const activeServoIds = useSimulationStore((state) => state.wiringValidation.activeServoIds);
  const servoTargetAngles = useSimulationStore((state) => state.servoTargetAngles);
  const script = useSimulationStore((state) => state.script);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const gravity = useSimulationStore((state) => state.gravity);
  const surfaceFriction = useSimulationStore((state) => state.surfaceFriction);
  const restitution = useSimulationStore((state) => state.restitution);
  const rampAngle = useSimulationStore((state) => state.rampAngle);
  const launchSpeed = useSimulationStore((state) => state.launchSpeed);
  const harmonicMass = useSimulationStore((state) => state.harmonicMass);
  const pendulumLength = useSimulationStore((state) => state.pendulumLength);
  const springStiffness = useSimulationStore((state) => state.springStiffness);
  const springDamping = useSimulationStore((state) => state.springDamping);
  const sourceVoltage = useSimulationStore((state) => state.sourceVoltage);
  const r1Ohms = useSimulationStore((state) => state.r1Ohms);
  const r2Ohms = useSimulationStore((state) => state.r2Ohms);
  const r3Ohms = useSimulationStore((state) => state.r3Ohms);
  const rVarOhms = useSimulationStore((state) => state.rVarOhms);
  const laserYawDeg = useSimulationStore((state) => state.laserYawDeg);
  const laserPitchDeg = useSimulationStore((state) => state.laserPitchDeg);
  const opticalElementYawDeg = useSimulationStore((state) => state.opticalElementYawDeg);
  const refractiveIndex = useSimulationStore((state) => state.refractiveIndex);
  const lensFocalLength = useSimulationStore((state) => state.lensFocalLength);
  const readOnly = useSimulationStore((state) => state.readOnly);

  const setServoAngleByPartId = useSimulationStore((state) => state.setServoAngleByPartId);
  const centerAllServos = useSimulationStore((state) => state.centerAllServos);
  const setScript = useSimulationStore((state) => state.setScript);
  const setGravity = useSimulationStore((state) => state.setGravity);
  const setSurfaceFriction = useSimulationStore((state) => state.setSurfaceFriction);
  const setRestitution = useSimulationStore((state) => state.setRestitution);
  const setRampAngle = useSimulationStore((state) => state.setRampAngle);
  const setLaunchSpeed = useSimulationStore((state) => state.setLaunchSpeed);
  const setHarmonicMass = useSimulationStore((state) => state.setHarmonicMass);
  const setPendulumLength = useSimulationStore((state) => state.setPendulumLength);
  const setSpringStiffness = useSimulationStore((state) => state.setSpringStiffness);
  const setSpringDamping = useSimulationStore((state) => state.setSpringDamping);
  const triggerHarmonicRelease = useSimulationStore((state) => state.triggerHarmonicRelease);
  const setSourceVoltage = useSimulationStore((state) => state.setSourceVoltage);
  const setR1Ohms = useSimulationStore((state) => state.setR1Ohms);
  const setR2Ohms = useSimulationStore((state) => state.setR2Ohms);
  const setR3Ohms = useSimulationStore((state) => state.setR3Ohms);
  const setRVarOhms = useSimulationStore((state) => state.setRVarOhms);
  const setLaserYawDeg = useSimulationStore((state) => state.setLaserYawDeg);
  const setLaserPitchDeg = useSimulationStore((state) => state.setLaserPitchDeg);
  const setOpticalElementYawDeg = useSimulationStore((state) => state.setOpticalElementYawDeg);
  const setRefractiveIndex = useSimulationStore((state) => state.setRefractiveIndex);
  const setLensFocalLength = useSimulationStore((state) => state.setLensFocalLength);
  const startManualServoTest = useSimulationStore((state) => state.startManualServoTest);
  const runSimulation = useSimulationStore((state) => state.runSimulation);
  const stopSimulation = useSimulationStore((state) => state.stopSimulation);

  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const assignments = useMemo(
    () => getServoPinAssignments(workspaceParts, wires, activeServoIds),
    [workspaceParts, wires, activeServoIds],
  );

  const hasAnyWiredGpio = assignments.some((entry) => entry.dslToken !== null);
  const isPlaying = simulationStatus === 'playing';

  const handleCopyAnglesAsDsl = () => {
    if (readOnly) return;
    const stepBlock = formatServoStepDsl(assignments, servoTargetAngles);
    if (!stepBlock) return;

    const trimmed = script.trimEnd();
    const nextScript = trimmed.length > 0 ? `${trimmed}\n${stepBlock}` : stepBlock;
    setScript(nextScript);

    setCopiedFeedback(true);
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedFeedback(false);
    }, 1500);
  };

  const activeLab = getLabBlueprint(activeLabId);
  const labUiConfig = activeLab.uiConfig;
  const gravityPresets =
    activeLab.subject === 'physics' ? PHYSICS_GRAVITY_PRESETS : ROBOTICS_GRAVITY_PRESETS;

  const gravitySection = (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#827148]/20 bg-[#827148]/8 p-2.5">
      <div className="flex items-center justify-between text-[11px] font-bold tracking-wide uppercase text-[#827148]">
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          <span>Gravity (What-If)</span>
        </span>
        <span className="font-mono text-[10px] font-semibold text-[#827148]/80">
          {Math.hypot(gravity[0], gravity[1], gravity[2]).toFixed(2)} m/s&sup2;
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {gravityPresets.map((preset) => {
          const isSelected = Math.abs(gravity[1] - preset.vector[1]) < 0.01;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={readOnly}
              onClick={() => setGravity(preset.vector)}
              aria-pressed={isSelected}
              className={`flex items-center justify-between rounded-md border px-2 py-1 text-left text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? 'border-[#827148] bg-[#827148] text-[#FFEED6] shadow-xs'
                  : 'border-[#827148]/25 bg-[#FFEED6] text-[#827148] hover:bg-[#A5AF79]/30'
              }`}
            >
              <span>{preset.label}</span>
              <span className="font-mono text-[10px] opacity-85">{preset.readout}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (activeLab.subject === 'physics') {
    const hasHarmonicParts = workspaceParts.some(
      (p) =>
        p.type === 'pivot_anchor' ||
        p.type === 'pendulum_bob' ||
        p.type === 'helical_spring_mass',
    );
    const hasCircuitParts = workspaceParts.some(
      (p) =>
        p.type === 'dc_power_supply' ||
        p.type === 'breadboard_base' ||
        p.type === 'resistor_component' ||
        p.type === 'potentiometer_rheostat' ||
        p.type === 'galvanometer_ammeter',
    );
    const hasOpticsParts = workspaceParts.some(
      (p) =>
        p.type === 'laser_emitter' ||
        p.type === 'plane_mirror' ||
        p.type === 'convex_lens' ||
        p.type === 'concave_lens' ||
        p.type === 'glass_prism' ||
        p.type === 'optical_target_screen',
    );
    const showMechanicsSection = !hasHarmonicParts && !hasCircuitParts && !hasOpticsParts;

    const frictionBadge =
      surfaceFriction <= 0.05
        ? 'Ice'
        : surfaceFriction >= 1.15
          ? 'High-Grip'
          : 'Dry';
    const restitutionBadge =
      restitution <= 0.05
        ? 'Inelastic'
        : restitution >= 0.95
          ? 'Elastic'
          : 'Bouncy';
    const balancedTargetOhms = (r2Ohms * r3Ohms) / Math.max(1, r1Ohms);

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-[#827148]/20 pb-2">
          <div>
            <h2 className="text-xs font-bold tracking-wide uppercase text-[#827148]">
              What-If Physics Controls
            </h2>
            <p className="text-[11px] text-[#827148]/75">
              Adjust parameters live or before launch
            </p>
          </div>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => (isPlaying ? stopSimulation() : runSimulation())}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isPlaying
                ? 'border-[#827148]/30 bg-[#E8A07C] text-[#827148] hover:bg-[#827148] hover:text-[#FFEED6]'
                : 'border-[#827148]/20 bg-[#A5AF79] text-[#FFEED6] hover:bg-[#E8A07C] hover:text-[#827148]'
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Run</span>
              </>
            )}
          </button>
        </div>

        {(showMechanicsSection || hasHarmonicParts) && gravitySection}

        {hasHarmonicParts && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-[#827148]/20 bg-[#827148]/5 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide uppercase text-[#827148]">
                SHM &amp; Harmonic Bench
              </span>
              <button
                type="button"
                disabled={readOnly}
                onClick={triggerHarmonicRelease}
                className="rounded-md bg-[#827148] px-2 py-0.5 text-[10px] font-bold text-[#FFEED6] transition-colors hover:bg-[#6e5e3a] disabled:opacity-50"
              >
                {isPlaying ? 'Impulse Kick' : 'Release Bob'}
              </button>
            </div>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Oscillator Mass (m)</span>
                <span className="font-mono font-bold">{harmonicMass.toFixed(1)} kg</span>
              </div>
              <input
                type="range"
                aria-label="Oscillator Mass"
                min={0.2}
                max={5.0}
                step={0.1}
                value={harmonicMass}
                disabled={readOnly}
                onChange={(event) => setHarmonicMass(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Pendulum Length (L)</span>
                <span className="font-mono font-bold">{pendulumLength.toFixed(2)} m</span>
              </div>
              <input
                type="range"
                aria-label="Pendulum Length"
                min={0.8}
                max={3.2}
                step={0.1}
                value={pendulumLength}
                disabled={readOnly || isPlaying}
                onChange={(event) => setPendulumLength(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Spring Stiffness (k)</span>
                <span className="font-mono font-bold">{springStiffness.toFixed(0)} N/m</span>
              </div>
              <input
                type="range"
                aria-label="Spring Stiffness"
                min={4}
                max={60}
                step={1}
                value={springStiffness}
                disabled={readOnly}
                onChange={(event) => setSpringStiffness(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Viscous Damping (c)</span>
                <span className="font-mono font-bold">{springDamping.toFixed(2)} N&middot;s/m</span>
              </div>
              <input
                type="range"
                aria-label="Viscous Damping"
                min={0}
                max={2.5}
                step={0.05}
                value={springDamping}
                disabled={readOnly}
                onChange={(event) => setSpringDamping(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>
          </div>
        )}

        {hasCircuitParts && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-[#827148]/20 bg-[#827148]/5 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide uppercase text-[#827148]">
                Wheatstone Bridge Controls
              </span>
              <span className="font-mono text-[10px] text-[#827148]/80">
                Null @ {balancedTargetOhms.toFixed(0)} &Omega;
              </span>
            </div>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Supply Voltage (Vs)</span>
                <span className="font-mono font-bold">{sourceVoltage.toFixed(1)} V</span>
              </div>
              <input
                type="range"
                aria-label="Supply Voltage"
                min={0}
                max={24}
                step={0.5}
                value={sourceVoltage}
                disabled={readOnly}
                onChange={(event) => setSourceVoltage(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Resistor R1 (A&rarr;B)</span>
                <span className="font-mono font-bold">{r1Ohms.toFixed(0)} &Omega;</span>
              </div>
              <input
                type="range"
                aria-label="Resistor R1"
                min={20}
                max={500}
                step={10}
                value={r1Ohms}
                disabled={readOnly}
                onChange={(event) => setR1Ohms(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Resistor R2 (A&rarr;D)</span>
                <span className="font-mono font-bold">{r2Ohms.toFixed(0)} &Omega;</span>
              </div>
              <input
                type="range"
                aria-label="Resistor R2"
                min={20}
                max={500}
                step={10}
                value={r2Ohms}
                disabled={readOnly}
                onChange={(event) => setR2Ohms(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Resistor R3 (B&rarr;C)</span>
                <span className="font-mono font-bold">{r3Ohms.toFixed(0)} &Omega;</span>
              </div>
              <input
                type="range"
                aria-label="Resistor R3"
                min={20}
                max={500}
                step={10}
                value={r3Ohms}
                disabled={readOnly}
                onChange={(event) => setR3Ohms(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Rheostat R_var (D&rarr;C)</span>
                <span className="font-mono font-bold">{rVarOhms.toFixed(0)} &Omega;</span>
              </div>
              <input
                type="range"
                aria-label="Rheostat R_var"
                min={10}
                max={1000}
                step={5}
                value={rVarOhms}
                disabled={readOnly}
                onChange={(event) => setRVarOhms(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>
          </div>
        )}

        {hasOpticsParts && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-[#827148]/20 bg-[#827148]/5 p-2.5">
            <span className="text-[11px] font-bold tracking-wide uppercase text-[#827148]">
              Geometrical Optics Controls
            </span>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Laser Yaw (&phi;)</span>
                <span className="font-mono font-bold">{laserYawDeg.toFixed(0)}&deg;</span>
              </div>
              <input
                type="range"
                aria-label="Laser Yaw"
                min={-30}
                max={30}
                step={1}
                value={laserYawDeg}
                disabled={readOnly}
                onChange={(event) => setLaserYawDeg(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Laser Pitch</span>
                <span className="font-mono font-bold">{laserPitchDeg.toFixed(0)}&deg;</span>
              </div>
              <input
                type="range"
                aria-label="Laser Pitch"
                min={-15}
                max={15}
                step={1}
                value={laserPitchDeg}
                disabled={readOnly}
                onChange={(event) => setLaserPitchDeg(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Mirror &amp; Prism Rotation</span>
                <span className="font-mono font-bold">{opticalElementYawDeg.toFixed(0)}&deg;</span>
              </div>
              <input
                type="range"
                aria-label="Mirror and Prism Rotation"
                min={-60}
                max={60}
                step={1}
                value={opticalElementYawDeg}
                disabled={readOnly}
                onChange={(event) => setOpticalElementYawDeg(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Refractive Index (n)</span>
                <span className="font-mono font-bold">{refractiveIndex.toFixed(2)}</span>
              </div>
              <input
                type="range"
                aria-label="Refractive Index"
                min={1.0}
                max={2.42}
                step={0.02}
                value={refractiveIndex}
                disabled={readOnly}
                onChange={(event) => setRefractiveIndex(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>

            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Lens Focal Length (f)</span>
                <span className="font-mono font-bold">{lensFocalLength.toFixed(1)} m</span>
              </div>
              <input
                type="range"
                aria-label="Lens Focal Length"
                min={0.8}
                max={4.5}
                step={0.1}
                value={lensFocalLength}
                disabled={readOnly}
                onChange={(event) => setLensFocalLength(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148]"
              />
            </label>
          </div>
        )}

        {showMechanicsSection && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-[#827148]/20 bg-[#827148]/5 p-2.5">
            {/* Ramp Inclination */}
            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Ramp Inclination (&theta;)</span>
                <span className="font-mono font-bold">{rampAngle.toFixed(0)}&deg;</span>
              </div>
              <input
                type="range"
                aria-label="Ramp Inclination"
                min={5}
                max={45}
                step={1}
                value={rampAngle}
                disabled={readOnly}
                onChange={(event) => setRampAngle(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            {/* Surface Friction */}
            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Surface Friction (&mu;)</span>
                <span className="font-mono font-bold">
                  {surfaceFriction.toFixed(2)} ({frictionBadge})
                </span>
              </div>
              <input
                type="range"
                aria-label="Surface Friction"
                min={0}
                max={1.5}
                step={0.05}
                value={surfaceFriction}
                disabled={readOnly}
                onChange={(event) => setSurfaceFriction(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            {/* Collision Restitution */}
            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Collision Restitution (e)</span>
                <span className="font-mono font-bold">
                  {restitution.toFixed(2)} ({restitutionBadge})
                </span>
              </div>
              <input
                type="range"
                aria-label="Collision Restitution"
                min={0}
                max={1}
                step={0.05}
                value={restitution}
                disabled={readOnly}
                onChange={(event) => setRestitution(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            {/* Initial Launch Speed */}
            <label className="flex flex-col gap-1 text-[11px]">
              <div className="flex items-center justify-between font-semibold text-[#827148]">
                <span>Initial Launch Speed (v&#8320;)</span>
                <span className="font-mono font-bold">{launchSpeed.toFixed(1)} m/s</span>
              </div>
              <input
                type="range"
                aria-label="Initial Launch Speed"
                min={0}
                max={12}
                step={0.5}
                value={launchSpeed}
                disabled={readOnly}
                onChange={(event) => setLaunchSpeed(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        {gravitySection}
        {labUiConfig.showCodeEditor && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#827148]/30 bg-[#827148]/5 px-3 py-4 text-center text-xs text-[#827148]/80">
            <Sliders className="h-5 w-5 text-[#827148]/60" />
            <p>Mount one or more Servo MG90S actuators onto chassis hip sockets to calibrate.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {gravitySection}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isPlaying ? (
          <button
            type="button"
            disabled={readOnly}
            onClick={startManualServoTest}
            title="Validate circuit and activate Rapier physics without running the loop script"
            className="inline-flex items-center gap-1 rounded-md border border-[#827148]/25 bg-[#A5AF79] px-2 py-1 text-[11px] font-bold text-[#FFEED6] shadow-xs transition-colors hover:bg-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Enable Live Motors</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/25 bg-emerald-600/15 px-2 py-1 text-[11px] font-semibold text-emerald-900">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
            Motors Live
          </span>
        )}

        <button
          type="button"
          disabled={readOnly}
          onClick={centerAllServos}
          className="inline-flex items-center gap-1 rounded-md border border-[#827148]/30 bg-[#827148]/10 px-2 py-1 text-[11px] font-semibold text-[#827148] transition-colors hover:bg-[#827148]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Center All (0&deg;)</span>
        </button>
      </div>

      <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
        {assignments.map((entry) => {
          const rawAngle = Math.round(servoTargetAngles[entry.servoId] ?? 0);
          const sliderValue = Math.max(SLIDER_MIN_DEG, Math.min(SLIDER_MAX_DEG, rawAngle));
          const formattedAngle = rawAngle > 0 ? `+${rawAngle}°` : `${rawAngle}°`;

          return (
            <div
              key={entry.servoId}
              className="flex flex-col gap-1 rounded-lg border border-[#827148]/20 bg-[#827148]/5 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono font-semibold text-[#827148]">
                  {entry.socketLabel}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      entry.gpioLabel === 'Unwired'
                        ? 'bg-rose-500/15 text-rose-800'
                        : 'bg-[#A5AF79]/25 text-[#5c6537]'
                    }`}
                  >
                    {entry.gpioLabel}
                  </span>
                  <span className="w-10 text-right font-mono font-bold text-[#827148]">
                    {formattedAngle}
                  </span>
                </div>
              </div>

              <input
                type="range"
                aria-label={`${entry.socketLabel} (${entry.gpioLabel}) angle slider`}
                min={SLIDER_MIN_DEG}
                max={SLIDER_MAX_DEG}
                step={1}
                value={sliderValue}
                disabled={readOnly}
                onChange={(event) =>
                  setServoAngleByPartId(entry.servoId, Number(event.target.value))
                }
                className="h-1.5 w-full cursor-pointer accent-[#827148] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={readOnly || !hasAnyWiredGpio}
        onClick={handleCopyAnglesAsDsl}
        title={
          hasAnyWiredGpio
            ? 'Append current slider angles as PIN_* DSL lines in the script editor'
            : 'Wire at least one servo PWM pin to ESP32 GPIO (P1–P8) first'
        }
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#827148]/30 bg-[#827148]/15 px-3 py-1.5 text-xs font-bold text-[#827148] transition-colors hover:bg-[#827148] hover:text-[#FFEED6] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {copiedFeedback ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-700" />
            <span>Appended to Script</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>Copy Angles as DSL Step</span>
          </>
        )}
      </button>
    </div>
  );
}

