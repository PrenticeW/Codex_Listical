import { useCallback, useRef, useState } from 'react';
import isBrowserEnvironment from '../utils/isBrowserEnvironment';

export default function usePlannerFilters() {
  const [activeFilterColumns, setActiveFilterColumns] = useState(() => new Set());
  const [selectedProjectFilters, setSelectedProjectFilters] = useState(() => new Set());
  const [projectFilterMenu, setProjectFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const projectFilterButtonRef = useRef(null);
  const projectFilterMenuRef = useRef(null);

  const [selectedStatusFilters, setSelectedStatusFilters] = useState(() => new Set());
  const [statusFilterMenu, setStatusFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const statusFilterButtonRef = useRef(null);
  const statusFilterMenuRef = useRef(null);

  const [selectedRecurringFilters, setSelectedRecurringFilters] = useState(() => new Set());
  const [recurringFilterMenu, setRecurringFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const recurringFilterButtonRef = useRef(null);
  const recurringFilterMenuRef = useRef(null);

  const [selectedEstimateFilters, setSelectedEstimateFilters] = useState(() => new Set());
  const [estimateFilterMenu, setEstimateFilterMenu] = useState(() => ({
    open: false,
    left: 0,
    top: 0,
  }));
  const estimateFilterButtonRef = useRef(null);
  const estimateFilterMenuRef = useRef(null);

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

  const handleProjectFilterSelect = useCallback(
    (projectName) => {
      setSelectedProjectFilters((prev) => {
        const next = new Set(prev);
        if (next.has(projectName)) next.delete(projectName);
        else next.add(projectName);
        if (next.size === 0) {
          setProjectFilterMenu({ open: false, left: 0, top: 0 });
        }
        return next;
      });
    },
    []
  );

  const handleProjectFilterButtonClick = useCallback(
    (event, menuState) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = menuState.open;
      projectFilterButtonRef.current = event.currentTarget;
      setProjectFilterMenu({
        open: !isAlreadyOpen || menuState.left !== left || menuState.top !== top,
        left,
        top,
      });
    },
    []
  );

  const closeProjectFilterMenu = useCallback(() => {
    setProjectFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleStatusFilterSelect = useCallback(
    (statusName) => {
      setSelectedStatusFilters((prev) => {
        const next = new Set(prev);
        if (next.has(statusName)) next.delete(statusName);
        else next.add(statusName);
        if (next.size === 0) {
          setStatusFilterMenu({ open: false, left: 0, top: 0 });
        }
        return next;
      });
    },
    []
  );

  const handleStatusFilterButtonClick = useCallback(
    (event, menuState) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = menuState.open;
      statusFilterButtonRef.current = event.currentTarget;
      setStatusFilterMenu({
        open: !isAlreadyOpen || menuState.left !== left || menuState.top !== top,
        left,
        top,
      });
    },
    []
  );

  const closeStatusFilterMenu = useCallback(() => {
    setStatusFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleRecurringFilterSelect = useCallback(
    (value) => {
      setSelectedRecurringFilters((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        if (next.size === 0) {
          setRecurringFilterMenu({ open: false, left: 0, top: 0 });
        }
        return next;
      });
    },
    []
  );

  const handleRecurringFilterButtonClick = useCallback(
    (event, menuState) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = menuState.open;
      recurringFilterButtonRef.current = event.currentTarget;
      setRecurringFilterMenu({
        open: !isAlreadyOpen || menuState.left !== left || menuState.top !== top,
        left,
        top,
      });
    },
    []
  );

  const closeRecurringFilterMenu = useCallback(() => {
    setRecurringFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  const handleEstimateFilterSelect = useCallback(
    (value) => {
      setSelectedEstimateFilters((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        if (next.size === 0) {
          setEstimateFilterMenu({ open: false, left: 0, top: 0 });
        }
        return next;
      });
    },
    []
  );

  const handleEstimateFilterButtonClick = useCallback(
    (event, menuState) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowserEnvironment()) return;
      const buttonRect = event.currentTarget.getBoundingClientRect();
      const left = buttonRect.left + window.scrollX;
      const top = buttonRect.bottom + window.scrollY;
      const isAlreadyOpen = menuState.open;
      estimateFilterButtonRef.current = event.currentTarget;
      setEstimateFilterMenu({
        open: !isAlreadyOpen || menuState.left !== left || menuState.top !== top,
        left,
        top,
      });
    },
    []
  );

  const closeEstimateFilterMenu = useCallback(() => {
    setEstimateFilterMenu({ open: false, left: 0, top: 0 });
  }, []);

  return {
    activeFilterColumns,
    toggleFilterColumn,
    projectFilterMenu,
    projectFilterMenuRef,
    projectFilterButtonRef,
    selectedProjectFilters,
    handleProjectFilterSelect,
    handleProjectFilterButtonClick,
    closeProjectFilterMenu,
    statusFilterMenu,
    statusFilterMenuRef,
    statusFilterButtonRef,
    selectedStatusFilters,
    handleStatusFilterSelect,
    handleStatusFilterButtonClick,
    closeStatusFilterMenu,
    recurringFilterMenu,
    recurringFilterMenuRef,
    recurringFilterButtonRef,
    selectedRecurringFilters,
    handleRecurringFilterSelect,
    handleRecurringFilterButtonClick,
    closeRecurringFilterMenu,
    estimateFilterMenu,
    estimateFilterMenuRef,
    estimateFilterButtonRef,
    selectedEstimateFilters,
    handleEstimateFilterSelect,
    handleEstimateFilterButtonClick,
    closeEstimateFilterMenu,
  };
}
