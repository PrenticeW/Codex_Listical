import React, { useEffect, useRef, useState } from 'react';
import { PLAN_ESTIMATE_OPTIONS } from '../../utils/staging/planTableHelpers';
import { linkifyText, containsUrl, renderUrlSegments } from '../../utils/linkify';

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

  // Display/edit toggle for linkified URLs. A native <input> can't render
  // anchors, so when the value contains a URL and the cell isn't being
  // edited we show a static linkified div instead, swapping back to the
  // input on click/focus. Cells without URLs keep the always-live input
  // exactly as before.
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);
  const showLinkifiedDisplay = !isEditing && containsUrl(value);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

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

  // Static display shown in place of the input when the value contains a
  // URL and the cell isn't being edited. Clicking anywhere in it (except a
  // link) swaps back to the input for editing. cellMouseDown/cellMouseEnter
  // still fire from the <td>, so click-to-select and drag-select behave the
  // same as with the live input.
  const linkifiedDisplay = (
    <div
      style={{
        ...inputStyle,
        cursor: 'text',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        flex: trailing ? 1 : undefined,
        minWidth: trailing ? 0 : undefined,
      }}
      onClick={() => setIsEditing(true)}
      // Programmatic focus (usePlanTableFocus targets the data-plan-*
      // attributes) lands here when the display is shown — swap to the
      // input, which the isEditing effect then focuses for real.
      tabIndex={-1}
      onFocus={() => setIsEditing(true)}
      {...dataAttributes}
    >
      {linkifyText(value)}
    </div>
  );

  // While editing a value that contains a URL, paint a mirror behind the
  // (transparent-text) input so URLs read as links mid-edit. The mirror
  // tracks the input's horizontal scroll so long values stay aligned.
  const hasUrl = containsUrl(value);
  const mirrorRef = useRef(null);
  const syncMirrorScroll = (e) => {
    if (mirrorRef.current) mirrorRef.current.scrollLeft = e.target.scrollLeft;
  };

  const input = (
    <div style={{ position: 'relative', width: '100%', ...(trailing ? { flex: 1, minWidth: 0 } : {}) }}>
      {hasUrl && (
        <div
          ref={mirrorRef}
          aria-hidden
          style={{
            ...inputStyle,
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'pre',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <span>{renderUrlSegments(value || '')}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        size={1}
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); syncMirrorScroll(e); }}
        onScroll={syncMirrorScroll}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setIsEditing(false)}
        onMouseDown={onMouseDown}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          position: 'relative',
          ...(hasUrl ? { color: 'transparent', caretColor: textColor || inkColor } : {}),
        }}
        {...dataAttributes}
      />
    </div>
  );

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
          {showLinkifiedDisplay ? linkifiedDisplay : input}
          <div
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </div>
        </div>
      ) : (
        showLinkifiedDisplay ? linkifiedDisplay : input
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
