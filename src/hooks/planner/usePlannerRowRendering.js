import { useCallback } from 'react';
import useRowRenderers from './useRowRenderers';

export default function usePlannerRowRendering({
  rowRenderersConfig,
  rowIndexMap,
  columnIndexByKey,
  handleCellClick,
  handleCellMouseDown,
  updateRowValues,
  isCellActive,
  isCellInSelection,
  selectedRowIdSet,
  selectedCellKeys,
  dragIndex = null,
  hoverIndex = null,
}) {
  const rowRenderers = useRowRenderers(rowRenderersConfig);

  const createRowRenderContext = useCallback(
    (tableRow, { previousRowOriginal = null, rowProps = {}, isActive = false, handleRowMouseDown = null } = {}) => {
      const row = tableRow?.original ?? {};
      const rowId = row?.id ?? null;
      const tableRowIndex = typeof tableRow?.index === 'number' ? tableRow.index : null;
      // Use originalRowNumber from row data to preserve numbering when filters are applied
      const rowNumber = row?.originalRowNumber ?? (tableRowIndex != null ? tableRowIndex + 1 : null);
      const isRowSelected = Boolean(rowId && selectedRowIdSet.has(rowId));
      const rowPropsLocal = { ...rowProps };

      if (isActive) {
        rowPropsLocal['data-active-row'] = 'true';
      }
      if (rowId) {
        rowPropsLocal['data-row-id'] = rowId;
      }

      // Add drag state styling
      // Apply dragging state to all selected rows during drag
      if (dragIndex !== null && isRowSelected) {
        rowPropsLocal['data-dragging'] = 'true';
      }
      if (tableRowIndex === hoverIndex && dragIndex !== null && hoverIndex !== null) {
        rowPropsLocal['data-drop-target'] = 'true';
      }

      const cellMetadataProps = (columnKey) => {
        const props = {};
        if (rowId) props['data-row-id'] = rowId;
        if (columnKey) props['data-column-key'] = columnKey;
        if (tableRowIndex != null) {
          props['data-row-index'] = tableRowIndex;
        }
        const columnIndex = columnIndexByKey[columnKey];
        if (columnIndex != null) {
          props['data-column-index'] = columnIndex;
        }
        return props;
      };

      const cellClickProps = (columnKey) => {
        if (tableRowIndex == null || !rowId) return {};

        // Add onClick and onMouseDown handlers to all cells
        // onMouseDown enables shift-select and cmd-select for multi-cell selection
        return {
          ...cellMetadataProps(columnKey),
          onClick: () => handleCellClick(tableRowIndex, columnKey),
          onMouseDown: (event) => {
            const target = event.target;
            const hasModifierKey = event.shiftKey || event.metaKey || event.ctrlKey;

            // For select elements - never intercept, always let them open
            const isSelect = target instanceof HTMLSelectElement || target.closest('select');
            if (isSelect) {
              return;
            }

            // For inputs and textareas
            const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
            if (isInput) {
              // Check if this cell is already active and is the only one selected
              const isAlreadyActive = isCellActive(rowId, columnKey);
              const cellKey = `${rowId}|${columnKey}`;
              const isSingleCellSelected = selectedCellKeys.size === 1 && selectedCellKeys.has(cellKey);

              // If cell is already active and is the only selected cell, allow normal editing
              if (isAlreadyActive && isSingleCellSelected && !hasModifierKey) {
                return;
              }

              // Blur any currently focused input to save its value before cell selection changes
              const activeInput = document.activeElement;
              if (activeInput instanceof HTMLInputElement ||
                  activeInput instanceof HTMLTextAreaElement) {
                activeInput.blur();
                // Wait for blur to complete and save value before changing selection
                setTimeout(() => {
                  handleCellMouseDown(event, rowId, columnKey);
                }, 0);
                event.preventDefault();
                return;
              }

              // For modifier keys, prevent default to enable multi-select without focusing
              if (hasModifierKey) {
                event.preventDefault();
              }
            }

            // Call the handler to track cell selection and anchor
            handleCellMouseDown(event, rowId, columnKey);
          },
        };
      };

      const withCellSelectionClass = (baseClass = '', columnKey) => {
        const classes = [];
        if (baseClass) classes.push(baseClass);
        if (isCellActive(rowId, columnKey)) classes.push('active-cell');
        if (isCellInSelection(rowId, columnKey)) classes.push('selected-cell');
        return classes.join(' ').trim();
      };

      const commitRowUpdate = (updater, options) => {
        if (!rowId) return;
        const targetIndex = rowIndexMap.get(rowId);
        if (targetIndex == null) return;
        updateRowValues(targetIndex, updater, options);
      };

      const ensureInteractionMarked = () => {
        commitRowUpdate(
          (currentRow) => {
            if (currentRow?.hasUserInteraction) return null;
            return { hasUserInteraction: true };
          },
          { markInteraction: true }
        );
      };

      return {
        row,
        rowId,
        rowNumber,
        isRowSelected,
        rowPropsLocal,
        cellMetadataProps,
        withCellSelectionClass,
        cellClickProps,
        tableRow,
        previousRow: previousRowOriginal,
        commitRowUpdate,
        ensureInteractionMarked,
        handleRowMouseDown,
      };
    },
    [
      columnIndexByKey,
      handleCellClick,
      handleCellMouseDown,
      isCellActive,
      isCellInSelection,
      rowIndexMap,
      selectedRowIdSet,
      selectedCellKeys,
      updateRowValues,
      dragIndex,
      hoverIndex,
    ]
  );

  const renderDataRow = useCallback(
    (tableRow, options = {}) => {
      const context = createRowRenderContext(tableRow, options);
      const renderer = rowRenderers[context.row.type];
      return renderer ? renderer(context) : null;
    },
    [createRowRenderContext, rowRenderers]
  );

  return { renderDataRow };
}
