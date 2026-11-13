'use client';

import { useEffect } from 'react';
import { useSimulationStore } from '@/store/useSimulationStore';

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (
    element instanceof HTMLElement &&
    (element.isContentEditable || element.closest('[contenteditable="true"]') !== null)
  ) {
    return true;
  }

  return element.closest('[data-code-editor-panel="true"]') !== null;
}

/**
 * Registers global Delete/Backspace part removal, Ctrl/Cmd+Z / Ctrl/Cmd+Y / Ctrl/Cmd+Shift+Z
 * undo/redo shortcuts, and the `W` X-Ray Wiring View toggle while protecting input/editor focus.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const targetElement = event.target instanceof Element ? event.target : null;
      if (isEditableElement(document.activeElement) || isEditableElement(targetElement)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = (event.ctrlKey || event.metaKey) && !event.altKey;

      if (hasPrimaryModifier && key === 'z') {
        event.preventDefault();
        const { simulationStatus, readOnly, undo, redo } = useSimulationStore.getState();
        if (readOnly || simulationStatus !== 'idle') return;
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (hasPrimaryModifier && !event.shiftKey && key === 'y') {
        event.preventDefault();
        const { simulationStatus, readOnly, redo } = useSimulationStore.getState();
        if (readOnly || simulationStatus !== 'idle') return;
        redo();
        return;
      }

      if (event.repeat) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey && key === 'w') {
        event.preventDefault();
        useSimulationStore.getState().toggleViewMode();
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      const { simulationStatus, selectedPartId, readOnly, removePart } =
        useSimulationStore.getState();
      if (readOnly || simulationStatus !== 'idle' || !selectedPartId) return;

      event.preventDefault();
      removePart(selectedPartId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

