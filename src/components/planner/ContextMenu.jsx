import React from 'react';
import { Copy, Clipboard, Trash2, Plus, CornerDownRight, FolderPlus, PlusCircle } from 'lucide-react';

/**
 * Context menu for spreadsheet cells and rows.
 *
 * contextType === 'cell'  → copy / paste actions only
 * contextType === 'row'   → full row actions (duplicate, delete, insert, etc.)
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
  onCopy,
  onPaste,
}) {
  if (!contextMenu.isOpen) return null;

  const { x, y, hasSelectedRows, selectedRowsCount, rowId, contextType } = contextMenu;

  const MENU_WIDTH = 200;
  const MENU_HEIGHT = contextType === 'cell' ? 90 : 280;
  const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
  const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);

  const menuStyle = { position: 'fixed', left: `${clampedLeft}px`, top: `${clampedTop}px`, zIndex: 9999 };

  const handleAction = (action) => { action(); onClose(); };

  // ── Cell context: copy / paste only ──────────────────────────────────────
  if (contextType === 'cell') {
    return (
      <div
        className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
        style={menuStyle}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          onClick={() => handleAction(onCopy)}
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
        >
          <Copy className="w-4 h-4" />
          Copy
          <span className="ml-auto text-xs text-gray-400">⌘C</span>
        </button>
        <button
          onClick={() => handleAction(onPaste)}
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
        >
          <Clipboard className="w-4 h-4" />
          Paste
          <span className="ml-auto text-xs text-gray-400">⌘V</span>
        </button>
      </div>
    );
  }

  // ── Row context: full row actions ─────────────────────────────────────────
  return (
    <div
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={menuStyle}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
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
    </div>
  );
}
