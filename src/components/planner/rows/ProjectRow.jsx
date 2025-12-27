import { GripVertical } from 'lucide-react';

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
}) {
  const rowId = row.original.id;
  const rowType = row.original._rowType; // 'projectHeader', 'projectGeneral', or 'projectUnscheduled'
  const projectNickname = row.original.projectNickname || '';
  const projectName = row.original.projectName || '';

  // Check if this row is being dragged or is a drop target
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  // Check if this is a pinned row (first 7 rows)
  const isPinnedRow = row.index < 7;
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  // Determine row styling based on type
  const isHeader = rowType === 'projectHeader';
  const bgColor = isHeader ? '#d5a6bd' : '#f2e5eb'; // Dark pink for header, light pink for sections

  // Get section label for non-header rows
  const sectionLabel = rowType === 'projectGeneral' ? 'General' : rowType === 'projectUnscheduled' ? 'Unscheduled' : '';

  // Get project label (use full project name)
  const projectLabel = projectName;

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

          // Merge cells A through E (checkbox, project, subproject, status, task)
          if (['checkbox', 'project', 'subproject', 'status', 'task'].includes(columnId)) {
            // Render merged cell on first occurrence
            if (!mergedCellRendered) {
              mergedCellRendered = true;

              // Determine cell content based on row type
              let cellContent = '\u00A0'; // Non-breaking space by default
              if (isHeader) {
                // Project name for header rows
                cellContent = projectLabel;
              } else {
                // Section label for section rows
                cellContent = sectionLabel;
              }

              // Calculate total width of columns A through E
              const columnsToMerge = ['checkbox', 'project', 'subproject', 'status', 'task'];
              const totalWidth = columnsToMerge.reduce((sum, colId) => {
                const column = row.getAllCells().find(c => c.column.id === colId)?.column;
                return sum + (column ? column.getSize() : 0);
              }, 0);

              return (
                <td
                  key="merged-a-to-e"
                  style={{
                    width: `${totalWidth}px`,
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
                      backgroundColor: bgColor,
                      borderBottom: '1px solid #d3d3d3',
                      borderRight: '1px solid #d3d3d3',
                      paddingLeft: '8px',
                      paddingRight: '3px',
                      fontWeight: isHeader ? '600' : '400',
                    }}
                  >
                    {cellContent}
                  </div>
                </td>
              );
            } else {
              // Skip subsequent columns that have been merged
              return null;
            }
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
                  fontWeight: isHeader && (columnId === 'estimate' || columnId === 'timeValue') ? '600' : '400',
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
