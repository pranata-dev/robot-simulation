'use client';

import { Code2, Play, Square } from 'lucide-react';
import { useSimulationStore } from '@/store/useSimulationStore';

export default function CodeEditorPanel() {
  const script = useSimulationStore((state) => state.script);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const wiresCount = useSimulationStore((state) => state.wires.length);
  const activeServoCount = useSimulationStore((state) => Object.keys(state.servoAngles).length);
  const setScript = useSimulationStore((state) => state.setScript);
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
        onChange={(event) => setScript(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={'PIN_1: 90\nPIN_2: -45'}
        className="w-full resize-y rounded-lg border border-[#827148]/30 bg-[#FFEED6] p-3 font-mono text-xs leading-relaxed text-[#827148] placeholder:text-[#827148]/45 focus:border-[#A5AF79] focus:ring-2 focus:ring-[#A5AF79]/40 focus:outline-none"
      />

      <p className="text-[11px] leading-snug text-[#827148]/75">
        Syntax: <code className="font-mono font-semibold">PIN_1: 90</code> or{' '}
        <code className="font-mono font-semibold">ESP_D13: -45</code> (maps{' '}
        <code className="font-mono">PIN_1..PIN_8</code> to GPIO 13, 12, 14, 27, 26, 25, 33, 32).
      </p>
    </section>
  );
}

