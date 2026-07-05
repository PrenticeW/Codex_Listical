import React from 'react';
import { PLAN_ESTIMATE_OPTIONS } from '../../utils/staging/planTableHelpers';

/**
 * Shared cell styling utilities
 *
 * Selection visuals are class-driven:
 *   - `selected-cell` class on a <td> draws the rose outline (see index.css).
 *   - `selected-row` class on a <tr> paints every <td> pink, with `.drag-handle`
 *     overriding the handle column to black.
 *
 * These helpers only resolve the *default* background per row type and the
 * drop-target pink. Anything selection-related lives in CSS.
 */
// Design tokens
const BENTO_LINE = '#DAD8C8';
const GUT_BG    = '#D2D7E1';
const GUT_LINE  = '#C9C5BC';
const CELL_HEIGHT = 24; // matches design GV_RH

const getCellBackground = ({ isDropTarget, rowType, promptBg }) => {
  if (isDropTarget) return '#fff5fc';
  switch (rowType) {
    case 'header':   return '#24252B';
    case 'prompt':   return promptBg || '#EEF0F5';
    case 'response': return '#ffffff';
    default:         return '#ffffff';
  }
};

const getHandleBackground = ({ isDropTarget, rowType }) => {
  if (isDropTarget) return '#fff5fc';
  if (rowType === 'header') return '#24252B';
  return GUT_BG;
};

const cellClassName = (isSelected) => isSelected ? 'selected-cell' : '';

/**
 * Drag handle cell - first column with grip icon
 */
export function DragHandleCell({
  isRowSelected,
  isDropTarget,
  rowType,
  onClick,
}) {
  const bg = getHandleBackground({ isDropTarget, rowType });
  const isHeader = rowType === 'header';
  return (
    <td
      className="drag-handle"
      style={{
        width: 24, minWidth: 24,
        height: isHeader ? 44 : CELL_HEIGHT,
        backgroundColor: bg,
        borderRight: isHeader ? '1px solid rgba(255,255,255,.06)' : `1px solid ${GUT_LINE}`,
        borderBottom: isHeader ? 'none' : `1px solid ${BENTO_LINE}`,
        borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
        cursor: 'grab',
        textAlign: 'center',
        verticalAlign: 'middle',
        padding: 0,
      }}
      onClick={onClick}
    >
      <span style={{ fontSize: 9, color: isHeader ? 'rgba(255,255,255,.3)' : isRowSelected ? '#ffffff' : '#8A8278' }}>⠿</span>
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
  promptBg,
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
  // Optional right-aligned content (e.g. row action buttons) rendered
  // after the input inside the same cell
  trailing,
}) {
  const bg = getCellBackground({ isDropTarget, rowType, promptBg });
  const isHeader = rowType === 'header';
  const style = {
    backgroundColor: bg,
    height: isHeader ? 44 : CELL_HEIGHT,
    borderBottom: `1px solid ${BENTO_LINE}`,
    borderRight: `1px solid ${BENTO_LINE}`,
    borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
    padding: '0 8px',
    verticalAlign: 'middle',
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;
  if (textAlign) style.textAlign = textAlign;
  if (paddingLeft) style.paddingLeft = paddingLeft;
  if (paddingRight) style.paddingRight = paddingRight;

  const inkColor = rowType === 'response' ? '#616161' : '#1F1F1F';
  const inputStyle = {
    fontSize: `${Math.round(12.5 * textSizeScale)}px`,
    fontFamily: 'var(--font-sans)',
    color: textColor || inkColor,
    fontWeight: fontWeight === 'semibold' ? 600 : 400,
    width: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
  };

  return (
    <td
      className={`${cellClassName(isSelected)}${trailing ? ' group/cell' : ''}`}
      style={style}
      colSpan={colSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      {trailing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="text"
            size={1}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onMouseDown={onMouseDown}
            placeholder={placeholder}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            {...dataAttributes}
          />
          <div
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </div>
        </div>
      ) : (
        <input
          type="text"
          size={1}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onMouseDown={onMouseDown}
          placeholder={placeholder}
          style={inputStyle}
          {...dataAttributes}
        />
      )}
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
    backgroundColor: getCellBackground({ isDropTarget, rowType }),
    borderTop: isDropTarget ? '2px solid #000000' : undefined,
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;
  if (paddingLeft) style.paddingLeft = paddingLeft;

  return (
    <td
      className={cellClassName(isSelected)}
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
  promptBg,
  textSizeScale,
  dataAttributes,
}) {
  return (
    <td
      className={cellClassName(isSelected)}
      style={{
        width: 140,
        minWidth: `${Math.round(118 * textSizeScale)}px`,
        height: CELL_HEIGHT,
        backgroundColor: getCellBackground({ isDropTarget, rowType, promptBg }),
        borderBottom: `1px solid ${BENTO_LINE}`,
        borderRight: `1px solid ${BENTO_LINE}`,
        borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
        padding: '0 8px',
        verticalAlign: 'middle',
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <select
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          fontSize: `${Math.round(12 * textSizeScale)}px`,
          fontFamily: "'Mulish', sans-serif",
          color: '#616161',
          paddingRight: 16,
        }}
        value={value || '-'}
        onMouseDown={(e) => { onMouseDown(e); e.stopPropagation(); }}
        onChange={(e) => onChange(e.target.value)}
        {...dataAttributes}
      >
        {PLAN_ESTIMATE_OPTIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
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
  promptBg,
  textSizeScale,
  readOnly,
  dataAttributes,
}) {
  return (
    <td
      className={cellClassName(isSelected)}
      style={{
        width: 120, minWidth: 60,
        height: CELL_HEIGHT,
        backgroundColor: getCellBackground({ isDropTarget, rowType, promptBg }),
        borderBottom: `1px solid ${BENTO_LINE}`,
        borderRight: `1px solid ${BENTO_LINE}`,
        borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
        padding: '0 8px',
        verticalAlign: 'middle',
        textAlign: 'right',
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      <input
        type="text"
        size={1}
        value={value || '0.00'}
        onChange={(e) => { if (!readOnly) onChange(e.target.value); }}
        onMouseDown={onMouseDown}
        onFocus={onFocus}
        readOnly={readOnly}
        placeholder="0.00"
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          textAlign: 'right',
          fontFamily: "'Mulish', sans-serif",
          fontSize: `${Math.round(12.5 * textSizeScale)}px`,
          color: '#1F1F1F',
          fontVariantNumeric: 'tabular-nums',
        }}
        {...dataAttributes}
      />
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
  promptBg,
  width,
  minWidth,
  colSpan,
}) {
  const style = {
    backgroundColor: getCellBackground({ isDropTarget, rowType, promptBg }),
    height: CELL_HEIGHT,
    borderBottom: `1px solid ${BENTO_LINE}`,
    borderRight: `1px solid ${BENTO_LINE}`,
    borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
    padding: 0,
    verticalAlign: 'middle',
  };

  if (width) style.width = width;
  if (minWidth) style.minWidth = minWidth;

  return (
    <td
      className={cellClassName(isSelected)}
      style={style}
      colSpan={colSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    />
  );
}
