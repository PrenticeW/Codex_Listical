import React from 'react';
import { PLAN_ESTIMATE_OPTIONS } from '../../utils/staging/planTableHelpers';

/**
 * Shared cell styling utilities
 */
const getSelectionOutline = (isSelected) =>
  isSelected ? { boxShadow: 'inset 0 0 0 2px rgba(0, 0, 0, 0.65)', position: 'relative', zIndex: 2 } : {};

const getCellBackground = ({ isSelected, isDropTarget, rowType }) => {
  if (isSelected) return '#fff5fc';
  if (isDropTarget) return '#fff5fc';

  switch (rowType) {
    case 'header':
      return '#b7b7b7';
    case 'prompt':
      return '#d9d9d9';
    case 'response':
      return '#f3f3f3';
    default:
      return '#ffffff';
  }
};

const getHandleBackground = ({ isRowSelected, isDropTarget, rowType }) => {
  if (isRowSelected) return '#000000';
  if (isDropTarget) return '#fff5fc';

  switch (rowType) {
    case 'header':
      return '#b7b7b7';
    case 'prompt':
      return '#d9d9d9';
    case 'response':
      return '#f3f3f3';
    default:
      return '#f9fafb';
  }
};

/**
 * Drag handle cell - first column with grip icon
 */
export function DragHandleCell({
  isRowSelected,
  isDropTarget,
  rowType,
  onClick,
}) {
  return (
    <td
      className="border border-[#e5e7eb] px-1 py-0.5 text-center"
      style={{
        width: '24px',
        minWidth: '24px',
        backgroundColor: getHandleBackground({ isRowSelected, isDropTarget, rowType }),
        borderTop: isDropTarget ? '2px solid #000000' : undefined,
        cursor: 'grab',
      }}
      onClick={onClick}
    >
      <span style={{ fontSize: '10px', color: isRowSelected ? '#ffffff' : rowType === 'header' ? '#6b7280' : '#9ca3af' }}>
        ⋮⋮
      </span>
    </td>
  );
}

/**
 * Text input cell - editable text field
 */
export function TextInputCell({
  value,
  onChange,
  onKeyDown,
  onFocus,
  onMouseDown,
  onMouseEnter,
  placeholder,
  isSelected,
  isDropTarget,
  rowType,
  textSizeScale,
  colSpan,
  width,
  minWidth,
  textAlign,
  fontWeight,
  textColor,
  paddingLeft,
  paddingRight,
  dataAttributes,
}) {
  const style = {
    backgroundColor: getCellBackground({ isSelected, isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
    ...getSelectionOutline(isSelected),
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;
  if (textAlign) style.textAlign = textAlign;
  if (paddingLeft) style.paddingLeft = paddingLeft;
  if (paddingRight) style.paddingRight = paddingRight;

  const inputClassName = `w-full bg-transparent focus:outline-none border-none ${
    fontWeight === 'semibold' ? 'font-semibold' : ''
  } ${textColor || 'text-slate-800'}`;

  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={style}
      colSpan={colSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onMouseDown={onMouseDown}
        placeholder={placeholder}
        className={inputClassName}
        style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
        {...dataAttributes}
      />
    </td>
  );
}

/**
 * Static text cell - non-editable text display
 */
export function StaticTextCell({
  text,
  onMouseDown,
  onMouseEnter,
  isSelected,
  isDropTarget,
  rowType,
  textSizeScale,
  colSpan,
  width,
  minWidth,
  fontWeight,
  paddingLeft,
}) {
  const style = {
    backgroundColor: getCellBackground({ isSelected, isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
    ...getSelectionOutline(isSelected),
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;
  if (paddingLeft) style.paddingLeft = paddingLeft;

  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={style}
      colSpan={colSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <span
        className={`text-slate-800 ${fontWeight === 'semibold' ? 'font-semibold' : ''}`}
        style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
      >
        {text}
      </span>
    </td>
  );
}

/**
 * Estimate dropdown cell
 */
export function EstimateSelectCell({
  value,
  onChange,
  onMouseDown,
  onMouseEnter,
  isSelected,
  isDropTarget,
  rowType,
  textSizeScale,
  dataAttributes,
}) {
  const style = {
    width: '140px',
    minWidth: '140px',
    backgroundColor: getCellBackground({ isSelected, isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
    ...getSelectionOutline(isSelected),
  };

  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={style}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <select
        className="w-full bg-transparent focus:outline-none border-none"
        style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
        value={value || '-'}
        onMouseDown={onMouseDown}
        onChange={(e) => onChange(e.target.value)}
        {...dataAttributes}
      >
        {PLAN_ESTIMATE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </td>
  );
}

/**
 * Time value input cell
 */
export function TimeValueCell({
  value,
  onChange,
  onMouseDown,
  onMouseEnter,
  onFocus,
  isSelected,
  isDropTarget,
  rowType,
  textSizeScale,
  readOnly,
  dataAttributes,
}) {
  const style = {
    width: '120px',
    minWidth: '120px',
    textAlign: 'right',
    paddingRight: '10px',
    backgroundColor: getCellBackground({ isSelected, isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
    ...getSelectionOutline(isSelected),
  };

  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={style}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <input
        type="text"
        value={value || '0.00'}
        onChange={(e) => {
          if (!readOnly) onChange(e.target.value);
        }}
        onMouseDown={onMouseDown}
        onFocus={onFocus}
        readOnly={readOnly}
        className="w-full bg-transparent text-right focus:outline-none border-none"
        style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
        placeholder="0.00"
        {...dataAttributes}
      />
    </td>
  );
}

/**
 * Delete button cell
 */
export function DeleteButtonCell({
  onClick,
  rowType,
  textSizeScale,
  label = 'Delete row',
}) {
  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={{
        width: '32px',
        minWidth: '32px',
        textAlign: 'center',
        backgroundColor: rowType === 'prompt' ? '#d9d9d9' : '#f3f3f3',
      }}
    >
      <button
        type="button"
        aria-label={label}
        className="font-semibold text-slate-800"
        style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
        onClick={onClick}
      >
        X
      </button>
    </td>
  );
}

/**
 * Empty cell - placeholder cell with just styling
 */
export function EmptyCell({
  onMouseDown,
  onMouseEnter,
  isSelected,
  isDropTarget,
  rowType,
  width,
  minWidth,
  colSpan,
}) {
  const style = {
    backgroundColor: getCellBackground({ isSelected, isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
    ...getSelectionOutline(isSelected),
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;

  return (
    <td
      className="border border-[#e5e7eb] px-3 py-0.5"
      style={style}
      colSpan={colSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    />
  );
}

/**
 * Header cell - full width spanning cell for section headers
 */
export function HeaderCell({
  text,
  isDropTarget,
  textSizeScale,
  colSpan,
  paddingLeft,
  rightContent,
}) {
  const style = {
    backgroundColor: '#b7b7b7',
    color: '#1f2937',
    fontSize: `${Math.round(14 * textSizeScale)}px`,
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
  };

  if (paddingLeft) style.paddingLeft = paddingLeft;

  if (rightContent) {
    // Header with right-aligned content (like time total)
    return null; // This case is handled separately in the parent
  }

  return (
    <td
      colSpan={colSpan}
      className="border border-[#e5e7eb] px-3 py-0.5 text-left font-semibold"
      style={style}
    >
      {text}
    </td>
  );
}
