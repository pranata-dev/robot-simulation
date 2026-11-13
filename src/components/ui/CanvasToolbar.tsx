'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Eye, Layers, Redo2, Undo2 } from 'lucide-react';
import { getActivePresets } from '@/lib/constants/socketRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';

/**
 * Floating top-center canvas toolbar providing history Undo/Redo actions,
 * 1-click Assembly Presets, X-Ray Wiring View (`W`), and Physics Inspector toggle.
 */
export default function CanvasToolbar() {
  const theme = useSimulationStore((state) => state.theme);
  const activeBlueprintId = useSimulationStore((state) => state.activeBlueprintId);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const readOnly = useSimulationStore((state) => state.readOnly);
  const viewMode = useSimulationStore((state) => state.viewMode);
  const physicsInspectorOpen = useSimulationStore((state) => state.physicsInspectorOpen);
  const toggleViewMode = useSimulationStore((state) => state.toggleViewMode);
  const togglePhysicsInspector = useSimulationStore((state) => state.togglePhysicsInspector);
  const loadPreset = useSimulationStore((state) => state.loadPreset);
  const canUndo = useSimulationStore((state) => state.canUndo);
  const canRedo = useSimulationStore((state) => state.canRedo);
  const undo = useSimulationStore((state) => state.undo);
  const redo = useSimulationStore((state) => state.redo);

  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        presetMenuRef.current &&
        event.target instanceof Node &&
        !presetMenuRef.current.contains(event.target)
      ) {
        setPresetMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresetMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [presetMenuOpen]);

  const isDark = theme === 'dark';
  const isXray = viewMode === 'wiring_xray';
  const historyDisabled = readOnly || simulationStatus !== 'idle';

  const containerClass = isDark
    ? 'border-slate-700/80 bg-slate-950/85 text-slate-100'
    : 'border-slate-300/90 bg-white/90 text-slate-800';

  const buttonBaseClass = isDark
    ? 'hover:bg-slate-800 text-slate-200 disabled:text-slate-600'
    : 'hover:bg-slate-100 text-slate-700 disabled:text-slate-300';

  const xrayButtonClass = isXray
    ? isDark
      ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-200'
      : 'border-cyan-600 bg-cyan-50 text-cyan-800'
    : isDark
      ? 'border-transparent text-slate-200 hover:bg-slate-800'
      : 'border-transparent text-slate-700 hover:bg-slate-100';

  const inspectorButtonClass = physicsInspectorOpen
    ? isDark
      ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
      : 'border-amber-600 bg-amber-50 text-amber-800'
    : isDark
      ? 'border-transparent text-slate-200 hover:bg-slate-800'
      : 'border-transparent text-slate-700 hover:bg-slate-100';

  return (
    <div
      className={`absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border px-2 py-1.5 shadow-lg backdrop-blur-md ${containerClass}`}
    >
      <div ref={presetMenuRef} className="relative">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setPresetMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={presetMenuOpen}
          title="Load 1-Click Assembly Preset"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${buttonBaseClass}`}
        >
          <Layers className="h-3.5 w-3.5 text-amber-400" />
          <span>Load Preset</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {presetMenuOpen && (
          <div
            role="menu"
            aria-label="Assembly Presets"
            className={`absolute top-full left-0 mt-2 w-72 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md ${
              isDark
                ? 'border-slate-700 bg-slate-950/95 text-slate-100'
                : 'border-slate-200 bg-white/95 text-slate-800'
            }`}
          >
            {getActivePresets(activeBlueprintId).map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  loadPreset(preset.id);
                  setPresetMenuOpen(false);
                }}
                className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isDark ? 'hover:bg-slate-800/90' : 'hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-semibold">{preset.name}</span>
                <span className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={`mx-1 h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

      <button
        type="button"
        onClick={undo}
        disabled={historyDisabled || !canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent ${buttonBaseClass}`}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={redo}
        disabled={historyDisabled || !canRedo}
        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        aria-label="Redo"
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent ${buttonBaseClass}`}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <span className={`mx-1 h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

      <button
        type="button"
        onClick={toggleViewMode}
        aria-pressed={isXray}
        title="Toggle X-Ray Wiring View (W)"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${xrayButtonClass}`}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>Wiring View</span>
        <kbd
          className={`rounded border px-1 py-0.2 text-[10px] font-mono leading-tight ${
            isXray
              ? isDark
                ? 'border-cyan-400/50 bg-cyan-950/60 text-cyan-200'
                : 'border-cyan-500/40 bg-cyan-100 text-cyan-800'
              : isDark
                ? 'border-slate-700 bg-slate-900 text-slate-400'
                : 'border-slate-300 bg-slate-100 text-slate-500'
          }`}
        >
          W
        </kbd>
      </button>

      <button
        type="button"
        onClick={togglePhysicsInspector}
        aria-pressed={physicsInspectorOpen}
        title="Toggle Physics & Telemetry Inspector"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${inspectorButtonClass}`}
      >
        <Activity className="h-3.5 w-3.5" />
        <span>Physics Inspector</span>
      </button>
    </div>
  );
}
