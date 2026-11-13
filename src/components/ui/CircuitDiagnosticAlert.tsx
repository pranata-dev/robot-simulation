'use client';

import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useSimulationStore } from '@/store/useSimulationStore';

const MAX_VISIBLE_ISSUES = 5;

export default function CircuitDiagnosticAlert() {
  const showCircuitDiagnostics = useSimulationStore((state) => state.showCircuitDiagnostics);
  const wiringValidation = useSimulationStore((state) => state.wiringValidation);
  const dismissCircuitDiagnostics = useSimulationStore(
    (state) => state.dismissCircuitDiagnostics,
  );

  if (!showCircuitDiagnostics || wiringValidation.isValid || wiringValidation.issues.length === 0) {
    return null;
  }

  const visibleIssues = wiringValidation.issues.slice(0, MAX_VISIBLE_ISSUES);
  const hiddenCount = wiringValidation.issues.length - visibleIssues.length;
  const { hasShortCircuit } = wiringValidation;

  return (
    <aside
      role="alert"
      aria-label="Circuit Wiring Diagnostics"
      className="pointer-events-auto absolute top-4 right-4 z-20 w-80 rounded-xl border border-rose-500/60 bg-slate-950/92 p-3.5 text-rose-100 shadow-2xl backdrop-blur-md sm:w-96"
    >
      <div className="mb-2 flex items-start justify-between gap-2 border-b border-rose-500/25 pb-2">
        <div className="flex items-center gap-2">
          {hasShortCircuit ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <div>
            <h2 className="text-xs font-bold tracking-wide text-rose-200 uppercase">
              {hasShortCircuit ? 'Short Circuit Detected' : 'Circuit Wiring Incomplete'}
            </h2>
            <p className="text-[11px] text-rose-300/80">
              Fix highlighted red pins before starting simulation.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissCircuitDiagnostics}
          aria-label="Dismiss circuit diagnostic alert"
          className="rounded-md p-1 text-rose-300/80 transition-colors hover:bg-rose-500/20 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="flex flex-col gap-1.5 text-xs leading-snug">
        {visibleIssues.map((issue) => (
          <li
            key={issue.id}
            className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-950/40 px-2.5 py-1.5"
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
            <span className="text-rose-100">{issue.message}</span>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <p className="mt-2 text-[11px] font-medium text-rose-300/80">
          +{hiddenCount} additional pin issue{hiddenCount === 1 ? '' : 's'} highlighted in 3D.
        </p>
      )}
    </aside>
  );
}

