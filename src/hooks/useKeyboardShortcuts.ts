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
 * Registers global Delete/Backspace shortcuts to remove the currently selected modular 3D part
 * while protecting active simulation playback and text/code input fields.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

      const targetElement = event.target instanceof Element ? event.target : null;
      if (isEditableElement(document.activeElement) || isEditableElement(targetElement)) {
        return;
      }

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

