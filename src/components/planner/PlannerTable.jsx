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
  cellFontSize,
  gripIconSize,
  dates,
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
        className="flex-1 overflow-auto border border-slate-200/60 bg-white rounded-lg shadow-sm"
        style={{ position: 'relative' }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
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
              zIndex: 4,
              backgroundColor: 'white',
              height: `${8 * rowHeight}px`,
              width: `${table.getTotalSize()}px`,
            }}
          >
            {table.getRowModel().rows.slice(0, 8).map((row, index) => {
              const rowId = row.original.id;
              const isRowSelected = selectedRows.has(rowId);

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
                  isCellSelected={isCellSelected}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
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
                  table={table}
                  dates={dates}
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
                  isCellSelected={isCellSelected}
                  editingCell={editingCell}
                  editValue={editValue}
                  setEditValue={setEditValue}
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
                  table={table}
                  dates={dates}
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

      {/* Debug info */}
      <div className="p-3 bg-slate-100 rounded-lg text-xs font-mono shrink-0 border border-slate-200">
        <div className="flex gap-4">
          <div>
            <span className="text-green-600 font-semibold">Virtualization:</span> Rendering {rowVirtualizer.getVirtualItems().length} of {data.length} rows
          </div>
          <div>Selected cells: {selectedCells.size} {selectedCells.size > 0 && `(${Array.from(selectedCells).slice(0, 5).join(', ')}${selectedCells.size > 5 ? '...' : ''})`}</div>
          <div>Selected rows: {selectedRows.size} {selectedRows.size > 0 && `(${Array.from(selectedRows).join(', ')})`}</div>
        </div>
        <div className="mt-1">
          <span>Editing: {editingCell ? `${editingCell.rowId} / ${editingCell.columnId}` : 'None'}</span>
          {' • '}
          <span style={undoStack.length > 0 ? { color:'var(--brand-deep)', fontWeight:600 } : { color:'#94a3b8' }}>
            Undo: {undoStack.length}
          </span>
          {' • '}
          <span style={redoStack.length > 0 ? { color:'var(--brand-deep)', fontWeight:600 } : { color:'#94a3b8' }}>
            Redo: {redoStack.length}
          </span>
        </div>
        <div className="text-slate-500 mt-1">
          Try: Click row # to select row • Click cell to select • Drag to select range • Shift+Click for range • Cmd/Ctrl+Click for multi • Double-click to edit • Delete/Backspace to clear cells/rows • Cmd/Ctrl+Backspace to delete rows entirely • Cmd/Ctrl+C to copy • Cmd/Ctrl+V to paste • Cmd/Ctrl+Z to undo • Cmd/Ctrl+Shift+Z to redo
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export default React.memo(PlannerTable);
