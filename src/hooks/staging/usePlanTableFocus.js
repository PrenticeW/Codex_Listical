import { useState, useEffect } from 'react';

/**
 * Hook to manage focus for plan table cells
 * Handles deferred focus requests after DOM updates
 */
export default function usePlanTableFocus({ pendingFocusRequestRef, shortlist }) {
  const [pendingPlanFocus, setPendingPlanFocus] = useState(null);

  // Watch for pending focus requests from the ref
  useEffect(() => {
    if (!pendingFocusRequestRef.current) return;
    setPendingPlanFocus(pendingFocusRequestRef.current);
    pendingFocusRequestRef.current = null;
  }, [shortlist, pendingFocusRequestRef]);

  // Execute focus when pending focus changes
  useEffect(() => {
    if (!pendingPlanFocus) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let cancelled = false;
    let frame = null;

    const tryFocus = (attempt = 0) => {
      if (cancelled) return;

      const { itemId, row, col } = pendingPlanFocus;
      const selector = `[data-plan-item="${itemId}"][data-plan-row="${row}"][data-plan-col="${col}"]`;
      const target = document.querySelector(selector);

      if (target instanceof HTMLElement) {
        target.focus();
        if (target instanceof HTMLInputElement) {
          target.select();
        }
        setPendingPlanFocus(null);
        return;
      }

      // Retry up to 4 times
      if (attempt >= 4) {
        setPendingPlanFocus(null);
        return;
      }

      frame = window.requestAnimationFrame(() => tryFocus(attempt + 1));
    };

    frame = window.requestAnimationFrame(() => tryFocus(0));

    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [pendingPlanFocus]);

  return {
    pendingPlanFocus,
    setPendingPlanFocus,
  };
}
