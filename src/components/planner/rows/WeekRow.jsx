import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * WeekRow Component
 * Renders the second row of the table with merged week cells.
 * Week labels are click-to-edit inline; custom names persist via weekNames / onWeekNameChange.
 */
function WeekRow({
  row,
  rowId,
  isRowSelected,
  rowNumZIndex,
  rowHeight,
  headerFontSize,
  gripIconSize,
  cellFontSize,
  table,
  handleRowNumberClick,
  handleDragStart,
  handleDragEnd,
  weekNames = {},
  onWeekNameChange,
}) {
  const [editingWeek, setEditingWeek] = useState(null); // weekNumber being edited
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  // Focus input when edit starts
  useEffect(() => {
    if (editingWeek !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingWeek]);

  const startEdit = useCallback((weekNum, defaultLabel) => {
    setDraft(weekNames[weekNum] || defaultLabel);
    setEditingWeek(weekNum);
  }, [weekNames]);

  const commitEdit = useCallback(() => {
    if (editingWeek === null) return;
    const trimmed = draft.trim();
    if (onWeekNameChange) {
      onWeekNameChange(editingWeek, trimmed || `Week ${editingWeek}`);
    }
    setEditingWeek(null);
  }, [editingWeek, draft, onWeekNameChange]);

  const cancelEdit = useCallback(() => {
    setEditingWeek(null);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }, [commitEdit, cancelEdit]);

  return (
    <>
      {/* Row number cell */}
      <td
        key="rowNum"
        style={{
          width: `${table.getColumn('rowNum').getSize()}px`,
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

      {/* Merged cell for columns A-H */}
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
          className="h-full"
          style={{
            minHeight: `${rowHeight}px`,
            backgroundColor: 'black',
            borderTop: '1px solid black',
            borderBottom: '1px solid black',
            borderRight: '1.5px solid black',
          }}
        />
      </td>

      {/* Merged week cells */}
      {row.original._weekSpans.map((span, idx) => {
        // Calculate total width of merged cells (only for visible columns)
        let totalWidth = 0;
        for (let i = 0; i < span.span; i++) {
          const colId = `day-${span.startDay + i}`;
          const column = table.getColumn(colId);
          if (!column || !column.getIsVisible()) continue;
          totalWidth += column.getSize();
        }

        if (totalWidth === 0) return null;

        const weekNum = span.weekNumber ?? (idx + 1);
        const displayLabel = weekNames[weekNum] || span.label;
        const isEditing = editingWeek === weekNum;

        return (
          <td
            key={`week-span-${idx}`}
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
              className="h-full flex items-center justify-center font-semibold text-gray-700"
              style={{
                fontSize: `${cellFontSize}px`,
                minHeight: `${rowHeight}px`,
                backgroundColor: 'transparent',
                borderTop: '1.5px solid black',
                borderBottom: '1px solid #d3d3d3',
                borderRight: '1.5px solid black',
              }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: `${cellFontSize}px`,
                    fontWeight: 600,
                    width: '90%',
                    textAlign: 'center',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #6b7280',
                    outline: 'none',
                    color: 'inherit',
                  }}
                />
              ) : (
                <span
                  title="Click to rename"
                  onClick={() => startEdit(weekNum, span.label)}
                  style={{ cursor: 'text', userSelect: 'none', width: '100%', textAlign: 'center', padding: '0 4px' }}
                >
                  {displayLabel}
                </span>
              )}
            </div>
          </td>
        );
      })}
    </>
  );
}

export default WeekRow;
