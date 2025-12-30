import { GripVertical, ListFilter, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import { MonthRow, WeekRow } from './rows';
import TaskRow from './rows/TaskRow';
import ProjectRow from './rows/ProjectRow';
import {
  ARCHIVE_ROW_STYLE,
  ARCHIVE_HEADER_STYLE,
  ARCHIVED_PROJECT_HEADER_STYLE,
  ARCHIVED_PROJECT_SUB_STYLE,
} from '../../constants/planner/rowTypes';

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
  setEditValue,
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
  dayColumnFilters,
  handleDayColumnFilterToggle,
  filters = {},
  onProjectFilterButtonClick,
  onSubprojectFilterButtonClick,
  onStatusFilterButtonClick,
  onRecurringFilterButtonClick,
  onEstimateFilterButtonClick,
  collapsedGroups = new Set(),
  toggleGroupCollapse = () => {},
  archiveTotals = {},
}) {
  // Destructure filter states to avoid accessing during render
  const {
    selectedProjectFilters = new Set(),
    selectedSubprojectFilters = new Set(),
    selectedStatusFilters = new Set(),
    selectedRecurringFilters = new Set(),
    selectedEstimateFilters = new Set(),
  } = filters;
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
  const isArchiveRow = row.original._isArchiveRow; // Legacy archive divider
  const isArchiveHeader = row.original._rowType === 'archiveHeader';
  const isArchiveWeekRow = row.original._rowType === 'archiveRow';
  const isArchivedProjectHeader = row.original._rowType === 'archivedProjectHeader';
  const isArchivedProjectGeneral = row.original._rowType === 'archivedProjectGeneral';
  const isArchivedProjectUnscheduled = row.original._rowType === 'archivedProjectUnscheduled';
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
        collapsedGroups={collapsedGroups}
        toggleGroupCollapse={toggleGroupCollapse}
        isCellSelected={isCellSelected}
        editingCell={editingCell}
        editValue={editValue}
        setEditValue={setEditValue}
        handleCellMouseDown={handleCellMouseDown}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
      />
    );
  }

  // Delegate to ProjectRow for archived project rows (they render similarly)
  if (isArchivedProjectHeader || isArchivedProjectGeneral || isArchivedProjectUnscheduled) {
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
        projectTotals={archiveTotals.projectTotals || {}}
        isArchived={true}
        collapsedGroups={collapsedGroups}
        toggleGroupCollapse={toggleGroupCollapse}
        isCellSelected={isCellSelected}
        editingCell={editingCell}
        editValue={editValue}
        setEditValue={setEditValue}
        handleCellMouseDown={handleCellMouseDown}
        handleCellMouseEnter={handleCellMouseEnter}
        handleCellDoubleClick={handleCellDoubleClick}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
      />
    );
  }

  // Delegate to TaskRow for regular task rows
  if (!isMonthRow && !isWeekRow && !isDayRow && !isDayOfWeekRow && !isDailyMinRow && !isDailyMaxRow && !isFilterRow && !isInboxRow && !isArchiveRow && !isArchiveHeader && !isArchiveWeekRow) {
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
      ) : isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow || isInboxRow || isArchiveRow || isArchiveHeader || isArchiveWeekRow ? (
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
              // Skip all other columns for legacy archive row
              return null;
            }

            // For archive header row, merge ALL cells (fixed columns AND day columns)
            if (isArchiveHeader && !mergedCellRendered) {
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
                  key="merged-all-cols-archive-header"
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
                      ...ARCHIVE_HEADER_STYLE,
                      borderBottom: '1.5px solid black',
                      borderRight: '1.5px solid black',
                      fontWeight: '600',
                      fontSize: `${cellFontSize}px`,
                      paddingLeft: '8px',
                    }}
                  >
                    Archive
                  </div>
                </td>
              );
            } else if (isArchiveHeader) {
              // Skip all other columns for archive header row
              return null;
            }

            // For archive week row, merge columns A-D (checkbox through status)
            // Similar to project section rows (General/Unscheduled)
            const archiveWeekColumnsToMerge = ['checkbox', 'project', 'subproject', 'status'];
            if (isArchiveWeekRow && archiveWeekColumnsToMerge.includes(columnId)) {
              if (!mergedCellRendered) {
                mergedCellRendered = true;

                const isCollapsed = collapsedGroups.has(row.original.groupId);
                const weekLabel = row.original.archiveWeekLabel || '';

                // Calculate total width of columns A-D
                const totalWidth = archiveWeekColumnsToMerge.reduce((sum, colId) => {
                  const column = table.getColumn(colId);
                  return sum + (column ? column.getSize() : 0);
                }, 0);

                // This merged cell is not editable, but we keep it for consistency
                return (
                  <td
                    key="merged-archive-week-a-to-d"
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
                      className="h-full flex items-center gap-2 cursor-pointer"
                      style={{
                        minHeight: `${rowHeight}px`,
                        ...ARCHIVE_ROW_STYLE,
                        borderBottom: '1px solid #d3d3d3',
                        borderRight: '1px solid #d3d3d3',
                        fontWeight: '400',
                        fontSize: `${cellFontSize}px`,
                        paddingLeft: '8px',
                      }}
                      onClick={() => toggleGroupCollapse(row.original.groupId)}
                    >
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span>{weekLabel}</span>
                    </div>
                  </td>
                );
              } else {
                // Skip merged columns
                return null;
              }
            }

            // For archive week row, render unmerged columns E, F, G, H
            if (isArchiveWeekRow && ['task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              // Column E (task) shows the date range - EDITABLE
              const dateRange = row.original.archiveLabel || '';
              // Column G (estimate) shows the weekly total hours
              const weeklyTotal = row.original.archiveTotalHours || '0.00';
              // Column H (timeValue) shows the weekly min and max
              const weeklyMin = row.original.archiveWeeklyMin || '0.00';
              const weeklyMax = row.original.archiveWeeklyMax || '0.00';

              let cellContent = '\u00A0';
              let justifyContent = 'flex-start';
              let fontStyle = 'normal';

              if (columnId === 'task') {
                cellContent = dateRange;
              } else if (columnId === 'estimate') {
                cellContent = weeklyTotal;
                justifyContent = 'flex-end';
              } else if (columnId === 'timeValue') {
                cellContent = `of ${weeklyMin} - ${weeklyMax}`;
                fontStyle = 'italic';
              }

              // Make task column (E) editable - but save to archiveLabel field
              const isTaskColumn = columnId === 'task';
              const editableColumnId = 'archiveLabel'; // Save to archiveLabel field
              const isEditing = isTaskColumn && editingCell?.rowId === rowId && editingCell?.columnId === editableColumnId;
              const isSelected = isTaskColumn && isCellSelected?.(rowId, editableColumnId);

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
                  onMouseDown={(e) => {
                    if (isTaskColumn && handleCellMouseDown) {
                      handleCellMouseDown(e, rowId, editableColumnId);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (isTaskColumn && handleCellMouseEnter) {
                      handleCellMouseEnter(e, rowId, editableColumnId);
                    }
                  }}
                  onDoubleClick={(e) => {
                    if (isTaskColumn && handleCellDoubleClick) {
                      handleCellDoubleClick(rowId, editableColumnId, dateRange);
                    }
                  }}
                >
                  <div
                    className={`h-full flex items-center ${isSelected ? 'selected-cell' : ''}`}
                    style={{
                      minHeight: `${rowHeight}px`,
                      ...ARCHIVE_ROW_STYLE,
                      borderBottom: '1px solid #d3d3d3',
                      borderRight: columnId === 'timeValue' ? '1.5px solid black' : '1px solid #d3d3d3',
                      fontSize: `${cellFontSize}px`,
                      paddingLeft: '3px',
                      paddingRight: '3px',
                      justifyContent: justifyContent,
                      fontStyle: fontStyle,
                      outline: isEditing ? '2px solid black' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => {
                          if (setEditValue) {
                            setEditValue(e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (handleEditKeyDown) {
                            handleEditKeyDown(e, rowId, editableColumnId, e.target.value);
                          }
                        }}
                        onBlur={() => {
                          if (handleEditComplete) {
                            handleEditComplete(rowId, editableColumnId, editValue);
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: `${cellFontSize}px`,
                          padding: 0,
                        }}
                      />
                    ) : (
                      cellContent
                    )}
                  </div>
                </td>
              );
            }

            // For archive week row, render day columns with transparent background
            if (isArchiveWeekRow && columnId.startsWith('day-')) {
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
                    className="h-full flex items-center"
                    style={{
                      minHeight: `${rowHeight}px`,
                      backgroundColor: 'transparent',
                      borderBottom: '1px solid #d3d3d3',
                      borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3',
                      fontSize: `${cellFontSize}px`,
                      paddingLeft: '3px',
                      paddingRight: '3px',
                    }}
                  >
                    {'\u00A0'}
                  </div>
                </td>
              );
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
          // Columns that need filter buttons: B (project), D (status), F (recurring), G (estimate)
          // Note: subproject is excluded as we don't have a filter for it yet
          const hasFilter = ['project', 'subproject', 'status', 'recurring', 'estimate'].includes(columnId);

          // Map column ID to the appropriate click handler
          const getFilterClickHandler = () => {
            if (columnId === 'project' && onProjectFilterButtonClick) return onProjectFilterButtonClick;
            if (columnId === 'subproject' && onSubprojectFilterButtonClick) return onSubprojectFilterButtonClick;
            if (columnId === 'status' && onStatusFilterButtonClick) return onStatusFilterButtonClick;
            if (columnId === 'recurring' && onRecurringFilterButtonClick) return onRecurringFilterButtonClick;
            if (columnId === 'estimate' && onEstimateFilterButtonClick) return onEstimateFilterButtonClick;
            return null;
          };

          const filterClickHandler = getFilterClickHandler();
          const isFilterActive = (
            (columnId === 'project' && selectedProjectFilters.size > 0) ||
            (columnId === 'subproject' && selectedSubprojectFilters.size > 0) ||
            (columnId === 'status' && selectedStatusFilters.size > 0) ||
            (columnId === 'recurring' && selectedRecurringFilters.size > 0) ||
            (columnId === 'estimate' && selectedEstimateFilters.size > 0)
          );

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
                {hasFilter && filterClickHandler && (
                  isFilterActive ? (
                    <Filter
                      size={14}
                      className="cursor-pointer"
                      onClick={filterClickHandler}
                      title={`Filter ${columnId}`}
                      style={{ fill: '#065f46', stroke: '#065f46' }}
                    />
                  ) : (
                    <ListFilter
                      size={14}
                      className="cursor-pointer"
                      onClick={filterClickHandler}
                      title={`Filter ${columnId}`}
                      style={{ fill: 'none', stroke: 'black' }}
                    />
                  )
                )}
              </div>
            </td>
          );
        }

        // For day columns, show filter button (right-aligned) and 0.00 value (center-aligned)
        const value = row.original[columnId] || '';
        const dayIndex = parseInt(columnId.split('-')[1]);
        const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;
        const isFilterActive = dayColumnFilters && dayColumnFilters.has(columnId);

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
              {isFilterActive ? (
                <Filter
                  size={10}
                  fill="#065f46"
                  className="cursor-pointer transition-colors"
                  style={{ position: 'absolute', right: '2px', color: '#065f46' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (handleDayColumnFilterToggle) {
                      handleDayColumnFilterToggle(columnId);
                    }
                  }}
                  title="Filter active"
                />
              ) : (
                <ListFilter
                  size={10}
                  strokeWidth={2}
                  className="cursor-pointer transition-colors text-gray-400 hover:text-gray-600"
                  style={{ position: 'absolute', right: '2px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (handleDayColumnFilterToggle) {
                      handleDayColumnFilterToggle(columnId);
                    }
                  }}
                  title="Add filter"
                />
              )}
            </div>
          </td>
        );
      })
      ) : null}
    </tr>
    </>
  );
}
