/**
 * Generic Auto-Persist Hook
 * Automatically saves a value to storage when it changes (after initial mount)
 *
 * Post-Supabase-port note: callers should pass `enabled: false` while their
 * async load is in flight and flip it to `true` once the load completes.
 * That trades one redundant first-load write for guaranteed correctness on
 * subsequent user changes (see the gate-pattern lesson in
 * MIGRATION_HANDOFF.md). Without it, an interaction that fires before the
 * load resolves can be silently overwritten.
 */

import { useEffect, useRef } from 'react';

/**
 * Automatically persists a value to storage when it changes
 *
 * @param {*} value - The value to persist
 * @param {Function} saveFunction - Function to call to save the value
 *   (receives value, projectId, yearNumber). May return a Promise; the
 *   hook does not await it so callers should handle rejections inside
 *   their save function.
 * @param {Object} options - Configuration options
 * @param {string} options.projectId - Project identifier
 * @param {number|null} options.yearNumber - Year number for scoped storage
 * @param {boolean} options.skipInitialSave - Skip the very first effect
 *   run (default true). Independent of `enabled`.
 * @param {boolean} options.enabled - Gate: when false, no save fires even
 *   if the value changes (default true). Use false until the async load
 *   has completed, then flip true.
 * @param {Function} options.shouldSave - Optional predicate to determine if
 *   value should be saved
 */
export default function useAutoPersist(value, saveFunction, options = {}) {
  const {
    projectId,
    yearNumber,
    skipInitialSave = true,
    enabled = true,
    shouldSave,
  } = options;

  const isInitialMount = useRef(skipInitialSave);
  // shouldSave is held in a ref so callers can safely pass an inline
  // predicate without making the effect re-fire every render (which would
  // cause a save on every render once the gate is open).
  const shouldSaveRef = useRef(shouldSave);
  shouldSaveRef.current = shouldSave;

  useEffect(() => {
    if (!enabled) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const predicate = shouldSaveRef.current;
    if (predicate && !predicate(value)) return;
    saveFunction(value, projectId, yearNumber);
  }, [value, saveFunction, projectId, yearNumber, enabled]);
}
