'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Eye,
  FlaskConical,
  Layers,
  Pause,
  Play,
  Redo2,
  Square,
  Undo2,
} from 'lucide-react';
import {
  ALL_LAB_BLUEPRINTS,
  getLabBlueprint,
  getPresetsForLab,
} from '@/lib/blueprints/blueprintRegistry';
import { useSimulationStore } from '@/store/useSimulationStore';

const TIME_SCALE_OPTIONS = [0.25, 0.5, 1.0, 2.0] as const;

/**
 * Floating top-center canvas toolbar providing Lab switching, 1-click Presets,
 * Play/Stop/Pause/Slow-Mo time controls, Undo/Redo, X-Ray Wiring View (`W`), and Physics Inspector toggle.
 */
export default function CanvasToolbar() {
  const theme = useSimulationStore((state) => state.theme);
  const activeLabId = useSimulationStore((state) => state.activeLabId);
  const simulationStatus = useSimulationStore((state) => state.simulationStatus);
  const isPaused = useSimulationStore((state) => state.isPaused);
  const timeScale = useSimulationStore((state) => state.timeScale);
  const readOnly = useSimulationStore((state) => state.readOnly);
  const viewMode = useSimulationStore((state) => state.viewMode);
  const physicsInspectorOpen = useSimulationStore((state) => state.physicsInspectorOpen);
  const setActiveLab = useSimulationStore((state) => state.setActiveLab);
  const toggleViewMode = useSimulationStore((state) => state.toggleViewMode);
  const wiringPartsActive = useSimulationStore((state) =>
    state.workspaceParts.some(
      (part) => part.type === 'dc_power_supply' || part.type === 'breadboard_base',
    ),
  );
  const togglePhysicsInspector = useSimulationStore((state) => state.togglePhysicsInspector);
  const loadPreset = useSimulationStore((state) => state.loadPreset);
  const runSimulation = useSimulationStore((state) => state.runSimulation);
  const stopSimulation = useSimulationStore((state) => state.stopSimulation);
  const togglePause = useSimulationStore((state) => state.togglePause);
  const setTimeScale = useSimulationStore((state) => state.setTimeScale);
  const canUndo = useSimulationStore((state) => state.canUndo);
  const canRedo = useSimulationStore((state) => state.canRedo);
  const undo = useSimulationStore((state) => state.undo);
  const redo = useSimulationStore((state) => state.redo);

  const [labMenuOpen, setLabMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const labMenuRef = useRef<HTMLDivElement | null>(null);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetMenuOpen && !labMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        presetMenuRef.current &&
        event.target instanceof Node &&
        !presetMenuRef.current.contains(event.target)
      ) {
        setPresetMenuOpen(false);
      }
      if (
        labMenuRef.current &&
        event.target instanceof Node &&
        !labMenuRef.current.contains(event.target)
      ) {
        setLabMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresetMenuOpen(false);
        setLabMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [labMenuOpen, presetMenuOpen]);

  const activeLab = getLabBlueprint(activeLabId);
  const labPresets = getPresetsForLab(activeLab.id);
  const isDark = theme === 'dark';
  const isPlaying = simulationStatus === 'playing';
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

  const menuDropdownClass = isDark
    ? 'border-slate-700 bg-slate-950/95 text-slate-100'
    : 'border-slate-200 bg-white/95 text-slate-800';

  return (
    <div
      className={`absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border px-2 py-1.5 shadow-lg backdrop-blur-md ${containerClass}`}
    >
      {/* Lab Switcher */}
      <div ref={labMenuRef} className="relative">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            setPresetMenuOpen(false);
            setLabMenuOpen((prev) => !prev);
          }}
          aria-haspopup="menu"
          aria-expanded={labMenuOpen}
          title="Switch STEM Laboratory"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${buttonBaseClass}`}
        >
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="max-w-36 truncate">{activeLab.name}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {labMenuOpen && (
          <div
            role="menu"
            aria-label="STEM Laboratories"
            className={`absolute top-full left-0 mt-2 w-72 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md ${menuDropdownClass}`}
          >
            {ALL_LAB_BLUEPRINTS.map((lab) => {
              const isActive = lab.id === activeLab.id;
              return (
                <button
                  key={lab.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActiveLab(lab.id);
                    setLabMenuOpen(false);
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? isDark
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-emerald-50 text-emerald-900'
                      : isDark
                        ? 'hover:bg-slate-800/90'
                        : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{lab.name}</span>
                    <span className="rounded bg-current/10 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                      {lab.subject}
                    </span>
                  </div>
                  <span className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {lab.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Preset Loader */}
      <div ref={presetMenuRef} className="relative">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            setLabMenuOpen(false);
            setPresetMenuOpen((prev) => !prev);
          }}
          aria-haspopup="menu"
          aria-expanded={presetMenuOpen}
          title="Load 1-Click Assembly Preset"
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${buttonBaseClass}`}
        >
          <Layers className="h-3.5 w-3.5 text-amber-400" />
          <span>Preset</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        {presetMenuOpen && (
          <div
            role="menu"
            aria-label="Assembly Presets"
            className={`absolute top-full left-0 mt-2 w-72 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md ${menuDropdownClass}`}
          >
            {labPresets.map((preset) => (
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

      <span className={`mx-0.5 h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

      {/* Simulation Playback & Time-Scale Controls */}
      <button
        type="button"
        onClick={() => (isPlaying ? stopSimulation() : runSimulation())}
        title={isPlaying ? 'Stop & Reset Simulation' : 'Run Simulation'}
        aria-label={isPlaying ? 'Stop Simulation' : 'Run Simulation'}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
          isPlaying
            ? isDark
              ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
            : isDark
              ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
        }`}
      >
        {isPlaying ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
        <span>{isPlaying ? 'Stop' : 'Run'}</span>
      </button>

      <button
        type="button"
        onClick={togglePause}
        disabled={!isPlaying}
        aria-pressed={isPlaying && isPaused}
        title={isPaused ? 'Resume Physics' : 'Pause Physics'}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          isPlaying && isPaused
            ? isDark
              ? 'bg-amber-500/25 text-amber-200'
              : 'bg-amber-100 text-amber-900'
            : buttonBaseClass
        }`}
      >
        {isPaused ? <Play className="h-3 w-3 fill-current" /> : <Pause className="h-3 w-3" />}
        <span>{isPaused ? 'Resume' : 'Pause'}</span>
      </button>

      <div
        role="group"
        aria-label="Simulation Time Scale"
        className={`flex items-center gap-0.5 rounded-lg border px-1 py-0.5 ${
          isDark ? 'border-slate-700/80 bg-slate-900/70' : 'border-slate-200 bg-slate-100/80'
        }`}
      >
        {TIME_SCALE_OPTIONS.map((scale) => {
          const isSelected = timeScale === scale;
          return (
            <button
              key={scale}
              type="button"
              onClick={() => setTimeScale(scale)}
              aria-pressed={isSelected}
              title={`Simulation speed ${scale}x`}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold transition-colors ${
                isSelected
                  ? isDark
                    ? 'bg-sky-500/30 text-sky-200'
                    : 'bg-sky-600 text-white'
                  : isDark
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {scale}x
            </button>
          );
        })}
      </div>

      <span className={`mx-0.5 h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

      <button
        type="button"
        onClick={undo}
        disabled={historyDisabled || !canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent ${buttonBaseClass}`}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={redo}
        disabled={historyDisabled || !canRedo}
        title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        aria-label="Redo"
        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent ${buttonBaseClass}`}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>

      <span className={`mx-0.5 h-4 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

      {(activeLab.uiConfig.showWiringTools || wiringPartsActive) && (
        <button
          type="button"
          onClick={toggleViewMode}
          aria-pressed={isXray}
          title="Toggle X-Ray Wiring View (W)"
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${xrayButtonClass}`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Wiring</span>
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
      )}

      <button
        type="button"
        onClick={togglePhysicsInspector}
        aria-pressed={physicsInspectorOpen}
        title="Toggle Physics & Telemetry Inspector"
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${inspectorButtonClass}`}
      >
        <Activity className="h-3.5 w-3.5" />
        <span>Inspector</span>
      </button>
    </div>
  );
}
