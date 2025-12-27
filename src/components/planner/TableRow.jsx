import React from 'react';
import { GripVertical, ListFilter, ChevronDown } from 'lucide-react';
import { MonthRow, WeekRow } from './rows';
import EditableCell from './EditableCell';
import DropdownCell, { PILLBOX_COLORS } from './DropdownCell';
import EstimateDropdownCell from './EstimateDropdownCell';
import CheckboxCell from './CheckboxCell';
import { ESTIMATE_COLOR_MAP } from '../../constants/planner/rowTypes';

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
  const rowType = row.original.type; // New row type system
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
            if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              // For day of week row (row 4), merge all fixed columns
              if (isDayOfWeekRow && !mergedCellRendered) {
                mergedCellRendered = true;
                return (
                  <td
                    key="merged-fixed-cols"
                    style={{
                      width: `${['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)}px`,
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
                'checkbox': '\u00A0\u00A0✓',
                'project': '\u00A0\u00A0Project',
                'subproject': '\u00A0\u00A0Subproject',
                'status': '\u00A0\u00A0Status',
                'task': '\u00A0\u00A0Task',
                'recurring': '\u00A0\u00A0Recurring',
                'estimate': '\u00A0\u00A0Estimate',
                'timeValue': '\u00A0\u00A0Time Value'
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
                      borderLeft: (columnId === 'checkbox') ? '1px solid black' : 'none',
                      borderRight: columnId === 'timeValue' ? '1.5px solid black' : 'none'
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
        if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
          if (!mergedCellRendered) {
            mergedCellRendered = true;
            return (
              <td
                key="merged-fixed-cols"
                style={{
                  width: `${['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)}px`,
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
        if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
          // Columns that need filter buttons: B (project), C (subproject), D (status), F (recurring), G (estimate)
          const hasFilter = ['project', 'subproject', 'status', 'recurring', 'estimate'].includes(columnId);

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
                  borderLeft: (row.index < 4 && columnId === 'checkbox') ? '1px solid black' : 'none',
                  borderRight: columnId === 'timeValue' ? '1.5px solid black' : (row.index < 4 ? 'none' : '1px solid #d3d3d3')
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
        // Fallback: Regular row rendering for rows without a type
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
        } else if (columnId === 'timeValue') {
          // Thick border after timeValue (last fixed column before day columns)
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
                columnId === 'checkbox' || columnId === 'recurring' ? (
                  <CheckboxCell
                    initialValue={editValue}
                    onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                    onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                    cellFontSize={cellFontSize}
                  />
                ) : columnId === 'status' ? (
                  <DropdownCell
                    initialValue={editValue}
                    onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                    onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                    cellFontSize={cellFontSize}
                    rowHeight={rowHeight}
                    isPillbox={true}
                  />
                ) : columnId === 'estimate' ? (
                  <EstimateDropdownCell
                    initialValue={editValue}
                    onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                    onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                    cellFontSize={cellFontSize}
                    rowHeight={rowHeight}
                  />
                ) : (
                  <EditableCell
                    initialValue={editValue}
                    onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                    onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                    cellFontSize={cellFontSize}
                  />
                )
              ) : (
                columnId === 'checkbox' || columnId === 'recurring' ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      backgroundColor: (value === 'true' || value === true) ? '#d4ecbc' : 'transparent',
                    }}
                  >
                    {/* Hidden input for copy/paste compatibility */}
                    <input
                      type="text"
                      value={(value === 'true' || value === true) ? 'true' : 'false'}
                      readOnly
                      style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    {/* Custom checkbox styled to match Done status colors */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditComplete(rowId, columnId, (!(value === 'true' || value === true)).toString());
                      }}
                      className="flex items-center justify-center cursor-pointer"
                      style={{
                        width: `${rowHeight - 12}px`,
                        height: `${rowHeight - 12}px`,
                        minWidth: `${rowHeight - 12}px`,
                        minHeight: `${rowHeight - 12}px`,
                        backgroundColor: (value === 'true' || value === true) ? '#52881c' : 'white',
                        border: `2px solid ${(value === 'true' || value === true) ? '#52881c' : '#d1d5db'}`,
                        borderRadius: '3px',
                      }}
                    >
                      {(value === 'true' || value === true) && (
                        <svg
                          width={`${rowHeight - 14}`}
                          height={`${rowHeight - 14}`}
                          viewBox="0 0 14 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.6666 3.5L5.24998 9.91667L2.33331 7"
                            stroke="white"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                ) : columnId === 'status' ? (
                  <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                    {value && value !== '' ? (
                      <div
                        className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                        style={{
                          backgroundColor: PILLBOX_COLORS[value]?.bg || PILLBOX_COLORS['-'].bg,
                          color: PILLBOX_COLORS[value]?.text || PILLBOX_COLORS['-'].text,
                          fontSize: `${cellFontSize}px`,
                          paddingLeft: '8px',
                          paddingRight: '8px'
                        }}
                      >
                        <span>{value}</span>
                        <ChevronDown size={10} style={{ color: PILLBOX_COLORS[value]?.text || PILLBOX_COLORS['-'].text }} />
                      </div>
                    ) : (
                      <div
                        className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                        style={{
                          backgroundColor: PILLBOX_COLORS['-'].bg,
                          color: PILLBOX_COLORS['-'].text,
                          fontSize: `${cellFontSize}px`,
                          paddingLeft: '8px',
                          paddingRight: '8px'
                        }}
                      >
                        <span>-</span>
                        <ChevronDown size={10} style={{ color: PILLBOX_COLORS['-'].text }} />
                      </div>
                    )}
                  </div>
                ) : columnId === 'estimate' ? (
                  <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                    <div
                      className="flex items-center justify-between gap-1 flex-1"
                      style={{
                        fontSize: `${cellFontSize}px`,
                        paddingLeft: '8px',
                        paddingRight: '8px',
                        color: ESTIMATE_COLOR_MAP[value]?.text || 'inherit'
                      }}
                    >
                      <span>{value || '-'}</span>
                      <ChevronDown size={12} style={{ color: '#9ca3af' }} />
                    </div>
                  </div>
                ) : columnId === 'timeValue' ? (
                  <div className="w-full text-right" style={{ paddingRight: '8px' }}>
                    {value || '\u00A0'}
                  </div>
                ) : (
                  <div className="w-full px-1">
                    {value || '\u00A0'}
                  </div>
                )
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
