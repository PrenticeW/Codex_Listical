import React from 'react';
import { GripVertical } from 'lucide-react';

/**
 * MonthRow Component
 * Renders the first row of the table with merged month cells
 */
function MonthRow({
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
}) {
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
            borderTop: '1.5px solid black',
            borderBottom: '3px solid white',
            borderRight: '1.5px solid black',
          }}
        />
      </td>

      {/* Merged month cells */}
      {row.original._monthSpans.map((span, idx) => {
        // Calculate total width of merged cells
        let totalWidth = 0;
        for (let i = 0; i < span.span; i++) {
          const colId = `day-${span.startDay + i}`;
          totalWidth += table.getColumn(colId).getSize();
        }

        // Last month span gets thicker right border
        const isLastMonth = idx === row.original._monthSpans.length - 1;

        return (
          <td
            key={`month-span-${idx}`}
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
              className="h-full bg-blue-50 flex items-center justify-center font-semibold text-gray-700"
              style={{
                fontSize: `${cellFontSize}px`,
                minHeight: `${rowHeight}px`,
                borderTop: '1.5px solid black',
                borderBottom: '1px solid #d3d3d3',
                borderRight: isLastMonth ? '1.5px solid black' : '1px solid #d3d3d3'
              }}
            >
              {span.label}
            </div>
          </td>
        );
      })}
    </>
  );
}

export default MonthRow;
