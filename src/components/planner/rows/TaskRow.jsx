import { GripVertical } from 'lucide-react';
import EditableCell from '../EditableCell';
import DropdownCell, { PILLBOX_COLORS } from '../DropdownCell';
import EstimateDropdownCell from '../EstimateDropdownCell';
import CheckboxCell from '../CheckboxCell';
import ProjectDropdownCell from '../ProjectDropdownCell';
import SubprojectDropdownCell from '../SubprojectDropdownCell';
import { ESTIMATE_COLOR_MAP } from '../../../constants/planner/rowTypes';
import { ChevronDown } from 'lucide-react';

/**
 * TaskRow Component
 * Renders a regular task data row (non-special rows like month, week, day, filter, etc.)
 * Handles all cell types: checkboxes, dropdowns, editable text, and day columns
 */
export default function TaskRow({
  row,
  virtualRow,
  isRowSelected,
  isCellSelected,
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
  rowHeight,
  cellFontSize,
  headerFontSize,
  gripIconSize,
  projects = ['-'],
  projectSubprojectsMap = {},
  rowData,
}) {
  const rowId = row.original.id;
  const isDragging = Array.isArray(draggedRowId) && draggedRowId.includes(rowId);
  const isDropTarget = dropTargetRowId === rowId;

  // Get the current project value for this row to filter subprojects
  const currentProject = rowData?.project || row.original.project || '';

  // Filter subprojects based on the current project selection
  // If no project is selected or project is '-', only show '-' option
  // Otherwise, show only subprojects for the selected project
  const filteredSubprojects = (currentProject && currentProject !== '-' && projectSubprojectsMap[currentProject])
    ? projectSubprojectsMap[currentProject]
    : ['-'];

  // Check if this is a pinned row (first 7 rows)
  const isPinnedRow = row.index < 7;
  // Higher z-index for pinned row number cells
  const rowNumZIndex = isPinnedRow ? 15 : 10;

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
                  backgroundColor: '#d9f6e0',
                  zIndex: rowNumZIndex,
                }}
                className={`p-0 ${isRowSelected ? 'selected-cell' : ''}`}
              >
                <div
                  className={`h-full border-r border-b border-gray-300 flex items-center justify-between font-mono cursor-pointer`}
                  style={{ fontSize: `${headerFontSize}px`, minHeight: `${rowHeight}px`, backgroundColor: '#d9f6e0', color: '#065f46' }}
                  onClick={(e) => handleRowNumberClick(e, rowId)}
                  onContextMenu={(e) => handleCellContextMenu?.(e, rowId, 'rowNum')}
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
                className={`h-full cursor-cell flex items-center ${
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
                onContextMenu={(e) => handleCellContextMenu?.(e, rowId, columnId)}
              >
                {isEditing ? (
                  columnId === 'checkbox' || columnId === 'recurring' ? (
                    <CheckboxCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
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
                  ) : columnId === 'estimate' ? (
                    <EstimateDropdownCell
                      initialValue={editValue}
                      onComplete={(newValue) => handleEditComplete(rowId, columnId, newValue)}
                      onCancel={() => handleEditCancel(rowId, columnId)}
                      onKeyDown={(e, currentValue) => handleEditKeyDown(e, rowId, columnId, currentValue)}
                      cellFontSize={cellFontSize}
                      rowHeight={rowHeight}
                      autoOpen={true}
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
                      className={`w-full h-full flex items-center justify-center ${
                        isSelected && !isEditing ? 'ring-2 ring-inset ring-blue-500' : ''
                      }`}
                      style={{
                        backgroundColor: (value === 'true' || value === true)
                          ? (isSelected && !isEditing ? '#b8dff0' : '#d4ecbc')
                          : (isSelected && !isEditing ? '#eff6ff' : 'transparent'),
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
                          width: `${rowHeight - 12}px`,
                          height: `${rowHeight - 12}px`,
                          minWidth: `${rowHeight - 12}px`,
                          minHeight: `${rowHeight - 12}px`,
                          backgroundColor: (value === 'true' || value === true) ? '#52881c' : 'white',
                          border: `2px solid ${(value === 'true' || value === true) ? '#52881c' : '#d1d5db'}`,
                          borderRadius: '3px',
                        }}
                      >
                        {(value === 'true' || value === true) && (
                          <svg
                            width={`${rowHeight - 14}`}
                            height={`${rowHeight - 14}`}
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
                    <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      {value && value !== '' && value !== '-' ? (
                        <div
                          className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: '#e5e5e5',
                            color: '#000000',
                            fontSize: `${cellFontSize}px`,
                            paddingLeft: '8px',
                            paddingRight: '8px'
                          }}
                        >
                          <span>{value}</span>
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
                          className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: '#ffffff',
                            color: '#000000',
                            fontSize: `${cellFontSize}px`,
                            paddingLeft: '8px',
                            paddingRight: '8px'
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
                    <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      <div
                        className="flex items-center justify-between gap-1 flex-1"
                        style={{
                          fontSize: `${cellFontSize}px`,
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          color: '#000000'
                        }}
                      >
                        <span>{value || '-'}</span>
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
                    <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      {value && value !== '' ? (
                        <div
                          className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: PILLBOX_COLORS[value]?.bg || PILLBOX_COLORS['-'].bg,
                            color: PILLBOX_COLORS[value]?.text || PILLBOX_COLORS['-'].text,
                            fontSize: `${cellFontSize}px`,
                            paddingLeft: '8px',
                            paddingRight: '8px'
                          }}
                        >
                          <span>{value}</span>
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
                          className="py-0.5 rounded-full font-medium text-xs flex items-center justify-between gap-1 flex-1"
                          style={{
                            backgroundColor: PILLBOX_COLORS['-'].bg,
                            color: PILLBOX_COLORS['-'].text,
                            fontSize: `${cellFontSize}px`,
                            paddingLeft: '8px',
                            paddingRight: '8px'
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
                  ) : columnId === 'estimate' ? (
                    <div className="w-full flex items-center" style={{ paddingLeft: '3px', paddingRight: '3px' }}>
                      <div
                        className="flex items-center justify-between gap-1 flex-1"
                        style={{
                          fontSize: `${cellFontSize}px`,
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          color: ESTIMATE_COLOR_MAP[value]?.text || 'inherit'
                        }}
                      >
                        <span>{value || '-'}</span>
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
                  ) : columnId === 'timeValue' ? (
                    <div className="w-full text-right" style={{ paddingRight: '8px' }}>
                      {value || '\u00A0'}
                    </div>
                  ) : isDayColumn ? (
                    <div className="w-full text-center px-1">
                      {value || '\u00A0'}
                    </div>
                  ) : (
                    <div className="w-full px-1">
                      {value || '\u00A0'}
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
}
