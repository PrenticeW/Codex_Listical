import React from 'react';
import { Folder, CornerDownRight, CheckCircle } from 'lucide-react';
import { GROUP_FIELD_LABELS } from '../../utils/planner/groupSelection';

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
  minWidth: 240,
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

function MenuItem({ label, onClick, danger, hint, icon, disabled, style }) {
  const [hovered, setHovered] = React.useState(false);
  const hov = hovered && !disabled;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '9px 11px', marginBottom: 4,
        background: danger
          ? (hov ? DANGER_BG : 'transparent')
          : (hov ? 'var(--brand-hover-bg)' : 'transparent'),
        border: `1px solid ${danger
          ? (hov ? DANGER_BD : 'transparent')
          : (hov ? 'var(--brand-hover-bd)' : 'transparent')}`,
        cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        fontFamily: FONT, fontSize: 'calc(13px * var(--pz))', fontWeight: 400,
        color: disabled ? '#9E9E9E' : danger ? DANGER : (hov ? 'var(--brand-deep)' : INK_MUTE),
        opacity: disabled ? 0.42 : 1,
        borderRadius: 8,
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {icon}
        {label}
      </span>
      {hint && (
        <span style={{ fontSize: 'calc(11px * var(--pz))', color: '#9E9E9E', fontFamily: MONO, marginLeft: 12 }}>{hint}</span>
      )}
    </button>
  );
}

// Section header for the GROUP SELECTION BY block (design bundle frame 1).
function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 'calc(9px * var(--pz))', fontWeight: 700, letterSpacing: '.1em',
      textTransform: 'uppercase', color: '#9E9E9E',
      fontFamily: MONO, marginBottom: 8, paddingBottom: 6,
      borderBottom: '1px solid rgba(200,174,198,0.35)',
    }}>
      {children}
    </div>
  );
}

// Single hint line under the section header — rendered once, never repeated
// per option (design bundle frames 2–3).
function SectionHint({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 11px', marginBottom: 7,
      fontFamily: MONO, fontSize: 'calc(9.5px * var(--pz))', fontWeight: 500,
      letterSpacing: '.04em', color: '#9E9E9E',
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="5" r="4.4" stroke="currentColor" strokeWidth="1" />
        <path d="M5 4.4v2.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <circle cx="5" cy="3" r="0.55" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

const GROUP_ICON_PROPS = { size: 13, strokeWidth: 1.2, style: { flexShrink: 0 } };
const GROUP_OPTIONS = [
  { field: 'project', icon: <Folder {...GROUP_ICON_PROPS} /> },
  { field: 'subproject', icon: <CornerDownRight {...GROUP_ICON_PROPS} /> },
  { field: 'status', icon: <CheckCircle {...GROUP_ICON_PROPS} /> },
];

// GROUP SELECTION BY — one-shot reorder of the selected rows (see
// utils/planner/groupSelection.js for the rules; docs: group-by handoff).
function GroupSelectionSection({ groupSelection, onGroupBy, onClose }) {
  const { enabled = {}, hint = null } = groupSelection || {};
  return (
    <>
      <div style={DIVIDER} />
      <SectionHeader>Group selection by</SectionHeader>
      {hint && <SectionHint>{hint}</SectionHint>}
      {GROUP_OPTIONS.map(({ field, icon }, i) => (
        <MenuItem
          key={field}
          label={GROUP_FIELD_LABELS[field]}
          icon={icon}
          disabled={!enabled[field]}
          onClick={() => { onGroupBy(field); onClose(); }}
          style={i === GROUP_OPTIONS.length - 1 ? { marginBottom: 0 } : undefined}
        />
      ))}
    </>
  );
}

// Inline count input + Add button, used for row insertion
// (reference/SystemContextMenu.jsx → CMCountRight).
function CountAddControl({ onAdd }) {
  // Held as a string and starting empty — coercing to a number on every
  // keystroke made the field permanently show "1" and impossible to clear.
  // Empty input defaults to 1 on Add.
  const [value, setValue] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const commitCount = () => {
    const parsed = parseInt(value, 10);
    onAdd?.(Number.isNaN(parsed) ? 1 : Math.min(99, Math.max(1, parsed)));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitCount(); } }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="no-spinner"
        style={{
          width: 34, height: 22,
          border: `1px solid ${focused ? 'var(--brand)' : '#e8e8e4'}`,
          borderRadius: 5,
          fontFamily: FONT, fontSize: 'calc(12px * var(--pz))', fontWeight: 500, color: '#1a1a1a',
          textAlign: 'center', background: '#ffffff', outline: 'none', padding: 0,
          transition: 'border-color 0.15s',
        }}
      />
      <div
        role="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); commitCount(); }}
        style={{
          height: 22, padding: '0 9px',
          background: 'var(--brand-deep)', borderRadius: 5,
          display: 'flex', alignItems: 'center',
          fontFamily: FONT, fontSize: 'calc(11px * var(--pz))', fontWeight: 600, color: '#ffffff',
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
      <span style={{ fontFamily: FONT, fontSize: 'calc(13px * var(--pz))', fontWeight: 400, color: '#1F1F1F', whiteSpace: 'nowrap' }}>{label}</span>
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
  groupSelection,
  onGroupBy,
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

  const MENU_WIDTH = 240;
  // Header (optional) + 2 insert rows (single-row context) + divider + duplicate + delete,
  // or just header + duplicate + delete (multi-row context).
  const showGroupSection = hasSelectedRows && typeof onGroupBy === 'function';
  // Header (optional) + 2 insert rows (single-row context) + divider + duplicate + delete
  // + group-by section (divider + header + optional hint + 3 options).
  const MENU_HEIGHT = (hasSelectedRows ? 28 : 0) + (showInsertRows ? 68 : 0) + 68
    + (showGroupSection ? 160 + (groupSelection?.hint ? 22 : 0) : 0);
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
          fontSize: 'calc(9px * var(--pz))', fontWeight: 700, letterSpacing: '.1em',
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
        style={{ marginBottom: showGroupSection ? 4 : 0 }}
      />
      {showGroupSection && (
        <GroupSelectionSection
          groupSelection={groupSelection}
          onGroupBy={onGroupBy}
          onClose={onClose}
        />
      )}
    </div>
  );
}
