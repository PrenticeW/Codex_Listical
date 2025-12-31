/**
 * Filter Button Handler Hook
 * Creates a memoized click handler for filter buttons
 *
 * This hook eliminates the repetitive pattern of wrapping filter button
 * click handlers with menu state.
 */

import { useCallback } from 'react';

/**
 * Creates a filter button click handler with menu state
 *
 * @param {Function} handleFilterButtonClick - The base filter button click handler
 * @param {Object} filterMenu - The filter menu state object
 * @returns {Function} Memoized click handler
 *
 * @example
 * const onProjectFilterButtonClick = useFilterButtonHandler(
 *   handleProjectFilterButtonClick,
 *   projectFilterMenu
 * );
 */
export default function useFilterButtonHandler(handleFilterButtonClick, filterMenu) {
  return useCallback(
    (event) => handleFilterButtonClick(event, filterMenu),
    [handleFilterButtonClick, filterMenu]
  );
}
