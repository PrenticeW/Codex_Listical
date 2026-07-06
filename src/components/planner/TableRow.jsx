import React from 'react';
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
import { TASK_ROW_DETAIL_EVENT } from '../../contexts/TaskRowPanelContext';

/**
 * TableRow Component
 * Routes row rendering to the appropriate specialized component based on row type
 * Handles special row types (month, week, day, filter, daily min/max) and delegates
 * regular task rows to the TaskRow component
 *
 * Memoized to prevent unnecessary re-renders when parent updates
 */
const TableRow = React.memo(function TableRow({
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
  handleCellContextMenu,
  handleEditComplete,
  handleEditCancel,
  handleEditKeyDown,
  draggedRowId,
  dropTargetRowId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
  handleCellDragStart,
  handleCellDragOver,
  handleCellDragLeave,
  handleCellDrop,
  handleCellDragEnd,
  isCellBeingDragged,
  isCellDropTarget,
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
  projectIdByNickname,
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
  weekNames = {},
  onWeekNameChange,
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

  // Check if this is a pinned row (first 8 rows)
  const isPinnedRow = row.index < 8;
  // Higher z-index for pinned row number cells
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  // Inbox/Archive divider rows are solid black across their FULL width, so
  // painting the <tr> itself black is safe there — it backstops any
  // sub-device-pixel gap between adjacent flex cells (from fractional
  // column-resize widths) that would otherwise show the page background
  // through as a thin white/grid line.
  //
  // Month/Week/Day/Day-of-week/Daily Min/Max/Total rows are NOT safe for
  // this treatment: only their gutter + fixed-columns (A-H) region is
  // black — their day-columns region has legitimate light/transparent
  // content (month labels, dates, S/M/T letters, min/max/total values).
  // Painting the whole row black would bleed black through any gap in
  // that light content instead of the harmless grid background. For
  // those rows, a separate backdrop behind just the gutter+fixed-columns
  // region below (see fixedRegionBackdropWidth) provides the same
  // gap-proofing without touching the day-columns area.
  const isSolidBlackRow = Boolean(
    row.original._isInboxRow ||
    row.original._isArchiveRow ||
    row.original._rowType === 'archiveHeader'
  );

  const isFixedRegionBlackRow = Boolean(
    row.original._isMonthRow ||
    row.original._isWeekRow ||
    row.original._isDayRow ||
    row.original._isDayOfWeekRow ||
    row.original._isDailyMinRow ||
    row.original._isDailyMaxRow ||
    row.original._isDailyTotalRow ||
    row.original._isFilterRow
  );

  const fixedRegionBackdropWidth = isFixedRegionBlackRow
    ? table.getColumn('rowNum').getSize() +
      ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue']
        .filter(colId => table.getColumn(colId).getIsVisible())
        .reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0)
    : 0;

  const style = {
    display: 'flex',
    position: 'absolute',
    // Positioned with `top` rather than `transform: translateY(...)` --
    // a `transform` on this row would establish a new containing block,
    // which breaks `position: sticky` on the row-number gutter cell
    // further down (sticky descendants stop tracking the scroll
    // container once any ancestor has a transform, which is why the
    // gutter used to disappear once you scrolled far enough right).
    top: `${virtualRow.start}px`,
    left: 0,
    width: '100%',
    opacity: isDragging ? 0.5 : 1,
    gap: 0,
    ...(isSolidBlackRow ? { backgroundColor: 'black' } : {}),
  };

  // Check for special row types
  const isMonthRow = row.original._isMonthRow;
  const isWeekRow = row.original._isWeekRow;
  const isDayRow = row.original._isDayRow;
  const isDayOfWeekRow = row.original._isDayOfWeekRow;
  const isDailyMinRow = row.original._isDailyMinRow;
  const isDailyMaxRow = row.original._isDailyMaxRow;
  const isDailyTotalRow = row.original._isDailyTotalRow;
  const isFilterRow = row.original._isFilterRow;
  const isInboxRow = row.original._isInboxRow;
  const isArchiveRow = row.original._isArchiveRow; // Legacy archive divider
  const isArchiveHeader = row.original._rowType === 'archiveHeader';
  const isArchiveWeekRow = row.original._rowType === 'archiveRow';
  const isArchivedProjectHeader = row.original._rowType === 'archivedProjectHeader';
  const isArchivedProjectGeneral = row.original._rowType === 'archivedProjectGeneral';
  const isArchivedProjectUnscheduled = row.original._rowType === 'archivedProjectUnscheduled';
  const isProjectRow = row.original._rowType === 'projectHeader' || row.original._rowType === 'projectGeneral' || row.original._rowType === 'projectUnscheduled' || row.original._rowType === 'subprojectHeader' || row.original._rowType === 'subprojectGeneral' || row.original._rowType === 'subprojectUnscheduled';

  // Delegate to ProjectRow for project/section/subproject rows
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
        projectIdByNickname={projectIdByNickname}
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
        handleCellContextMenu={handleCellContextMenu}
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
        projectIdByNickname={projectIdByNickname}
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
        handleCellContextMenu={handleCellContextMenu}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
      />
    );
  }

  // Delegate to TaskRow for regular task rows
  if (!isMonthRow && !isWeekRow && !isDayRow && !isDayOfWeekRow && !isDailyMinRow && !isDailyMaxRow && !isDailyTotalRow && !isFilterRow && !isInboxRow && !isArchiveRow && !isArchiveHeader && !isArchiveWeekRow) {
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
        handleCellContextMenu={handleCellContextMenu}
        handleEditComplete={handleEditComplete}
        handleEditCancel={handleEditCancel}
        handleEditKeyDown={handleEditKeyDown}
        draggedRowId={draggedRowId}
        dropTargetRowId={dropTargetRowId}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleDragEnd={handleDragEnd}
        handleCellDragStart={handleCellDragStart}
        handleCellDragOver={handleCellDragOver}
        handleCellDragLeave={handleCellDragLeave}
        handleCellDrop={handleCellDrop}
        handleCellDragEnd={handleCellDragEnd}
        isCellBeingDragged={isCellBeingDragged}
        isCellDropTarget={isCellDropTarget}
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
            backgroundColor: '#000000',
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
      {isFixedRegionBlackRow && (
        // Backstop behind just the gutter + fixed-columns (A-H) region —
        // see fixedRegionBackdropWidth comment above. Sits behind the real
        // cells (zIndex 0) so it's invisible except through any
        // sub-pixel gap between them.
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${fixedRegionBackdropWidth}px`,
            height: `${rowHeight}px`,
            backgroundColor: 'black',
            // Negative z-index so it paints behind the row's normal-flow
            // (non-positioned) <td> cells, and behind the sticky gutter
            // cell too — it's purely a gap backstop, never meant to be on
            // top of real content.
            zIndex: -1,
            pointerEvents: 'none',
          }}
        />
      )}
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
          weekNames={weekNames}
          onWeekNameChange={onWeekNameChange}
        />
      ) : isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow || isInboxRow || isArchiveRow || isArchiveHeader || isArchiveWeekRow ? (
        // Render day/day-of-week/daily-min/daily-max/inbox/archive rows with centered calendar cells
        (() => {
          let mergedCellRendered = false;
          return row.getVisibleCells().map(cell => {
            const columnId = cell.column.id;
            const value = row.original[columnId] || '';

            // Special handling for row number column. Day/Day-of-week/Daily
            // Min/Daily Max (always pinned) and the Inbox/Archive-section
            // divider rows are structural, not real task data, so their
            // gutter cell is blank/flush. The Archive section's per-week
            // divider row (isArchiveWeekRow — editable week label + weekly
            // total) is numbered like a task row via the precomputed
            // `_gutterNumber` (see ProjectTimePlannerV2.jsx). Archived
            // project rows are routed to ProjectRow instead.
            if (columnId === 'rowNum') {
              if (isArchiveWeekRow) {
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
                      backgroundColor: '#E8ECF5',
                      zIndex: rowNumZIndex,
                    }}
                    className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
                  >
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, rowId);
                      }}
                      onDragEnd={handleDragEnd}
                      className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-grab active:cursor-grabbing`}
                      style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: isRowSelected ? 'var(--sel-gutter)' : '#E8ECF5', color: isRowSelected ? '#fff' : '#6A7A9E' }}
                      onClick={(e) => handleRowNumberClick(e, rowId)}
                      onContextMenu={(e) => handleCellContextMenu?.(e, rowId, 'rowNum')}
                      title="Drag to reorder"
                    >
                      <div className="flex items-center">
                        <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                      </div>
                      <span>{row.original._gutterNumber}</span>
                      <div style={{ width: `${gripIconSize}px` }} />
                    </div>
                  </td>
                );
              }
              // Day/Day-of-week/Daily Min/Daily Max/Inbox/Archive divider
              // rows all fill the gutter black to match the black bar the
              // rest of these rows use — no number shown. Borders must
              // match that same black bar's borders exactly (see the
              // merged-fixed-cols / merged-all-cols cells below), otherwise
              // the bordered cell renders taller than the borderless gutter
              // and the two visibly overhang one another top and bottom.
              const isDayFamilyPinned = isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow;
              const gutterBorderTop = isDayFamilyPinned ? '1px solid black' : 'none';
              const gutterBorderBottom = isDayFamilyPinned
                ? '1px solid black'
                : '1.5px solid black';
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
                    backgroundColor: 'black',
                    zIndex: rowNumZIndex,
                  }}
                  className="p-0"
                >
                  <div
                    className="h-full flex items-center justify-between"
                    style={{
                      minHeight: `${rowHeight}px`,
                      backgroundColor: 'black',
                      borderTop: gutterBorderTop,
                      borderBottom: gutterBorderBottom,
                    }}
                    onClick={(e) => handleRowNumberClick(e, rowId)}
                  />
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
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                        detail: { task: row.original },
                      }));
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

                // Split "Year X, Week Y" → yearPrefix="Year X, " weekName="Week Y"
                // so only the week name part is user-editable.
                const commaIdx = weekLabel.indexOf(', ');
                const yearPrefix = commaIdx !== -1 ? weekLabel.slice(0, commaIdx + 2) : '';
                const weekName   = commaIdx !== -1 ? weekLabel.slice(commaIdx + 2) : weekLabel;

                // Calculate total width of columns A-D
                const totalWidth = archiveWeekColumnsToMerge.reduce((sum, colId) => {
                  const column = table.getColumn(colId);
                  return sum + (column ? column.getSize() : 0);
                }, 0);

                const isEditingWeekLabel = editingCell?.rowId === rowId && editingCell?.columnId === 'archiveWeekLabel';

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
                    onMouseDown={(e) => {
                      if (e.button !== 0 || isEditingWeekLabel) return;
                      window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                        detail: { task: row.original },
                      }));
                    }}
                  >
                    <div
                      className="h-full flex items-center gap-2"
                      style={{
                        minHeight: `${rowHeight}px`,
                        ...ARCHIVE_ROW_STYLE,
                        borderBottom: '1px solid #d3d3d3',
                        borderRight: '1px solid #d3d3d3',
                        fontWeight: '400',
                        fontSize: `${cellFontSize}px`,
                        paddingLeft: '8px',
                        outline: isEditingWeekLabel ? '2px solid black' : 'none',
                        outlineOffset: '-2px',
                      }}
                    >
                      <span
                        className="cursor-pointer"
                        onClick={() => toggleGroupCollapse(row.original.groupId)}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </span>
                      <span>{yearPrefix}</span>
                      {isEditingWeekLabel ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue && setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (handleEditKeyDown) {
                              handleEditKeyDown(e, rowId, 'archiveWeekLabel', yearPrefix + e.target.value);
                            }
                          }}
                          onBlur={() => {
                            if (handleEditComplete) {
                              handleEditComplete(rowId, 'archiveWeekLabel', yearPrefix + editValue);
                            }
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            height: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontSize: `${cellFontSize}px`,
                            padding: 0,
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-text"
                          title="Click to rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (handleCellDoubleClick) {
                              handleCellDoubleClick(rowId, 'archiveWeekLabel', weekName);
                            }
                          }}
                        >
                          {weekName}
                        </span>
                      )}
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
                  className={`p-0 ${isSelected && !isEditing ? 'selected-cell' : ''}`}
                  onMouseDown={(e) => {
                    if (isTaskColumn && handleCellMouseDown) {
                      handleCellMouseDown(e, rowId, editableColumnId);
                    }
                    if (e.button === 0 && !isEditing) {
                      window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                        detail: { task: row.original },
                      }));
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
                    className="h-full flex items-center"
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
              // Day, day-of-week, and daily min/max rows all render a single
              // plain black bar across the fixed columns -- the column
              // labels (Project, Subproject, Status, etc.) that used to be
              // white text here now live in the Filter row instead, so this
              // bar no longer needs labels or the white divider borders.
              if ((isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow) && !mergedCellRendered) {
                mergedCellRendered = true;

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
                        backgroundColor: 'black',
                        borderTop: '1px solid black',
                        borderBottom: '1px solid black',
                        borderRight: '1.5px solid black',
                      }}
                    >
                    </div>
                  </td>
                );
              } else if (isDayRow || isDayOfWeekRow || isDailyMinRow || isDailyMaxRow) {
                // Skip subsequent fixed columns for day/day-of-week/daily min/max rows
                return null;
              }

              // This code should not be reached for special rows
              return null;
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
          // Daily min row: light blue
          bgColor = '#C8D8F0';
        } else if (isDailyMaxRow) {
          // Daily max row: pale blue
          bgColor = '#DCE8F8';
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
                fontSize: (isDailyMinRow || isDailyMaxRow) ? '0.6875rem' : `${cellFontSize}px`,
                fontStyle: (isDailyMinRow || isDailyMaxRow) ? 'italic' : undefined,
                backgroundColor: bgColor,
                borderTop: isDayRow ? '1.5px solid black' : (isDayOfWeekRow ? '1.5px solid black' : undefined),
                borderBottom: (isDayOfWeekRow || isDailyMaxRow) ? '1.5px solid black' : (isDailyMinRow ? 'none' : (isDayRow ? '1px solid black' : '1px solid #d3d3d3')),
                borderRight: isLastDayOfWeek ? '1.5px solid black' : (isDayRow ? '1px solid black' : '1px solid #d3d3d3'),
                // Align text right-edge with filter row: button(10px) + gap(8px) + right-pad(2px) = 20px
                paddingRight: (isDailyMinRow || isDailyMaxRow) ? '20px' : undefined,
                paddingLeft: (isDailyMinRow || isDailyMaxRow) ? '2px' : undefined,
                justifyContent: (isDailyMinRow || isDailyMaxRow) ? 'flex-end' : 'center',
              }}
            >
              {value || '\u00A0'}
            </div>
          </td>
        );
      });
    })()
      ) : isFilterRow ? (
        // Render filter row: fixed-column (A-H) labels/filters/resize only
        // now — day-column totals/filters/resize moved to the Daily Total
        // row above (see isDailyTotalRow branch below).
        (() => {
        let mergedDayCellRendered = false;
        return row.getVisibleCells().map(cell => {
        const columnId = cell.column.id;

        // Special handling for row number column. The Filter row is where
        // all the column labels live now (Project, Subproject, etc.), so
        // its gutter cell gets the "#" label to match — the column header
        // for the row-number gutter below.
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
                backgroundColor: '#F0F4FC',
                zIndex: rowNumZIndex,
              }}
              className="p-0"
            >
              <div
                className="h-full flex items-center"
                style={{
                  minHeight: `${rowHeight}px`,
                  backgroundColor: '#F0F4FC',
                  borderBottom: '1px solid #d3d3d3',
                  paddingLeft: '6px',
                }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <span
                  style={{
                    fontSize: `${headerFontSize}px`,
                    fontWeight: 600,
                    color: '#334155',
                  }}
                >
                  #
                </span>
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

          // Column resizing now lives here on the Filter row (the
          // column-letter header row that used to hold this was removed).
          const column = table.getColumn(columnId);
          const canResize = column?.getCanResize?.();

          // Column labels also moved here from the removed column-letter row.
          const columnLabel = {
            project: 'Project',
            subproject: 'Subproject',
            status: 'Status',
            task: 'Task',
            recurring: 'Recurring',
            estimate: 'Estimate',
            timeValue: 'Time Value',
          }[columnId];

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
                className="h-full flex items-center justify-between"
                style={{
                  position: 'relative',
                  minHeight: `${rowHeight}px`,
                  backgroundColor: row.index < 4 ? 'black' : '#F0F4FC',
                  borderBottom: row.index < 4 ? '1px solid black' : '1px solid #d3d3d3',
                  borderLeft: (row.index < 4 && columnId === 'checkbox') ? '1px solid black' : 'none',
                  borderRight: columnId === 'timeValue' ? '1.5px solid black' : (row.index < 4 ? 'none' : '1px solid #d3d3d3'),
                  paddingLeft: columnLabel ? '6px' : '0',
                  paddingRight: hasFilter ? '2px' : '0'
                }}
              >
                {columnLabel && (
                  <span
                    style={{
                      fontSize: `${headerFontSize}px`,
                      fontWeight: 600,
                      color: '#334155',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {columnLabel}
                  </span>
                )}
                {hasFilter && filterClickHandler && (
                  isFilterActive ? (
                    <Filter
                      size={14}
                      className="cursor-pointer"
                      onClick={filterClickHandler}
                      title={`Filter ${columnId}`}
                      style={{ fill: 'var(--brand-deep)', stroke: 'var(--brand-deep)' }}
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
                {canResize && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startWidth = column.getSize();
                      const handleMouseMove = (moveEvent) => {
                        moveEvent.preventDefault();
                        const diff = moveEvent.clientX - startX;
                        const minSize = column.columnDef.minSize || 30;
                        const newWidth = Math.max(minSize, startWidth + diff);
                        table.setColumnSizing(prev => ({ ...prev, [column.id]: newWidth }));
                      };
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                      document.body.style.cursor = 'col-resize';
                      document.body.style.userSelect = 'none';
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#000000'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    className="column-resizer"
                    style={{
                      position: 'absolute',
                      right: '-2px',
                      top: 0,
                      bottom: 0,
                      width: '10px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      touchAction: 'none',
                      backgroundColor: 'transparent',
                      zIndex: 10000,
                      pointerEvents: 'all',
                    }}
                    title="Drag to resize column"
                  />
                )}
              </div>
            </td>
          );
        }

        // Day columns: single merged plain black bar — totals/filters/
        // resize for day columns now live on the Daily Total row above.
        if (!mergedDayCellRendered) {
          mergedDayCellRendered = true;
          const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
            .reduce((sum, dayColId) => sum + table.getColumn(dayColId).getSize(), 0);
          return (
            <td
              key="merged-day-cols"
              style={{
                width: `${dayColumnsWidth}px`,
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
                  borderBottom: '1.5px solid black',
                }}
              />
            </td>
          );
        }
        return null;
        });
        })()
      ) : isDailyTotalRow ? (
        // Render Daily Total row: day columns show total values + filter
        // icons + resize handles (moved here from the removed column-letter
        // header row); fixed columns (A-H) render a single merged plain
        // black bar, same treatment as Daily Min/Daily Max's fixed columns.
        (() => {
          let mergedFixedCellRendered = false;
          return row.getVisibleCells().map(cell => {
            const columnId = cell.column.id;

            // Row-number gutter: black fill, no number — matches the other
            // pinned header rows.
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
                    backgroundColor: 'black',
                    zIndex: rowNumZIndex,
                  }}
                  className="p-0"
                >
                  <div
                    className="h-full flex items-center justify-between"
                    style={{
                      minHeight: `${rowHeight}px`,
                      backgroundColor: 'black',
                      borderTop: '1px solid black',
                      borderBottom: '1px solid black',
                    }}
                    onClick={(e) => handleRowNumberClick(e, rowId)}
                  />
                </td>
              );
            }

            // Fixed columns (A-H): single merged plain black bar.
            if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              if (!mergedFixedCellRendered) {
                mergedFixedCellRendered = true;
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
                        backgroundColor: 'black',
                        borderTop: '1px solid black',
                        borderBottom: '1px solid black',
                        borderRight: '1.5px solid black',
                      }}
                    />
                  </td>
                );
              }
              return null;
            }

            // Day columns: total value + filter button (right-aligned) and
            // resize handle — moved here from the old Filter row.
            const value = row.original[columnId] || '';
            const dayIndex = parseInt(columnId.split('-')[1]);
            const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;
            const isFilterActive = dayColumnFilters && dayColumnFilters.has(columnId);

            const dayColumn = table.getColumn(columnId);
            const dayColumnCanResize = dayColumn?.getCanResize?.();

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
                  className="h-full flex items-center justify-between"
                  style={{
                    position: 'relative',
                    minHeight: `${rowHeight}px`,
                    fontSize: `${cellFontSize}px`,
                    backgroundColor: '#F0F4FC',
                    borderBottom: '1px solid #D0D8E8',
                    borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #D0D8E8',
                    paddingLeft: '2px',
                    paddingRight: '2px',
                  }}
                >
                  <span className="text-right flex-1 pr-2" style={{ fontSize: `${cellFontSize}px`, fontWeight: 'bold' }}>{value}</span>
                  {isFilterActive ? (
                    <Filter
                      size={10}
                      fill="var(--brand-deep)"
                      className="cursor-pointer transition-colors shrink-0"
                      style={{ color: 'var(--brand-deep)' }}
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
                      className="cursor-pointer transition-colors text-gray-400 hover:text-gray-600 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (handleDayColumnFilterToggle) {
                          handleDayColumnFilterToggle(columnId);
                        }
                      }}
                      title="Add filter"
                    />
                  )}
                  {dayColumnCanResize && (
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startWidth = dayColumn.getSize();
                        const handleMouseMove = (moveEvent) => {
                          moveEvent.preventDefault();
                          const diff = moveEvent.clientX - startX;
                          const minSize = dayColumn.columnDef.minSize || 30;
                          const newWidth = Math.max(minSize, startWidth + diff);
                          table.setColumnSizing(prev => ({ ...prev, [dayColumn.id]: newWidth }));
                        };
                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                          document.body.style.cursor = '';
                          document.body.style.userSelect = '';
                        };
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#000000'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      className="column-resizer"
                      style={{
                        position: 'absolute',
                        right: '-2px',
                        top: 0,
                        bottom: 0,
                        width: '10px',
                        cursor: 'col-resize',
                        userSelect: 'none',
                        touchAction: 'none',
                        backgroundColor: 'transparent',
                        zIndex: 10000,
                        pointerEvents: 'all',
                      }}
                      title="Drag to resize column"
                    />
                  )}
                </div>
              </td>
            );
          });
        })()
      ) : null}
    </tr>
    </>
  );
});

export default TableRow;
