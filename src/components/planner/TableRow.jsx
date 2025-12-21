import React from 'react';
import { GripVertical, ListFilter } from 'lucide-react';
import { MonthRow, WeekRow } from './rows';
import EditableCell from './EditableCell';

/**
 * TableRow Component
 * Renders a single row in the table with support for special row types
 * and regular data rows
 */
export default function TableRow({
  row,
  virtualRow,
  isRowSelected,
  isCellSelected,
  editingCell,
  editValue,
  setEditValue,
  handleRowNumberClick,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellDoubleClick,
  handleEditComplete,
  handleEditKeyDown,
  draggedRowId,
  dropTargetRowId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
  table,
  dates,
}) {
  const rowId = row.original.id;
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  // Check if this is a pinned row (first 7 rows)
  const isPinnedRow = row.index < 7;
  // Higher z-index for pinned row number cells
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  const style = {
    display: 'flex',
    position: 'absolute',
    top: 0,
    left: 0,
    transform: `translateY(${virtualRow.start}px)`,
    width: '100%',
    opacity: isDragging ? 0.5 : 1,
    gap: 0,
  };

  // Check if this is a special row
  const isMonthRow = row.original._isMonthRow;
  const isWeekRow = row.original._isWeekRow;
  const isDayRow = row.original._isDayRow;
  const isDayOfWeekRow = row.original._isDayOfWeekRow;
  const isDailyMinRow = row.original._isDailyMinRow;
  const isDailyMaxRow = row.original._isDailyMaxRow;
  const isFilterRow = row.original._isFilterRow;

  return (
    <>
      {isDropTarget && draggedRowId && !isDragging && (
        <tr
          style={{
            position: 'absolute',
            top: virtualRow.start - 1,
            left: 0,
            width: '100%',
            height: '2px',
            backgroundColor: '#3b82f6',
            zIndex: 1000,
            pointerEvents: 'none',
            display: 'block',
          }}
        />
      )}
      <tr
        style={style}
        className={isRowSelected || isDragging ? 'selected-row' : ''}
        onDragOver={(e) => handleDragOver(e, rowId)}
        onDrop={(e) => handleDrop(e, rowId)}
      >
      {isMonthRow ? (
        <MonthRow
          row={row}
          rowId={rowId}
          isRowSelected={isRowSelected}
          rowNumZIndex={rowNumZIndex}
          rowHeight={rowHeight}
          headerFontSize={headerFontSize}
          gripIconSize={gripIconSize}
          cellFontSize={cellFontSize}
          table={table}
          handleRowNumberClick={handleRowNumberClick}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
        />
      ) : isWeekRow ? (
        <WeekRow
          row={row}
          rowId={rowId}
          isRowSelected={isRowSelected}
          rowNumZIndex={rowNumZIndex}
          rowHeight={rowHeight}
          headerFontSize={headerFontSize}
          gripIconSize={gripIconSize}
          cellFontSize={cellFontSize}
          table={table}
          handleRowNumberClick={handleRowNumberClick}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
        />
      ) : isDayRow || isDayOfWeekRow ? (
        // Render day/day-of-week rows with centered calendar cells
        (() => {
          let mergedCellRendered = false;
          return row.getVisibleCells().map(cell => {
            const columnId = cell.column.id;
            const value = row.original[columnId] || '';

            // Special handling for row number column
            if (columnId === 'rowNum') {
              return (
                <td
                  key={cell.id}
                  style={{
                    width: `${cell.column.getSize()}px`,
                    flexShrink: 0,
                    flexGrow: 0,
                    height: `${rowHeight}px`,
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: '#d9f6e0',
                    zIndex: rowNumZIndex,
                  }}
                  className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
                >
                  <div
                    className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer`}
                    style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: '#d9f6e0', color: '#065f46' }}
                    onClick={(e) => handleRowNumberClick(e, rowId)}
                  >
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, rowId);
                      }}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing flex items-center"
                      title="Drag to reorder"
                    >
                      <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                    </div>
                    <span>{row.index + 1}</span>
                    <div style={{ width: `${gripIconSize}px` }} />
                  </div>
                </td>
              );
            }

            // For fixed columns, show empty cells
            if (['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'].includes(columnId)) {
              // For day of week row (row 4), merge all fixed columns
              if (isDayOfWeekRow && !mergedCellRendered) {
                mergedCellRendered = true;
                return (
                  <td
                    key="merged-fixed-cols"
                    style={{
                      width: `${['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'].reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)}px`,
                      flexShrink: 0,
                      flexGrow: 0,
                      height: `${rowHeight}px`,
                      boxSizing: 'border-box',
                    }}
                    className="p-0"
                  >
                    <div
                      className="h-full"
                      style={{
                        minHeight: `${rowHeight}px`,
                        backgroundColor: 'black',
                        borderTop: '3px solid white',
                        borderBottom: '3px solid white',
                        borderRight: '1.5px solid black',
                      }}
                    />
                  </td>
                );
              } else if (isDayOfWeekRow) {
                // Skip subsequent fixed columns for day of week row
                return null;
              }

              // For day row (row 3), render individual cells with labels
              const labelMap = {
                'project': '\u00A0\u00A0✓',
                'status': '\u00A0\u00A0Project',
                'task': '\u00A0\u00A0Subproject',
                'estimate': '\u00A0\u00A0Status',
                'timeValue': '\u00A0\u00A0Task',
                'col_f': '\u00A0\u00A0Recurring',
                'col_g': '\u00A0\u00A0Estimate',
                'col_h': '\u00A0\u00A0Time Value'
              };

              return (
                <td
                  key={cell.id}
                  style={{
                    width: `${cell.column.getSize()}px`,
                    flexShrink: 0,
                    flexGrow: 0,
                    height: `${rowHeight}px`,
                    boxSizing: 'border-box',
                  }}
                  className="p-0"
                >
                  <div
                    className="h-full flex items-center"
                    style={{
                      minHeight: `${rowHeight}px`,
                      backgroundColor: 'black',
                      color: 'white',
                      fontSize: `${cellFontSize}px`,
                      fontWeight: 500,
                      borderTop: '3px solid white',
                      borderBottom: '3px solid white',
                      borderLeft: (columnId === 'project') ? '1px solid black' : 'none',
                      borderRight: columnId === 'col_h' ? '1.5px solid black' : 'none'
                    }}
                  >
                    {labelMap[columnId] || ''}
                  </div>
                </td>
              );
            }

        // For day columns, determine if it's a weekend and apply appropriate background
        // Extract day index from columnId (e.g., "day-0" -> 0)
        const dayIndex = parseInt(columnId.split('-')[1]);
        const date = dates[dayIndex];
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Check if this is the last day of a week (every 7th day: day 6, 13, 20, etc.)
        const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;

        // Different background colors based on row type and whether it's a weekend
        let bgColor;
        if (isDayOfWeekRow) {
          // Day of week row: #d9d9d9 for weekends, #efefef for weekdays
          bgColor = isWeekend ? '#d9d9d9' : '#efefef';
        } else {
          // Day number row: transparent to show borders
          bgColor = 'transparent';
        }

        // For day columns, center-align the content
        return (
          <td
            key={cell.id}
            style={{
              width: `${cell.column.getSize()}px`,
              flexShrink: 0,
              flexGrow: 0,
              height: `${rowHeight}px`,
              boxSizing: 'border-box',
            }}
            className="p-0"
          >
            <div
              className="h-full flex items-center justify-center"
              style={{
                minHeight: `${rowHeight}px`,
                fontSize: `${cellFontSize}px`,
                backgroundColor: bgColor,
                borderTop: isDayRow ? '1.5px solid black' : (isDayOfWeekRow ? '1.5px solid black' : undefined),
                borderBottom: isDayOfWeekRow ? '1.5px solid black' : '1px solid #d3d3d3',
                borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3'
              }}
            >
              {value || '\u00A0'}
            </div>
          </td>
        );
      });
    })()
      ) : isDailyMinRow || isDailyMaxRow ? (
        // Render daily min/max rows with special styling
        (() => {
          let mergedCellRendered = false;
          return row.getVisibleCells().map(cell => {
        const columnId = cell.column.id;
        const value = row.original[columnId] || '';

        // Determine background color based on row type
        const bgColor = isDailyMinRow ? '#ead1dc' : '#f2e5eb';

        // Special handling for row number column
        if (columnId === 'rowNum') {
          return (
            <td
              key={cell.id}
              style={{
                width: `${cell.column.getSize()}px`,
                flexShrink: 0,
                flexGrow: 0,
                height: `${rowHeight}px`,
                userSelect: 'none',
                boxSizing: 'border-box',
                position: 'sticky',
                left: 0,
                backgroundColor: '#d9f6e0',
                zIndex: rowNumZIndex,
              }}
              className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
            >
              <div
                className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer`}
                style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: '#d9f6e0', color: '#065f46' }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(e, rowId);
                  }}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab active:cursor-grabbing flex items-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                </div>
                <span>{row.index + 1}</span>
                <div style={{ width: `${gripIconSize}px` }} />
              </div>
            </td>
          );
        }

        // For fixed columns A-H, merge them into a single black cell
        if (['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'].includes(columnId)) {
          if (!mergedCellRendered) {
            mergedCellRendered = true;
            return (
              <td
                key="merged-fixed-cols"
                style={{
                  width: `${['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'].reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)}px`,
                  flexShrink: 0,
                  flexGrow: 0,
                  height: `${rowHeight}px`,
                  boxSizing: 'border-box',
                }}
                className="p-0"
              >
                <div
                  className="h-full"
                  style={{
                    minHeight: `${rowHeight}px`,
                    backgroundColor: 'black',
                    borderTop: '1px solid black',
                    borderBottom: '1px solid black',
                    borderRight: '1.5px solid black',
                  }}
                />
              </td>
            );
          } else {
            // Skip subsequent fixed columns since they're merged
            return null;
          }
        }

        // For day columns, show the value with special styling
        // Extract day index and check if it's the last day of a week (every 7th day)
        const dayIndex = parseInt(columnId.split('-')[1]);
        const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;

        return (
          <td
            key={cell.id}
            style={{
              width: `${cell.column.getSize()}px`,
              flexShrink: 0,
              flexGrow: 0,
              height: `${rowHeight}px`,
              boxSizing: 'border-box',
            }}
            className="p-0"
          >
            <div
              className="h-full flex items-center justify-center italic text-xs"
              style={{
                minHeight: `${rowHeight}px`,
                backgroundColor: bgColor,
                fontSize: '10px',
                borderBottom: '1px solid #d3d3d3',
                borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3'
              }}
            >
              {value || '\u00A0'}
            </div>
          </td>
        );
      });
    })()
      ) : isFilterRow ? (
        // Render filter row with filter button placeholders
        row.getVisibleCells().map(cell => {
        const columnId = cell.column.id;

        // Special handling for row number column
        if (columnId === 'rowNum') {
          return (
            <td
              key={cell.id}
              style={{
                width: `${cell.column.getSize()}px`,
                flexShrink: 0,
                flexGrow: 0,
                height: `${rowHeight}px`,
                userSelect: 'none',
                boxSizing: 'border-box',
                position: 'sticky',
                left: 0,
                backgroundColor: '#d9f6e0',
                zIndex: rowNumZIndex,
              }}
              className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
            >
              <div
                className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer`}
                style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: '#d9f6e0', color: '#065f46' }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(e, rowId);
                  }}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab active:cursor-grabbing flex items-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                </div>
                <span>{row.index + 1}</span>
                <div style={{ width: `${gripIconSize}px` }} />
              </div>
            </td>
          );
        }

        // For fixed columns
        if (['project', 'status', 'task', 'estimate', 'timeValue', 'col_f', 'col_g', 'col_h'].includes(columnId)) {
          // Columns that need filter buttons: B (status), C (task), D (estimate), F (col_f), G (col_g)
          const hasFilter = ['status', 'task', 'estimate', 'col_f', 'col_g'].includes(columnId);

          return (
            <td
              key={cell.id}
              style={{
                width: `${cell.column.getSize()}px`,
                flexShrink: 0,
                flexGrow: 0,
                height: `${rowHeight}px`,
                boxSizing: 'border-box',
              }}
              className="p-0"
            >
              <div
                className="h-full flex items-center justify-center"
                style={{
                  minHeight: `${rowHeight}px`,
                  backgroundColor: row.index < 4 ? 'black' : '#ead1dc',
                  borderBottom: row.index < 4 ? '1px solid black' : '1px solid #d3d3d3',
                  borderLeft: (row.index < 4 && columnId === 'project') ? '1px solid black' : 'none',
                  borderRight: columnId === 'col_h' ? '1.5px solid black' : (row.index < 4 ? 'none' : '1px solid #d3d3d3')
                }}
              >
                {hasFilter && (
                  <ListFilter size={14} className="text-gray-400" />
                )}
              </div>
            </td>
          );
        }

        // For day columns, show filter button (right-aligned) and 0.00 value
        const value = row.original[columnId] || '';
        const dayIndex = parseInt(columnId.split('-')[1]);
        const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;

        return (
          <td
            key={cell.id}
            style={{
              width: `${cell.column.getSize()}px`,
              flexShrink: 0,
              flexGrow: 0,
              height: `${rowHeight}px`,
              boxSizing: 'border-box',
            }}
            className="p-0"
          >
            <div
              className="h-full flex items-center gap-1"
              style={{
                minHeight: `${rowHeight}px`,
                fontSize: `${cellFontSize}px`,
                backgroundColor: '#ead1dc',
                borderBottom: '1px solid #d3d3d3',
                borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3'
              }}
            >
              <span className="text-xs flex-1">{value}</span>
              <ListFilter size={10} className="text-gray-400 flex-shrink-0" />
            </div>
          </td>
        );
      })
      ) : (
        // Regular row rendering
        row.getVisibleCells().map(cell => {
        const columnId = cell.column.id;
        const value = row.original[columnId] || '';
        const isSelected = isCellSelected(rowId, columnId);
        const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

        // Special handling for row number column
        if (columnId === 'rowNum') {
          return (
            <td
              key={cell.id}
              style={{
                width: `${cell.column.getSize()}px`,
                flexShrink: 0,
                flexGrow: 0,
                height: `${rowHeight}px`,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                boxSizing: 'border-box',
                position: 'sticky',
                left: 0,
                backgroundColor: '#d9f6e0',
                zIndex: rowNumZIndex,
              }}
              className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
            >
              <div
                className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer`}
                style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: '#d9f6e0', color: '#065f46' }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <div
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(e, rowId);
                  }}
                  onDragEnd={handleDragEnd}
                  className="cursor-grab active:cursor-grabbing flex items-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                </div>
                <span>{row.index + 1}</span>
                <div style={{ width: `${gripIconSize}px` }} />
              </div>
            </td>
          );
        }

        // Check if this is a day column to apply week border
        const isDayColumn = columnId.startsWith('day-');
        let borderRightStyle = undefined;

        if (isDayColumn) {
          const dayIndex = parseInt(columnId.split('-')[1]);
          const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;

          if (isLastDayOfWeek) {
            borderRightStyle = '1.5px solid black';
          } else {
            borderRightStyle = '1px solid #d3d3d3';
          }
        } else if (columnId === 'col_h') {
          // Thick border after col_h (last fixed column before day columns)
          borderRightStyle = '1.5px solid black';
        } else {
          borderRightStyle = '1px solid #d3d3d3';
        }

        return (
          <td
            key={cell.id}
            style={{
              width: `${cell.column.getSize()}px`,
              flexShrink: 0,
              flexGrow: 0,
              height: `${rowHeight}px`,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              boxSizing: 'border-box',
            }}
            className="p-0"
          >
            <div
              className={`h-full cursor-cell flex items-center ${
                isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
              }`}
              style={{
                fontSize: `${cellFontSize}px`,
                minHeight: `${rowHeight}px`,
                borderBottom: '1px solid #d3d3d3',
                borderRight: borderRightStyle
              }}
              onMouseDown={(e) => handleCellMouseDown(e, rowId, columnId)}
              onMouseEnter={() => handleCellMouseEnter({}, rowId, columnId)}
              onDoubleClick={() => handleCellDoubleClick(rowId, columnId, value)}
            >
              {isEditing ? (
                <EditableCell
                  initialValue={editValue}
                  onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                  onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                  cellFontSize={cellFontSize}
                />
              ) : (
                <div className="w-full">{value || '\u00A0'}</div>
              )}
            </div>
          </td>
        );
      })
      )}
    </tr>
    </>
  );
}
