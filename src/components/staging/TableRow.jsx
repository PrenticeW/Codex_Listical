import React from 'react';
import {
  DragHandleCell,
  TextInputCell,
  StaticTextCell,
  EstimateSelectCell,
  TimeValueCell,
  EmptyCell,
} from './TableCells';
import { PLAN_TABLE_COLS, formatMinutesToHHmm } from '../../utils/staging/planTableHelpers';
import { SECTION_CONFIG } from '../../utils/staging/sectionConfig';

/**
 * Unified table row component that handles all row types:
 * - header: Section header row (grey, spans all columns)
 * - prompt: Question/prompt row (medium grey)
 * - response: Answer/data row (light grey)
 * - data: Generic data row (white)
 */
export default function TableRow({
  item,
  rowValues,
  rowIdx,
  rowType,
  sectionType,
  // Selection state
  isCellSelected,
  isRowSelected,
  isDropTarget,
  isDragged,
  // Handlers
  onCellChange,
  onEstimateChange,
  onCellMouseDown,
  onCellMouseEnter,
  onHandleClick,
  onInputFocus,
  onEnterKeyAddRow,
  onContextMenu,
  // Drag handlers
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  // Styling
  textSizeScale,
  // Selection context for context menu
  selectedCells,
  selectedRows,
  // Outcome totaling
  outcomeTotals,
  outcomeSectionTotal,
}) {
  const hasTimeElements = sectionType === 'Actions' || sectionType === 'Schedule';
  const isSchedulePrompt = rowType === 'prompt' && sectionType === 'Schedule';

  // Common row props for drag and drop
  const rowProps = {
    draggable: true,
    onDragStart: (e) => onDragStart(e, item.id, rowIdx),
    onDragOver: (e) => onDragOver(e, item.id, rowIdx),
    onDrop: (e) => onDrop(e, item.id, rowIdx),
    onDragEnd,
    onContextMenu: (e) =>
      onContextMenu(e, {
        itemId: item.id,
        rowIdx,
        sectionType,
        rowType,
        showOutcomeTotals: item.showOutcomeTotals || false,
        selectedCells,
        selectedRows,
      }),
    style: {
      opacity: isDragged ? 0.5 : 1,
      cursor: 'grab',
    },
  };

  // Helper to create data attributes
  const dataAttrs = (col) => ({
    'data-plan-item': item.id,
    'data-plan-row': rowIdx,
    'data-plan-col': col,
  });

  // Helper for cell mouse handlers
  const cellMouseDown = (e, col) => onCellMouseDown(e, item.id, rowIdx, col, PLAN_TABLE_COLS);
  const cellMouseEnter = (col) => onCellMouseEnter(item.id, rowIdx, col, PLAN_TABLE_COLS);

  // HEADER ROW
  if (rowType === 'header') {
    const isActionsHeader = sectionType === 'Actions';
    const showOutcomeTotals = item.showOutcomeTotals || false;
    const showSectionTotal = isActionsHeader && showOutcomeTotals;

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="header"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <td
          colSpan={showSectionTotal ? PLAN_TABLE_COLS - 1 : PLAN_TABLE_COLS}
          className="border border-[#e5e7eb] py-0.5"
          style={{
            backgroundColor: isCellSelected(item.id, rowIdx, 0) ? '#dbeafe' : '#b7b7b7',
            borderTop: isDropTarget ? '2px solid #3b82f6' : undefined,
            paddingLeft: '12px',
          }}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
        >
          <input
            type="text"
            value={rowValues[0] || ''}
            onChange={(e) => onCellChange(item.id, rowIdx, 0, e.target.value)}
            onMouseDown={(e) => cellMouseDown(e, 0)}
            onFocus={onInputFocus}
            className="w-full bg-transparent focus:outline-none border-none font-semibold text-gray-800"
            style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
            {...dataAttrs(0)}
          />
        </td>
        {showSectionTotal && (
          <td
            className="border border-[#e5e7eb] py-0.5 text-right pr-2 font-semibold text-gray-800"
            style={{
              backgroundColor: '#b7b7b7',
              width: '70px',
              minWidth: '70px',
              fontSize: `${Math.round(14 * textSizeScale)}px`,
            }}
          >
            {formatMinutesToHHmm(outcomeSectionTotal)}
          </td>
        )}
      </tr>
    );
  }

  // PROMPT ROW - Schedule section (has time elements)
  if (isSchedulePrompt) {
    const estimateValue = rowValues[4] || '-';
    const isCustomEstimate = estimateValue === 'Custom';
    const displayedTimeValue = rowValues[5] || '0.00';

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="prompt"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(0)}
        />
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'prompt', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          colSpan={3}
          dataAttributes={dataAttrs(2)}
        />
        <EstimateSelectCell
          value={estimateValue}
          onChange={(val) => onEstimateChange(item.id, rowIdx, val)}
          onMouseDown={(e) => cellMouseDown(e, 4)}
          onMouseEnter={() => cellMouseEnter(4)}
          isSelected={isCellSelected(item.id, rowIdx, 4)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(4)}
        />
        <TimeValueCell
          value={displayedTimeValue}
          onChange={(val) => onCellChange(item.id, rowIdx, 5, val)}
          onMouseDown={(e) => cellMouseDown(e, 5)}
          onMouseEnter={() => cellMouseEnter(5)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 5)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          readOnly={!isCustomEstimate}
          dataAttributes={dataAttrs(5)}
        />
      </tr>
    );
  }

  // PROMPT ROW - Regular (no time elements, but may show totals for Actions section)
  if (rowType === 'prompt') {
    const showOutcomeTotals = item.showOutcomeTotals || false;
    const isActionsPrompt = sectionType === 'Actions';
    // outcomeTotals is now keyed by row index
    const outcomeTotal = isActionsPrompt && outcomeTotals ? outcomeTotals.get(rowIdx) || 0 : 0;
    const showTotal = isActionsPrompt && showOutcomeTotals;

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="prompt"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(0)}
        />
        <TextInputCell
          value={rowValues[1]}
          onChange={(val) => onCellChange(item.id, rowIdx, 1, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'prompt', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 1)}
          onMouseEnter={() => cellMouseEnter(1)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 1)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          textSizeScale={textSizeScale}
          colSpan={showTotal ? PLAN_TABLE_COLS - 2 : PLAN_TABLE_COLS - 1}
          dataAttributes={dataAttrs(1)}
        />
        {showTotal && (
          <td
            className="border border-[#e5e7eb] py-0.5 text-right pr-2 font-semibold"
            style={{
              backgroundColor: '#d4d4d4',
              width: '70px',
              minWidth: '70px',
              fontSize: `${Math.round(14 * textSizeScale)}px`,
            }}
          >
            {formatMinutesToHHmm(outcomeTotal)}
          </td>
        )}
      </tr>
    );
  }

  // RESPONSE ROW - with time elements (Actions or Schedule section)
  if (rowType === 'response' && hasTimeElements) {
    const estimateValue = rowValues[4] || '-';
    const displayedTimeValue = rowValues[5] || '0.00';

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="response"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(0)}
        />
        <TextInputCell
          value={rowValues[1]}
          onChange={(val) => onCellChange(item.id, rowIdx, 1, val)}
          onMouseDown={(e) => cellMouseDown(e, 1)}
          onMouseEnter={() => cellMouseEnter(1)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 1)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(1)}
        />
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'response', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          colSpan={2}
          dataAttributes={dataAttrs(2)}
        />
        <EstimateSelectCell
          value={estimateValue}
          onChange={(val) => onEstimateChange(item.id, rowIdx, val)}
          onMouseDown={(e) => cellMouseDown(e, 4)}
          onMouseEnter={() => cellMouseEnter(4)}
          isSelected={isCellSelected(item.id, rowIdx, 4)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(4)}
        />
        <TimeValueCell
          value={displayedTimeValue}
          onChange={(val) => onCellChange(item.id, rowIdx, 5, val)}
          onMouseDown={(e) => cellMouseDown(e, 5)}
          onMouseEnter={() => cellMouseEnter(5)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 5)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          readOnly={false}
          dataAttributes={dataAttrs(5)}
        />
      </tr>
    );
  }

  // RESPONSE ROW - without time elements
  if (rowType === 'response') {
    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="response"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(0)}
        />
        <TextInputCell
          value={rowValues[1]}
          onChange={(val) => onCellChange(item.id, rowIdx, 1, val)}
          onMouseDown={(e) => cellMouseDown(e, 1)}
          onMouseEnter={() => cellMouseEnter(1)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 1)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="120px"
          dataAttributes={dataAttrs(1)}
        />
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'response', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          colSpan={PLAN_TABLE_COLS - 2}
          dataAttributes={dataAttrs(2)}
        />
      </tr>
    );
  }

  // DATA ROW - generic row with all cells editable (fallback)
  return (
    <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
      <DragHandleCell
        isRowSelected={isRowSelected}
        isDropTarget={isDropTarget}
        rowType="data"
        onClick={(e) => onHandleClick(e, item.id, rowIdx)}
      />
      {rowValues.map((cellValue, cellIdx) => (
        <TextInputCell
          key={`${item.id}-row-${rowIdx}-cell-${cellIdx}`}
          value={cellValue}
          onChange={(val) => onCellChange(item.id, rowIdx, cellIdx, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, rowValues.__rowType || 'data', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, cellIdx)}
          onMouseEnter={() => cellMouseEnter(cellIdx)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, cellIdx)}
          isDropTarget={isDropTarget}
          rowType="data"
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(cellIdx)}
        />
      ))}
    </tr>
  );
}
