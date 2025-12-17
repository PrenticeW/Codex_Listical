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

            // For inputs with modifier keys: prevent default to enable multi-select
            // For inputs without modifiers: don't prevent default, let them focus normally
            const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
            if (isInput && hasModifierKey) {
              event.preventDefault();
            }

            // Always call the handler to track cell selection and anchor
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
