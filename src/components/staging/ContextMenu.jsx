import React from 'react';
import { Trash2, Plus, CornerDownRight, Copy, Target, CheckSquare, ListTodo, Calendar, FolderKanban, Calculator } from 'lucide-react';

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
  onInsertRowType,
  onToggleOutcomeTotals,
}) {
  if (!contextMenu.isOpen) return null;

  const {
    x,
    y,
    itemId,
    rowIdx,
    sectionType,
    rowType,
    showOutcomeTotals,
    hasSelectedCells,
    hasSelectedRows,
    selectedCellsCount,
    selectedRowsCount,
  } = contextMenu;

  // Define section-specific row type options based on the actual template structure
  // Template uses:
  // - 'prompt' rows: darker grey background, text in column 1 (index 1)
  // - 'response' rows: lighter grey background, text in column 2 (index 2)
  // - 'data' rows: white background, all cells editable
  //
  // Outcomes section template: prompt ("Outcome") -> response ("Measurable Outcome")
  // Actions section template: prompt ("Measurable Outcome") -> response ("Action")
  const getSectionInsertOptions = () => {
    switch (sectionType) {
      case 'Reasons':
        return [
          { label: 'Add Reason', type: 'prompt', icon: Target },
        ];
      case 'Outcomes':
        return [
          { label: 'Add Outcome', type: 'prompt', icon: Target },
          { label: 'Add Measurable Outcome', type: 'response', icon: CheckSquare },
        ];
      case 'Actions':
        return [
          { label: 'Add Measurable Outcome', type: 'prompt', icon: CheckSquare },
          { label: 'Add Action', type: 'response', icon: ListTodo },
        ];
      case 'Subprojects':
        return [
          { label: 'Add Subproject', type: 'prompt', icon: FolderKanban },
        ];
      case 'Schedule':
        return [
          { label: 'Add Schedule Item', type: 'prompt', icon: Calendar },
        ];
      default:
        return [];
    }
  };

  const sectionOptions = getSectionInsertOptions();

  // Position the menu, ensuring it doesn't go off-screen and doesn't open below the cursor when near the bottom
  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 300;
  const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
  const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);

  const menuStyle = {
    position: 'fixed',
    left: `${clampedLeft}px`,
    top: `${clampedTop}px`,
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
          {/* Section-specific insert options */}
          {!isMultiRow && sectionOptions.length > 0 && (
            <>
              {sectionOptions.map((option, index) => {
                const IconComponent = option.icon;
                return (
                  <button
                    key={`${option.type}-${index}`}
                    onClick={() => handleAction(() => onInsertRowType(option.type))}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
                  >
                    <IconComponent className="w-4 h-4" />
                    {option.label}
                  </button>
                );
              })}
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          {/* Toggle totals for the entire Actions section */}
          {!isMultiRow && sectionType === 'Actions' && (
            <>
              <button
                onClick={() => handleAction(onToggleOutcomeTotals)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <Calculator className="w-4 h-4" />
                {showOutcomeTotals ? 'Hide Totals' : 'Show Totals'}
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          {/* Generic row operations */}
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
