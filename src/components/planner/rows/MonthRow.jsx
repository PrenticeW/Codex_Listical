import React from 'react';

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
      {/* Row-number gutter cell — no number for this pinned header row (the
          numbered/shaded gutter only begins at the true first data row,
          currently row 8), but filled black to match the black bar the
          rest of this row's fixed columns use. */}
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
          // Left transparent (not black) so the rounded corner on the inner
          // div below actually shows the table's white background peeking
          // through, instead of this td's own black square filling in
          // behind the curve and hiding it. Table cells with
          // border-collapse: collapse also ignore border-radius entirely,
          // so the td can't be rounded directly — the div does the visual
          // work.
          zIndex: rowNumZIndex,
        }}
        className="p-0"
      >
        <div
          className="h-full flex items-center justify-between"
          style={{
            minHeight: `${rowHeight}px`,
            backgroundColor: 'black',
            // Match the merged-fixed-cols cell's borders below so both
            // cells render at the same height and don't overhang each other.
            borderTop: '1px solid black',
            borderBottom: '1px solid black',
            borderTopLeftRadius: '14px',
          }}
          onClick={(e) => handleRowNumberClick(e, rowId)}
        />
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

      {/* Merged month cells */}
      {row.original._monthSpans.map((span, idx) => {
        // Calculate total width of merged cells (only for visible columns)
        let totalWidth = 0;
        for (let i = 0; i < span.span; i++) {
          const colId = `day-${span.startDay + i}`;
          const column = table.getColumn(colId);
          if (!column || !column.getIsVisible()) continue; // Skip if column doesn't exist or is hidden
          totalWidth += column.getSize();
        }

        // Skip this span if no valid visible columns were found
        if (totalWidth === 0) return null;

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
              className="h-full flex items-center justify-center font-semibold text-gray-700"
              style={{
                // Month label is a calendar figure (NUM_FONT/Mulish in the
                // design handover), not prose -- doesn't inherit DM Sans.
                fontFamily: "'Mulish', sans-serif",
                // headerFontSize (12, matches design's H1 fontSize:12), not
                // cellFontSize -- this is chrome text, not a data cell. This
                // prop was previously accepted but never actually used here.
                fontSize: `${headerFontSize}px`,
                // Mulish's default line-height ('normal') is much taller than
                // this fixed-height row -- flex align-items:center then
                // centers that tall line box, not the glyphs, so the text
                // sits visibly high. Tighten to the font-size itself.
                lineHeight: 1,
                minHeight: `${rowHeight}px`,
                backgroundColor: 'transparent',
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
