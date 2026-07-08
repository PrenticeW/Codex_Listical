import React from 'react';

/**
 * Context menu for spreadsheet cells and rows.
 *
 * contextType === 'cell'  → copy / paste actions only
 * contextType === 'row'   → full row actions (duplicate, delete, insert, etc.)
 */

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace";

const BENTO_SHELL = {
  background: '#ffffff',
  borderRadius: 12,
  padding: '11px 13px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
  minWidth: 200,
  userSelect: 'none',
  fontFamily: FONT,
};

const DIVIDER = {
  height: 1,
  background: 'rgba(200,174,198,0.35)',
  margin: '6px 0',
};

// Danger tokens match the shared "AB" (ActionButton) primitive used across
// every panel/menu in the design handoff (reference/PanelPrimitives.jsx) —
// distinct from the plain modal danger red used elsewhere in the app.
const DANGER = '#DD2C2C';
const DANGER_BG = 'rgba(221,44,44,0.07)';
const DANGER_BD = 'rgba(221,44,44,0.35)';
const INK_MUTE = '#616161';

function MenuItem({ label, onClick, danger, hint, style }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '9px 11px', marginBottom: 4,
        background: danger
          ? (hovered ? DANGER_BG : 'transparent')
          : (hovered ? 'var(--brand-hover-bg)' : 'transparent'),
        border: `1px solid ${danger
          ? (hovered ? DANGER_BD : 'transparent')
          : (hovered ? 'var(--brand-hover-bd)' : 'transparent')}`,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: danger ? DANGER : (hovered ? 'var(--brand-deep)' : INK_MUTE),
        borderRadius: 8,
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        ...style,
      }}
    >
      <span>{label}</span>
      {hint && (
        <span style={{ fontSize: 11, color: '#9E9E9E', fontFamily: MONO, marginLeft: 12 }}>{hint}</span>
      )}
    </button>
  );
}

// Inline count input + Add button, used for row insertion
// (reference/SystemContextMenu.jsx → CMCountRight).
function CountAddControl({ onAdd }) {
  const [value, setValue] = React.useState(1);
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        onChange={(e) => setValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="no-spinner"
        style={{
          width: 28, height: 22,
          border: `1px solid ${focused ? 'var(--brand)' : '#e8e8e4'}`,
          borderRadius: 5,
          fontFamily: FONT, fontSize: 12, fontWeight: 500, color: '#1a1a1a',
          textAlign: 'center', background: '#ffffff', outline: 'none', padding: 0,
          transition: 'border-color 0.15s',
        }}
      />
      <div
        role="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onAdd?.(value); }}
        style={{
          height: 22, padding: '0 9px',
          background: 'var(--brand-deep)', borderRadius: 5,
          display: 'flex', alignItems: 'center',
          fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#ffffff',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        Add
      </div>
    </div>
  );
}

// Row insertion affordance: label on the left, count input + Add on the right
// (reference/SystemContextMenu.jsx → GBentoAB label/right pattern).
function InsertRow({ label, onAdd }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 2px', marginBottom: 4 }}>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 400, color: '#1F1F1F', whiteSpace: 'nowrap' }}>{label}</span>
      <CountAddControl onAdd={onAdd} />
    </div>
  );
}

export default function ContextMenu({
  contextMenu,
  onClose,
  onDeleteRows,
  onDuplicateRow,
  onInsertTaskRows,
  onInsertLabelRows,
  onCopy,
  onPaste,
}) {
  if (!contextMenu.isOpen) return null;

  const { x, y, hasSelectedRows, selectedRowsCount, rowId, contextType } = contextMenu;

  // ── Cell context: copy / paste only ──────────────────────────────────────
  if (contextType === 'cell') {
    const MENU_WIDTH = 160;
    const MENU_HEIGHT = 90;
    const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
    const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
    const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);
    const posStyle = { position: 'fixed', left: `${clampedLeft}px`, top: `${clampedTop}px`, zIndex: 9999 };
    const handleAction = (action) => { action(); onClose(); };

    return (
      <div
        style={{ ...posStyle, ...BENTO_SHELL, minWidth: MENU_WIDTH }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MenuItem label="Copy" hint="⌘C" onClick={() => handleAction(onCopy)} />
        <MenuItem label="Paste" hint="⌘V" onClick={() => handleAction(onPaste)} style={{ marginBottom: 0 }} />
      </div>
    );
  }

  // ── Row context: full row actions ─────────────────────────────────────────
  const isMulti = hasSelectedRows && selectedRowsCount > 1;
  const rowLabel = `Row${isMulti ? 's' : ''}`;
  const showInsertRows = Boolean(rowId) && !isMulti;

  const MENU_WIDTH = 200;
  // Header (optional) + 2 insert rows (single-row context) + divider + duplicate + delete,
  // or just header + duplicate + delete (multi-row context).
  const MENU_HEIGHT = (hasSelectedRows ? 28 : 0) + (showInsertRows ? 68 : 0) + 68;
  const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
  const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);
  const posStyle = { position: 'fixed', left: `${clampedLeft}px`, top: `${clampedTop}px`, zIndex: 9999 };
  const handleAction = (action) => { action(); onClose(); };

  return (
    <div
      style={{ ...posStyle, ...BENTO_SHELL }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasSelectedRows && (
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
          textTransform: 'uppercase', color: '#9E9E9E',
          fontFamily: MONO, marginBottom: 8, paddingBottom: 6,
          borderBottom: '1px solid rgba(200,174,198,0.35)',
        }}>
          {selectedRowsCount} row{selectedRowsCount > 1 ? 's' : ''} selected
        </div>
      )}
      {showInsertRows && (
        <>
          <InsertRow label="Insert tasks" onAdd={(count) => handleAction(() => onInsertTaskRows(count))} />
          <InsertRow label="Insert labels" onAdd={(count) => handleAction(() => onInsertLabelRows(count))} />
          <div style={DIVIDER} />
        </>
      )}
      <MenuItem label={`Duplicate ${rowLabel}`} onClick={() => handleAction(onDuplicateRow)} />
      <MenuItem
        label={`Delete ${rowLabel}`}
        danger
        onClick={() => handleAction(onDeleteRows)}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}
