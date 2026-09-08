import { useCallback, useLayoutEffect, useState } from 'react';

const MARGIN = 8;

/**
 * Positions a portalled, `position: fixed` menu next to an anchor element and
 * keeps it on screen.
 *
 * - Measures the real menu height once it has rendered (falls back to
 *   `estimatedHeight` for the very first paint).
 * - Opens below the anchor when there is room, otherwise above; when neither
 *   side fits it takes the larger side and returns a `maxHeight` so the menu
 *   can scroll instead of spilling off the viewport.
 * - Clamps `top`/`left` inside the viewport.
 * - Re-measures on scroll (any ancestor, captured on window) and resize, so
 *   the menu follows its cell instead of being left behind.
 *
 * Returns `null` while closed, else `{ top, left, maxHeight }`.
 */
export function useAnchoredMenuPosition({ open, anchorRef, menuRef, estimatedHeight, width }) {
  const [pos, setPos] = useState(null);

  const compute = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const measured = menuRef.current?.offsetHeight;
    const h = measured && measured > 0 ? measured : estimatedHeight;

    const spaceBelow = vh - MARGIN - rect.bottom;
    const spaceAbove = rect.top - MARGIN;

    let top;
    let maxHeight;
    if (h <= spaceBelow) {
      top = rect.bottom;
      maxHeight = spaceBelow;
    } else if (h <= spaceAbove) {
      top = rect.top - h;
      maxHeight = spaceAbove;
    } else if (spaceBelow >= spaceAbove) {
      top = rect.bottom;
      maxHeight = spaceBelow;
    } else {
      maxHeight = spaceAbove;
      top = rect.top - Math.min(h, maxHeight);
    }
    maxHeight = Math.max(0, Math.floor(maxHeight));
    // Final clamp so the menu can never start above or run past the viewport.
    const shown = Math.min(h, maxHeight);
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - shown));

    const left = Math.max(MARGIN, Math.min(rect.left, vw - width - MARGIN));

    setPos((prev) => (
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight }
    ));
  }, [anchorRef, menuRef, estimatedHeight, width]);

  // Place before first paint when opening; re-measure once the menu exists.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    compute();
    // The portal mounts in the commit after `pos` is first set, so measure
    // again on the next frame with the real height.
    const raf = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(raf);
  }, [open, compute]);

  // Follow the anchor on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) return undefined;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; compute(); });
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, compute]);

  return pos;
}
