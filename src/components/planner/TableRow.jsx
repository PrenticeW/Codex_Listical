import { GripVertical, ListFilter } from 'lucide-react';
import { MonthRow, WeekRow } from './rows';
import TaskRow from './rows/TaskRow';
import ProjectRow from './rows/ProjectRow';

/**
 * TableRow Component
 * Routes row rendering to the appropriate specialized component based on row type
 * Handles special row types (month, week, day, filter, daily min/max) and delegates
 * regular task rows to the TaskRow component
 */
export default function TableRow({
  row,
  virtualRow,
  isRowSelected,
  isCellSelected,
  editingCell,
  editValue,
  handleRowNumberClick,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellDoubleClick,
  handleEditComplete,
  handleEditCancel,
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
  projects = ['-'],
  projectSubprojectsMap = {},
  rowData,
  totalDays,
  projectWeeklyQuotas,
  projectTotals,
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

  // Check for special row types
  const isMonthRow = row.original._isMonthRow;
  const isWeekRow = row.original._isWeekRow;
  const isDayRow = row.original._isDayRow;
  const isDayOfWeekRow = row.original._isDayOfWeekRow;
  const isDailyMinRow = row.original._isDailyMinRow;
  const isDailyMaxRow = row.original._isDailyMaxRow;
  const isFilterRow = row.original._isFilterRow;
  const isInboxRow = row.original._isInboxRow;
  const isArchiveRow = row.original._isArchiveRow;
  const isProjectRow = row.original._rowType === 'projectHeader' || row.original._rowType === 'projectGeneral' || row.original._rowType === 'projectUnscheduled';

  // Delegate to ProjectRow for project/section rows
  if (isProjectRow) {
    return (
      <ProjectRow
        row={row}
        virtualRow={virtualRow}
        isRowSelected={isRowSelected}
        handleRowNumberClick={handleRowNumberClick}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        draggedRowId={draggedRowId}
        dropTargetRowId={dropTargetRowId}
        rowHeight={rowHeight}
        cellFontSize={cellFontSize}
        headerFontSize={headerFontSize}
        gripIconSize={gripIconSize}
        totalDays={totalDays}
        projectWeeklyQuotas={projectWeeklyQuotas}
        projectTotals={projectTotals}
      />
    );
  }

  // Delegate to TaskRow for regular task rows
  if (!isMonthRow && !isWeekRow && !isDayRow && !isDayOfWeekRow && !isDailyMinRow && !isDailyMaxRow && !isFilterRow && !isInboxRow && !isArchiveRow) {
    return (
      <TaskRow
        row={row}
        virtualRow={virtualRow}
        isRowSelected={isRowSelected}
        isCellSelected={isCellSelected}
        editingCell={editingCell}
        editValue={editValue}
        handleRowNumberClick={handleRowNumberClick}
        handleCellMouseDown={handleCellMouseDown}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
        draggedRowId={draggedRowId}
        dropTargetRowId={dropTargetRowId}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleDragEnd={handleDragEnd}
        rowHeight={rowHeight}
        cellFontSize={cellFontSize}
        headerFontSize={headerFontSize}
        gripIconSize={gripIconSize}
        projects={projects}
        projectSubprojectsMap={projectSubprojectsMap}
        rowData={rowData}
      />
    );
  }

  // Handle special row types below
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
      ) : isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow || isInboxRow || isArchiveRow ? (
        // Render day/day-of-week/daily-min/daily-max/inbox/archive rows with centered calendar cells
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

            // For inbox row, merge ALL cells (fixed columns AND day columns)
            if (isInboxRow && !mergedCellRendered) {
              mergedCellRendered = true;

              // Calculate total width of all columns except rowNum
              const allColumns = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'];
              const visibleFixedColumns = allColumns.filter(colId => table.getColumn(colId).getIsVisible());
              const totalFixedWidth = visibleFixedColumns.reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0);

              // Add all day columns widths
              const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
                .reduce((sum, dayColId) => sum + table.getColumn(dayColId).getSize(), 0);

              const totalWidth = totalFixedWidth + dayColumnsWidth;

              return (
                <td
                  key="merged-all-cols"
                  style={{
                    width: `${totalWidth}px`,
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
                      borderBottom: '1.5px solid black',
                      borderRight: '1.5px solid black',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: `${cellFontSize}px`,
                      paddingLeft: '8px',
                    }}
                  >
                    Inbox
                  </div>
                </td>
              );
            } else if (isInboxRow) {
              // Skip all other columns for inbox row
              return null;
            }

            // For archive row, merge ALL cells (fixed columns AND day columns)
            if (isArchiveRow && !mergedCellRendered) {
              mergedCellRendered = true;

              // Calculate total width of all columns except rowNum
              const allColumns = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'];
              const visibleFixedColumns = allColumns.filter(colId => table.getColumn(colId).getIsVisible());
              const totalFixedWidth = visibleFixedColumns.reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0);

              // Add all day columns widths
              const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
                .reduce((sum, dayColId) => sum + table.getColumn(dayColId).getSize(), 0);

              const totalWidth = totalFixedWidth + dayColumnsWidth;

              return (
                <td
                  key="merged-all-cols-archive"
                  style={{
                    width: `${totalWidth}px`,
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
                      borderBottom: '1.5px solid black',
                      borderRight: '1.5px solid black',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: `${cellFontSize}px`,
                      paddingLeft: '8px',
                    }}
                  >
                    Archive
                  </div>
                </td>
              );
            } else if (isArchiveRow) {
              // Skip all other columns for archive row
              return null;
            }

            // For fixed columns, show empty cells (or label for daily min/max)
            if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              // For day of week row (row 4), merge all fixed columns
              // For daily min/max rows, merge all fixed columns and show label
              if ((isDayOfWeekRow || isDailyMinRow || isDailyMaxRow) && !mergedCellRendered) {
                mergedCellRendered = true;

                // Determine background color and label
                let bgColor = 'black';
                let borderStyle = {
                  borderTop: '3px solid white',
                  borderBottom: '3px solid white',
                  borderRight: '1.5px solid black',
                };
                let label = '';
                let labelStyle = {};

                if (isDailyMinRow || isDailyMaxRow) {
                  // Daily min/max rows: black background for merged fixed columns
                  bgColor = 'black';
                  label = '';
                  borderStyle = {
                    borderBottom: '1px solid #d3d3d3',
                    borderRight: '1.5px solid black',
                  };
                  labelStyle = {};
                }

                return (
                  <td
                    key="merged-fixed-cols"
                    style={{
                      width: `${['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].filter(colId => table.getColumn(colId).getIsVisible()).reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)}px`,
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
                        backgroundColor: bgColor,
                        ...borderStyle,
                        ...labelStyle,
                      }}
                    >
                      {label}
                    </div>
                  </td>
                );
              } else if (isDayOfWeekRow || isDailyMinRow || isDailyMaxRow) {
                // Skip subsequent fixed columns for day of week/daily min/max rows
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
        } else if (isDailyMinRow) {
          // Daily min row: pink
          bgColor = '#ead1dc';
        } else if (isDailyMaxRow) {
          // Daily max row: light pink
          bgColor = '#f2e5eb';
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
                borderBottom: (isDayOfWeekRow || isDailyMaxRow) ? '1.5px solid black' : (isDailyMinRow ? 'none' : '1px solid #d3d3d3'),
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
                className="h-full flex items-center justify-end"
                style={{
                  minHeight: `${rowHeight}px`,
                  backgroundColor: row.index < 4 ? 'black' : '#ead1dc',
                  borderBottom: row.index < 4 ? '1px solid black' : '1px solid #d3d3d3',
                  borderLeft: (row.index < 4 && columnId === 'checkbox') ? '1px solid black' : 'none',
                  borderRight: columnId === 'timeValue' ? '1.5px solid black' : (row.index < 4 ? 'none' : '1px solid #d3d3d3'),
                  paddingRight: hasFilter ? '2px' : '0'
                }}
              >
                {hasFilter && (
                  <ListFilter size={14} className="text-gray-400" />
                )}
              </div>
            </td>
          );
        }

        // For day columns, show filter button (right-aligned) and 0.00 value (center-aligned)
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
              className="h-full flex items-center justify-center relative"
              style={{
                minHeight: `${rowHeight}px`,
                fontSize: `${cellFontSize}px`,
                backgroundColor: '#ead1dc',
                borderBottom: '1px solid #d3d3d3',
                borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3',
                position: 'relative',
                paddingRight: '14px'
              }}
            >
              <span className="text-xs">{value}</span>
              <ListFilter size={10} className="text-gray-400" style={{ position: 'absolute', right: '2px' }} />
            </div>
          </td>
        );
      })
      ) : null}
    </tr>
    </>
  );
}
