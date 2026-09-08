import { useState, useCallback, useEffect, useRef } from 'react';
import type { UseCollapsibleGroupsReturn } from '../../types/planner';
import {
  saveCollapsedGroups,
  peekPlannerCache,
  readPlannerSettingsRowStrict,
  isPlannerSettingsWriteRecent,
  PLANNER_ROWS_STALE_EVENT,
} from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

interface UseCollapsibleGroupsOptions {
  projectId?: string;
  yearNumber?: number | null;
}

const sameSet = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
};

const setFromRow = (row: { collapsed_groups?: unknown } | null): Set<string> =>
  new Set(Array.isArray(row?.collapsed_groups) ? (row!.collapsed_groups as string[]) : []);

/**
 * Hook to manage collapsed groups (archive weeks and project groups).
 *
 * Seeds from the synchronous cache on first render so collapsed rows don't
 * flash open, then reads SERVER truth (not the cache) and adopts it.
 *
 * Two rules, both learned the hard way (archived weeks "opening on their
 * own", 2026-09-08):
 *   1. Loading never saves. The persist effect only writes when the set
 *      differs from the last value adopted from the server (or saved by
 *      us). The old hook re-saved whatever it loaded — on a stale browser
 *      that wrote a weeks-old collapsed set over the server's.
 *   2. A failed load never becomes an empty set. The strict read throws
 *      instead of returning defaults; on failure we keep the cached state
 *      and still allow the user's own toggles to save.
 *
 * Revalidates on the planner-rows-stale event (tab wake / back online) and
 * on window focus, mirroring usePlannerStorage.
 */
export default function useCollapsibleGroups(
  { projectId = DEFAULT_PROJECT_ID, yearNumber = null }: UseCollapsibleGroupsOptions = {}
): UseCollapsibleGroupsReturn {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (yearNumber != null) {
      const { plannerSettings } = peekPlannerCache(yearNumber);
      if (plannerSettings && Array.isArray(plannerSettings.collapsed_groups)) {
        return new Set(plannerSettings.collapsed_groups as string[]);
      }
    }
    return new Set();
  });

  // Gate + baseline for the persist effect. `baseline` is the last set we
  // know the server holds (adopted from a read, or written by our save).
  const loadedForYear = useRef<number | null | undefined>(undefined);
  const baselineRef = useRef<Set<string> | null>(null);
  const latestRef = useRef<Set<string>>(collapsedGroups);
  latestRef.current = collapsedGroups;

  useEffect(() => {
    let cancelled = false;
    loadedForYear.current = undefined;
    baselineRef.current = null;
    let gen = 0;
    const WAKE_MIN_GAP_MS = 30000;
    let lastWakeAt = 0;

    const revalidate = async () => {
      const myGen = ++gen;
      try {
        const row = await readPlannerSettingsRowStrict(yearNumber);
        if (cancelled || myGen !== gen) return;
        const loaded = setFromRow(row);
        baselineRef.current = loaded;
        setCollapsedGroups(prev => (sameSet(prev, loaded) ? prev : loaded));
      } catch (error) {
        if (cancelled || myGen !== gen) return;
        console.warn('Collapsed groups revalidation failed; keeping cached state', error);
        // Treat what we hold as the baseline so a later user toggle saves,
        // but the (possibly stale) cached set itself is never re-saved.
        if (baselineRef.current == null) baselineRef.current = latestRef.current;
      } finally {
        if (!cancelled && myGen === gen) loadedForYear.current = yearNumber;
      }
    };

    revalidate();
    // Never revalidate over this tab's own in-flight (or just-landed)
    // settings save — the read could return the pre-save row and revert
    // the user's toggle (see isPlannerSettingsWriteRecent in storage.js).
    const onStale = () => { if (!isPlannerSettingsWriteRecent()) revalidate(); };
    const onWake = () => {
      if (Date.now() - lastWakeAt < WAKE_MIN_GAP_MS) return;
      if (isPlannerSettingsWriteRecent()) return;
      lastWakeAt = Date.now();
      revalidate();
    };
    window.addEventListener(PLANNER_ROWS_STALE_EVENT, onStale);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    return () => {
      cancelled = true;
      window.removeEventListener(PLANNER_ROWS_STALE_EVENT, onStale);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [projectId, yearNumber]);

  // Persist only genuine changes made after the load for this year settled.
  useEffect(() => {
    if (loadedForYear.current !== yearNumber) return;
    const baseline = baselineRef.current;
    if (baseline && sameSet(baseline, collapsedGroups)) return;
    baselineRef.current = collapsedGroups;
    saveCollapsedGroups(collapsedGroups, projectId, yearNumber);
  }, [collapsedGroups, projectId, yearNumber]);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const isCollapsed = useCallback((groupId: string) => {
    return collapsedGroups.has(groupId);
  }, [collapsedGroups]);

  return {
    collapsedGroups,
    setCollapsedGroups, // Export setter for advanced operations (like undo/redo)
    toggleGroupCollapse,
    isCollapsed,
  };
}
