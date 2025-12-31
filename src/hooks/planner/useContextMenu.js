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
    } = options;

    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      rowId,
      columnId,
      cellKey,
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
      if (e.key === 'Escape') closeContextMenu();
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.isOpen, closeContextMenu]);

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  };
}
