import React from 'react';
import { GripVertical, ListFilter, ChevronRight, ChevronDown } from 'lucide-react';
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
import { getSelectionEdgeClassNames } from '../../utils/planner/selectionEdgeClasses';
import { linkifyText } from '../../utils/linkify';

// Active-filter icon color. Filters keep the same icon at rest and when
// active — only the color changes (no icon swap). High-saturation blue,
// distinct from the muted --brand-deep token used elsewhere.
const FILTER_ACTIVE_COLOR = '#0066FF';

// Shared filter funnel icon for column headers + day-total cells. Same
// glyph at rest and active (color-only state change per design review).
// On hover: solid white fill behind the icon, icon turns black.
function FilterIcon({ size, active, activeColor, inactiveColor, onClick, title, className = '' }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
        margin: -2,
        borderRadius: 4,
        background: hovered ? '#ffffff' : 'transparent',
        transition: 'background 0.12s',
        lineHeight: 0,
      }}
    >
      <ListFilter
        size={size}
        strokeWidth={2}
        className={`cursor-pointer transition-colors shrink-0 ${className}`}
        onClick={onClick}
        title={title}
        style={{
          fill: 'none',
          stroke: hovered ? '#000000' : (active ? activeColor : inactiveColor),
        }}
      />
    </span>
  );
}

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
  isTopOfSelectionBlock,
  isBottomOfSelectionBlock,
  isCellSelected,
  getCellSelectionEdges,
  hasMultiCellSelection,
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
    // Inbox/Archive dividers use the design handover's dark chrome
    // (#24252B / var(--bento-dark)), same as the filter row -- not pure
    // black.
    ...(isSolidBlackRow ? { backgroundColor: '#24252B' } : {}),
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
        isTopOfSelectionBlock={isTopOfSelectionBlock}
        isBottomOfSelectionBlock={isBottomOfSelectionBlock}
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
        getCellSelectionEdges={getCellSelectionEdges}
        hasMultiCellSelection={hasMultiCellSelection}
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
        isTopOfSelectionBlock={isTopOfSelectionBlock}
        isBottomOfSelectionBlock={isBottomOfSelectionBlock}
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
        getCellSelectionEdges={getCellSelectionEdges}
        hasMultiCellSelection={hasMultiCellSelection}
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
        isTopOfSelectionBlock={isTopOfSelectionBlock}
        isBottomOfSelectionBlock={isBottomOfSelectionBlock}
        isCellSelected={isCellSelected}
        getCellSelectionEdges={getCellSelectionEdges}
        hasMultiCellSelection={hasMultiCellSelection}
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
        className={[
          isRowSelected || isDragging ? 'selected-row sys-sel-row' : '',
          isTopOfSelectionBlock ? 'sel-block-top' : '',
          isBottomOfSelectionBlock ? 'sel-block-bottom' : '',
        ].filter(Boolean).join(' ')}
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
            // Filter row's fixed columns now match the Subproject row's
            // pale-blue chrome (#DCE4F5) instead of the old dark chrome --
            // the other pinned calendar rows (Month/Week/Day/Day-of-week/
            // Daily Min/Max/Total) stay pure black per reference/SystemView.jsx.
            backgroundColor: isFilterRow ? '#DCE4F5' : 'black',
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
                    className="p-0"
                  >
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleDragStart(e, rowId);
                      }}
                      onDragEnd={handleDragEnd}
                      className={`h-full border-r border-b border-gray-300 flex items-center justify-between cursor-grab active:cursor-grabbing`}
                      // Row-number gutter is Mulish per the design handover
                      // (NUM_FONT in reference/SystemView.jsx) -- not Tailwind's
                      // generic `font-mono` stack, which was never the intended font.
                      style={{ fontFamily: "'Mulish', sans-serif", fontSize: `${headerFontSize}px`, lineHeight: 1, minHeight: `${rowHeight}px`, backgroundColor: isRowSelected ? 'var(--sel-gutter)' : '#E8ECF5', color: isRowSelected ? '#fff' : '#6A7A9E' }}
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
              // Day/Day-of-week/Daily Min/Daily Max gutters stay pure black
              // (matches the calendar-header rows). Inbox/Archive divider
              // gutters use the design handover's dark chrome (#24252B),
              // same as the rest of those rows.
              const gutterBg = isDayFamilyPinned ? 'black' : '#24252B';
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
                    backgroundColor: gutterBg,
                    zIndex: rowNumZIndex,
                  }}
                  className="p-0"
                >
                  <div
                    className="h-full flex items-center justify-between"
                    style={{
                      minHeight: `${rowHeight}px`,
                      backgroundColor: gutterBg,
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
              // Must filter to visible day columns only, same as the fixed
              // columns above -- summing every day column regardless of
              // visibility makes this merged bar wider than the table's
              // actual (visible-only) total width whenever any day columns
              // are hidden (e.g. the hide-past-weeks feature), which pushes
              // this row's content out past the real scrollable area and
              // gets clipped.
              const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
                .filter(dayColId => table.getColumn(dayColId).getIsVisible())
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
                      // Design handover (reference/SystemView.jsx SectionBar)
                      // uses var(--bento-dark) = #24252B for Inbox/Archive
                      // dividers, not pure black.
                      backgroundColor: '#24252B',
                      borderBottom: '1.5px solid black',
                      borderRight: '1.5px solid black',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: `${cellFontSize}px`,
                      // DM Sans's default line-height ('normal') is taller
                      // than this fixed-height row, so flex align-items:center
                      // centers the tall line box rather than the glyphs.
                      lineHeight: 1,
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
              // Must filter to visible day columns only, same as the fixed
              // columns above -- summing every day column regardless of
              // visibility makes this merged bar wider than the table's
              // actual (visible-only) total width whenever any day columns
              // are hidden (e.g. the hide-past-weeks feature), which pushes
              // this row's content out past the real scrollable area and
              // gets clipped.
              const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
                .filter(dayColId => table.getColumn(dayColId).getIsVisible())
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
                      // Design handover (reference/SystemView.jsx SectionBar)
                      // uses var(--bento-dark) = #24252B for Inbox/Archive
                      // dividers, not pure black.
                      backgroundColor: '#24252B',
                      borderBottom: '1.5px solid black',
                      borderRight: '1.5px solid black',
                      color: 'white',
                      fontWeight: '600',
                      fontSize: `${cellFontSize}px`,
                      lineHeight: 1,
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
              // Must filter to visible day columns only, same as the fixed
              // columns above -- summing every day column regardless of
              // visibility makes this merged bar wider than the table's
              // actual (visible-only) total width whenever any day columns
              // are hidden (e.g. the hide-past-weeks feature), which pushes
              // this row's content out past the real scrollable area and
              // gets clipped.
              const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
                .filter(dayColId => table.getColumn(dayColId).getIsVisible())
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
                          {linkifyText(weekName)}
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
              const selectionEdgeClasses = getSelectionEdgeClassNames(getCellSelectionEdges?.(rowId, editableColumnId));

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
                  className={`p-0 ${isSelected && !isEditing ? `selected-cell ${selectionEdgeClasses} ${hasMultiCellSelection ? 'sel-fill' : ''}` : ''}`}
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
                      // Date range + hour totals are ledger figures (matches
                      // NUM_FONT / Mulish in the design handover).
                      fontFamily: "'Mulish', sans-serif",
                      fontSize: `${cellFontSize}px`,
                      lineHeight: 1,
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
                          // index.css forces `input { font-family: DM Sans }`,
                          // overriding inheritance -- match the surrounding
                          // Mulish ledger figure explicitly.
                          fontFamily: "'Mulish', sans-serif",
                          lineHeight: 1,
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

            // For fixed columns, show empty cells (or label for daily min/max/total)
            if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              // Day and day-of-week rows render a single plain black bar
              // across the fixed columns -- the column labels (Project,
              // Subproject, Status, etc.) that used to be white text here
              // now live in the Filter row instead, so this bar no longer
              // needs labels or the white divider borders.
              if ((isDayRow || isDayOfWeekRow) && !mergedCellRendered) {
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
              } else if (isDayRow || isDayOfWeekRow) {
                // Skip subsequent fixed columns for day/day-of-week rows
                return null;
              }

              // Daily Min/Max rows: per the design handover (reference/
              // SystemView.jsx H5/H6), columns A-G stay a blank black bar,
              // but column H (Time Value) carries a right-aligned uppercase
              // "Daily Min"/"Daily Max" label instead of being blank.
              if ((isDailyMinRow || isDailyMaxRow) && !mergedCellRendered) {
                mergedCellRendered = true;

                const widthAG = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate']
                  .filter(colId => table.getColumn(colId).getIsVisible())
                  .reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0);
                const widthH = table.getColumn('timeValue').getIsVisible() ? table.getColumn('timeValue').getSize() : 0;

                return (
                  <React.Fragment key="merged-fixed-cols-minmax">
                    <td
                      style={{
                        width: `${widthAG}px`,
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
                          borderRight: '1px solid rgba(255,255,255,0.1)',
                        }}
                      />
                    </td>
                    <td
                      style={{
                        width: `${widthH}px`,
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
                          backgroundColor: 'black',
                          borderTop: '1px solid black',
                          borderBottom: '1px solid black',
                          borderRight: '1.5px solid black',
                          paddingRight: '8px',
                          fontFamily: "'Mulish', sans-serif",
                          fontSize: '9px',
                          lineHeight: 1,
                          color: 'rgba(255,255,255,0.55)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Daily {isDailyMinRow ? 'Min' : 'Max'}
                      </div>
                    </td>
                  </React.Fragment>
                );
              } else if (isDailyMinRow || isDailyMaxRow) {
                // Skip subsequent fixed columns for daily min/max rows
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
                // Design handover (reference/SystemView.jsx, NUM_FONT) uses
                // Mulish for every date/day-of-week/min/max figure in the
                // calendar header rows -- these are numeral/ledger content,
                // not prose, so they don't inherit the page's DM Sans.
                fontFamily: "'Mulish', sans-serif",
                // Matches reference/SystemView.jsx exactly: H3 (date) 10.5px,
                // H4 (day-of-week) 11px, H5/H6 (min/max) 11px (0.6875rem).
                // These are fixed chrome sizes, not tied to the cellFontSize/
                // headerFontSize zoom scale, same as the existing min/max
                // convention this extends.
                fontSize: (isDailyMinRow || isDailyMaxRow) ? '0.6875rem' : (isDayRow ? '10.5px' : isDayOfWeekRow ? '11px' : `${cellFontSize}px`),
                lineHeight: 1,
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
                // "#" gutter now matches the Subproject row's gutter
                // treatment (backgroundColor #E8ECF5, text #6A7A9E) instead
                // of the old dark chrome band, so it reads as one family
                // with the Subproject rows below it.
                backgroundColor: '#E8ECF5',
                zIndex: rowNumZIndex,
              }}
              className="p-0"
            >
              <div
                className="h-full flex items-center justify-center"
                style={{
                  minHeight: `${rowHeight}px`,
                  backgroundColor: '#E8ECF5',
                  // Separates this cell from the adjacent checkbox column --
                  // without it, the two same-colored cells read as one
                  // merged block since the checkbox cell has no borderLeft
                  // at this row index.
                  borderRight: '1px solid #d3d3d3',
                }}
                onClick={(e) => handleRowNumberClick(e, rowId)}
              >
                <span
                  style={{
                    fontFamily: "'Mulish', sans-serif",
                    fontSize: `${headerFontSize}px`,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: '#6A7A9E',
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
          // Estimate (G) and Time Value (H) are merged into a single "Time"
          // header cell here -- Time Value has no label/filter of its own,
          // so skip it entirely; its width gets folded into the estimate
          // cell below instead.
          if (columnId === 'timeValue') {
            return null;
          }

          const isTimeHeaderCell = columnId === 'estimate';
          const cellWidth = isTimeHeaderCell
            ? cell.column.getSize() + table.getColumn('timeValue').getSize()
            : cell.column.getSize();

          // Columns that need filter buttons: B (project), D (status), F (recurring), G (estimate/time)
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
          // The merged Time cell resizes the timeValue column, since that's
          // the column whose right edge the handle sits on.
          const column = table.getColumn(isTimeHeaderCell ? 'timeValue' : columnId);
          const canResize = column?.getCanResize?.();

          // Column labels also moved here from the removed column-letter row.
          const columnLabel = {
            project: 'Project',
            subproject: 'Subproject',
            status: 'Status',
            task: 'Task',
            recurring: 'Recurring',
            estimate: 'Time',
          }[columnId];

          return (
            <td
              key={cell.id}
              style={{
                width: `${cellWidth}px`,
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
                  // Pale-blue chrome matching the Subproject row's merged
                  // cell (#DCE4F5) -- the filter row is where column names +
                  // filter icons now live (reference/SystemView.jsx H8), and
                  // it now shares the same colour family as the Subproject
                  // rows directly below it instead of the old dark chrome.
                  backgroundColor: '#DCE4F5',
                  borderRight: isTimeHeaderCell ? '1.5px solid black' : '1px solid #d3d3d3',
                  // Design handover (reference/SystemView.jsx H8 row) uses
                  // `padding: '0 8px'` uniformly on these cells -- was 6px/2px.
                  paddingLeft: columnLabel ? '8px' : '0',
                  paddingRight: hasFilter ? '8px' : '0'
                }}
              >
                {columnLabel && (
                  <span
                    style={{
                      fontSize: `${headerFontSize}px`,
                      fontWeight: 700,
                      // Dark ink -- matches the Subproject row's default
                      // (unset/inherited black) text now that the
                      // background is pale blue rather than dark chrome.
                      color: '#1F2933',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {columnLabel}
                  </span>
                )}
                {hasFilter && filterClickHandler && (
                  <FilterIcon
                    size={14}
                    active={isFilterActive}
                    activeColor={FILTER_ACTIVE_COLOR}
                    // Inactive: same muted blue-grey used for the Subproject
                    // row's gutter text/chevron (#6A7A9E / #8090A8), so the
                    // filter icon reads correctly against the pale-blue fill.
                    inactiveColor="#6A7A9E"
                    onClick={filterClickHandler}
                    title={`Filter ${columnId}`}
                  />
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
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)'; }}
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
          // Filter to visible day columns only, same as the other merged
          // bars above -- otherwise this bar renders wider than the
          // table's actual visible width whenever day columns are hidden
          // (e.g. hide-past-weeks), overflowing/clipping the row.
          const dayColumnsWidth = Array.from({ length: totalDays }, (_, i) => `day-${i}`)
            .filter(dayColId => table.getColumn(dayColId).getIsVisible())
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
                  // Keep this consistent with the rest of the filter row's
                  // #DCE4F5 pale-blue chrome instead of switching to pure
                  // black once it reaches the day columns.
                  backgroundColor: '#DCE4F5',
                  borderBottom: '1px solid #d3d3d3',
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

            // Fixed columns (A-H): columns A-G stay a blank black bar, but
            // column H (Time Value) carries a right-aligned uppercase
            // "Daily Total" label -- per the design handover (reference/
            // SystemView.jsx H7), same treatment as Daily Min/Daily Max.
            if (['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate', 'timeValue'].includes(columnId)) {
              if (!mergedFixedCellRendered) {
                mergedFixedCellRendered = true;

                const widthAG = ['checkbox', 'project', 'subproject', 'status', 'task', 'recurring', 'estimate']
                  .filter(colId => table.getColumn(colId).getIsVisible())
                  .reduce((sum, colId) => sum + table.getColumn(colId).getSize(), 0);
                const widthH = table.getColumn('timeValue').getIsVisible() ? table.getColumn('timeValue').getSize() : 0;

                return (
                  <React.Fragment key="merged-fixed-cols">
                    <td
                      style={{
                        width: `${widthAG}px`,
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
                          borderRight: '1px solid rgba(255,255,255,0.1)',
                        }}
                      />
                    </td>
                    <td
                      style={{
                        width: `${widthH}px`,
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
                          backgroundColor: 'black',
                          borderTop: '1px solid black',
                          borderBottom: '1px solid black',
                          borderRight: '1.5px solid black',
                          paddingRight: '8px',
                          fontFamily: "'Mulish', sans-serif",
                          fontSize: '9px',
                          lineHeight: 1,
                          color: 'rgba(255,255,255,0.55)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Daily Total
                      </div>
                    </td>
                  </React.Fragment>
                );
              }
              return null;
            }

            // Day columns: total value + filter button (right-aligned) —
            // moved here from the old Filter row. Day columns are not
            // individually resizable (there are 84 of them; not a useful
            // affordance), so no resize handle here.
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
                  className="h-full flex items-center justify-between"
                  style={{
                    position: 'relative',
                    minHeight: `${rowHeight}px`,
                    fontSize: `${cellFontSize}px`,
                    // Design handover (reference/SystemView.jsx H7 "Daily
                    // Total" row) fills the day columns with the project
                    // header color (P.headerSet[0]) -- same #8BA8D8 band
                    // used for project header rows elsewhere in this table
                    // -- not the whisper-blue wash that was here before.
                    backgroundColor: '#8BA8D8',
                    borderBottom: '1px solid #d3d3d3',
                    borderRight: isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3',
                    paddingLeft: '2px',
                    // Was 2px -- left the filter icon sitting almost flush
                    // against the cell's right border.
                    paddingRight: '6px',
                  }}
                >
                  {/* Matches reference/SystemView.jsx H7 dayTotals span (fontSize: 11) -- fixed chrome size, not the cellFontSize zoom scale. */}
                  <span className="text-right flex-1 pr-2" style={{ fontFamily: "'Mulish', sans-serif", fontSize: '11px', fontWeight: 'bold', lineHeight: 1 }}>{value}</span>
                  <FilterIcon
                    size={10}
                    active={isFilterActive}
                    activeColor={FILTER_ACTIVE_COLOR}
                    inactiveColor="#000000"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (handleDayColumnFilterToggle) {
                        handleDayColumnFilterToggle(columnId);
                      }
                    }}
                    title={isFilterActive ? 'Filter active' : 'Add filter'}
                  />
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
