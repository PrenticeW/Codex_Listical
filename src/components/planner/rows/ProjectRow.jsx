import { GripVertical, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { TASK_ROW_DETAIL_EVENT, TASK_ROW_PANEL_CLOSE_EVENT } from '../../../contexts/TaskRowPanelContext';
import { getSelectionEdgeClassNames } from '../../../utils/planner/selectionEdgeClasses';

/**
 * ProjectRow Component
 * Renders pink project header rows with aggregated totals and weekly quotas
 *
 * Row types:
 * - projectHeader: Main project row (#8BA8D8) - shows project name, total scheduled, and quota
 * - projectGeneral: Section row (#DCE4F5) - shows "General" label
 * - projectUnscheduled: Section row (#DCE4F5) - shows "Unscheduled" label
 */
export default function ProjectRow({
  row,
  virtualRow,
  isRowSelected,
  isTopOfSelectionBlock,
  isBottomOfSelectionBlock,
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
  projectIdByNickname = new Map(),
  projectTotals = {},
  isArchived = false,
  collapsedGroups = new Set(),
  toggleGroupCollapse = () => {},
  isCellSelected,
  getCellSelectionEdges,
  hasMultiCellSelection,
  editingCell,
  editValue,
  setEditValue,
  handleCellMouseDown,
  handleCellMouseEnter,
  handleCellDoubleClick,
  handleCellContextMenu,
  handleEditComplete,
  handleEditCancel,
  handleEditKeyDown,
}) {
  const [taglineEditValue, setTaglineEditValue] = useState('');
  const rowId = row.original.id;
  const rowType = row.original._rowType; // 'projectHeader', 'subprojectHeader', 'projectGeneral', 'projectUnscheduled', or archived variants
  const projectNickname = row.original.projectNickname || '';
  const projectName = row.original.projectName || '';
  const projectTagline = row.original.projectTagline || '';
  const subprojectName = row.original.subprojectName || '';
  const subprojectLabel = row.original.subprojectLabel || ''; // Custom label for new subproject rows
  const customSectionLabel = row.original.sectionLabel || ''; // Custom label for general/unscheduled rows
  const groupId = row.original.groupId; // For project and subproject headers

  // Check if this row is being dragged or is a drop target
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  // Check if this is a pinned row (first 8 rows)
  const isPinnedRow = row.index < 8;
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  // Determine row styling based on type and archived status
  const isHeader = rowType === 'projectHeader' || rowType === 'archivedProjectHeader';
  const isSubprojectHeader = rowType === 'subprojectHeader';
  const bgColor = isHeader ? '#8BA8D8' : '#DCE4F5'; // Blue project header, pale blue sections/subproject headers

  // Check if this project/subproject group is collapsed
  const isCollapsed = (isHeader || isSubprojectHeader) && groupId && collapsedGroups.has(groupId);

  // Get section label for non-header rows
  // For subproject rows with custom label, use that; otherwise use standard labels
  const sectionLabel =
    subprojectLabel ? subprojectLabel : // Use custom label if present (e.g., "New")
    rowType === 'projectGeneral' || rowType === 'archivedProjectGeneral' || rowType === 'subprojectGeneral' ? (customSectionLabel || 'General') :
    rowType === 'projectUnscheduled' || rowType === 'archivedProjectUnscheduled' || rowType === 'subprojectUnscheduled' ? (customSectionLabel || 'Unscheduled') : '';

  // Get label (project name for project headers, subproject name for subproject headers)
  // Prefer full project name; fall back to nickname if name is absent
  const displayLabel = isSubprojectHeader ? subprojectName : (projectName || projectNickname);

  // Get weekly quota for this project (only for header rows).
  // Archived headers carry a frozen snapshot of the quota from the moment they
  // were archived (archivedWeeklyQuota). Active headers look up the current
  // sent-metrics value via the project's stable id so that Goal-side renames
  // don't silently zero out the hours shown here.
  const archivedWeeklyQuota = row.original.archivedWeeklyQuota;
  // Prefer the stable projectId stamped on the row at creation; fall back to the
  // nickname-map lookup for rows written before this field was introduced.
  const projectIdForQuota = (isHeader && rowType !== 'archivedProjectHeader')
    ? (row.original.projectId ?? projectIdByNickname.get(projectNickname))
    : null;
  const rawQuota = isHeader
    ? (rowType === 'archivedProjectHeader' && archivedWeeklyQuota != null
        ? archivedWeeklyQuota
        : (projectWeeklyQuotas.get(projectIdForQuota) ?? 0))
    : null;
  const formattedQuota = rawQuota !== null
    ? (typeof rawQuota === 'number' ? rawQuota.toFixed(2) : parseFloat(rawQuota).toFixed(2))
    : '0.00';

  // Get project total (sum of scheduled task timeValues)
  const projectTotal = isHeader ? (projectTotals[rowId] || '0.00') : '';

  const style = {
    display: 'flex',
    position: 'absolute',
    // `top` instead of `transform: translateY(...)` — a transform here
    // would break `position: sticky` on the row-number gutter cell below
    // (any ancestor transform disqualifies sticky descendants from
    // tracking the scroll container).
    top: `${virtualRow.start}px`,
    left: 0,
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
                  className="h-full border-r border-b border-gray-300 flex items-center justify-between cursor-grab active:cursor-grabbing"
                  // Row-number gutter is Mulish per the design handover
                  // (NUM_FONT in reference/SystemView.jsx) -- not Tailwind's
                  // generic `font-mono` stack, which was never the intended font.
                  style={{ fontFamily: "'Mulish', sans-serif", fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: isRowSelected ? 'var(--sel-gutter)' : '#E8ECF5', color: isRowSelected ? '#fff' : '#6A7A9E' }}
                  onClick={(e) => {
                    handleRowNumberClick(e, rowId);
                    window.dispatchEvent(new CustomEvent(TASK_ROW_PANEL_CLOSE_EVENT));
                  }}
                  onContextMenu={(e) => handleCellContextMenu?.(e, rowId, 'rowNum')}
                  title="Drag to reorder"
                >
                  <div className="flex items-center">
                    <GripVertical size={gripIconSize} className="text-gray-400 hover:text-gray-600" />
                  </div>
                  {/* Precomputed sequential number (see ProjectTimePlannerV2's
                      _gutterNumber pass) that skips the 7 pinned header rows
                      and the Inbox/Archive divider rows. */}
                  <span>{row.original._gutterNumber}</span>
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
          const columnsToMerge = isHeader ? columnsToMergeHeader : columnsToMergeSection;

          if (columnsToMerge.includes(columnId)) {
            // Render merged cell on first occurrence
            if (!mergedCellRendered) {
              mergedCellRendered = true;

              // Calculate total width of columns to merge.
              // Use getAllCells so hidden columns are found, but only add their
              // width when they are actually visible — keeps this row's width
              // consistent with TaskRow, which iterates getVisibleCells().
              const totalWidth = columnsToMerge.reduce((sum, colId) => {
                const column = row.getAllCells().find(c => c.column.id === colId)?.column;
                if (!column || !column.getIsVisible()) return sum;
                return sum + column.getSize();
              }, 0);

              // For subproject headers: chevron sits at the right edge of the merged A–D cell (left of column E).
              const chevronRight = 0;

              // For project headers, the editable column is 'projectName'
              // For subproject headers, the editable column is 'subprojectName'
              const editableColumnId = isSubprojectHeader ? 'subprojectName' : 'projectName';
              const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === editableColumnId;
              const isSelected = isCellSelected?.(rowId, editableColumnId);
              const selectionEdgeClasses = getSelectionEdgeClassNames(getCellSelectionEdges?.(rowId, editableColumnId));

              return (
                <td
                  key={`merged-${isHeader ? 'a-to-e' : 'a-to-d'}`}
                  style={{
                    width: `${totalWidth}px`,
                    flexShrink: 0,
                    flexGrow: 0,
                    height: `${rowHeight}px`,
                    userSelect: isEditing ? 'text' : 'none',
                    boxSizing: 'border-box',
                  }}
                  className={`p-0 ${isSelected && !isEditing ? `selected-cell ${selectionEdgeClasses} ${hasMultiCellSelection ? 'sel-fill' : ''}` : ''}`}
                  onMouseDown={(e) => {
                    if (isEditing) return;
                    // Don't select the row when clicking the collapse/expand chevron
                    if (e.target.closest('[data-group-toggle]')) return;
                    if ((isHeader || isSubprojectHeader) && handleCellMouseDown) {
                      handleCellMouseDown(e, rowId, editableColumnId);
                    }
                    window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                      detail: { task: row.original },
                    }));
                  }}
                  onMouseEnter={(e) => {
                    if (isEditing) return;
                    if ((isHeader || isSubprojectHeader) && handleCellMouseEnter) {
                      handleCellMouseEnter(e, rowId, editableColumnId);
                    }
                  }}
                  onDoubleClick={(e) => {
                    if ((isHeader || isSubprojectHeader) && handleCellDoubleClick) {
                      // For project headers, pre-fill with projectName (the actual field being edited)
                      // and initialise tagline edit state
                      const initialValue = isHeader ? projectName : displayLabel;
                      if (isHeader) {
                        setTaglineEditValue(projectTagline);
                      }
                      handleCellDoubleClick(rowId, editableColumnId, initialValue);
                    }
                  }}
                >
                  <div
                    className="h-full flex items-center gap-2"
                    style={{
                      position: 'relative',
                      fontSize: `${cellFontSize}px`,
                      minHeight: `${rowHeight}px`,
                      // Inner div covers the <td>, so row selection has to be
                      // applied here rather than relying on `tr.selected-row td` CSS.
                      // Keep the header's own fill and tint it with a translucent
                      // overlay rather than replacing it with a flat colour.
                      backgroundColor: bgColor,
                      backgroundImage: isRowSelected
                        ? 'linear-gradient(var(--sel-row-overlay), var(--sel-row-overlay))'
                        : 'none',
                      borderBottom: '1px solid #d3d3d3',
                      borderRight: '1px solid #d3d3d3',
                      paddingLeft: '8px',
                      paddingRight: '3px',
                      fontWeight: (isHeader || isSubprojectHeader) ? '600' : '400',
                      outline: isEditing ? '2px solid black' : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    {isSubprojectHeader && groupId && (
                      <span
                        data-group-toggle
                        style={{
                          position: 'absolute',
                          right: chevronRight + 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#8090A8',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isEditing) toggleGroupCollapse(groupId);
                        }}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </span>
                    )}
                    {!isHeader && !isSubprojectHeader && (
                      <span style={{
                        position: 'absolute',
                        right: chevronRight + 4,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#8090A8',
                        display: 'flex',
                        alignItems: 'center',
                        pointerEvents: 'none',
                      }}>
                        <ChevronRight size={14} />
                      </span>
                    )}
                    {isEditing ? (
                      isHeader ? (
                        // Project headers: two inputs for name and tagline
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: 0 }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue?.(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                // Commit both name and tagline
                                handleEditComplete?.(rowId, editableColumnId, editValue);
                                if (taglineEditValue !== projectTagline && handleEditComplete) {
                                  // Tagline change is committed as a separate command via a direct call
                                  handleEditComplete(rowId, 'projectTagline', taglineEditValue);
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setTaglineEditValue('');
                                handleEditCancel?.(rowId, editableColumnId);
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                // Move focus to tagline input
                                e.currentTarget.parentElement?.querySelector('.tagline-input')?.focus();
                              }
                            }}
                            onBlur={(e) => {
                              // Only commit if focus is leaving the whole editing area (not moving to tagline)
                              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                                handleEditComplete?.(rowId, editableColumnId, editValue);
                                if (taglineEditValue !== projectTagline && handleEditComplete) {
                                  handleEditComplete(rowId, 'projectTagline', taglineEditValue);
                                }
                              }
                            }}
                            autoFocus
                            style={{
                              flex: '0 1 auto',
                              minWidth: 0,
                              height: '100%',
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: `${cellFontSize}px`,
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              padding: 0,
                            }}
                          />
                          <span style={{ fontWeight: 400, opacity: 0.7, flexShrink: 0, padding: '0 3px' }}>:</span>
                          <input
                            type="text"
                            className="tagline-input"
                            value={taglineEditValue}
                            onChange={(e) => setTaglineEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleEditComplete?.(rowId, editableColumnId, editValue);
                                if (taglineEditValue !== projectTagline && handleEditComplete) {
                                  handleEditComplete(rowId, 'projectTagline', taglineEditValue);
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setTaglineEditValue('');
                                handleEditCancel?.(rowId, editableColumnId);
                              }
                            }}
                            onBlur={(e) => {
                              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                                handleEditComplete?.(rowId, editableColumnId, editValue);
                                if (taglineEditValue !== projectTagline && handleEditComplete) {
                                  handleEditComplete(rowId, 'projectTagline', taglineEditValue);
                                }
                              }
                            }}
                            placeholder="tagline"
                            style={{
                              flex: '1 1 auto',
                              minWidth: 0,
                              height: '100%',
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: `${cellFontSize}px`,
                              fontWeight: '400',
                              opacity: 0.7,
                              padding: 0,
                            }}
                          />
                        </div>
                      ) : (
                        // Subproject headers: single input
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue?.(e.target.value)}
                          onKeyDown={(e) => {
                            if (handleEditKeyDown) {
                              handleEditKeyDown(e, rowId, editableColumnId, e.target.value);
                            }
                          }}
                          onBlur={() => handleEditComplete?.(rowId, editableColumnId, editValue)}
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
                      )
                    ) : (
                      <span>
                        {isHeader ? (
                          projectTagline ? (
                            <>{(projectName || displayLabel).toUpperCase()}<span style={{ fontWeight: 400, opacity: 0.7 }}>: {projectTagline}</span></>
                          ) : (projectName || displayLabel).toUpperCase()
                        ) : '\u00A0'}
                      </span>
                    )}
                  </div>
                </td>
              );
            } else {
              // Skip subsequent columns that have been merged
              return null;
            }
          }

          // For section and subproject header rows, render task column (E) with label
          if (!isHeader && columnId === 'task') {
            const label = isSubprojectHeader ? displayLabel : sectionLabel;
            const editableColumnId = 'task';
            const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === editableColumnId;
            const isSelected = isCellSelected?.(rowId, editableColumnId);
            const selectionEdgeClasses = getSelectionEdgeClassNames(getCellSelectionEdges?.(rowId, editableColumnId));

            return (
              <td
                key={cell.id}
                style={{
                  width: `${cell.column.getSize()}px`,
                  flexShrink: 0,
                  flexGrow: 0,
                  height: `${rowHeight}px`,
                  userSelect: isEditing ? 'text' : 'none',
                  boxSizing: 'border-box',
                }}
                className={`p-0 ${isSelected && !isEditing ? `selected-cell ${selectionEdgeClasses} ${hasMultiCellSelection ? 'sel-fill' : ''}` : ''}`}
                onMouseDown={(e) => {
                  if (isEditing) return;
                  if (handleCellMouseDown) {
                    handleCellMouseDown(e, rowId, editableColumnId);
                  }
                  window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                    detail: { task: row.original },
                  }));
                }}
                onMouseEnter={(e) => {
                  if (isEditing) return;
                  if (handleCellMouseEnter) {
                    handleCellMouseEnter(e, rowId, editableColumnId);
                  }
                }}
                onDoubleClick={(e) => {
                  if (handleCellDoubleClick) {
                    handleCellDoubleClick(rowId, editableColumnId, label);
                  }
                }}
              >
                <div
                  className="h-full flex items-center"
                  style={{
                    fontSize: `${cellFontSize}px`,
                    minHeight: `${rowHeight}px`,
                    // Inner div covers the <td>, so row selection has to be
                    // applied here rather than relying on `tr.selected-row td` CSS.
                    // Keep the header's own fill and tint it with a translucent
                    // overlay rather than replacing it with a flat colour.
                    backgroundColor: bgColor,
                    backgroundImage: isRowSelected
                      ? 'linear-gradient(var(--sel-row-overlay), var(--sel-row-overlay))'
                      : 'none',
                    borderBottom: '1px solid #d3d3d3',
                    borderRight: '1px solid #d3d3d3',
                    paddingLeft: '8px',
                    paddingRight: '3px',
                    fontWeight: '600',
                    outline: isEditing ? '2px solid black' : 'none',
                    outlineOffset: '-2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
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
                      onBlur={(e) => {
                        if (handleEditComplete) {
                          handleEditComplete(rowId, editableColumnId, e.target.value);
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
                    label
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
              onMouseDown={(e) => {
                if (handleCellMouseDown) handleCellMouseDown(e, rowId, columnId);
              }}
              onMouseEnter={(e) => {
                if (handleCellMouseEnter) handleCellMouseEnter(e, rowId, columnId);
              }}
            >
              <div
                className="h-full flex items-center"
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  backgroundColor: isDayColumn ? 'transparent' : bgColor, // No background for day columns
                  // Same overlay tint as the label cells so selection covers the whole row.
                  backgroundImage: isRowSelected
                    ? 'linear-gradient(var(--sel-row-overlay), var(--sel-row-overlay))'
                    : 'none',
                  borderBottom: '1px solid #d3d3d3',
                  borderRight: borderRightStyle,
                  paddingLeft: '3px',
                  paddingRight: '3px',
                  // Scheduled-total / quota figures are ledger content
                  // (matches NUM_FONT/Mulish in the design handover).
                  fontFamily: (columnId === 'estimate' || columnId === 'timeValue') ? "'Mulish', sans-serif" : undefined,
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
