/**
 * useStagingTableWidth
 *
 * Per-account width preference for the Goal page table + prompt box.
 * Backed by stagingLayoutStorage (Supabase `profiles.staging_table_width`),
 * with a synchronous localStorage peek so the saved width applies on first
 * render instead of flashing full width while the network read resolves.
 *
 * `width` is a px number, or null for the default full-width behaviour.
 * `setWidth` updates local state immediately and persists in the
 * background (fire-and-forget; a failed save just logs — the UI keeps the
 * chosen width for the session).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  loadStagingTableWidth,
  peekStagingTableWidth,
  saveStagingTableWidth,
  MIN_STAGING_TABLE_WIDTH,
} from '../../lib/stagingLayoutStorage';

export { MIN_STAGING_TABLE_WIDTH };

export default function useStagingTableWidth() {
  const [width, setWidthState] = useState(() => peekStagingTableWidth());

  // Refresh from Supabase (source of truth) on mount.
  useEffect(() => {
    let cancelled = false;
    loadStagingTableWidth().then((saved) => {
      if (!cancelled) setWidthState(saved);
    });
    return () => { cancelled = true; };
  }, []);

  const setWidth = useCallback((value) => {
    const next = value == null
      ? null
      : Math.max(MIN_STAGING_TABLE_WIDTH, Math.round(value));
    setWidthState(next);
    saveStagingTableWidth(next).catch((error) => {
      console.error('Failed to save staging table width', error);
    });
  }, []);

  return { width, setWidth };
}
