import React, { useMemo } from 'react';
import { ListFilter } from 'lucide-react';

const FILTER_BLOCKED_LETTERS = new Set(['A', 'D', 'F']);

export default function TimelineHeader({
  timelineRows,
  columnStructure,
  columnLetters,
  columnLetterByKey,
  getWidthStyle,
  fixedCols,
  ROW_H,
  activeFilterColumns,
  projectFilterMenu,
  projectFilterButtonRef,
  handleProjectFilterButtonClick,
  selectedProjectFilters,
  statusFilterMenu,
  statusFilterButtonRef,
  handleStatusFilterButtonClick,
  selectedStatusFilters,
  recurringFilterMenu,
  recurringFilterButtonRef,
  handleRecurringFilterButtonClick,
  selectedRecurringFilters,
  estimateFilterMenu,
  estimateFilterButtonRef,
  handleEstimateFilterButtonClick,
  selectedEstimateFilters,
  toggleFilterColumn,
  applyRowLabelStyle = () => ({}),
}) {
  const letterByKey = useMemo(() => {
    if (columnLetterByKey) return columnLetterByKey;
    const map = {};
    columnStructure.forEach((col, idx) => {
      map[col.key] = columnLetters[idx];
    });
    return map;
  }, [columnLetterByKey, columnLetters, columnStructure]);

  const renderContentWithFilterButton = (content, columnKey = null, rowIsFilter = false) => {
    if (!rowIsFilter || !columnKey || columnKey === 'rowLabel') return content;
    const columnLetter = letterByKey[columnKey];
    if (columnLetter && FILTER_BLOCKED_LETTERS.has(columnLetter)) return content;
    const isProjectFilterButton = columnKey === 'project';
    const isStatusFilterButton = columnKey === 'status';
    const isRecurringFilterButton = columnKey === 'recurring';
    const isEstimateFilterButton = columnKey === 'estimate';
    const isActive = isProjectFilterButton
      ? projectFilterMenu.open || selectedProjectFilters.size > 0
      : isStatusFilterButton
        ? statusFilterMenu.open || selectedStatusFilters.size > 0
        : isRecurringFilterButton
          ? recurringFilterMenu.open || selectedRecurringFilters.size > 0
          : isEstimateFilterButton
            ? estimateFilterMenu.open || selectedEstimateFilters.size > 0
            : activeFilterColumns.has(columnKey);
    return (
      <div className="flex w-full items-center justify-end gap-1">
        <span className="leading-tight">{content}</span>
        <button
          type="button"
          aria-label={`Toggle filter for ${columnKey}`}
          aria-pressed={isActive}
          title={isActive ? 'Filter active' : 'Add filter'}
          ref={
            isProjectFilterButton
              ? projectFilterButtonRef
              : isStatusFilterButton
                ? statusFilterButtonRef
                : isRecurringFilterButton
                  ? recurringFilterButtonRef
                  : isEstimateFilterButton
                    ? estimateFilterButtonRef
                    : null
          }
          onClick={(event) => {
            if (isProjectFilterButton) {
              handleProjectFilterButtonClick(event);
            } else if (isStatusFilterButton) {
              handleStatusFilterButtonClick(event);
            } else if (isRecurringFilterButton) {
              handleRecurringFilterButtonClick(event);
            } else if (isEstimateFilterButton) {
              handleEstimateFilterButtonClick(event);
            } else {
              event.preventDefault();
              event.stopPropagation();
              toggleFilterColumn(columnKey);
            }
          }}
          className={`inline-flex h-[22px] w-[22px] items-center justify-center bg-transparent p-0 transition-colors ${
            isActive ? 'text-green-600' : 'text-green-400 hover:text-green-600'
          }`}
          style={{ border: 'none' }}
        >
          <ListFilter className="h-full w-full" strokeWidth={isActive ? 2.2 : 2} />
        </button>
      </div>
    );
  };

  const renderTimelineRow = (config) => {
    if (!config) return null;
    const {
      id,
      rowClassName,
      rowLabelStyle,
      rowLabelClassName = 'text-center font-semibold border border-[#ced3d0]',
      fixedCellStyle,
      fixedCellClassName = 'border border-[#ced3d0]',
      fixedCells = [],
      cells = [],
      rowLabelContent = '',
    } = config;
    const isFilterRow = id === 'totals';

    return (
      <tr key={`row-${id}`} className={`h-[${ROW_H}px] ${rowClassName ?? ''}`}>
        <td
          className={`${rowLabelClassName} p-0`}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(rowLabelStyle || {}))}
        >
          {renderContentWithFilterButton(rowLabelContent, 'rowLabel', isFilterRow)}
        </td>
        {fixedCells.length > 0 ? (
          fixedCells.map((cell) => (
            <td
              key={cell.key}
              colSpan={cell.colSpan ?? 1}
              className={`${cell.className ?? fixedCellClassName} p-0`}
              style={{
                ...(fixedCellStyle || {}),
                ...(cell.columnKey ? getWidthStyle(cell.columnKey, cell.style || {}) : cell.style || {}),
              }}
            >
              {renderContentWithFilterButton(cell.content, cell.columnKey ?? cell.key, isFilterRow)}
            </td>
          ))
        ) : (
          <td
            colSpan={fixedCols - 1}
            className={`${fixedCellClassName} p-0`}
            style={fixedCellStyle}
          ></td>
        )}
        {cells.map((cell) => (
          <td
            key={cell.key}
            colSpan={cell.colSpan ?? 1}
            className={[cell.className || '', 'p-0'].join(' ').trim()}
            style={
              cell.columnKey ? getWidthStyle(cell.columnKey, cell.style || {}) : cell.style
            }
          >
            {renderContentWithFilterButton(cell.content, cell.columnKey, isFilterRow)}
          </td>
        ))}
      </tr>
    );
  };

  if (!timelineRows.length) return null;

  return (
    <>
      {timelineRows.map((row) => (
        renderTimelineRow(row)
      ))}
    </>
  );
}
