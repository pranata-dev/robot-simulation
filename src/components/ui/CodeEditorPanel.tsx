'use client';

import { AlertTriangle, Code2, Play, Square, Terminal, Trash2, X } from 'lucide-react';
import { useSimulationStore } from '@/store/useSimulationStore';

export default function CodeEditorPanel() {
  const script = useSimulationStore((state) => state.script);
  const scriptError = useSimulationStore((state) => state.scriptError);
  const scriptLogs = useSimulationStore((state) => state.scriptLogs);
  const readOnly = useSimulationStore((state) => state.readOnly);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const wiresCount = useSimulationStore((state) => state.wires.length);
  const activeServoCount = useSimulationStore((state) => Object.keys(state.servoAngles).length);
  const setScript = useSimulationStore((state) => state.setScript);
  const clearScriptError = useSimulationStore((state) => state.clearScriptError);
  const clearScriptLogs = useSimulationStore((state) => state.clearScriptLogs);
  const runSimulation = useSimulationStore((state) => state.runSimulation);
  const stopSimulation = useSimulationStore((state) => state.stopSimulation);

  const isPlaying = simulationStatus === 'playing';

  const handleToggleRun = () => {
    if (isPlaying) {
      stopSimulation();
      return;
    }
    runSimulation();
  };

  return (
    <section
      aria-label="Servo Control Script Editor"
      data-code-editor-panel="true"
      className="absolute right-4 bottom-4 z-10 flex w-80 flex-col gap-3 rounded-xl border border-[#827148]/30 bg-[#FFEED6]/95 p-4 text-[#827148] shadow-xl backdrop-blur-sm sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-[#827148]/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 shrink-0 text-[#827148]" />
          <div>
            <h2 className="text-sm font-bold tracking-wide uppercase">Control Script</h2>
            <p className="text-xs text-[#827148]/80">
              {wiresCount} wire{wiresCount === 1 ? '' : 's'} &middot; {activeServoCount} active servo
              {activeServoCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleRun}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide uppercase shadow-sm transition-colors ${
            isPlaying
              ? 'border-[#827148]/30 bg-[#E8A07C] text-[#827148] hover:bg-[#827148] hover:text-[#FFEED6]'
              : 'border-[#827148]/20 bg-[#A5AF79] text-[#FFEED6] hover:bg-[#E8A07C] hover:text-[#827148]'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Run Simulation</span>
            </>
          )}
        </button>
      </div>

      <textarea
        aria-label="Control script input"
        value={script}
        readOnly={readOnly}
        onChange={(event) => setScript(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={'PIN_1: 90\nPIN_2: -45'}
        className="w-full resize-y rounded-lg border border-[#827148]/30 bg-[#FFEED6] p-3 font-mono text-xs leading-relaxed text-[#827148] placeholder:text-[#827148]/45 focus:border-[#A5AF79] focus:ring-2 focus:ring-[#A5AF79]/40 focus:outline-none read-only:cursor-default read-only:opacity-85"
      />

      {scriptError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] leading-snug text-red-900"
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            <span>{scriptError}</span>
          </div>
          <button
            type="button"
            onClick={clearScriptError}
            aria-label="Dismiss script error"
            className="rounded p-0.5 text-red-700 hover:bg-red-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {scriptLogs.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-[#827148]/25 bg-[#827148]/10 p-2">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-wide uppercase text-[#827148]/80">
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" />
              Console ({scriptLogs.length})
            </span>
            <button
              type="button"
              onClick={clearScriptLogs}
              aria-label="Clear script console"
              className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[#827148]/15"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
          <div className="max-h-24 overflow-y-auto font-mono text-[11px] leading-tight">
            {scriptLogs.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.level === 'error'
                    ? 'text-red-700'
                    : entry.level === 'warn'
                      ? 'text-amber-800'
                      : 'text-[#827148]'
                }
              >
                {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-snug text-[#827148]/75">
        DSL: <code className="font-mono font-semibold">PIN_1: 90</code> /{' '}
        <code className="font-mono font-semibold">ESP_D13: -45</code> &middot; Worker JS:{' '}
        <code className="font-mono font-semibold">setServoAngle</code>,{' '}
        <code className="font-mono font-semibold">delay</code>,{' '}
        <code className="font-mono font-semibold">loop</code>,{' '}
        <code className="font-mono font-semibold">log</code>.
      </p>
    </section>
  );
}

