import React from 'react';
import {
  Copy,
  Trash2,
  Plus,
  CornerDownRight,
  FolderPlus,
  PlusCircle,
} from 'lucide-react';

/**
 * Context menu for spreadsheet cells and rows
 * Shows different actions based on what's selected
 */
export default function ContextMenu({
  contextMenu,
  onClose,
  onDeleteRows,
  onDuplicateRow,
  onInsertRowAbove,
  onInsertRowBelow,
  onAddTasks,
  onAddSubproject,
}) {
  if (!contextMenu.isOpen) return null;

  const {
    x,
    y,
    hasSelectedRows,
    selectedRowsCount,
    rowId,
  } = contextMenu;

  // Position the menu, ensuring it doesn't go off-screen
  const menuStyle = {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 9999,
  };

  const handleAction = (action) => {
    action();
    onClose();
  };

  return (
    <div
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={menuStyle}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Row actions */}
      {hasSelectedRows && (
        <>
          <div className="px-3 py-1.5 text-xs text-gray-500 font-medium border-b border-gray-100">
            {selectedRowsCount} row{selectedRowsCount > 1 ? 's' : ''} selected
          </div>
          <button
            onClick={() => handleAction(onDuplicateRow)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <Copy className="w-4 h-4" />
            Duplicate Row{selectedRowsCount > 1 ? 's' : ''}
          </button>
          <button
            onClick={() => handleAction(onDeleteRows)}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
          >
            <Trash2 className="w-4 h-4" />
            Delete Row{selectedRowsCount > 1 ? 's' : ''}
            <span className="ml-auto text-xs text-gray-400">Del</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
        </>
      )}

      {/* Insert actions (available when right-clicking on a row) */}
      {rowId && (
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
          <div className="border-t border-gray-100 my-1" />
        </>
      )}

      {/* Additional actions */}
      <button
        onClick={() => handleAction(onAddTasks)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <PlusCircle className="w-4 h-4" />
        Add Tasks
      </button>
      <button
        onClick={() => handleAction(onAddSubproject)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <FolderPlus className="w-4 h-4" />
        Add Subproject
      </button>
      <button
        onClick={() => handleAction(onDuplicateRow)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
      >
        <Copy className="w-4 h-4" />
        Duplicate
      </button>

      {/* No selection fallback */}
      {!hasSelectedRows && !rowId && (
        <div className="px-3 py-1.5 text-xs text-gray-400 italic border-t border-gray-100 mt-1">
          Right-click on a row for more options
        </div>
      )}
    </div>
  );
}
