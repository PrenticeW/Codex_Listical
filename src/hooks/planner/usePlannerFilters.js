import { useCallback, useRef, useState } from 'react';
import isBrowserEnvironment from '../../utils/isBrowserEnvironment';

/**
 * Custom hook to create a generic filter state and handlers for a specific filter type
 * This eliminates the duplication of nearly identical filter logic
 */
function useFilter() {
  const [selectedFilters, setSelectedFilters] = useState(() => new Set());
  const [filterMenu, setFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const filterButtonRef = useRef(null);
  const filterMenuRef = useRef(null);

  const handleFilterSelect = useCallback((value) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      if (next.size === 0) {
        setFilterMenu({ open: false, left: 0, top: 0 });
      }
      return next;
    });
  }, []);

  const handleFilterButtonClick = useCallback((event, menuState) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isBrowserEnvironment()) return;
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const left = buttonRect.left + window.scrollX;
    const top = buttonRect.bottom + window.scrollY;
    const isAlreadyOpen = menuState.open;
    filterButtonRef.current = event.currentTarget;
    setFilterMenu({
      open: !isAlreadyOpen || menuState.left !== left || menuState.top !== top,
      left,
      top,
    });
  }, []);

  const closeFilterMenu = useCallback(() => {
    setFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  return {
    selectedFilters,
    filterMenu,
    filterButtonRef,
    filterMenuRef,
    handleFilterSelect,
    handleFilterButtonClick,
    closeFilterMenu,
  };
}

export default function usePlannerFilters() {
  const [activeFilterColumns, setActiveFilterColumns] = useState(() => new Set());

  // Create filter states for each filter type using the custom hook
  const projectFilter = useFilter();
  const subprojectFilter = useFilter();
  const statusFilter = useFilter();
  const recurringFilter = useFilter();
  const estimateFilter = useFilter();

  const toggleFilterColumn = useCallback(
    (columnKey) => {
      if (!columnKey) return;
      setActiveFilterColumns((prev) => {
        const next = new Set(prev);
        if (next.has(columnKey)) {
          next.delete(columnKey);
        } else {
          next.add(columnKey);
        }
        return next;
      });
    },
    [setActiveFilterColumns]
  );

  return {
    activeFilterColumns,
    toggleFilterColumn,

    // Project filter
    projectFilterMenu: projectFilter.filterMenu,
    projectFilterMenuRef: projectFilter.filterMenuRef,
    projectFilterButtonRef: projectFilter.filterButtonRef,
    selectedProjectFilters: projectFilter.selectedFilters,
    handleProjectFilterSelect: projectFilter.handleFilterSelect,
    handleProjectFilterButtonClick: projectFilter.handleFilterButtonClick,
    closeProjectFilterMenu: projectFilter.closeFilterMenu,

    // Subproject filter
    subprojectFilterMenu: subprojectFilter.filterMenu,
    subprojectFilterMenuRef: subprojectFilter.filterMenuRef,
    subprojectFilterButtonRef: subprojectFilter.filterButtonRef,
    selectedSubprojectFilters: subprojectFilter.selectedFilters,
    handleSubprojectFilterSelect: subprojectFilter.handleFilterSelect,
    handleSubprojectFilterButtonClick: subprojectFilter.handleFilterButtonClick,
    closeSubprojectFilterMenu: subprojectFilter.closeFilterMenu,

    // Status filter
    statusFilterMenu: statusFilter.filterMenu,
    statusFilterMenuRef: statusFilter.filterMenuRef,
    statusFilterButtonRef: statusFilter.filterButtonRef,
    selectedStatusFilters: statusFilter.selectedFilters,
    handleStatusFilterSelect: statusFilter.handleFilterSelect,
    handleStatusFilterButtonClick: statusFilter.handleFilterButtonClick,
    closeStatusFilterMenu: statusFilter.closeFilterMenu,

    // Recurring filter
    recurringFilterMenu: recurringFilter.filterMenu,
    recurringFilterMenuRef: recurringFilter.filterMenuRef,
    recurringFilterButtonRef: recurringFilter.filterButtonRef,
    selectedRecurringFilters: recurringFilter.selectedFilters,
    handleRecurringFilterSelect: recurringFilter.handleFilterSelect,
    handleRecurringFilterButtonClick: recurringFilter.handleFilterButtonClick,
    closeRecurringFilterMenu: recurringFilter.closeFilterMenu,

    // Estimate filter
    estimateFilterMenu: estimateFilter.filterMenu,
    estimateFilterMenuRef: estimateFilter.filterMenuRef,
    estimateFilterButtonRef: estimateFilter.filterButtonRef,
    selectedEstimateFilters: estimateFilter.selectedFilters,
    handleEstimateFilterSelect: estimateFilter.handleFilterSelect,
    handleEstimateFilterButtonClick: estimateFilter.handleFilterButtonClick,
    closeEstimateFilterMenu: estimateFilter.closeFilterMenu,
  };
}
