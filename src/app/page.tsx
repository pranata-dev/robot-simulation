'use client';

import dynamic from 'next/dynamic';
import CircuitDiagnosticAlert from '@/components/ui/CircuitDiagnosticAlert';
import CodeEditorPanel from '@/components/ui/CodeEditorPanel';
import InventoryPanel from '@/components/ui/InventoryPanel';
import { useSimulationStore } from '@/store/useSimulationStore';

const SimulationScene = dynamic(() => import('@/components/canvas/SimulationScene'), {
  ssr: false,
});

export default function Home() {
  const theme = useSimulationStore((state) => state.theme);

  return (
    <main
      className={`relative w-screen h-screen overflow-hidden ${
        theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'
      }`}
    >
      <InventoryPanel />
      <CircuitDiagnosticAlert />
      <CodeEditorPanel />
      <SimulationScene />
    </main>
  );
}
