import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { TASK_ROW_DETAIL_EVENT, TASK_ROW_PANEL_CLOSE_EVENT } from '../../../contexts/TaskRowPanelContext';
import EditableCell from '../EditableCell';
import DropdownCell, { PILLBOX_COLORS } from '../DropdownCell';
import EstimateDropdownCell from '../EstimateDropdownCell';
import CheckboxCell from '../CheckboxCell';
import ProjectDropdownCell from '../ProjectDropdownCell';
import SubprojectDropdownCell from '../SubprojectDropdownCell';
import { ESTIMATE_COLOR_MAP } from '../../../constants/planner/rowTypes';
import { ChevronDown } from 'lucide-react';
import { getSelectionEdgeClassNames } from '../../../utils/planner/selectionEdgeClasses';
import { linkifyText } from '../../../utils/linkify';
import MultiStatusDropdownCell from '../MultiStatusDropdownCell';
import { isMultiStatusRow, getMultiInstances, getCurrentInstanceIndex } from '../../../utils/planner/multiStatus';

/**
 * TaskRow Component
 * Renders a regular task data row (non-special rows like month, week, day, filter, etc.)
 * Handles all cell types: checkboxes, dropdowns, editable text, and day columns
 *
 * Memoized to prevent unnecessary re-renders
 */
const TaskRow = React.memo(function TaskRow({
  row,
  virtualRow,
  isRowSelected,
  isContextMenuTarget = false,
  isTopOfSelectionBlock,
  isBottomOfSelectionBlock,
  isCellSelected,
  getCellSelectionEdges,
  hasMultiCellSelection,
  editingCell,
  editValue,
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
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
  projects = ['-'],
  projectSubprojectsMap = {},
  rowData,
  dates = [],
  totalDays,
  selectCell,
  statusFilters,
}) {
  const rowId = row.original.id;
  // Multi rows (estimate 'Multi', >1 scheduled date) get the per-instance
  // status dropdown in the status column instead of the plain pill.
  const isMultiStatus = isMultiStatusRow(row.original, totalDays);
  // The focused instance is simply the row's selected day cell (the table's
  // own selection — one focus ring on screen). Clicking an instance's day
  // cell points the status chip at that entry; the panel's footer chevrons
  // move the selection itself.
  const multiInstances = isMultiStatus ? getMultiInstances(row.original, totalDays) : null;
  const statusFilterActive = !!statusFilters?.size;
  // The row's selected day cell normally decides which instance the chip
  // rests on — but while a status filter is active, a lingering selection
  // (the multi-status panel moves the selection to the last-viewed date via
  // onShownInstanceChange, and it stays there after close) only wins when
  // that instance's status actually matches the filter. Otherwise the chip
  // must jump to the earliest matching date (filterFocusDayIndex below).
  const selectedInstance = multiInstances
    ? (multiInstances.find(inst => isCellSelected(rowId, `day-${inst.dayIndex}`)) ?? null)
    : null;
  const selectedInstanceDayIndex =
    selectedInstance && (!statusFilterActive || statusFilters.has(selectedInstance.status))
      ? selectedInstance.dayIndex
      : null;
  // With a status filter active, rest the chip on the FIRST instance whose
  // status matches the filter — instances are in day order, so "first" is
  // the earliest date (the reason this row is in the results).
  const filterFocusDayIndex = multiInstances && statusFilterActive
    ? (multiInstances.find(inst => statusFilters.has(inst.status))?.dayIndex ?? null)
    : null;
  const focusInstanceDayIndex = selectedInstanceDayIndex ?? filterFocusDayIndex;
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);

  // Tracks which cell the pointer is over and whether it's on the border (for drag-to-move gating)
  const cellBorderStateRef = useRef({ columnId: null, onBorder: false });
  // React-controlled: which columnId is currently in drag-ready (border-hover) state
  const [draggableColumnId, setDraggableColumnId] = useState(null);
  const isDropTarget = dropTargetRowId === rowId;

  // Get the current project value for this row to filter subprojects
  const currentProject = rowData?.project || row.original.project || '';

  // Filter subprojects based on the current project selection
  // If no project is selected or project is '-', only show '-' option
  // Otherwise, show only subprojects for the selected project
  const filteredSubprojects = (currentProject && currentProject !== '-' && projectSubprojectsMap[currentProject])
    ? projectSubprojectsMap[currentProject]
    : ['-'];

  // Check if this is a pinned row (first 8 rows)
  const isPinnedRow = row.index < 8;
  // Higher z-index for pinned row number cells
  const rowNumZIndex = isPinnedRow ? 15 : 10;

  const isRowEditing = editingCell?.rowId === rowId;
  const needsSubprojectReview = row.original._importNeedsSubprojectReview;
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
    zIndex: isRowEditing ? 10 : undefined,
    ...(needsSubprojectReview && { borderLeft: '3px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)' }),
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
            backgroundColor: 'var(--th-sel)',
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
        {row.getVisibleCells().map(cell => {
          const columnId = cell.column.id;
          const value = row.original[columnId] || '';
          const isSelected = isCellSelected(rowId, columnId);
          const isEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;

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
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  boxSizing: 'border-box',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: 'var(--th-gutter)',
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
                  className={`h-full border-r border-b border-gray-300 flex items-center justify-between cursor-grab active:cursor-grabbing`}
                  // Row-number gutter is Mulish per the design handover
                  // (NUM_FONT in reference/SystemView.jsx) -- not Tailwind's
                  // generic `font-mono` stack, which was never the intended font.
                  style={{ fontFamily: "'Mulish', sans-serif", fontSize: `${headerFontSize}px`, lineHeight: 1, minHeight: `${rowHeight}px`, backgroundColor: (isRowSelected || isContextMenuTarget) ? 'var(--sel-gutter)' : 'var(--th-gutter)', color: (isRowSelected || isContextMenuTarget) ? '#fff' : 'var(--th-gutter-text)' }}
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
                      and the Inbox/Archive divider rows, so the visible
                      numbering has no gaps at those rows. */}
                  <span>{row.original._gutterNumber}</span>
                  <div style={{ width: `${gripIconSize}px` }} />
                </div>
              </td>
            );
          }

          // Check if this is a day column to apply week border
          const isDayColumn = columnId.startsWith('day-');
          let borderRightStyle = undefined;

          if (isDayColumn) {
            const dayIndex = parseInt(columnId.split('-')[1]);
            const isLastDayOfWeek = (dayIndex + 1) % 7 === 0;

            if (isLastDayOfWeek) {
              borderRightStyle = '1.5px solid black';
            } else {
              borderRightStyle = '1px solid #d3d3d3';
            }
          } else if (columnId === 'timeValue') {
            // Thick border after timeValue (last fixed column before day columns)
            borderRightStyle = '1.5px solid black';
          } else {
            borderRightStyle = '1px solid #d3d3d3';
          }

          const isCellDragging = isCellBeingDragged?.(rowId, columnId);
          const isCellDrop = isCellDropTarget?.(rowId, columnId);

          // Border threshold in px — pointer within this distance of any edge = grab cursor + draggable
          const BORDER_THRESHOLD = 5;
          const isDraggableCell = draggableColumnId === columnId;

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
                position: 'relative',
                overflow: isEditing ? 'visible' : 'hidden',
              }}
              className={`p-0 ${isSelected && !isEditing ? `selected-cell ${getSelectionEdgeClassNames(getCellSelectionEdges?.(rowId, columnId))} ${hasMultiCellSelection ? 'sel-fill' : ''}` : ''}`}
              onDragOver={(e) => handleCellDragOver?.(e, rowId, columnId)}
              onDragLeave={(e) => handleCellDragLeave?.(e)}
              onDrop={(e) => handleCellDrop?.(e, rowId, columnId)}
              draggable={isDraggableCell}
              onMouseMove={(e) => {
                if (isEditing) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const onBorder =
                  x <= BORDER_THRESHOLD ||
                  y <= BORDER_THRESHOLD ||
                  x >= rect.width - BORDER_THRESHOLD ||
                  y >= rect.height - BORDER_THRESHOLD;
                cellBorderStateRef.current = { columnId, onBorder };
                e.currentTarget.style.cursor = onBorder ? 'grab' : 'cell';
                setDraggableColumnId(onBorder ? columnId : null);
              }}
              onMouseLeave={(e) => {
                cellBorderStateRef.current = { columnId: null, onBorder: false };
                e.currentTarget.style.cursor = '';
                setDraggableColumnId(null);
              }}
              onDragStart={(e) => {
                if (!cellBorderStateRef.current.onBorder || cellBorderStateRef.current.columnId !== columnId) {
                  e.preventDefault();
                  return;
                }
                e.stopPropagation();
                handleCellDragStart?.(e, rowId, columnId);
              }}
              onDragEnd={(e) => {
                setDraggableColumnId(null);
                handleCellDragEnd?.(e);
              }}
            >
              <div
                className={`h-full flex items-center w-full ${
                  isCellDrop ? 'ring-2 ring-inset ring-black bg-[var(--sel-row)]' : ''
                }`}
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  borderBottom: '1px solid #d3d3d3',
                  borderRight: borderRightStyle,
                }}
                onMouseDown={(e) => {
                  // If pointer is on the cell border, let the drag initiate — don't call
                  // handleCellMouseDown which calls e.preventDefault() and kills the drag.
                  if (cellBorderStateRef.current.onBorder && cellBorderStateRef.current.columnId === columnId) {
                    e.stopPropagation();
                    return;
                  }
                  // Single left-click on the task name cell opens the detail panel.
                  // Done here (not onClick) because handleCellMouseDown calls
                  // e.preventDefault() which can suppress the click event.
                  if (columnId === 'task' && e.button === 0 && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                    window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, {
                      detail: { task: { ...row.original, ...rowData } },
                    }));
                  }
                  handleCellMouseDown(e, rowId, columnId);
                }}
                onMouseEnter={() => handleCellMouseEnter({}, rowId, columnId)}
                onDoubleClick={() => handleCellDoubleClick(rowId, columnId, value)}
                onContextMenu={(e) => handleCellContextMenu?.(e, rowId, columnId)}
              >
                {isEditing ? (
                  columnId === 'checkbox' || columnId === 'recurring' ? (
                    <CheckboxCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                      rowHeight={rowHeight}
                    />
                  ) : columnId === 'project' ? (
                    <ProjectDropdownCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onCancel={() => handleEditCancel(rowId, columnId)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                      rowHeight={rowHeight}
                      options={projects}
                      autoOpen={true}
                    />
                  ) : columnId === 'subproject' ? (
                    <SubprojectDropdownCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onCancel={() => handleEditCancel(rowId, columnId)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                      rowHeight={rowHeight}
                      options={filteredSubprojects}
                      autoOpen={true}
                    />
                  ) : columnId === 'status' ? (
                    isMultiStatus ? (
                      <MultiStatusDropdownCell
                        rowData={row.original}
                        dates={dates}
                        totalDays={totalDays}
                        cellFontSize={cellFontSize}
                        autoOpen={true}
                        onInstanceStatusChange={(dayIndex, status) => handleEditComplete(rowId, `multiStatus-${dayIndex}`, status)}
                        focusDayIndex={focusInstanceDayIndex}
                        onShownInstanceChange={(dayIndex) => { if (dayIndex !== null) selectCell?.(rowId, `day-${dayIndex}`); }}
                        onRequestClose={() => handleEditCancel(rowId, columnId)}
                      />
                    ) : (
                      <DropdownCell
                        initialValue={editValue}
                        onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                        onCancel={() => handleEditCancel(rowId, columnId)}
                        onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                        cellFontSize={cellFontSize}
                        rowHeight={rowHeight}
                        isPillbox={true}
                        autoOpen={true}
                      />
                    )
                  ) : columnId === 'estimate' ? (
                    <EstimateDropdownCell
                      initialValue={editValue}
                      onComplete={(newValue, options) => handleEditComplete(rowId, columnId, newValue, options)}
                      onCancel={() => handleEditCancel(rowId, columnId)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                      rowHeight={rowHeight}
                      autoOpen={true}
                      multiInstances={multiInstances}
                      rowData={row.original}
                      dates={dates}
                      focusDayIndex={focusInstanceDayIndex}
                      onInstanceTimeChange={(dayIndex, newValue) => handleEditComplete(rowId, `day-${dayIndex}`, newValue, { keepEditing: true })}
                      onShownInstanceChange={(dayIndex) => { if (dayIndex !== null) selectCell?.(rowId, `day-${dayIndex}`); }}
                    />
                  ) : (
                    <EditableCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                    />
                  )
                ) : (
                  columnId === 'checkbox' || columnId === 'recurring' ? (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{
                        backgroundColor: (value === 'true' || value === true)
                          ? '#d4ecbc'
                          : 'transparent',
                      }}
                    >
                      {/* Hidden input for copy/paste compatibility */}
                      <input
                        type="text"
                        value={(value === 'true' || value === true) ? 'true' : 'false'}
                        readOnly
                        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      {/* Custom checkbox styled to match Done status colors */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditComplete(rowId, columnId, (!(value === 'true' || value === true)).toString());
                        }}
                        className="flex items-center justify-center cursor-pointer"
                        style={{
                          // Sized as a proportion of the row (~2/3) so it
                          // scales with zoom but stays visually smaller than
                          // the cell -- rowHeight-6 filled the whole cell and
                          // read as oversized.
                          width: `${Math.max(12, Math.round(rowHeight * (2 / 3)))}px`,
                          height: `${Math.max(12, Math.round(rowHeight * (2 / 3)))}px`,
                          minWidth: `${Math.max(12, Math.round(rowHeight * (2 / 3)))}px`,
                          minHeight: `${Math.max(12, Math.round(rowHeight * (2 / 3)))}px`,
                          backgroundColor: (value === 'true' || value === true) ? '#276436' : 'white',
                          // 1px border -- 2px read as a thick ring around
                          // unchecked boxes.
                          border: `1px solid ${(value === 'true' || value === true) ? '#276436' : 'var(--th-gutter-line)'}`,
                          borderRadius: '3px',
                        }}
                      >
                        {(value === 'true' || value === true) && (
                          <svg
                            width={`${Math.max(8, Math.round(rowHeight * (2 / 3)) - 4)}`}
                            height={`${Math.max(8, Math.round(rowHeight * (2 / 3)) - 4)}`}
                            viewBox="0 0 14 14"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M11.6666 3.5L5.24998 9.91667L2.33331 7"
                              stroke="white"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  ) : columnId === 'project' ? (
                    /* h-full + overflow-hidden: the pill's natural height (line box +
                       borders) can exceed the fixed 24px row by a fraction of a CSS px;
                       at browser zoom below 100% that rounds to a whole device pixel and
                       the pill visibly paints over the row borders. Clipping to the cell
                       keeps pills inside their rows at every zoom/DPR. Same fix applied
                       to the subproject, status and estimate wrappers below. */
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      {value && value !== '' && value !== '-' ? (
                        <div
                          className="text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: '#e5e5e5',
                            color: '#000000',
                            fontSize: `${cellFontSize}px`,
                            // Design handover (reference/SystemDropdowns.jsx,
                            // PillTrigger) uses a squarer borderRadius: 5
                            // chip, not a fully-rounded pill.
                            borderRadius: '5px',
                            paddingLeft: '6px',
                            paddingRight: '6px',
                            border: '2px solid white',
                            overflow: 'hidden',
                            minWidth: 0,
                          }}
                        >
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={value}>{value}</span>
                          <ChevronDown
                            size={10}
                            style={{ color: '#000000', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellDoubleClick(rowId, columnId, value);
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: '#ffffff',
                            color: '#000000',
                            fontSize: `${cellFontSize}px`,
                            borderRadius: '5px',
                            paddingLeft: '6px',
                            paddingRight: '6px',
                            border: '2px solid white'
                          }}
                        >
                          <span>-</span>
                          <ChevronDown
                            size={10}
                            style={{ color: '#000000', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellDoubleClick(rowId, columnId, value);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : columnId === 'subproject' ? (
                    <div className="w-full h-full flex items-center relative overflow-hidden" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      {!value && currentProject && currentProject !== '-' && projectSubprojectsMap[currentProject]?.some(s => s !== '-') && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '6px',
                            height: '12px',
                            backgroundColor: '#fca5a5',
                            borderRadius: '0 6px 6px 0',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      <div
                        className="flex items-center justify-between gap-1 flex-1"
                        style={{
                          fontSize: `${cellFontSize}px`,
                          borderRadius: '5px',
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          color: '#000000',
                          border: '1px solid white',
                          overflow: 'hidden',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={value || '-'}>{value || '-'}</span>
                        <ChevronDown
                          size={12}
                          style={{ color: '#9ca3af', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellDoubleClick(rowId, columnId, value);
                          }}
                        />
                      </div>
                    </div>
                  ) : columnId === 'status' ? (
                    isMultiStatus ? (
                      <MultiStatusDropdownCell
                        rowData={row.original}
                        dates={dates}
                        totalDays={totalDays}
                        cellFontSize={cellFontSize}
                        onInstanceStatusChange={(dayIndex, status) => handleEditComplete(rowId, `multiStatus-${dayIndex}`, status)}
                        focusDayIndex={focusInstanceDayIndex}
                        onShownInstanceChange={(dayIndex) => { if (dayIndex !== null) selectCell?.(rowId, `day-${dayIndex}`); }}
                      />
                    ) : (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      {value && value !== '' ? (
                        <div
                          className="text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: PILLBOX_COLORS[value]?.bg || PILLBOX_COLORS['-'].bg,
                            color: PILLBOX_COLORS[value]?.text || PILLBOX_COLORS['-'].text,
                            fontSize: `${cellFontSize}px`,
                            borderRadius: '5px',
                            paddingLeft: '6px',
                            paddingRight: '6px',
                            border: '2px solid white',
                            overflow: 'hidden',
                            minWidth: 0,
                          }}
                        >
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={value}>{value}</span>
                          <ChevronDown
                            size={10}
                            style={{ color: PILLBOX_COLORS[value]?.text || PILLBOX_COLORS['-'].text, cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellDoubleClick(rowId, columnId, value);
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: PILLBOX_COLORS['-'].bg,
                            color: PILLBOX_COLORS['-'].text,
                            fontSize: `${cellFontSize}px`,
                            borderRadius: '5px',
                            paddingLeft: '6px',
                            paddingRight: '6px',
                            border: '2px solid white'
                          }}
                        >
                          <span>-</span>
                          <ChevronDown
                            size={10}
                            style={{ color: PILLBOX_COLORS['-'].text, cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellDoubleClick(rowId, columnId, value);
                            }}
                          />
                        </div>
                      )}
                    </div>
                    )
                  ) : columnId === 'estimate' ? (
                    <div className="w-full h-full flex items-center overflow-hidden" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      <div
                        className="flex items-center justify-between gap-1 flex-1"
                        style={{
                          fontSize: `${cellFontSize}px`,
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          color: ESTIMATE_COLOR_MAP[value]?.text || 'inherit',
                          overflow: 'hidden',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={value || '-'}>{value || '-'}</span>
                        {isMultiStatus && multiInstances && (
                          <span
                            style={{
                              fontFamily: 'monospace', fontSize: 'calc(10.5px * var(--pz))', fontWeight: 700,
                              letterSpacing: '.04em', opacity: 0.75, flexShrink: 0, userSelect: 'none',
                            }}
                          >
                            {(Math.max(0,
                              focusInstanceDayIndex != null
                                ? multiInstances.findIndex(inst => inst.dayIndex === focusInstanceDayIndex)
                                : getCurrentInstanceIndex(multiInstances)
                            )) + 1}/{multiInstances.length}
                          </span>
                        )}
                        <ChevronDown
                          size={12}
                          style={{ color: 'currentColor', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCellDoubleClick(rowId, columnId, value);
                          }}
                        />
                      </div>
                    </div>
                  ) : columnId === 'timeValue' ? (
                    <div className="w-full text-right" style={{ fontFamily: "'Mulish', sans-serif", lineHeight: 1, paddingRight: '8px' }}>
                      {value || '\u00A0'}
                    </div>
                  ) : isDayColumn ? (
                    <div className="w-full text-center px-1">
                      {/* '=timeValue' is the zero-time placeholder (counts as a
                          scheduled instance \u2014 see isScheduledDayValue); render
                          it as 0.00 rather than leaking the raw token. */}
                      {(value === '=timeValue' ? '0.00' : value) || '\u00A0'}
                    </div>
                  ) : columnId === 'task' ? (
                    /* Mirrors mobile SystemScreen's notesMark: an asterisk in the
                       theme family's accent colour marks tasks with notes. The
                       asterisk sits outside the truncating span so an ellipsis on
                       a long name never swallows it. */
                    <div className="w-full flex items-center" style={{ paddingLeft: '8px', paddingRight: '3px', overflow: 'hidden', minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {value ? linkifyText(value) : '\u00A0'}
                      </span>
                      {((rowData?.notes ?? row.original.notes) || '').trim() !== '' && (
                        <span
                          aria-hidden="true"
                          style={{ color: 'var(--brand)', fontWeight: 700, flexShrink: 0, marginLeft: '2px', userSelect: 'none' }}
                        >
                          *
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="w-full" style={{ paddingLeft: '8px', paddingRight: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {value ? linkifyText(value) : '\u00A0'}
                    </div>
                  )
                )}
              </div>
            </td>
          );
        })}
      </tr>
    </>
  );
});

export default TaskRow;
