import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import {
  ESTIMATE_VALUES,
  ESTIMATE_COLOR_MAP,
  parseEstimateLabelToMinutes,
  formatMinutesToHHmm,
} from '../../constants/planner/rowTypes';

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Grouped layout per design handoff (03_OVERLAYS.md §2 / reference/SystemDropdowns.jsx
// EstimateDropdown): Hours + Other on the left, Minutes on the right, each under a
// mono-caps section label. Derived from ESTIMATE_VALUES so no values are dropped —
// the prototype's own list happened to be a partial mockup.
const EST_HOURS = ESTIMATE_VALUES.filter((v) => /Hour/.test(v));
const EST_MINUTES = ESTIMATE_VALUES.filter((v) => /Minute/.test(v));
const EST_OTHER = ESTIMATE_VALUES.filter((v) => !/Hour|Minute/.test(v)); // '-', 'Custom', 'Multi'

const ROW_H = 24;
const HEADER_H = 20;
const DIVIDER_H = 7;
const FOOTER_H = 36;

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--brand-ink)',
        padding: '5px 10px',
        borderBottom: '1px solid var(--brand-bd)',
      }}
    >
      {children}
    </div>
  );
}

// Single option row. `staged` options (Hours/Minutes combo picks) show a
// checkmark and stay highlighted until Confirm/deselect; `instant` options
// (Other section) commit immediately on click, same as before.
function EstimateOption({ value, cellFontSize, colorText, staged, legacyHighlighted, onMouseDown, onMouseEnterHighlight }) {
  const [hovered, setHovered] = useState(false);
  const background = staged
    ? 'var(--sel-row)'
    : hovered
      ? 'var(--brand-hover-bg)'
      : legacyHighlighted
        ? 'var(--sel-row)'
        : '#ffffff';

  return (
    <div
      onMouseEnter={() => { setHovered(true); onMouseEnterHighlight?.(); }}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onMouseDown}
      style={{
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 10,
        paddingRight: 8,
        fontFamily: FONT,
        fontSize: cellFontSize,
        color: colorText || '#000000',
        cursor: 'pointer',
        background,
        transition: 'background 0.1s',
      }}
    >
      <span>{value}</span>
      {staged && (
        <svg width="11" height="9" viewBox="0 0 12 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 5l3.5 3.5L11 1" stroke="var(--brand-deep)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/**
 * EstimateDropdownCell Component
 * Grouped Hours / Minutes / Other dropdown selector for the Estimate column.
 *
 * Hours and Minutes options can be staged together (click to toggle, click
 * again to deselect) and combined with the "Confirm" button, which sets the
 * estimate to "Custom" and writes the summed total to the Value column. The
 * Other section ('-', Custom, Multi) still commits instantly on click, same
 * as a single preset pick.
 */
function EstimateDropdownCell({
  initialValue,
  onComplete,
  onCancel,
  onKeyDown,
  cellFontSize,
  rowHeight,
  autoOpen = false,
}) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = ESTIMATE_VALUES.indexOf(valueToFind);
    return index === -1 ? 0 : index;
  });
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedMinute, setSelectedMinute] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Calculate position when dropdown opens — flip above the cell if too close to viewport bottom
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const leftColH = HEADER_H + EST_HOURS.length * ROW_H + DIVIDER_H + HEADER_H + EST_OTHER.length * ROW_H;
      const rightColH = HEADER_H + EST_MINUTES.length * ROW_H;
      const estimatedHeight = Math.min(Math.max(leftColH, rightColH) + FOOTER_H + 8, 440);
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = Math.max(rect.width, 240);
      const fitsBelow = rect.bottom + estimatedHeight < window.innerHeight - 8;
      setDropdownPosition({
        top: fitsBelow ? rect.bottom : rect.top - estimatedHeight,
        left: Math.min(rect.left, window.innerWidth - panelWidth - 8),
        width: panelWidth,
      });
    }
  }, [isOpen, rowHeight]);

  // Close dropdown when clicking outside. Unchanged from before: commits
  // whatever the flat-list selectedIndex currently is (keyboard-driven only —
  // hovering Hours/Minutes combo rows no longer touches selectedIndex, so an
  // in-progress combo that isn't confirmed is safely discarded, not half-applied).
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        handleComplete(ESTIMATE_VALUES[selectedIndex]);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, selectedIndex]);

  const handleComplete = (value, options) => {
    setIsOpen(false);
    onComplete(value, options);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (onCancel) {
      onCancel();
    } else {
      onComplete(initialValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleComplete(ESTIMATE_VALUES[selectedIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, ESTIMATE_VALUES.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Pass through to parent handler
    onKeyDown(e, ESTIMATE_VALUES[selectedIndex]);
  };

  // Other section (-, Custom, Multi) — instant commit, same as a single preset pick.
  const handleSelectInstant = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    handleComplete(option);
  };

  // Hours / Minutes — stage the pick (toggle on/off), don't close or commit yet.
  const handleToggleHour = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedHour(prev => (prev === option ? null : option));
  };
  const handleToggleMinute = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedMinute(prev => (prev === option ? null : option));
  };

  const hasCombo = Boolean(selectedHour || selectedMinute);

  // Derived live from selectedHour/selectedMinute — recomputes on every
  // render, so the value written on Confirm always reflects the current
  // picks, not just whatever was staged at the moment of a click.
  const comboMinutes = (selectedHour ? (parseEstimateLabelToMinutes(selectedHour) ?? 0) : 0)
    + (selectedMinute ? (parseEstimateLabelToMinutes(selectedMinute) ?? 0) : 0);

  const handleConfirmCombo = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasCombo) return;
    // Only an Hour+Minute combination produces a figure that isn't already
    // one of the preset labels — that's the only case that should read
    // "Custom". Picking just one side is exactly a preset value (e.g. "3
    // Hours"), so commit that label directly instead of forcing Custom.
    if (selectedHour && selectedMinute) {
      const combinedTimeValue = formatMinutesToHHmm(comboMinutes);
      handleComplete('Custom', { timeValueOverride: combinedTimeValue });
    } else {
      handleComplete(selectedHour || selectedMinute);
    }
  };

  const currentValue = ESTIMATE_VALUES[selectedIndex];

  return (
    <div
      ref={dropdownRef}
      className="relative w-full h-full flex items-center"
      style={{ paddingLeft: '3px', paddingRight: '3px' }}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()} // Prevent parent cell handlers from interfering
      tabIndex={0}
    >
      <button
        ref={buttonRef}
        className="w-full h-full px-1 focus:outline-none flex items-center justify-between gap-1"
        style={{
          fontSize: `${cellFontSize}px`,
          backgroundColor: '#ffffff',
          border: '2px solid var(--sel-ring)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex-1 text-left">
          {ESTIMATE_VALUES[selectedIndex] || ' '}
        </span>
        <ChevronDown size={12} className="flex-shrink-0" style={{ color: '#9ca3af' }} />
      </button>

      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            backgroundColor: '#ffffff',
            border: '1px solid #e8e8e4',
            borderRadius: 6,
            boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
            zIndex: 9999,
            maxHeight: '440px',
            display: 'flex',
            flexDirection: 'column',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', overflowY: 'auto' }}>
            {/* Left — Hours + Other */}
            <div style={{ borderRight: '1px solid #e8e8e4' }}>
              <SectionLabel>Hours</SectionLabel>
              {EST_HOURS.map((option) => (
                <EstimateOption
                  key={option}
                  value={option}
                  cellFontSize={cellFontSize}
                  staged={selectedHour === option}
                  onMouseDown={(e) => handleToggleHour(e, option)}
                />
              ))}
              <div style={{ height: 1, background: '#e8e8e4', margin: '3px 0' }} />
              <SectionLabel>Other</SectionLabel>
              {EST_OTHER.map((option) => (
                <EstimateOption
                  key={option}
                  value={option}
                  cellFontSize={cellFontSize}
                  colorText={ESTIMATE_COLOR_MAP[option]?.text}
                  legacyHighlighted={option === currentValue}
                  onMouseDown={(e) => handleSelectInstant(e, option)}
                  onMouseEnterHighlight={() => setSelectedIndex(ESTIMATE_VALUES.indexOf(option))}
                />
              ))}
            </div>
            {/* Right — Minutes */}
            <div>
              <SectionLabel>Minutes</SectionLabel>
              {EST_MINUTES.map((option) => (
                <EstimateOption
                  key={option}
                  value={option}
                  cellFontSize={cellFontSize}
                  colorText={ESTIMATE_COLOR_MAP[option]?.text}
                  staged={selectedMinute === option}
                  onMouseDown={(e) => handleToggleMinute(e, option)}
                />
              ))}
            </div>
          </div>

          {/* Confirm — combines the staged Hour + Minute pick into a single
              Custom estimate, written to the Value column. */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '6px 8px',
              borderTop: '1px solid #e8e8e4',
            }}
          >
            <button
              type="button"
              onMouseDown={handleConfirmCombo}
              disabled={!hasCombo}
              style={{
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: hasCombo ? '#ffffff' : '#999999',
                background: hasCombo ? 'var(--brand-deep)' : '#e8e8e4',
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                cursor: hasCombo ? 'pointer' : 'default',
              }}
            >
              Confirm
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default EstimateDropdownCell;
