import { useState, useCallback, useEffect, useRef } from 'react';
import type { UseCollapsibleGroupsReturn } from '../../types/planner';
import { readCollapsedGroups, saveCollapsedGroups } from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

interface UseCollapsibleGroupsOptions {
  projectId?: string;
  yearNumber?: number | null;
}

/**
 * Hook to manage collapsed groups (archive weeks and project groups).
 * Post-Supabase-port: starts empty, then loads the saved set asynchronously.
 * A `loadedForYear` ref gates saves until the load completes so an early
 * toggle cannot be overwritten when the Supabase round-trip resolves.
 */
export default function useCollapsibleGroups(
  { projectId = DEFAULT_PROJECT_ID, yearNumber = null }: UseCollapsibleGroupsOptions = {}
): UseCollapsibleGroupsReturn {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const loadedForYear = useRef<number | null | symbol>(null);

  useEffect(() => {
    let cancelled = false;
    loadedForYear.current = null;
    (async () => {
      try {
        const loaded = await readCollapsedGroups(projectId, yearNumber);
        if (cancelled) return;
        setCollapsedGroups(loaded);
        loadedForYear.current = yearNumber as any;
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load collapsed groups', error);
          loadedForYear.current = yearNumber as any;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, yearNumber]);

  // Persist whenever collapsedGroups changes, but only after the load for
  // the current year has completed.
  useEffect(() => {
    if (loadedForYear.current !== yearNumber) return;
    saveCollapsedGroups(collapsedGroups, projectId, yearNumber);
  }, [collapsedGroups, projectId, yearNumber]);

  // Toggle a group's collapsed state
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

  // Check if a group is collapsed
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
