import React from 'react';
import TableRow from './TableRow';

/**
 * PlannerTable Component
 * Renders the table with header, pinned rows, and virtualized rows
 */
function PlannerTable({
  tableBodyRef,
  timelineHeaderRows,
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
  handleEditComplete,
  handleEditCancel,
  handleEditKeyDown,
  draggedRowId,
  dropTargetRowId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleDragEnd,
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
  projectTotals,
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-hidden">
      <div
        ref={tableBodyRef}
        className="flex-1 overflow-auto border border-gray-300 bg-white"
        style={{ position: 'relative' }}
      >
        <table className="border-collapse" style={{ display: 'grid', borderSpacing: 0 }}>
          <thead className="sticky top-0 bg-gray-100 z-10" style={{ display: 'grid', position: 'sticky', top: 0, zIndex: 1 }}>
            {timelineHeaderRows.map((headerRow) => (
              <tr key={headerRow.id} style={{ display: 'flex', height: `${rowHeight}px`, gap: 0 }}>
                {headerRow.cells.map((cell) => {
                  const column = table.getColumn(cell.columnKey);

                  // Skip rendering header for hidden columns
                  if (!column || !column.getIsVisible()) {
                    return null;
                  }

                  const cellWidth = column.getSize();
                  const isPinned = column.getIsPinned();
                  const pinnedOffset = isPinned ? column.getStart('left') : undefined;

                  return (
                    <th
                      key={cell.id}
                      style={{
                        width: `${cellWidth}px`,
                        minWidth: `${cellWidth}px`,
                        flexShrink: 0,
                        flexGrow: 0,
                        boxSizing: 'border-box',
                        fontSize: `${headerFontSize}px`,
                        position: isPinned ? 'sticky' : 'relative',
                        left: isPinned ? `${pinnedOffset}px` : undefined,
                        backgroundColor: '#d9f6e0',
                        color: '#065f46',
                        zIndex: isPinned ? 20 : 1,
                        borderRight: '1px solid #d1d5db',
                        borderBottom: '1px solid #d1d5db',
                        paddingTop: '0.25rem',
                        paddingBottom: '0.25rem',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                      className=""
                    >
                      {cell.content}

                      {/* Add resize handle for resizable columns */}
                      {column && column.getCanResize && column.getCanResize() && (
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const startX = e.clientX;
                            const startWidth = column.getSize();

                            const handleMouseMove = (moveEvent) => {
                              const diff = moveEvent.clientX - startX;
                              const minSize = column.columnDef.minSize || 30;
                              const newWidth = Math.max(minSize, startWidth + diff);

                              table.setColumnSizing(prev => ({
                                ...prev,
                                [column.id]: newWidth
                              }));
                            };

                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            height: '100%',
                            width: '4px',
                            backgroundColor: 'transparent',
                            cursor: 'col-resize',
                            zIndex: 9999,
                            pointerEvents: 'auto',
                            userSelect: 'none',
                            touchAction: 'none',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#93c5fd';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="Drag to resize column"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {/* Pinned tbody for first 7 rows */}
          <tbody
            style={{
              display: 'grid',
              position: 'sticky',
              top: `${rowHeight}px`, // Position below the header
              zIndex: 4,
              backgroundColor: 'white',
              height: `${7 * rowHeight}px`,
            }}
          >
            {table.getRowModel().rows.slice(0, 7).map((row, index) => {
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
                  table={table}
                  dates={dates}
                  projects={projects}
                  subprojects={subprojects}
                  projectSubprojectsMap={projectSubprojectsMap}
                  rowData={row.original}
                  totalDays={totalDays}
                  projectWeeklyQuotas={projectWeeklyQuotas}
                  projectTotals={projectTotals}
                />
              );
            })}
          </tbody>
          {/* Main virtualized tbody for rows 7+ */}
          <tbody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize() - (7 * rowHeight)}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              // Skip first 7 rows as they're in the pinned tbody
              if (virtualRow.index < 7) return null;

              const row = table.getRowModel().rows[virtualRow.index];
              const rowId = row.original.id;
              const isRowSelected = selectedRows.has(rowId);

              // Adjust virtualRow start to account for the 7 pinned rows
              const adjustedVirtualRow = {
                ...virtualRow,
                start: virtualRow.start - (7 * rowHeight),
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
                  table={table}
                  dates={dates}
                  projects={projects}
                  subprojects={subprojects}
                  projectSubprojectsMap={projectSubprojectsMap}
                  rowData={row.original}
                  totalDays={totalDays}
                  projectWeeklyQuotas={projectWeeklyQuotas}
                  projectTotals={projectTotals}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Debug info */}
      <div className="p-2 bg-gray-100 rounded text-xs font-mono flex-shrink-0">
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
          <span className={undoStack.length > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
            Undo: {undoStack.length}
          </span>
          {' • '}
          <span className={redoStack.length > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
            Redo: {redoStack.length}
          </span>
        </div>
        <div className="text-gray-500 mt-1">
          Try: Click row # to select row • Click cell to select • Drag to select range • Shift+Click for range • Cmd/Ctrl+Click for multi • Double-click to edit • Delete/Backspace to clear cells/rows • Cmd/Ctrl+Backspace to delete rows entirely • Cmd/Ctrl+C to copy • Cmd/Ctrl+V to paste • Cmd/Ctrl+Z to undo • Cmd/Ctrl+Shift+Z to redo
        </div>
      </div>
    </div>
  );
}

export default PlannerTable;
