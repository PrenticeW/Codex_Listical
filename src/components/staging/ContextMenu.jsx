import React from 'react';
import { Trash2, Plus, CornerDownRight, Copy } from 'lucide-react';

/**
 * Context menu for staging table cells and rows
 * Shows different actions based on what's selected
 */
export default function ContextMenu({
  contextMenu,
  onClose,
  onDeleteRows,
  onInsertRowAbove,
  onInsertRowBelow,
  onDuplicateRow,
  onClearCells,
}) {
  if (!contextMenu.isOpen) return null;

  const {
    x,
    y,
    itemId,
    rowIdx,
    hasSelectedCells,
    hasSelectedRows,
    selectedCellsCount,
    selectedRowsCount,
  } = contextMenu;

  // Position the menu, ensuring it doesn't go off-screen
  const menuStyle = {
    position: 'fixed',
    left: `${Math.min(x, window.innerWidth - 220)}px`,
    top: `${Math.min(y, window.innerHeight - 300)}px`,
    zIndex: 9999,
  };

  const handleAction = (action) => {
    action();
    onClose();
  };

  const hasRowContext = itemId != null && rowIdx != null;
  const isMultiRow = selectedRowsCount > 1;
  const rowLabel = isMultiRow ? 'Rows' : 'Row';

  return (
    <div
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={menuStyle}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Selection info */}
      {(hasSelectedRows || hasSelectedCells) && (
        <div className="px-3 py-1.5 text-xs text-gray-500 font-medium border-b border-gray-100">
          {hasSelectedRows
            ? `${selectedRowsCount} row${selectedRowsCount > 1 ? 's' : ''} selected`
            : `${selectedCellsCount} cell${selectedCellsCount > 1 ? 's' : ''} selected`}
        </div>
      )}

      {/* Row actions - always show when right-clicking on a row */}
      {hasRowContext && (
        <>
          {!isMultiRow && (
            <>
              <button
                onClick={() => handleAction(onInsertRowAbove)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <Plus className="w-4 h-4" />
                Insert Row Above
              </button>
              <button
                onClick={() => handleAction(onInsertRowBelow)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <CornerDownRight className="w-4 h-4" />
                Insert Row Below
              </button>
            </>
          )}
          <button
            onClick={() => handleAction(onDuplicateRow)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <Copy className="w-4 h-4" />
            Duplicate {rowLabel}
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleAction(onDeleteRows)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
          >
            <Trash2 className="w-4 h-4" />
            Delete {rowLabel}
          </button>
        </>
      )}

      {/* Cell actions when cells are selected */}
      {hasSelectedCells && (
        <>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleAction(onClearCells)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <Trash2 className="w-4 h-4" />
            Clear Cell{selectedCellsCount > 1 ? 's' : ''}
            <span className="ml-auto text-xs text-gray-400">Del</span>
          </button>
        </>
      )}

      {/* No context fallback */}
      {!hasRowContext && !hasSelectedCells && !hasSelectedRows && (
        <div className="px-3 py-2 text-sm text-gray-400 italic">
          Right-click on a row for options
        </div>
      )}
    </div>
  );
}
