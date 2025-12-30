import { useState, useCallback } from 'react';
import type { UseCollapsibleGroupsReturn } from '../../types/planner';

/**
 * Hook to manage collapsed groups (archive weeks and project groups)
 *
 * This hook manages which groups are collapsed in the planner view.
 * Groups can be archive weeks or project sections that can be expanded/collapsed.
 *
 * @returns Object with collapsedGroups state and helper functions
 */
export default function useCollapsibleGroups(): UseCollapsibleGroupsReturn {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
