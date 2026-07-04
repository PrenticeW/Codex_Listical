import React from 'react';

/**
 * Context menu for spreadsheet cells and rows.
 *
 * contextType === 'cell'  → copy / paste actions only
 * contextType === 'row'   → full row actions (duplicate, delete, insert, etc.)
 */

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
        width: '100%', padding: '5px 2px',
        background: hovered ? 'rgba(43,89,182,0.05)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: danger ? '#c0392b' : '#1F1F1F',
        borderRadius: 6,
        transition: 'background 0.1s',
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

export default function ContextMenu({
  contextMenu,
  onClose,
  onDeleteRows,
  onDuplicateRow,
  onInsertRowAbove,
  onInsertRowBelow,
  onAddTasks,
  onAddSubproject,
  onCopy,
  onPaste,
}) {
  if (!contextMenu.isOpen) return null;

  const { x, y, hasSelectedRows, selectedRowsCount, rowId, contextType } = contextMenu;

  const MENU_WIDTH = 200;
  const MENU_HEIGHT = contextType === 'cell' ? 90 : 280;
  const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
  const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);

  const posStyle = { position: 'fixed', left: `${clampedLeft}px`, top: `${clampedTop}px`, zIndex: 9999 };
  const handleAction = (action) => { action(); onClose(); };

  // ── Cell context: copy / paste only ──────────────────────────────────────
  if (contextType === 'cell') {
    return (
      <div
        style={{ ...posStyle, ...BENTO_SHELL, minWidth: 160 }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MenuItem label="Copy" hint="⌘C" onClick={() => handleAction(onCopy)} />
        <MenuItem label="Paste" hint="⌘V" onClick={() => handleAction(onPaste)} />
      </div>
    );
  }

  // ── Row context: full row actions ─────────────────────────────────────────
  const isMulti = hasSelectedRows && selectedRowsCount > 1;
  const rowLabel = `Row${isMulti ? 's' : ''}`;

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
      {rowId && !isMulti && (
        <>
          <MenuItem label="Insert Row Above" onClick={() => handleAction(onInsertRowAbove)} />
          <MenuItem label="Insert Row Below" onClick={() => handleAction(onInsertRowBelow)} />
          <div style={DIVIDER} />
        </>
      )}
      {!isMulti && (
        <>
          <MenuItem label="Add Tasks" onClick={() => handleAction(onAddTasks)} />
          <MenuItem label="Add Subproject" onClick={() => handleAction(onAddSubproject)} />
          <div style={DIVIDER} />
        </>
      )}
      <MenuItem label={`Duplicate ${rowLabel}`} onClick={() => handleAction(onDuplicateRow)} />
      <MenuItem
        label={`Delete ${rowLabel}`}
        danger
        hint="Del"
        onClick={() => handleAction(onDeleteRows)}
      />
    </div>
  );
}
