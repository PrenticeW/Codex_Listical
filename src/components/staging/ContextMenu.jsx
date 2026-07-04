import React from 'react';

/**
 * Context menu for staging table cells and rows
 * Shows different actions based on what's selected
 */

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace";

const BENTO_SHELL = {
  background: '#ffffff',
  borderRadius: 12,
  padding: '11px 13px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
  minWidth: 220,
  userSelect: 'none',
  fontFamily: FONT,
};

const DIVIDER = {
  height: 1,
  background: 'rgba(200,174,198,0.35)',
  margin: '6px 0',
};

function MenuItem({ label, onClick, danger, hint, disabled }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '5px 2px',
        background: hovered && !disabled ? 'rgba(43,89,182,0.05)' : 'transparent',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: disabled ? '#C0C0C0' : danger ? '#c0392b' : '#1F1F1F',
        borderRadius: 6,
        transition: 'background 0.1s',
        opacity: disabled ? 0.5 : 1,
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
  onInsertRowAbove,
  onInsertRowBelow,
  onDuplicateRow,
  onClearCells,
  onInsertRowType,
  onToggleOutcomeTotals,
}) {
  if (!contextMenu.isOpen) return null;

  const {
    x,
    y,
    itemId,
    rowIdx,
    sectionType,
    rowType,
    showOutcomeTotals,
    isFirstOfType,
    hasSelectedCells,
    hasSelectedRows,
    selectedCellsCount,
    selectedRowsCount,
  } = contextMenu;

  // Define section-specific row type options
  const getSectionInsertOptions = () => {
    switch (sectionType) {
      case 'Reasons':    return [{ label: 'Add Reason', type: 'prompt' }];
      case 'Outcomes':   return [{ label: 'Add Outcome', type: 'prompt' }, { label: 'Add Measurable Outcome', type: 'response' }];
      case 'Actions':    return [{ label: 'Add Measurable Outcome', type: 'prompt' }, { label: 'Add Action', type: 'response' }];
      case 'Subprojects': return [{ label: 'Add Subproject', type: 'prompt' }];
      case 'Schedule':   return [{ label: 'Add Schedule Item', type: 'prompt' }];
      default:           return [];
    }
  };

  const sectionOptions = getSectionInsertOptions();

  const MENU_WIDTH = 220;
  const MENU_HEIGHT = 300;
  const clampedLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const fitsBelow = y + MENU_HEIGHT < window.innerHeight - 8;
  const clampedTop = fitsBelow ? y : Math.max(8, y - MENU_HEIGHT);

  const posStyle = { position: 'fixed', left: `${clampedLeft}px`, top: `${clampedTop}px`, zIndex: 9999 };
  const handleAction = (action) => { action(); onClose(); };

  const hasRowContext = itemId != null && rowIdx != null;
  const isMultiRow = selectedRowsCount > 1;
  const rowLabel = isMultiRow ? 'Rows' : 'Row';
  const isHeader = rowType === 'header';

  return (
    <div
      style={{ ...posStyle, ...BENTO_SHELL }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Selection info header */}
      {(hasSelectedRows || hasSelectedCells) && (
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
          textTransform: 'uppercase', color: '#9E9E9E',
          fontFamily: MONO, marginBottom: 8, paddingBottom: 6,
          borderBottom: '1px solid rgba(200,174,198,0.35)',
        }}>
          {hasSelectedRows
            ? `${selectedRowsCount} row${selectedRowsCount > 1 ? 's' : ''} selected`
            : `${selectedCellsCount} cell${selectedCellsCount > 1 ? 's' : ''} selected`}
        </div>
      )}

      {/* Row actions */}
      {hasRowContext && (
        <>
          {!isMultiRow && sectionOptions.length > 0 && (
            <>
              {sectionOptions.map((option, index) => (
                <MenuItem
                  key={`${option.type}-${index}`}
                  label={option.label}
                  onClick={() => handleAction(() => onInsertRowType(option.type))}
                />
              ))}
              <div style={DIVIDER} />
            </>
          )}
          {!isMultiRow && !isHeader && sectionType === 'Actions' && rowType === 'prompt' && (
            <>
              <MenuItem
                label={showOutcomeTotals ? 'Hide Totals' : 'Show Totals'}
                onClick={() => handleAction(onToggleOutcomeTotals)}
              />
              <div style={DIVIDER} />
            </>
          )}
          {!isMultiRow && (
            <>
              <MenuItem label="Insert Row Above" onClick={() => handleAction(onInsertRowAbove)} />
              <MenuItem label="Insert Row Below" onClick={() => handleAction(onInsertRowBelow)} />
            </>
          )}
          <MenuItem label={`Duplicate ${rowLabel}`} onClick={() => handleAction(onDuplicateRow)} />
          <div style={DIVIDER} />
          {!isHeader && (
            <MenuItem
              label={`Delete ${rowLabel}`}
              danger
              disabled={isFirstOfType}
              onClick={() => !isFirstOfType && handleAction(onDeleteRows)}
            />
          )}
        </>
      )}

      {/* Cell clear action */}
      {hasSelectedCells && (
        <>
          {hasRowContext && <div style={DIVIDER} />}
          <MenuItem
            label={`Clear Cell${selectedCellsCount > 1 ? 's' : ''}`}
            hint="Del"
            onClick={() => handleAction(onClearCells)}
          />
        </>
      )}

      {/* No context fallback */}
      {!hasRowContext && !hasSelectedCells && !hasSelectedRows && (
        <div style={{ fontSize: 12, color: '#9E9E9E', fontStyle: 'italic', padding: '2px 2px' }}>
          Right-click on a row for options
        </div>
      )}
    </div>
  );
}
