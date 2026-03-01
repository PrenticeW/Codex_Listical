import { useState, useCallback, useEffect } from 'react';

/**
 * Hook to manage context menu state for staging tables
 * Tracks which cells/rows are in focus when the menu is opened
 */
export default function useContextMenu() {
  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    itemId: null,
    rowIdx: null,
    colIdx: null,
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
      itemId = null,
      rowIdx = null,
      colIdx = null,
      selectedCells = new Set(),
      selectedRows = new Set(),
    } = options;

    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      itemId,
      rowIdx,
      colIdx,
      hasSelectedCells: selectedCells.size > 0,
      hasSelectedRows: selectedRows.size > 0,
      selectedCellsCount: selectedCells.size,
      selectedRowsCount: selectedRows.size,
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
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
