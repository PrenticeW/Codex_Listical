import { useState, useCallback, useEffect } from 'react';

/**
 * Hook to manage context menu state and position
 * Tracks which cells/rows are in focus when the menu is opened
 */
export default function useContextMenu() {
  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    rowId: null,
    columnId: null,
    cellKey: null,
    hasSelectedCells: false,
    hasSelectedRows: false,
    selectedCellsCount: 0,
    selectedRowsCount: 0,
  });

  // Handle right-click event
  const handleContextMenu = useCallback((event, options = {}) => {
    event.preventDefault();
    event.stopPropagation();

    const {
      rowId = null,
      columnId = null,
      cellKey = null,
      selectedCells = new Set(),
      selectedRows = new Set(),
      contextType = 'row',
    } = options;

    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      rowId,
      columnId,
      cellKey,
      contextType,
      hasSelectedCells: selectedCells.size > 0,
      hasSelectedRows: selectedRows.size > 0,
      selectedCellsCount: selectedCells.size,
      selectedRowsCount: selectedRows.size,
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!contextMenu.isOpen) return;

    const handleClickOutside = () => closeContextMenu();
    const handleEscape = (e) => {
      // Capture phase + stopPropagation: the open menu claims Escape so
      // page/panel-level Escape handlers don't also fire.
      if (e.key === 'Escape') { e.stopPropagation(); closeContextMenu(); }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    window.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [contextMenu.isOpen, closeContextMenu]);

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  };
}
