/**
 * Clipboard Operations for Staging/Goals Tables
 *
 * Handles copy and paste operations for plan tables.
 * Supports:
 * - Cell Copy/Paste: Copy selected cells as TSV
 * - Cross-project paste: Paste between different projects
 * - Fill Mode: Single value to multiple cells
 * - Range Mode: Grid of values
 */

import { cloneRowWithMetadata, cloneStagingState } from './planTableHelpers';

/**
 * Parse a cell key into its components
 */
const parseCellKey = (key) => {
  if (!key) return null;
  const parts = key.split('|');
  if (parts.length !== 3) return null;
  return {
    itemId: parts[0],
    rowIdx: parseInt(parts[1], 10),
    colIdx: parseInt(parts[2], 10),
  };
};

/**
 * Handle copy operation for selected cells
 * @param {Object} params Configuration object
 * @returns {string|null} TSV string to copy, or null if nothing to copy
 */
export const handleCopyOperation = ({
  selectedCells,
  shortlist,
}) => {
  if (!selectedCells || selectedCells.size === 0) return null;

  // Organize cells by item and row
  const cellsByItemAndRow = new Map();

  selectedCells.forEach((cellKey) => {
    const parsed = parseCellKey(cellKey);
    if (!parsed) return;

    const { itemId, rowIdx, colIdx } = parsed;
    const itemKey = itemId;

    if (!cellsByItemAndRow.has(itemKey)) {
      cellsByItemAndRow.set(itemKey, new Map());
    }

    const rowMap = cellsByItemAndRow.get(itemKey);
    if (!rowMap.has(rowIdx)) {
      rowMap.set(rowIdx, new Map());
    }

    // Get the value from shortlist
    const item = shortlist.find((i) => i.id === itemId);
    if (item && item.planTableEntries && item.planTableEntries[rowIdx]) {
      const value = item.planTableEntries[rowIdx][colIdx] || '';
      rowMap.get(rowIdx).set(colIdx, value);
    }
  });

  // Convert to TSV format
  // We'll process each item's rows and combine them
  const tsvRows = [];

  cellsByItemAndRow.forEach((rowMap) => {
    // Sort rows by index
    const sortedRowIdxs = Array.from(rowMap.keys()).sort((a, b) => a - b);

    sortedRowIdxs.forEach((rowIdx) => {
      const colMap = rowMap.get(rowIdx);
      // Sort columns by index
      const sortedColIdxs = Array.from(colMap.keys()).sort((a, b) => a - b);
      const values = sortedColIdxs.map((colIdx) => colMap.get(colIdx) || '');
      tsvRows.push(values.join('\t'));
    });
  });

  return tsvRows.join('\n');
};

/**
 * Handle paste operation
 * @param {Object} params Configuration object
 * @returns {Object|null} Command object for undo/redo, or null if nothing to paste
 */
export const handlePasteOperation = ({
  clipboardText,
  selectedCells,
  shortlist,
  setState,
}) => {
  if (!clipboardText || !selectedCells || selectedCells.size === 0) return null;

  // Parse TSV data
  const rows = clipboardText.split('\n').map((row) => row.split('\t'));
  if (rows.length === 0 || (rows.length === 1 && rows[0].length === 0)) return null;

  // Check if this is a single value paste (fill mode) vs grid paste
  const isSingleValue = rows.length === 1 && rows[0].length === 1;
  const singleValue = isSingleValue ? rows[0][0] : null;

  // Find the anchor cell (first selected cell)
  const firstCellKey = Array.from(selectedCells)[0];
  const anchor = parseCellKey(firstCellKey);
  if (!anchor) return null;

  // Calculate target cells based on paste size and anchor
  const pasteRowCount = rows.length;

  // Capture old state for undo
  let capturedState = null;

  const command = {
    execute: () => {
      setState((prev) => {
        // Capture state on first execute
        if (capturedState === null) {
          capturedState = cloneStagingState(prev);
        }

        // If single value and multiple cells selected, fill all selected cells
        if (isSingleValue && selectedCells.size > 1) {
          // Group cells by item
          const cellsByItem = new Map();
          selectedCells.forEach((cellKey) => {
            const parsed = parseCellKey(cellKey);
            if (!parsed) return;
            if (!cellsByItem.has(parsed.itemId)) {
              cellsByItem.set(parsed.itemId, []);
            }
            cellsByItem.get(parsed.itemId).push({ rowIdx: parsed.rowIdx, colIdx: parsed.colIdx });
          });

          return {
            ...prev,
            shortlist: prev.shortlist.map((item) => {
              const cells = cellsByItem.get(item.id);
              if (!cells) return item;

              const nextEntries = item.planTableEntries.map(cloneRowWithMetadata);
              cells.forEach(({ rowIdx, colIdx }) => {
                if (nextEntries[rowIdx] && colIdx < nextEntries[rowIdx].length) {
                  nextEntries[rowIdx][colIdx] = singleValue;
                }
              });

              return { ...item, planTableEntries: nextEntries };
            }),
          };
        }

        // Grid paste: paste values to selected cells
        // If multiple cells are selected, paste to all selected cells (repeating/tiling as needed)
        // If only anchor is selected, paste grid starting from anchor

        // Group selected cells by item
        const cellsByItem = new Map();
        selectedCells.forEach((cellKey) => {
          const parsed = parseCellKey(cellKey);
          if (!parsed) return;
          if (!cellsByItem.has(parsed.itemId)) {
            cellsByItem.set(parsed.itemId, []);
          }
          cellsByItem.get(parsed.itemId).push({ rowIdx: parsed.rowIdx, colIdx: parsed.colIdx });
        });

        return {
          ...prev,
          shortlist: prev.shortlist.map((item) => {
            const cells = cellsByItem.get(item.id);
            if (!cells) return item;

            const nextEntries = item.planTableEntries.map(cloneRowWithMetadata);

            // Find the bounds of the selection for this item
            const selectedRowIdxs = [...new Set(cells.map(c => c.rowIdx))].sort((a, b) => a - b);
            const selectedColIdxs = [...new Set(cells.map(c => c.colIdx))].sort((a, b) => a - b);

            // Create a set for quick lookup of selected cells
            const selectedSet = new Set(cells.map(c => `${c.rowIdx}|${c.colIdx}`));

            // Paste values - tile/repeat clipboard data across selected cells
            selectedRowIdxs.forEach((targetRowIdx, selRowOffset) => {
              selectedColIdxs.forEach((targetColIdx, selColOffset) => {
                // Only paste to cells that are actually selected
                if (!selectedSet.has(`${targetRowIdx}|${targetColIdx}`)) return;

                // Map selection offset to clipboard data (with wrapping/tiling)
                const clipboardRowIdx = selRowOffset % rows.length;
                const clipboardColIdx = selColOffset % rows[clipboardRowIdx].length;

                if (nextEntries[targetRowIdx] && targetColIdx < nextEntries[targetRowIdx].length) {
                  nextEntries[targetRowIdx][targetColIdx] = rows[clipboardRowIdx][clipboardColIdx];
                }
              });
            });

            return { ...item, planTableEntries: nextEntries };
          }),
        };
      });
    },
    undo: () => {
      if (capturedState !== null) {
        setState(capturedState);
      }
    },
  };

  return command;
};
