import React, { useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import EditableCell from '../EditableCell';
import {
  STATUS_VALUES,
  ESTIMATE_VALUES,
  getStatusColorStyle,
  parseEstimateLabelToMinutes,
  formatMinutesToHHmm
} from '../../../constants/planner/rowTypes';

/**
 * TaskRow Component
 * Renders a task row by extending the base row rendering with custom UI elements
 * Preserves all table functionality: selection, editing, copy/paste, undo/redo
 */
export default function TaskRow({
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
  handleEditKeyDown,
  draggedRowId,
  dropTargetRowId,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
  table,
  onUpdateRow,
}) {
  const rowId = row.original.id;
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const rowData = row.original;

  // Handle row data updates
  const updateRowData = useCallback((updates) => {
    if (onUpdateRow) {
      onUpdateRow(rowId, updates);
    }
  }, [rowId, onUpdateRow]);

  // Check if this is a pinned row (first 7 rows)
  const isPinnedRow = row.index < 7;
  // Higher z-index for pinned row number cells
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  // This component mirrors the regular row rendering logic from TableRow.jsx
  // with custom content injected for specific columns
  return row.getVisibleCells().map(cell => {
    const columnId = cell.column.id;
    const value = rowData[columnId] || '';
    const isSelected = isCellSelected(rowId, columnId);
    const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

    // Special handling for row number column (same as regular rows)
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
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
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

    // Determine custom content for this cell
    let customContent = null;
    let customAlignment = 'flex items-center'; // default alignment

    // Column A (project): Checkbox
    if (columnId === 'project') {
      customAlignment = 'flex items-center justify-center';
      customContent = (
        <input
          type="checkbox"
          className="cursor-pointer"
          onChange={(e) => {
            e.stopPropagation();
          }}
        />
      );
    }

    // Column B (status): Project dropdown (placeholder)
    else if (columnId === 'status') {
      customContent = (
        <select
          className="w-full h-full border-0 outline-none cursor-pointer px-2"
          style={{ fontSize: `${cellFontSize}px` }}
          value="-"
          onClick={(e) => e.stopPropagation()}
        >
          <option>-</option>
        </select>
      );
    }

    // Column C (task): Subproject dropdown (placeholder)
    else if (columnId === 'task') {
      customContent = (
        <select
          className="w-full h-full border-0 outline-none cursor-pointer px-2"
          style={{ fontSize: `${cellFontSize}px` }}
          value="-"
          onClick={(e) => e.stopPropagation()}
        >
          <option>-</option>
        </select>
      );
    }

    // Column D (estimate): Status dropdown with colors
    else if (columnId === 'estimate') {
      customContent = (
        <select
          className="w-full h-full border-0 outline-none cursor-pointer text-center font-medium"
          style={{
            ...getStatusColorStyle(rowData.status),
            fontSize: `${cellFontSize}px`,
          }}
          value={rowData.status || '-'}
          onChange={(e) => {
            e.stopPropagation();
            updateRowData({ status: e.target.value });
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {STATUS_VALUES.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      );
    }

    // Column E (timeValue): Task name input
    // Override value to use 'task' field instead of 'timeValue'
    else if (columnId === 'timeValue') {
      // For this column, we want to edit the 'task' field, not 'timeValue'
      // We'll let it fall through to standard editing but we need to handle the value mapping
      // Actually, we need custom content to properly map to task field
      const taskValue = rowData.task || '';
      const isEditingThis = isEditing;

      if (isEditingThis) {
        customContent = (
          <EditableCell
            initialValue={editValue}
            onComplete={(newValue) => {
              handleEditComplete(rowId, columnId, newValue);
              updateRowData({ task: newValue });
            }}
            onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
            cellFontSize={cellFontSize}
          />
        );
      } else {
        customContent = (
          <div className="w-full px-2">{taskValue || '\u00A0'}</div>
        );
      }
    }

    // Column F (col_f): Recurring checkbox (placeholder)
    else if (columnId === 'col_f') {
      customAlignment = 'flex items-center justify-center';
      customContent = (
        <input
          type="checkbox"
          className="cursor-pointer"
          onChange={(e) => {
            e.stopPropagation();
          }}
        />
      );
    }

    // Column G (col_g): Time estimate dropdown
    else if (columnId === 'col_g') {
      customContent = (
        <select
          className="w-full h-full border-0 outline-none cursor-pointer px-2"
          style={{ fontSize: `${cellFontSize}px` }}
          value={rowData.estimate || '-'}
          onChange={(e) => {
            e.stopPropagation();
            const newEstimate = e.target.value;
            const minutes = parseEstimateLabelToMinutes(newEstimate);
            const updates = { estimate: newEstimate };

            if (minutes != null) {
              updates.timeValue = formatMinutesToHHmm(minutes);
            } else if (newEstimate === 'Custom') {
              updates.timeValue = '0.00';
            } else {
              updates.timeValue = '0.00';
            }

            updateRowData(updates);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ESTIMATE_VALUES.map(est => (
            <option key={est} value={est}>{est}</option>
          ))}
        </select>
      );
    }

    // Column H (col_h): Time value (read-only unless Custom estimate)
    else if (columnId === 'col_h') {
      const isCustomEstimate = rowData.estimate === 'Custom';
      customContent = (
        <input
          type="text"
          className="w-full h-full border-0 outline-none px-2 text-right"
          style={{
            fontSize: `${cellFontSize}px`,
            backgroundColor: isCustomEstimate ? 'white' : '#f5f5f5'
          }}
          value={rowData.timeValue || '0.00'}
          onChange={(e) => {
            if (isCustomEstimate) {
              updateRowData({ timeValue: e.target.value });
            }
          }}
          readOnly={!isCustomEstimate}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    // Calculate border styling (same as regular rows)
    const isDayColumn = columnId.startsWith('day-');
    let borderRightStyle = '1px solid #d3d3d3';

    if (isDayColumn) {
      const dayIndex = parseInt(columnId.split('-')[1]);
      const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;
      if (isLastDayOfWeek) {
        borderRightStyle = '1.5px solid black';
      }
    } else if (columnId === 'col_h') {
      borderRightStyle = '1.5px solid black'; // Thick border after last fixed column
    }

    // Render the cell with standard table functionality
    return (
      <td
        key={cell.id}
        style={{
          width: `${cell.column.getSize()}px`,
          flexShrink: 0,
          flexGrow: 0,
          height: `${rowHeight}px`,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          boxSizing: 'border-box',
        }}
        className="p-0"
      >
        <div
          className={`h-full cursor-cell ${customAlignment} ${
            isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
          }`}
          style={{
            fontSize: `${cellFontSize}px`,
            minHeight: `${rowHeight}px`,
            borderBottom: '1px solid #d3d3d3',
            borderRight: borderRightStyle
          }}
          onMouseDown={(e) => handleCellMouseDown(e, rowId, columnId)}
          onMouseEnter={() => handleCellMouseEnter({}, rowId, columnId)}
          onDoubleClick={() => handleCellDoubleClick(rowId, columnId, value)}
        >
          {customContent ? (
            // Use custom content (dropdowns, checkboxes)
            customContent
          ) : isEditing ? (
            // Use standard editing for regular cells
            <EditableCell
              initialValue={editValue}
              onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
              onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
              cellFontSize={cellFontSize}
            />
          ) : (
            // Use standard display for regular cells
            <div className="w-full px-2">{value || '\u00A0'}</div>
          )}
        </div>
      </td>
    );
  });
}
