'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import CanvasToolbar from '@/components/ui/CanvasToolbar';
import CircuitDiagnosticAlert from '@/components/ui/CircuitDiagnosticAlert';
import CodeEditorPanel from '@/components/ui/CodeEditorPanel';
import InventoryPanel from '@/components/ui/InventoryPanel';
import ServoCalibrationPanel from '@/components/ui/ServoCalibrationPanel';
import TelemetryHUD from '@/components/ui/TelemetryHUD';
import { getLabBlueprint } from '@/lib/blueprints/blueprintRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';

const SimulationScene = dynamic(() => import('@/components/canvas/SimulationScene'), {
  ssr: false,
});

export default function Home() {
  const theme = useSimulationStore((state) => state.theme);
  const activeLabId = useSimulationStore((state) => state.activeLabId);
  const labUiConfig = getLabBlueprint(activeLabId).uiConfig;
  const didInitPresetRef = useRef(false);

  useEffect(() => {
    if (didInitPresetRef.current) {
      return;
    }
    didInitPresetRef.current = true;
    const store = useSimulationStore.getState();
    if (store.workspaceParts.length === 0) {
      store.loadPreset(getLabBlueprint(store.activeLabId).defaultPresetId);
    }
  }, []);

  return (
    <main
      className={`relative w-screen h-screen overflow-hidden ${
        theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'
      }`}
    >
      <InventoryPanel />
      <CanvasToolbar />
      <CircuitDiagnosticAlert />
      <TelemetryHUD />
      {labUiConfig.showCodeEditor ? (
        <CodeEditorPanel />
      ) : labUiConfig.showWhatIfSliders ? (
        <aside
          aria-label="What-If Sandbox Parameters"
          className="pointer-events-auto absolute right-4 bottom-4 z-20 max-h-[calc(100vh-140px)] w-[340px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-[#827148]/30 bg-[#FFEED6]/95 p-4 text-[#827148] shadow-xl backdrop-blur-sm"
        >
          <ServoCalibrationPanel />
        </aside>
      ) : null}
      <SimulationScene />
    </main>
  );
}
