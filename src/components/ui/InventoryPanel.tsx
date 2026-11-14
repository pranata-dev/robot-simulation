'use client';

import { Box, Cable, Cpu, Crosshair, Flag, Moon, Radar, RotateCcw, Sun } from 'lucide-react';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { PartType } from '@/types/simulator';

function PartIcon({ type }: { type: PartType }) {
  if (type === 'CHASSIS_BASE' || type === 'OBSTACLE_BLOCK') {
    return <Box className="h-4 w-4 shrink-0" />;
  }
  if (type === 'ULTRASONIC_HCSR04') {
    return <Radar className="h-4 w-4 shrink-0" />;
  }
  if (type === 'TARGET_ZONE') {
    return <Flag className="h-4 w-4 shrink-0" />;
  }
  return <Cpu className="h-4 w-4 shrink-0" />;
}

interface InventoryPanelProps {
  allowedParts?: PartType[];
  readOnly?: boolean;
}

export default function InventoryPanel({
  allowedParts: allowedPartsProp,
  readOnly: readOnlyProp,
}: InventoryPanelProps = {}) {
  const inventory = useSimulationStore((state) => state.inventory);
  const storeAllowedParts = useSimulationStore((state) => state.allowedParts);
  const storeReadOnly = useSimulationStore((state) => state.readOnly);
  const workspacePartsCount = useSimulationStore((state) => state.workspaceParts.length);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const wiringMode = useSimulationStore((state) => state.wiringMode);
  const theme = useSimulationStore((state) => state.theme);
  const spawnPart = useSimulationStore((state) => state.spawnPart);
  const setWiringMode = useSimulationStore((state) => state.setWiringMode);
  const toggleTheme = useSimulationStore((state) => state.toggleTheme);
  const resetPositions = useSimulationStore((state) => state.resetPositions);
  const resetWorkspace = useSimulationStore((state) => state.resetWorkspace);

  const effectiveAllowedParts = allowedPartsProp ?? storeAllowedParts;
  const isReadOnly = readOnlyProp ?? storeReadOnly;
  const visibleInventory = effectiveAllowedParts
    ? inventory.filter((item) => effectiveAllowedParts.includes(item.type))
    : inventory;
  const isIdle = simulationStatus === 'idle';
  const canEditAssembly = isIdle && !isReadOnly;

  return (
    <aside
      aria-label="Part Inventory"
      className="absolute top-4 left-4 z-10 w-72 rounded-xl border border-[#827148]/30 bg-[#FFEED6]/95 p-4 text-[#827148] shadow-xl backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between border-b border-[#827148]/20 pb-2.5">
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Parts Inventory</h2>
          <p className="text-xs text-[#827148]/80">
            Spawn &amp; drag on XZ plane ({workspacePartsCount} active)
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
            className="rounded-lg border border-[#827148]/25 bg-[#FFEED6] p-1.5 text-[#827148] transition-colors hover:bg-[#A5AF79] hover:text-[#FFEED6]"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={resetPositions}
            disabled={workspacePartsCount === 0}
            title="Reset Position"
            aria-label="Reset Position"
            className="rounded-lg border border-[#827148]/25 bg-[#FFEED6] p-1.5 text-[#827148] transition-colors hover:bg-[#A5AF79] hover:text-[#FFEED6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetWorkspace}
            disabled={!canEditAssembly || workspacePartsCount === 0}
            title={isReadOnly ? 'Disabled in read-only mode' : 'Clear Workspace'}
            aria-label="Clear Workspace"
            className="rounded-lg border border-[#827148]/25 bg-[#FFEED6] p-1.5 text-[#827148] transition-colors hover:bg-[#E8A07C] hover:text-[#FFEED6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[#827148]/20 bg-[#827148]/10 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
          <Cable className="h-3.5 w-3.5 shrink-0" />
          Wiring
        </span>
        <div role="group" aria-label="Wiring Mode" className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWiringMode('3-pin')}
            disabled={!canEditAssembly}
            aria-pressed={wiringMode === '3-pin'}
            title="3-Pin Realistic Wiring (PWM + 5V + GND)"
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              wiringMode === '3-pin'
                ? 'bg-[#827148] text-[#FFEED6] shadow-sm'
                : 'bg-[#FFEED6] text-[#827148] hover:bg-[#A5AF79]/40'
            }`}
          >
            3-Pin
          </button>
          <button
            type="button"
            onClick={() => setWiringMode('1-wire')}
            disabled={!canEditAssembly}
            aria-pressed={wiringMode === '1-wire'}
            title="1-Wire Signal Shield (PWM only)"
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              wiringMode === '1-wire'
                ? 'bg-[#827148] text-[#FFEED6] shadow-sm'
                : 'bg-[#FFEED6] text-[#827148] hover:bg-[#A5AF79]/40'
            }`}
          >
            1-Wire
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {visibleInventory.map((item) => {
          const canSpawn = canEditAssembly && item.quantity > 0;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => spawnPart(item.type)}
              disabled={!canSpawn}
              className="group flex w-full items-center justify-between rounded-lg border border-[#827148]/20 bg-[#A5AF79] px-3 py-2.5 text-left text-[#FFEED6] shadow-sm transition-colors hover:bg-[#E8A07C] hover:text-[#827148] disabled:cursor-not-allowed disabled:bg-[#827148]/20 disabled:text-[#827148]/60"
            >
              <span className="flex items-center gap-2.5">
                <PartIcon type={item.type} />
                <span className="text-sm font-semibold">{item.label}</span>
              </span>
              <span className="rounded-md bg-[#FFEED6] px-2 py-0.5 text-xs font-bold text-[#827148] transition-colors group-hover:bg-[#827148] group-hover:text-[#FFEED6] group-disabled:bg-[#FFEED6]/60">
                {item.quantity}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

