'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Play, RotateCcw, Sliders } from 'lucide-react';
import { formatServoStepDsl, getServoPinAssignments } from '@/lib/microcontroller/servoPinMap';
import { useSimulationStore } from '@/store/useSimulationStore';

const SLIDER_MIN_DEG = -45;
const SLIDER_MAX_DEG = 45;

/**
 * Interactive manual servo calibration drawer allowing learners to sweep individual
 * mounted ServoProxy joints (-45° to +45°), center all joints, or append current angles
 * directly into the control script as a DSL step.
 */
export default function ServoCalibrationPanel() {
  const workspaceParts = useSimulationStore((state) => state.workspaceParts);
  const wires = useSimulationStore((state) => state.wires);
  const activeServoIds = useSimulationStore((state) => state.wiringValidation.activeServoIds);
  const servoTargetAngles = useSimulationStore((state) => state.servoTargetAngles);
  const script = useSimulationStore((state) => state.script);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const readOnly = useSimulationStore((state) => state.readOnly);

  const setServoAngleByPartId = useSimulationStore((state) => state.setServoAngleByPartId);
  const centerAllServos = useSimulationStore((state) => state.centerAllServos);
  const setScript = useSimulationStore((state) => state.setScript);
  const startManualServoTest = useSimulationStore((state) => state.startManualServoTest);

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

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#827148]/30 bg-[#827148]/5 px-3 py-6 text-center text-xs text-[#827148]/80">
        <Sliders className="h-5 w-5 text-[#827148]/60" />
        <p>Mount one or more Servo MG90S actuators onto chassis hip sockets to calibrate.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
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

