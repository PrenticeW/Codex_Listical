import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ESTIMATE_VALUES,
  ESTIMATE_COLOR_MAP,
  parseEstimateLabelToMinutes,
  formatMinutesToHHmm,
} from '../../constants/planner/rowTypes';
import { getCurrentInstanceIndex } from '../../utils/planner/multiStatus';
import { getPageZoom } from '../../utils/pageZoom';

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Grouped layout per design handoff (03_OVERLAYS.md §2 / reference/SystemDropdowns.jsx
// EstimateDropdown): Hours on the left, Minutes on the right, each under a
// mono-caps section label. Derived from ESTIMATE_VALUES so no values are dropped —
// the prototype's own list happened to be a partial mockup.
// '-' (clear) sits at the top of both columns and commits instantly;
// everything else in each column is a stageable Hour/Minute pick.
const EST_HOURS = ['-', ...ESTIMATE_VALUES.filter((v) => /Hour/.test(v))];
const EST_MINUTES = ['-', ...ESTIMATE_VALUES.filter((v) => /Minute/.test(v))];

const ROW_H = 26;
const HEADER_H = 22;
const FOOTER_H = 40;
const COL_PAD_Y = 8; // vertical breathing room inside each column

/**
 * Parse a day cell value to minutes. Mirrors useComputedData's reading:
 * HH:mm and HH.mm are hour/minute pairs, a bare number is decimal hours.
 * Returns null for empty / unparseable / '=timeValue' placeholder.
 */
function parseDayValueToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const t = value.trim();
  if (t === '' || t === '=timeValue') return null;
  if (t.includes(':') || t.includes('.')) {
    const [h, m] = t.split(/[:.]/).map((n) => parseInt(n, 10));
    return !isNaN(h) && !isNaN(m) ? h * 60 + m : null;
  }
  const num = parseFloat(t);
  return isNaN(num) ? null : Math.round(num * 60);
}

/** Footer date label: day-of-month `-` 3-letter weekday, e.g. `08-Mon` */
function formatInstanceDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  const dom = String(date.getDate()).padStart(2, '0');
  const wd = date.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${dom}-${wd}`;
}

function FooterArrow({ dir, disabled, onClick }) {
  const [hov, setHov] = useState(false);
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 'calc(26px * var(--pz))', height: 'calc(22px * var(--pz))',
        borderRadius: 6, flexShrink: 0,
        border: disabled ? '1px solid #efefec' : '1px solid var(--brand-bd)',
        background: disabled ? '#fafafa' : (hov ? 'var(--brand-deep)' : 'var(--brand-hover-bg)'),
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .15s, border-color .15s',
        userSelect: 'none',
      }}
    >
      <Icon size={16} strokeWidth={2.75} style={{ color: disabled ? '#D9D9D9' : (hov ? '#ffffff' : 'var(--brand-deep)') }} />
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
        fontSize: 'calc(9px * var(--pz))',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--brand-ink)',
        height: `calc(${HEADER_H}px * var(--pz))`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 calc(12px * var(--pz))',
        borderBottom: '1px solid var(--brand-bd)',
      }}
    >
      {children}
    </div>
  );
}

// Single option row. `staged` options (Hours/Minutes combo picks) show a
// checkmark and stay highlighted until Confirm/deselect; `instant` options
// (the '-' clear row) commit immediately on click, same as before.
function EstimateOption({ value, cellFontSize, colorText, staged, legacyHighlighted, onMouseDown }) {
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onMouseDown}
      style={{
        height: `calc(${ROW_H}px * var(--pz))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'calc(8px * var(--pz))',
        paddingLeft: 'calc(12px * var(--pz))',
        paddingRight: 'calc(10px * var(--pz))',
        fontFamily: FONT,
        fontSize: cellFontSize,
        color: colorText || '#000000',
        cursor: 'pointer',
        background,
        transition: 'background 0.1s',
      }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
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
 * Grouped Hours / Minutes dropdown selector for the Estimate column.
 *
 * Hours and Minutes options can be staged together (click to toggle, click
 * again to deselect) and combined with the "Confirm" button, which sets the
 * estimate to "Custom" and writes the summed total to the Value column. The
 * '-' (clear) row at the top of each column commits instantly on click,
 * same as a single preset pick.
 */
function EstimateDropdownCell({
  initialValue,
  onComplete,
  onCancel,
  onKeyDown,
  cellFontSize,
  rowHeight,
  autoOpen = false,
  // Multi-row wiring (estimate 'Multi', >1 scheduled date). When provided,
  // the panel edits one scheduled date's time at a time: the footer tag
  // shows the date and n/N and pages between instances; picks write into
  // that date's day cell (via onInstanceTimeChange) and the panel stays
  // open, mirroring MultiStatusDropdownCell.
  multiInstances = null,
  dates = [],
  focusDayIndex = null,
  onInstanceTimeChange = null,
  onShownInstanceChange = null, // (dayIndex | null) => void — moves the table selection while the panel is open
  rowData = null, // Multi mode: source of the day cells' current values (live-preview baseline)
}) {
  const multiMode = Boolean(onInstanceTimeChange && multiInstances && multiInstances.length > 1);
  const instances = multiMode ? multiInstances : [];

  const [isOpen, setIsOpen] = useState(autoOpen);
  // Which instance the panel is pointed at: the row's focused day cell if it
  // is one of the instances, else the current instance (first non-terminal).
  const [shownIdx, setShownIdx] = useState(() => {
    if (!multiMode) return 0;
    const focusIdx = focusDayIndex != null
      ? instances.findIndex((inst) => inst.dayIndex === focusDayIndex)
      : -1;
    return focusIdx !== -1 ? focusIdx : getCurrentInstanceIndex(instances);
  });
  const safeShownIdx = Math.min(shownIdx, Math.max(0, instances.length - 1));
  const shown = multiMode ? instances[safeShownIdx] : null;
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
      const pz = getPageZoom();
      const leftColH = HEADER_H + EST_HOURS.length * ROW_H + COL_PAD_Y;
      const rightColH = HEADER_H + EST_MINUTES.length * ROW_H + COL_PAD_Y;
      const footerH = multiMode ? FOOTER_H + 48 : FOOTER_H;
      const estimatedHeight = Math.min((Math.max(leftColH, rightColH) + footerH + 8) * pz, 480 * pz);
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = Math.max(rect.width, 280 * pz);
      const fitsBelow = rect.bottom + estimatedHeight < window.innerHeight - 8;
      setDropdownPosition({
        top: fitsBelow ? rect.bottom : rect.top - estimatedHeight,
        left: Math.min(rect.left, window.innerWidth - panelWidth - 8),
        width: panelWidth,
      });
    }
  }, [isOpen, rowHeight, multiMode]);

  // Multi mode: keep the panel and the row's day cells in step, same rules
  // as MultiStatusDropdownCell.
  // 1) If the selection moves to another of this row's instance cells while
  //    the panel is open, follow it (no-op when paging already moved it).
  useEffect(() => {
    if (!multiMode || !isOpen || focusDayIndex == null) return;
    const focusIdx = instances.findIndex((inst) => inst.dayIndex === focusDayIndex);
    if (focusIdx !== -1) setShownIdx(focusIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDayIndex]);

  // 2) Tell the row which day cell to focus-ring: the shown instance's cell
  //    while the panel is open, cleared on close/unmount. Paging via the
  //    footer chevrons advances the ring with the shown date.
  const shownChangeRef = useRef(onShownInstanceChange);
  shownChangeRef.current = onShownInstanceChange;
  useEffect(() => {
    if (!multiMode) return;
    shownChangeRef.current?.(isOpen && shown ? shown.dayIndex : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, isOpen, shown?.dayIndex]);
  useEffect(() => () => shownChangeRef.current?.(null), []);

  // Close dropdown when clicking outside. Unchanged from before: commits
  // whatever the flat-list selectedIndex currently is (keyboard-driven only —
  // hovering Hours/Minutes combo rows no longer touches selectedIndex, so an
  // in-progress combo that isn't confirmed is safely discarded, not half-applied).
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        if (multiMode) {
          handleCancel(); // per-date edits are already committed as they happen
        } else {
          handleComplete(ESTIMATE_VALUES[selectedIndex]);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedIndex, multiMode]);

  const handleComplete = (value, options) => {
    setIsOpen(false);
    onComplete(value, options);
  };

  const handleCancel = () => {
    if (multiMode) revertAllTouched();
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
      if (multiMode) {
        handleConfirmCombo(e);
      } else {
        handleComplete(ESTIMATE_VALUES[selectedIndex]);
      }
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

  // '-' (clear) — instant commit, same as a single preset pick. On a Multi
  // row it clears the SHOWN date's time instead, and the panel stays open.
  const handleSelectInstant = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    if (multiMode) {
      rememberBaseline(shown.dayIndex);
      onInstanceTimeChange(shown.dayIndex, '');
      setSelectedHour(null);
      setSelectedMinute(null);
      return;
    }
    handleComplete(option);
  };

  // Hours / Minutes — stage the pick (toggle on/off), don't close or commit yet.
  const handleToggleHour = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    const next = selectedHour === option ? null : option;
    setSelectedHour(next);
    liveWriteCombo(next, selectedMinute);
  };
  const handleToggleMinute = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    const next = selectedMinute === option ? null : option;
    setSelectedMinute(next);
    liveWriteCombo(selectedHour, next);
  };

  const hasCombo = Boolean(selectedHour || selectedMinute);

  // Multi mode live preview: picks write into the SHOWN date's day cell
  // immediately, and the whole visit stays PROVISIONAL until Confirm. Every
  // touched date's original value is kept in baselineRef; Confirm accepts
  // them all and closes, while Escape / outside click restores every
  // touched date and closes.
  const baselineRef = useRef({});
  const [touchedCount, setTouchedCount] = useState(0);
  const rememberBaseline = (di) => {
    if (!(di in baselineRef.current)) {
      baselineRef.current[di] = rowData?.[`day-${di}`] ?? '';
      setTouchedCount(Object.keys(baselineRef.current).length);
    }
  };
  const liveWriteCombo = (hour, minute) => {
    if (!multiMode || !shown) return;
    const di = shown.dayIndex;
    rememberBaseline(di);
    const minutes = (hour ? (parseEstimateLabelToMinutes(hour) ?? 0) : 0)
      + (minute ? (parseEstimateLabelToMinutes(minute) ?? 0) : 0);
    if (minutes > 0) {
      onInstanceTimeChange(di, formatMinutesToHHmm(minutes));
    } else {
      onInstanceTimeChange(di, baselineRef.current[di]); // all picks deselected — restore
    }
  };
  const revertAllTouched = () => {
    Object.entries(baselineRef.current).forEach(([di, value]) => {
      onInstanceTimeChange(Number(di), value);
    });
    baselineRef.current = {};
    setTouchedCount(0);
  };

  // Paging to another date keeps its live-written preview; the highlight
  // follows the SHOWN date — its current time value is decomposed back into
  // the matching Hour/Minute rows (e.g. 1.30 highlights '1 Hour' + '30
  // Minutes'). Dates with no / unmatchable time start unhighlighted.
  useEffect(() => {
    if (!multiMode || !shown) return;
    const mins = parseDayValueToMinutes(rowData?.[`day-${shown.dayIndex}`]);
    if (mins == null || mins <= 0) {
      setSelectedHour(null);
      setSelectedMinute(null);
      return;
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hourLabel = h > 0 ? `${h} Hour${h === 1 ? '' : 's'}` : null;
    const minuteLabel = m > 0 ? `${m} Minute${m === 1 ? '' : 's'}` : null;
    setSelectedHour(hourLabel && EST_HOURS.includes(hourLabel) ? hourLabel : null);
    setSelectedMinute(minuteLabel && EST_MINUTES.includes(minuteLabel) ? minuteLabel : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiMode, shown?.dayIndex]);

  // Derived live from selectedHour/selectedMinute — recomputes on every
  // render, so the value written on Confirm always reflects the current
  // picks, not just whatever was staged at the moment of a click.
  const comboMinutes = (selectedHour ? (parseEstimateLabelToMinutes(selectedHour) ?? 0) : 0)
    + (selectedMinute ? (parseEstimateLabelToMinutes(selectedMinute) ?? 0) : 0);

  const handleConfirmCombo = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (multiMode) {
      // Everything is already live-written — Confirm accepts the whole
      // visit (drops the restore baselines) and closes. Estimate stays
      // 'Multi'.
      baselineRef.current = {};
      setTouchedCount(0);
      setIsOpen(false);
      if (onCancel) onCancel(); else onComplete(initialValue);
      return;
    }
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
  // Multi mode: the dash reads as "this date has no time" — highlighted only
  // when the shown date's cell is empty and nothing is staged.
  const shownDayMinutes = multiMode && shown
    ? parseDayValueToMinutes(rowData?.[`day-${shown.dayIndex}`])
    : null;
  const dashHighlighted = multiMode
    ? (!hasCombo && !(shownDayMinutes > 0))
    : null;

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
          {multiMode ? (initialValue || 'Multi') : (ESTIMATE_VALUES[selectedIndex] || ' ')}
        </span>
        {multiMode && (
          <span
            style={{
              fontFamily: 'monospace', fontSize: 'calc(10.5px * var(--pz))', fontWeight: 700,
              letterSpacing: '.04em', opacity: 0.75, flexShrink: 0, userSelect: 'none',
            }}
          >
            {safeShownIdx + 1}/{instances.length}
          </span>
        )}
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
            maxHeight: 'calc(480px * var(--pz))',
            display: 'flex',
            flexDirection: 'column',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', overflowY: 'auto' }}>
            {/* Left — Hours */}
            <div style={{ borderRight: '1px solid #e8e8e4', paddingBottom: `calc(${COL_PAD_Y}px * var(--pz))` }}>
              <SectionLabel>Hours</SectionLabel>
              {EST_HOURS.map((option) => (
                <EstimateOption
                  key={option}
                  value={option}
                  cellFontSize={cellFontSize}
                  staged={option !== '-' && selectedHour === option}
                  legacyHighlighted={option === '-' && (multiMode ? dashHighlighted : (option === currentValue && !hasCombo))}
                  onMouseDown={(e) => (option === '-' ? handleSelectInstant(e, option) : handleToggleHour(e, option))}
                />
              ))}
            </div>
            {/* Right — Minutes */}
            <div style={{ paddingBottom: `calc(${COL_PAD_Y}px * var(--pz))` }}>
              <SectionLabel>Minutes</SectionLabel>
              {EST_MINUTES.map((option) => (
                <EstimateOption
                  key={option}
                  value={option}
                  cellFontSize={cellFontSize}
                  colorText={ESTIMATE_COLOR_MAP[option]?.text}
                  staged={option !== '-' && selectedMinute === option}
                  legacyHighlighted={option === '-' && (multiMode ? dashHighlighted : (option === currentValue && !hasCombo))}
                  onMouseDown={(e) => (option === '-' ? handleSelectInstant(e, option) : handleToggleMinute(e, option))}
                />
              ))}
            </div>
          </div>

          {/* Footer — on Multi rows, a date tag (‹ 08-Mon › with n/N) pages
              between the row's scheduled dates; Confirm commits the staged
              Hour + Minute pick (to the shown date on Multi rows, else as a
              single Custom estimate written to the Value column). */}
          <div
            style={{
              flexShrink: 0,
              padding: '8px 10px',
              borderTop: '1px solid #e8e8e4',
            }}
          >
            {multiMode && (
              <div style={{ marginBottom: 6 }}>
                {/* Full-width date pager: arrows at the edges, date centred */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FooterArrow
                    dir="prev"
                    disabled={safeShownIdx === 0}
                    onClick={() => setShownIdx((i) => Math.max(0, i - 1))}
                  />
                  <span style={{ fontFamily: FONT, fontSize: 'calc(11px * var(--pz))', fontWeight: 600, color: 'var(--brand-deep)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {formatInstanceDate(dates[shown.dayIndex])}
                  </span>
                  <FooterArrow
                    dir="next"
                    disabled={safeShownIdx === instances.length - 1}
                    onClick={() => setShownIdx((i) => Math.min(instances.length - 1, i + 1))}
                  />
                </div>
                <div style={{ textAlign: 'center', fontFamily: FONT, fontSize: 'calc(11.5px * var(--pz))', fontWeight: 600, color: '#777777', userSelect: 'none' }}>
                  {safeShownIdx + 1}/{instances.length}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onMouseDown={handleConfirmCombo}
                disabled={multiMode ? touchedCount === 0 : !hasCombo}
                style={{
                  fontFamily: FONT,
                  fontSize: 'calc(11px * var(--pz))',
                  fontWeight: 600,
                  color: (multiMode ? touchedCount > 0 : hasCombo) ? '#ffffff' : '#999999',
                  background: (multiMode ? touchedCount > 0 : hasCombo) ? 'var(--brand-deep)' : '#e8e8e4',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  cursor: (multiMode ? touchedCount > 0 : hasCombo) ? 'pointer' : 'default',
                  width: multiMode ? '100%' : 'auto',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default EstimateDropdownCell;
