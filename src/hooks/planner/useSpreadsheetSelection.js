import { useCallback } from 'react';

/**
 * Custom hook for managing cell and row selection in the planner spreadsheet
 * Handles single selection, range selection, and multi-selection with modifier keys
 *
 * @param {Object} params - Configuration object
 * @returns {Object} Selection handlers and utilities
 */
export const useSpreadsheetSelection = ({
  data,
  allColumnIds,
  selectedCells,
  setSelectedCells,
  selectedRows,
  setSelectedRows,
  anchorCell,
  setAnchorCell,
  anchorRow,
  setAnchorRow,
  isDragging,
  setIsDragging,
  dragStartCell,
  setDragStartCell,
  editingCell,
  setEditingCell,
  setEditValue,
}) => {
  // Helper to create cell key
  const getCellKey = useCallback((rowId, columnId) => {
    return `${rowId}|${columnId}`;
  }, []);

  // Helper to check if cell is selected
  const isCellSelected = useCallback((rowId, columnId) => {
    return selectedCells.has(getCellKey(rowId, columnId));
  }, [selectedCells, getCellKey]);

  // Helper to get range of rows between two rowIds
  const getRowRange = useCallback((startRowId, endRowId) => {
    const startIndex = data.findIndex(r => r.id === startRowId);
    const endIndex = data.findIndex(r => r.id === endRowId);

    if (startIndex === -1 || endIndex === -1) return new Set();

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);

    const range = new Set();
    for (let i = minIndex; i <= maxIndex; i++) {
      range.add(data[i].id);
    }

    return range;
  }, [data]);

  // Helper to get rectangular range of cells between two cells
  const getCellRange = useCallback((startCell, endCell) => {
    if (!startCell || !endCell) return new Set();

    // Get row indices
    const startRowIndex = data.findIndex(r => r.id === startCell.rowId);
    const endRowIndex = data.findIndex(r => r.id === endCell.rowId);

    // Get column indices
    const startColIndex = allColumnIds.indexOf(startCell.columnId);
    const endColIndex = allColumnIds.indexOf(endCell.columnId);

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return new Set();
    }

    // Calculate min/max for the range
    const minRow = Math.min(startRowIndex, endRowIndex);
    const maxRow = Math.max(startRowIndex, endRowIndex);
    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    // Generate all cells in the range
    const range = new Set();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const rowId = data[r].id;
        const columnId = allColumnIds[c];
        range.add(getCellKey(rowId, columnId));
      }
    }

    return range;
  }, [data, allColumnIds, getCellKey]);

  // Row number click handler - selects entire row
  const handleRowNumberClick = useCallback((e, rowId) => {
    e.preventDefault();
    e.stopPropagation();
    // Pull keyboard focus out of any input/textarea (filter box, detail
    // panel, just-finished edit). The global copy/paste handlers ignore the
    // event while an input has focus, which made the first Cmd+C / Cmd+V
    // after such interactions silently do nothing.
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();

    const anchorIndex = anchorRow ? data.findIndex(r => r.id === anchorRow) : -1;
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && (anchorIndex === -1 || selectedRows.size === 0)) {
      // Shift held but there's no usable starting point (nothing currently
      // selected, or the anchor row no longer exists after an edit or a
      // group/sort reorder): treat it as a fresh single-row selection
      // instead of resurrecting a stale range.
      setSelectedRows(new Set([rowId]));
      setSelectedCells(new Set());
      setAnchorRow(rowId);
      setEditingCell(null);
      return;
    }

    if (e.shiftKey && anchorIndex !== -1) {
      // Shift-click: resize the contiguous selected block containing the
      // anchor so it runs to the clicked row, REPLACING that block rather
      // than unioning forever. The previous fix (plain union, anchor never
      // moved) meant selections only ever grew — and once a group/sort
      // reorder moved rows under a stale anchor, a single shift-click
      // merged in a huge anchor-to-row span, sometimes most of the table.
      // Block-replace keeps that fix's intended behaviour (clicking past
      // the far side of the block still extends it outward, see below)
      // without the accumulation.
      const clickedIndex = data.findIndex(r => r.id === rowId);
      if (clickedIndex === -1) {
        // Clicked a row that isn't in the raw data array (structural /
        // computed rows) — same fresh single-select a plain click gives it.
        setSelectedRows(new Set([rowId]));
        setSelectedCells(new Set());
        setAnchorRow(rowId);
        setEditingCell(null);
        return;
      }

      // Contiguous run of selected rows around the anchor — the block this
      // shift-click resizes. Rows selected elsewhere (cmd-click) are left
      // untouched.
      let blockStart = anchorIndex;
      let blockEnd = anchorIndex;
      if (selectedRows.has(anchorRow)) {
        while (blockStart > 0 && selectedRows.has(data[blockStart - 1].id)) blockStart--;
        while (blockEnd < data.length - 1 && selectedRows.has(data[blockEnd + 1].id)) blockEnd++;
      }

      // Clicking above the block keeps its bottom edge; clicking below
      // keeps its top edge (so "select 5-10, shift-click 3" still gives
      // 3-10). Clicking inside the block shrinks it to anchor-to-click.
      let start;
      let end;
      if (clickedIndex < blockStart) {
        start = clickedIndex;
        end = blockEnd;
      } else if (clickedIndex > blockEnd) {
        start = blockStart;
        end = clickedIndex;
      } else {
        start = Math.min(anchorIndex, clickedIndex);
        end = Math.max(anchorIndex, clickedIndex);
      }

      setSelectedRows(prev => {
        const next = new Set(prev);
        for (let i = blockStart; i <= blockEnd; i++) next.delete(data[i].id);
        for (let i = start; i <= end; i++) next.add(data[i].id);
        return next;
      });
      setSelectedCells(new Set()); // Clear cell selections
      // Don't update anchor - keep it for next shift-click
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle row selection
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          next.add(rowId);
        }
        return next;
      });
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Update anchor for next shift-click
    } else {
      // Normal click: select single row
      setSelectedRows(new Set([rowId]));
      setSelectedCells(new Set()); // Clear cell selections
      setAnchorRow(rowId); // Set as anchor for shift-click
    }
    setEditingCell(null);
  }, [anchorRow, data, selectedRows, setSelectedRows, setSelectedCells, setAnchorRow, setEditingCell]);

  // Cell interaction handlers
  const handleCellMouseDown = useCallback((e, rowId, columnId) => {
    // Right-click or Mac Ctrl+click — don't touch selection
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) return;
    if (columnId === 'rowNum') return; // Don't select row number column

    // If this cell is currently being edited, let the event through
    // so the user can select/highlight text inside the input
    if (editingCell && editingCell.rowId === rowId && editingCell.columnId === columnId) {
      return;
    }

    // Prevent default to avoid text selection
    e.preventDefault();
    // Pull keyboard focus out of any input/textarea (filter box, detail
    // panel, just-finished edit). The global copy/paste handlers ignore the
    // event while an input has focus, which made the first Cmd+C / Cmd+V
    // after such interactions silently do nothing.
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();

    const cellKey = getCellKey(rowId, columnId);

    // Clear row selections when selecting cells
    setSelectedRows(new Set());

    if (e.shiftKey && anchorCell) {
      // Shift-click: range selection from anchor
      const range = getCellRange(anchorCell, { rowId, columnId });
      setSelectedCells(range);
      setEditingCell(null);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl-click: toggle selection
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
      setAnchorCell({ rowId, columnId });
      setEditingCell(null);
    } else {
      // Normal mouse down: start drag selection
      setSelectedCells(new Set([cellKey]));
      setAnchorCell({ rowId, columnId });
      setDragStartCell({ rowId, columnId });
      setIsDragging(true);
      setEditingCell(null);
    }
  }, [anchorCell, editingCell, getCellRange, getCellKey, setSelectedRows, setSelectedCells, setAnchorCell, setDragStartCell, setIsDragging, setEditingCell]);

  const handleCellMouseEnter = useCallback((e, rowId, columnId) => {
    if (!isDragging || !dragStartCell || columnId === 'rowNum') return;

    // Update selection to include range from drag start to current cell
    const range = getCellRange(dragStartCell, { rowId, columnId });
    setSelectedCells(range);
  }, [isDragging, dragStartCell, getCellRange, setSelectedCells]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStartCell(null);
  }, [setIsDragging, setDragStartCell]);

  // Neighbour-based edge detection for the currently selected cell range —
  // mirrors the row-selection-block edge logic (PlannerTable.jsx). Rather
  // than tracking the rectangle's bounds separately, this just checks
  // whether each of the four neighbouring cells (in full row/column order)
  // is also selected; any side whose neighbour is absent/unselected is an
  // outer edge of the selection and should get a border there. This lets a
  // multi-cell selection read as a single bordered block instead of every
  // cell drawing its own full outline.
  const getCellSelectionEdges = useCallback((rowId, columnId) => {
    if (!selectedCells.has(getCellKey(rowId, columnId))) {
      return { top: false, bottom: false, left: false, right: false };
    }

    const rowIndex = data.findIndex(r => r.id === rowId);
    const colIndex = allColumnIds.indexOf(columnId);
    if (rowIndex === -1 || colIndex === -1) {
      return { top: false, bottom: false, left: false, right: false };
    }

    const prevRowId = rowIndex > 0 ? data[rowIndex - 1]?.id : null;
    const nextRowId = rowIndex < data.length - 1 ? data[rowIndex + 1]?.id : null;
    const prevColId = colIndex > 0 ? allColumnIds[colIndex - 1] : null;
    const nextColId = colIndex < allColumnIds.length - 1 ? allColumnIds[colIndex + 1] : null;

    return {
      top: !(prevRowId && selectedCells.has(getCellKey(prevRowId, columnId))),
      bottom: !(nextRowId && selectedCells.has(getCellKey(nextRowId, columnId))),
      left: !(prevColId && selectedCells.has(getCellKey(rowId, prevColId))),
      right: !(nextColId && selectedCells.has(getCellKey(rowId, nextColId))),
    };
  }, [selectedCells, getCellKey, data, allColumnIds]);

  const handleCellDoubleClick = useCallback((rowId, columnId, value) => {
    if (columnId === 'rowNum') return;

    // Get the current value from the data if not provided
    const row = data.find(r => r.id === rowId);
    const currentValue = value !== undefined ? value : (row ? row[columnId] || '' : '');

    setEditingCell({ rowId, columnId });
    setEditValue(currentValue);
  }, [setEditingCell, setEditValue, data]);

  // The light overlay wash only makes sense once more than one cell is
  // selected — a lone selected cell should just get its outline, matching
  // how it looked before (and how a single selected row isn't washed
  // differently from a multi-row selection either).
  const hasMultiCellSelection = selectedCells.size > 1;

  return {
    getCellKey,
    isCellSelected,
    getCellSelectionEdges,
    hasMultiCellSelection,
    getRowRange,
    getCellRange,
    handleRowNumberClick,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleMouseUp,
    handleCellDoubleClick,
  };
};

export default useSpreadsheetSelection;
