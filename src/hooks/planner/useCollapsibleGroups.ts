import { useState, useCallback, useEffect, useRef } from 'react';
import type { UseCollapsibleGroupsReturn } from '../../types/planner';
import { readCollapsedGroups, saveCollapsedGroups } from '../../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../../constants/plannerStorageKeys';

interface UseCollapsibleGroupsOptions {
  projectId?: string;
  yearNumber?: number | null;
}

/**
 * Hook to manage collapsed groups (archive weeks and project groups)
 *
 * This hook manages which groups are collapsed in the planner view.
 * Groups can be archive weeks or project sections that can be expanded/collapsed.
 * State is persisted to localStorage so it survives page refresh.
 *
 * @returns Object with collapsedGroups state and helper functions
 */
export default function useCollapsibleGroups(
  { projectId = DEFAULT_PROJECT_ID, yearNumber = null }: UseCollapsibleGroupsOptions = {}
): UseCollapsibleGroupsReturn {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => readCollapsedGroups(projectId, yearNumber)
  );

  // Persist whenever collapsedGroups changes (skip initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
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
