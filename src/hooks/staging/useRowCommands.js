import { useCallback } from 'react';
import {
  cloneStagingState,
  cloneRowWithMetadata,
  PLAN_TABLE_COLS,
} from '../../utils/staging/planTableHelpers';
import { SECTION_CONFIG } from '../../utils/staging/sectionConfig';

/**
 * Hook that provides row manipulation commands (insert, delete, duplicate)
 * All commands support undo/redo via the command pattern
 */
export default function useRowCommands({
  setState,
  executeCommand,
  clearSelection,
  pendingFocusRequestRef,
}) {
  /**
   * Insert a blank row above the specified position
   */
  const insertRowAbove = useCallback(
    (itemId, rowIdx) => {
      if (itemId == null || rowIdx == null) return;

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                const newRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                entries.splice(rowIdx, 0, newRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  /**
   * Insert a blank row below the specified position
   */
  const insertRowBelow = useCallback(
    (itemId, rowIdx) => {
      if (itemId == null || rowIdx == null) return;

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                const newRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                entries.splice(rowIdx + 1, 0, newRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  /**
   * Delete rows - either from selection or single row
   */
  const deleteRows = useCallback(
    (selectedRows, contextItemId, contextRowIdx) => {
      const rowsToDelete = new Map();

      if (selectedRows && selectedRows.size > 0) {
        selectedRows.forEach((rowKey) => {
          const [itemId, rowIdxStr] = rowKey.split('|');
          const rowIdx = parseInt(rowIdxStr, 10);
          if (!rowsToDelete.has(itemId)) {
            rowsToDelete.set(itemId, new Set());
          }
          rowsToDelete.get(itemId).add(rowIdx);
        });
      } else if (contextItemId != null && contextRowIdx != null) {
        rowsToDelete.set(contextItemId, new Set([contextRowIdx]));
      } else {
        return;
      }

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const rowIdxSet = rowsToDelete.get(item.id);
                if (!rowIdxSet || rowIdxSet.size === 0) return item;

                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                // Don't delete if it would leave no rows
                if (entries.length <= rowIdxSet.size) return item;

                // Delete rows in reverse order to preserve indices
                const sortedIndices = Array.from(rowIdxSet).sort((a, b) => b - a);
                sortedIndices.forEach((idx) => {
                  if (idx >= 0 && idx < entries.length) {
                    entries.splice(idx, 1);
                  }
                });

                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
      if (clearSelection) clearSelection();
    },
    [setState, executeCommand, clearSelection]
  );

  /**
   * Duplicate rows - either from selection or single row
   */
  const duplicateRows = useCallback(
    (selectedRows, contextItemId, contextRowIdx) => {
      const rowsToDuplicate = new Map();

      if (selectedRows && selectedRows.size > 0) {
        selectedRows.forEach((rowKey) => {
          const [itemId, rowIdxStr] = rowKey.split('|');
          const rowIdx = parseInt(rowIdxStr, 10);
          if (!rowsToDuplicate.has(itemId)) {
            rowsToDuplicate.set(itemId, new Set());
          }
          rowsToDuplicate.get(itemId).add(rowIdx);
        });
      } else if (contextItemId != null && contextRowIdx != null) {
        rowsToDuplicate.set(contextItemId, new Set([contextRowIdx]));
      } else {
        return;
      }

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const rowIdxSet = rowsToDuplicate.get(item.id);
                if (!rowIdxSet || rowIdxSet.size === 0) return item;

                const entries = item.planTableEntries.map(cloneRowWithMetadata);

                // Insert in reverse order to preserve indices
                const sortedIndices = Array.from(rowIdxSet).sort((a, b) => b - a);
                sortedIndices.forEach((idx) => {
                  if (idx >= 0 && idx < entries.length) {
                    const duplicatedRow = cloneRowWithMetadata(entries[idx]);
                    entries.splice(idx + 1, 0, duplicatedRow);
                  }
                });

                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
      if (clearSelection) clearSelection();
    },
    [setState, executeCommand, clearSelection]
  );

  /**
   * Clear selected cells content
   */
  const clearCells = useCallback(
    (selectedCells) => {
      if (!selectedCells || selectedCells.size === 0) return;

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }

            const cellsByItem = new Map();
            selectedCells.forEach((cellKey) => {
              const [itemId, rowIdx, colIdx] = cellKey.split('|');
              if (!cellsByItem.has(itemId)) {
                cellsByItem.set(itemId, []);
              }
              cellsByItem.get(itemId).push({
                rowIdx: parseInt(rowIdx, 10),
                colIdx: parseInt(colIdx, 10),
              });
            });

            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                const cells = cellsByItem.get(item.id);
                if (!cells) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                cells.forEach(({ rowIdx, colIdx }) => {
                  if (entries[rowIdx] && entries[rowIdx][colIdx] !== undefined) {
                    entries[rowIdx][colIdx] = '';
                  }
                });
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  /**
   * Insert a row of specific type (prompt, response, data) below the specified position
   */
  const insertRowType = useCallback(
    (itemId, rowIdx, sectionType, rowType) => {
      if (itemId == null || rowIdx == null) return;

      // Determine text column and placeholder based on row type and section
      let textColumn = 2;
      let placeholderText = '';

      if (rowType === 'response') {
        textColumn = 2;
        placeholderText = SECTION_CONFIG[sectionType]?.placeholder || '';
      } else if (rowType === 'prompt') {
        textColumn = sectionType === 'Schedule' ? 2 : 1;
        placeholderText = SECTION_CONFIG[sectionType]?.prompt || '';
      } else if (rowType === 'data') {
        textColumn = 0;
        placeholderText = '';
      }

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);

                const newRow = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => {
                  if (rowType !== 'data' && i === textColumn) return placeholderText;
                  return '';
                });

                Object.defineProperty(newRow, '__rowType', {
                  value: rowType,
                  writable: true,
                  configurable: true,
                  enumerable: false,
                });

                entries.splice(rowIdx + 1, 0, newRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);

      // Set focus to the new row
      if (pendingFocusRequestRef) {
        pendingFocusRequestRef.current = {
          itemId,
          row: rowIdx + 1,
          col: textColumn,
        };
      }
    },
    [setState, executeCommand, pendingFocusRequestRef]
  );

  /**
   * Add a new row of the same type below (triggered by Enter key)
   */
  const addRowOnEnter = useCallback(
    (e, itemId, rowIdx, rowType) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const responseDefaultsBySection = {
        Reasons: SECTION_CONFIG.Reasons.placeholder,
        Outcomes: SECTION_CONFIG.Outcomes.placeholder,
        Actions: SECTION_CONFIG.Actions.placeholder,
        Schedule: SECTION_CONFIG.Schedule.placeholder,
        Subprojects: SECTION_CONFIG.Subprojects.placeholder,
      };

      const promptDefaultsBySection = {
        Reasons: SECTION_CONFIG.Reasons.prompt,
        Outcomes: SECTION_CONFIG.Outcomes.prompt,
        Actions: SECTION_CONFIG.Actions.prompt,
        Schedule: SECTION_CONFIG.Schedule.prompt,
        Subprojects: SECTION_CONFIG.Subprojects.prompt,
      };

      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);

                // Find the nearest header row above to determine the section
                let sectionType = '';
                for (let i = rowIdx; i >= 0; i--) {
                  if (entries[i]?.__rowType === 'header') {
                    sectionType = entries[i].__sectionType || '';
                    break;
                  }
                }

                const getDefaultText = () => {
                  if (rowType === 'response') {
                    return responseDefaultsBySection[sectionType] || '';
                  }
                  if (rowType === 'prompt') {
                    return promptDefaultsBySection[sectionType] || '';
                  }
                  return '';
                };

                const defaultText = getDefaultText();
                const newRow = Array.from({ length: PLAN_TABLE_COLS }, (_, i) => {
                  if (rowType === 'response' && i === 2) return defaultText;
                  if (rowType === 'prompt' && i === 1) return defaultText;
                  return '';
                });

                if (rowType) {
                  Object.defineProperty(newRow, '__rowType', {
                    value: rowType,
                    writable: true,
                    configurable: true,
                    enumerable: false,
                  });
                }

                entries.splice(rowIdx + 1, 0, newRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);

      // Set focus to the new row
      const focusCol = rowType === 'prompt' ? 1 : 2;
      if (pendingFocusRequestRef) {
        pendingFocusRequestRef.current = {
          itemId,
          row: rowIdx + 1,
          col: focusCol,
        };
      }
    },
    [setState, executeCommand, pendingFocusRequestRef]
  );

  return {
    insertRowAbove,
    insertRowBelow,
    deleteRows,
    duplicateRows,
    clearCells,
    insertRowType,
    addRowOnEnter,
  };
}
