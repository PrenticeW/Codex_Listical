import React from 'react';
import TableRow from './TableRow';

/**
 * PlannerTable Component
 * Renders the table with header, pinned rows, and virtualized rows
 */
function PlannerTable({
  tableBodyRef,
  table,
  rowHeight,
  headerFontSize,
  selectedRows,
  rowVirtualizer,
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
  contextMenuTargetRowId,
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
  cellFontSize,
  gripIconSize,
  dates,
  selectCell,
  data,
  selectedCells,
  undoStack,
  redoStack,
  projects,
  subprojects,
  projectSubprojectsMap,
  totalDays,
  projectWeeklyQuotas,
  projectIdByNickname,
  projectTotals,
  dayColumnFilters,
  handleDayColumnFilterToggle,
  filters,
  onProjectFilterButtonClick,
  onSubprojectFilterButtonClick,
  onStatusFilterButtonClick,
  onRecurringFilterButtonClick,
  onEstimateFilterButtonClick,
  collapsedGroups,
  toggleGroupCollapse,
  archiveTotals,
  weekNames,
  onWeekNameChange,
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden">
      <div
        ref={tableBodyRef}
        className="overflow-auto no-scrollbar border border-slate-200/60 bg-white rounded-lg shadow-sm"
        // Was `flex-1`, which always stretches to fill the remaining column
        // height regardless of content -- with few rows that left a tall
        // empty white box below the last row. `maxHeight: 100%` instead caps
        // it at the available space (still scrolls when content is taller)
        // but lets it shrink to the actual content height otherwise.
        style={{ position: 'relative', maxHeight: '100%' }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          // Edge auto-scroll while dragging (rows from the inbox into a
          // project, cells, etc.). The browser's native drag auto-scroll
          // doesn't kick in for this container, so the drop target stayed
          // offscreen. dragover keeps firing (~every 50ms) while the pointer
          // is held still, so scrolling here is enough to keep it moving.
          const el = e.currentTarget;
          const rect = el.getBoundingClientRect();
          const EDGE = 60; // px from the edge where scrolling starts
          const MAX_STEP = 24; // px per dragover event at the very edge
          const ramp = (dist) => Math.ceil(((EDGE - dist) / EDGE) * MAX_STEP);
          // The month / week / date / daily / filter rows are a sticky tbody
          // pinned to the top of the container, so the usable top edge is
          // just below them — scrolling should start as soon as the drag
          // indicator reaches the first data row, not the top of the page.
          const stickyTop = [...el.querySelectorAll(':scope > table > tbody')]
            .filter((tb) => getComputedStyle(tb).position === 'sticky')
            .reduce((h, tb) => h + tb.getBoundingClientRect().height, 0);
          const top = rect.top + stickyTop;
          if (e.clientY < top + EDGE) el.scrollTop -= ramp(Math.max(0, e.clientY - top));
          else if (e.clientY > rect.bottom - EDGE) el.scrollTop += ramp(Math.max(0, rect.bottom - e.clientY));
          if (e.clientX < rect.left + EDGE) el.scrollLeft -= ramp(Math.max(0, e.clientX - rect.left));
          else if (e.clientX > rect.right - EDGE) el.scrollLeft += ramp(Math.max(0, rect.right - e.clientX));
        }}
      >
        <table
          className="border-collapse"
          style={{
            display: 'grid',
            borderSpacing: 0,
            // Explicit width matching the sum of every column's size. Rows
            // are rendered as position: absolute <tr>s (for virtualization),
            // which take them out of normal flow, so nothing forces this
            // table (or its <tbody>s) to size themselves to the true content
            // width otherwise -- they'd default to the width of the
            // scrolling container instead. That undersized containing block
            // is what let sticky cells like the row-number gutter detach
            // and fly off-screen once you scrolled past that (too narrow)
            // width, since position: sticky can't stick beyond the bounds
            // of its own containing block.
            width: `${table.getTotalSize()}px`,
          }}
        >
          {/* No column-letter <thead> — removed per redesign; that row
              wasn't needed. Column resizing now lives on the Filter row
              (TableRow.jsx) instead. The pinned tbody below is now the
              very top of the table, so it sticks to top: 0. */}
          {/* Pinned tbody for first 8 rows */}
          <tbody
            style={{
              display: 'grid',
              position: 'sticky',
              top: 0,
              // Must beat the scrolling body's row-number gutter cells
              // (rowNumZIndex, up to 10 in TableRow.jsx) -- those sticky
              // <td>s live in an unpositioned tbody/tr, so they compare
              // directly against this tbody's z-index in the same
              // stacking context. If this value is lower, the numbered
              // gutter scrolls in front of the pinned black header block
              // instead of disappearing behind it.
              zIndex: 20,
              backgroundColor: 'white',
              height: `${8 * rowHeight}px`,
              width: `${table.getTotalSize()}px`,
              // Matches the parent panel's rounded-lg (8px) so this pinned,
              // square-cornered block doesn't visually square off the
              // panel's top corners once it's stuck flush against them.
              // overflow: hidden clips its own row backgrounds to that
              // curve too -- same pattern used for the sticky header on
              // the Plan page (TacticsPage.jsx).
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              overflow: 'hidden',
            }}
          >
            {table.getRowModel().rows.slice(0, 8).map((row, index) => {
              const rowId = row.original.id;
              const isRowSelected = selectedRows.has(rowId);

              // Only the outer edges of a contiguous selected-row block get a
              // border (see index.css .sys-sel-row) — check the neighbours in
              // full row order, not just this pinned slice.
              const allRows = table.getRowModel().rows;
              const prevRowId = allRows[index - 1]?.original.id;
              const nextRowId = allRows[index + 1]?.original.id;
              const isTopOfSelectionBlock = isRowSelected && !(prevRowId && selectedRows.has(prevRowId));
              const isBottomOfSelectionBlock = isRowSelected && !(nextRowId && selectedRows.has(nextRowId));

              // Create a virtual row object for proper positioning
              const virtualRow = {
                index,
                start: index * rowHeight, // Position each row at its proper offset
                size: rowHeight,
              };

              return (
                <TableRow
                  key={rowId}
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
                  setEditValue={setEditValue}
                  handleRowNumberClick={handleRowNumberClick}
                  handleCellMouseDown={handleCellMouseDown}
                  handleCellMouseEnter={handleCellMouseEnter}
                  handleCellDoubleClick={handleCellDoubleClick}
                  handleCellContextMenu={handleCellContextMenu}
                  isContextMenuTarget={rowId === contextMenuTargetRowId}
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
                  table={table}
                  dates={dates}
                  selectCell={selectCell}
                  projects={projects}
                  subprojects={subprojects}
                  projectSubprojectsMap={projectSubprojectsMap}
                  rowData={row.original}
                  totalDays={totalDays}
                  projectWeeklyQuotas={projectWeeklyQuotas}
                  projectIdByNickname={projectIdByNickname}
                  projectTotals={projectTotals}
                  dayColumnFilters={dayColumnFilters}
                  handleDayColumnFilterToggle={handleDayColumnFilterToggle}
                  filters={filters}
                  onProjectFilterButtonClick={onProjectFilterButtonClick}
                  onSubprojectFilterButtonClick={onSubprojectFilterButtonClick}
                  onStatusFilterButtonClick={onStatusFilterButtonClick}
                  onRecurringFilterButtonClick={onRecurringFilterButtonClick}
                  onEstimateFilterButtonClick={onEstimateFilterButtonClick}
                  collapsedGroups={collapsedGroups}
                  toggleGroupCollapse={toggleGroupCollapse}
                  archiveTotals={archiveTotals}
                  weekNames={weekNames}
                  onWeekNameChange={onWeekNameChange}
                />
              );
            })}
          </tbody>
          {/* Main virtualized tbody for rows 8+ */}
          <tbody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize() - (8 * rowHeight)}px`,
              position: 'relative',
              width: `${table.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              // Skip first 8 rows as they're in the pinned tbody
              if (virtualRow.index < 8) return null;

              const row = table.getRowModel().rows[virtualRow.index];
              const rowId = row.original.id;
              const isRowSelected = selectedRows.has(rowId);

              // Only the outer edges of a contiguous selected-row block get a
              // border (see index.css .sys-sel-row) — check the neighbours in
              // full row order.
              const allRows = table.getRowModel().rows;
              const prevRowId = allRows[virtualRow.index - 1]?.original.id;
              const nextRowId = allRows[virtualRow.index + 1]?.original.id;
              const isTopOfSelectionBlock = isRowSelected && !(prevRowId && selectedRows.has(prevRowId));
              const isBottomOfSelectionBlock = isRowSelected && !(nextRowId && selectedRows.has(nextRowId));

              // Adjust virtualRow start to account for the 8 pinned rows
              const adjustedVirtualRow = {
                ...virtualRow,
                start: virtualRow.start - (8 * rowHeight),
              };

              return (
                <TableRow
                  key={rowId}
                  row={row}
                  virtualRow={adjustedVirtualRow}
                  isRowSelected={isRowSelected}
                  isTopOfSelectionBlock={isTopOfSelectionBlock}
                  isBottomOfSelectionBlock={isBottomOfSelectionBlock}
                  isCellSelected={isCellSelected}
                  getCellSelectionEdges={getCellSelectionEdges}
                  hasMultiCellSelection={hasMultiCellSelection}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  handleRowNumberClick={handleRowNumberClick}
                  handleCellMouseDown={handleCellMouseDown}
                  handleCellMouseEnter={handleCellMouseEnter}
                  handleCellDoubleClick={handleCellDoubleClick}
                  handleCellContextMenu={handleCellContextMenu}
                  isContextMenuTarget={rowId === contextMenuTargetRowId}
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
                  table={table}
                  dates={dates}
                  selectCell={selectCell}
                  projects={projects}
                  subprojects={subprojects}
                  projectSubprojectsMap={projectSubprojectsMap}
                  rowData={row.original}
                  totalDays={totalDays}
                  projectWeeklyQuotas={projectWeeklyQuotas}
                  projectIdByNickname={projectIdByNickname}
                  projectTotals={projectTotals}
                  dayColumnFilters={dayColumnFilters}
                  handleDayColumnFilterToggle={handleDayColumnFilterToggle}
                  filters={filters}
                  onProjectFilterButtonClick={onProjectFilterButtonClick}
                  onSubprojectFilterButtonClick={onSubprojectFilterButtonClick}
                  onStatusFilterButtonClick={onStatusFilterButtonClick}
                  onRecurringFilterButtonClick={onRecurringFilterButtonClick}
                  onEstimateFilterButtonClick={onEstimateFilterButtonClick}
                  collapsedGroups={collapsedGroups}
                  toggleGroupCollapse={toggleGroupCollapse}
                  archiveTotals={archiveTotals}
                  weekNames={weekNames}
                  onWeekNameChange={onWeekNameChange}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export default React.memo(PlannerTable);
