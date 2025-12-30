import { GripVertical, ChevronRight, ChevronDown } from 'lucide-react';

/**
 * ProjectRow Component
 * Renders pink project header rows with aggregated totals and weekly quotas
 *
 * Row types:
 * - projectHeader: Main project row (#d5a6bd) - shows project name, total scheduled, and quota
 * - projectGeneral: Section row (#f2e5eb) - shows "General" label
 * - projectUnscheduled: Section row (#f2e5eb) - shows "Unscheduled" label
 */
export default function ProjectRow({
  row,
  virtualRow,
  isRowSelected,
  handleRowNumberClick,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,
  draggedRowId,
  dropTargetRowId,
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
  totalDays,
  projectWeeklyQuotas = new Map(),
  projectTotals = {},
  isArchived = false,
  collapsedGroups = new Set(),
  toggleGroupCollapse = () => {},
  isCellSelected,
  editingCell,
  editValue,
  setEditValue,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellDoubleClick,
  handleEditComplete,
  handleEditCancel,
  handleEditKeyDown,
}) {
  const rowId = row.original.id;
  const rowType = row.original._rowType; // 'projectHeader', 'subprojectHeader', 'projectGeneral', 'projectUnscheduled', or archived variants
  const projectNickname = row.original.projectNickname || '';
  const projectName = row.original.projectName || '';
  const subprojectName = row.original.subprojectName || '';
  const subprojectLabel = row.original.subprojectLabel || ''; // Custom label for new subproject rows
  const groupId = row.original.groupId; // For project and subproject headers

  // Check if this row is being dragged or is a drop target
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  // Check if this is a pinned row (first 7 rows)
  const isPinnedRow = row.index < 7;
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  // Determine row styling based on type and archived status
  const isHeader = rowType === 'projectHeader' || rowType === 'archivedProjectHeader';
  const isSubprojectHeader = rowType === 'subprojectHeader';
  const bgColor = isHeader ? '#d5a6bd' : '#f2e5eb'; // Dark pink for project header, light pink for sections and subproject headers

  // Check if this project/subproject group is collapsed
  const isCollapsed = (isHeader || isSubprojectHeader) && groupId && collapsedGroups.has(groupId);

  // Get section label for non-header rows
  // For subproject rows with custom label, use that; otherwise use standard labels
  const sectionLabel =
    subprojectLabel ? subprojectLabel : // Use custom label if present (e.g., "New")
    rowType === 'projectGeneral' || rowType === 'archivedProjectGeneral' || rowType === 'subprojectGeneral' ? 'General' :
    rowType === 'projectUnscheduled' || rowType === 'archivedProjectUnscheduled' || rowType === 'subprojectUnscheduled' ? 'Unscheduled' : '';

  // Get label (project name for project headers, subproject name for subproject headers)
  const displayLabel = isSubprojectHeader ? subprojectName : projectName;

  // Get weekly quota for this project (only for header rows)
  // Use nickname as key for quota lookup since that's how quotas are stored
  const rawQuota = isHeader ? (projectWeeklyQuotas.get(projectNickname) ?? 0) : null;
  const formattedQuota = rawQuota !== null
    ? (typeof rawQuota === 'number' ? rawQuota.toFixed(2) : parseFloat(rawQuota).toFixed(2))
    : '0.00';

  // Get project total (sum of scheduled task timeValues)
  const projectTotal = isHeader ? (projectTotals[rowId] || '0.00') : '';

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
      {(() => {
        let mergedCellRendered = false;
        return row.getVisibleCells().map(cell => {
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
                  className="h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer"
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

          // Merge cells differently for header vs section rows
          // Header rows (project and subproject): merge A through E (checkbox, project, subproject, status, task)
          // Section rows: merge A through D (checkbox, project, subproject, status)
          const columnsToMergeHeader = ['checkbox', 'project', 'subproject', 'status', 'task'];
          const columnsToMergeSection = ['checkbox', 'project', 'subproject', 'status'];
          const columnsToMerge = (isHeader || isSubprojectHeader) ? columnsToMergeHeader : columnsToMergeSection;

          if (columnsToMerge.includes(columnId)) {
            // Render merged cell on first occurrence
            if (!mergedCellRendered) {
              mergedCellRendered = true;

              // Calculate total width of columns to merge
              const totalWidth = columnsToMerge.reduce((sum, colId) => {
                const column = row.getAllCells().find(c => c.column.id === colId)?.column;
                return sum + (column ? column.getSize() : 0);
              }, 0);

              // For project headers, the editable column is 'projectName'
              // For subproject headers, the editable column is 'subprojectName'
              const editableColumnId = isSubprojectHeader ? 'subprojectName' : 'projectName';
              const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === editableColumnId;
              const isSelected = isCellSelected?.(rowId, editableColumnId);

              return (
                <td
                  key={`merged-${isHeader ? 'a-to-e' : 'a-to-d'}`}
                  style={{
                    width: `${totalWidth}px`,
                    flexShrink: 0,
                    flexGrow: 0,
                    height: `${rowHeight}px`,
                    userSelect: 'none',
                    boxSizing: 'border-box',
                  }}
                  className="p-0"
                  onMouseDown={(e) => {
                    if ((isHeader || isSubprojectHeader) && handleCellMouseDown) {
                      handleCellMouseDown(e, rowId, editableColumnId);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if ((isHeader || isSubprojectHeader) && handleCellMouseEnter) {
                      handleCellMouseEnter(e, rowId, editableColumnId);
                    }
                  }}
                  onDoubleClick={(e) => {
                    if ((isHeader || isSubprojectHeader) && handleCellDoubleClick) {
                      handleCellDoubleClick(rowId, editableColumnId, displayLabel);
                    }
                  }}
                >
                  <div
                    className={`h-full flex items-center gap-2 ${(isHeader || isSubprojectHeader) && groupId ? 'cursor-pointer' : ''} ${isSelected ? 'selected-cell' : ''}`}
                    style={{
                      fontSize: `${cellFontSize}px`,
                      minHeight: `${rowHeight}px`,
                      backgroundColor: bgColor,
                      borderBottom: '1px solid #d3d3d3',
                      borderRight: '1px solid #d3d3d3',
                      paddingLeft: '8px',
                      paddingRight: '3px',
                      fontWeight: (isHeader || isSubprojectHeader) ? '600' : '400',
                      outline: isEditing ? '2px solid black' : 'none',
                      outlineOffset: '-2px',
                    }}
                    onClick={(e) => {
                      if ((isHeader || isSubprojectHeader) && groupId && !isEditing) {
                        toggleGroupCollapse(groupId);
                      }
                    }}
                  >
                    {(isHeader || isSubprojectHeader) && groupId && (
                      isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />
                    )}
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
                          fontWeight: '600',
                          padding: 0,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span>{(isHeader || isSubprojectHeader) ? displayLabel : '\u00A0'}</span>
                    )}
                  </div>
                </td>
              );
            } else {
              // Skip subsequent columns that have been merged
              return null;
            }
          }

          // For section rows, render task column (E) with section label (editable)
          if (!isHeader && columnId === 'task') {
            const editableColumnId = 'task';
            const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === editableColumnId;
            const isSelected = isCellSelected?.(rowId, editableColumnId);

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
                }}
                className="p-0"
                onMouseDown={(e) => {
                  if (handleCellMouseDown) {
                    handleCellMouseDown(e, rowId, editableColumnId);
                  }
                }}
                onMouseEnter={(e) => {
                  if (handleCellMouseEnter) {
                    handleCellMouseEnter(e, rowId, editableColumnId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (handleCellDoubleClick) {
                    handleCellDoubleClick(rowId, editableColumnId, sectionLabel);
                  }
                }}
              >
                <div
                  className={`h-full flex items-center ${isSelected ? 'selected-cell' : ''}`}
                  style={{
                    fontSize: `${cellFontSize}px`,
                    minHeight: `${rowHeight}px`,
                    backgroundColor: bgColor,
                    borderBottom: '1px solid #d3d3d3',
                    borderRight: '1px solid #d3d3d3',
                    paddingLeft: '8px',
                    paddingRight: '3px',
                    fontWeight: '600',
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
                        fontWeight: '600',
                        padding: 0,
                      }}
                    />
                  ) : (
                    sectionLabel
                  )}
                </div>
              </td>
            );
          }

          // For other columns (recurring, estimate, timeValue, day columns)
          // Check if this is a day column to apply week border
          const isDayColumn = columnId.startsWith('day-');
          let borderRightStyle = undefined;

          if (isDayColumn) {
            const dayIndex = parseInt(columnId.split('-')[1]);
            const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;
            borderRightStyle = isLastDayOfWeek ? '1.5px solid black' : '1px solid #d3d3d3';
          } else if (columnId === 'timeValue') {
            borderRightStyle = '1.5px solid black';
          } else {
            borderRightStyle = '1px solid #d3d3d3';
          }

          // Determine cell content based on column
          let cellContent = '\u00A0'; // Non-breaking space by default

          // Day columns should be empty (no fill) for project rows
          if (isDayColumn) {
            cellContent = '\u00A0';
          } else if (columnId === 'estimate' && isHeader) {
            // Total scheduled tasks in estimate column for header rows
            cellContent = projectTotal;
          } else if (columnId === 'timeValue' && isHeader) {
            // Weekly quota in timeValue column for header rows
            cellContent = `of ${formattedQuota}`;
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
                boxSizing: 'border-box',
              }}
              className="p-0"
            >
              <div
                className="h-full flex items-center"
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  backgroundColor: isDayColumn ? 'transparent' : bgColor, // No background for day columns
                  borderBottom: '1px solid #d3d3d3',
                  borderRight: borderRightStyle,
                  paddingLeft: '3px',
                  paddingRight: '3px',
                  fontWeight: isHeader && columnId === 'estimate' ? '600' : '400',
                  fontStyle: columnId === 'timeValue' ? 'italic' : 'normal',
                  justifyContent: columnId === 'estimate' ? 'flex-end' : 'flex-start',
                }}
              >
                {cellContent}
              </div>
            </td>
          );
        });
      })()}
    </tr>
    </>
  );
}
