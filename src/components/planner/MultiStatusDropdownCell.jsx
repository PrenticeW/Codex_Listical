import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { DROPDOWN_OPTIONS, PILLBOX_COLORS } from './DropdownCell';
import { getMultiInstances, getCurrentInstanceIndex } from '../../utils/planner/multiStatus';
import { getPageZoom } from '../../utils/pageZoom';

/**
 * MultiStatusDropdownCell
 * Status cell variant for "Multi" rows (task scheduled more than once in a
 * week). Each scheduled instance (date) carries its own status; the panel
 * edits one instance at a time and steps between dates via a minimal footer.
 *
 * Spec: design_handoff_listical_production/06_MULTI_STATUS_DROPDOWN.md
 * - Trigger pill = current instance's status colours + {n}/{N} counter.
 * - Panel = standard status list scoped to the shown date, then a
 *   ‹ 08-Mon › footer with an n/N counter beneath.
 * - Selecting commits that date only; the panel stays open so several dates
 *   can be set in one visit. Outside click / Escape closes.
 */

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

function MultiStatusDropdownCell({
  rowData,
  dates = [],
  totalDays,
  cellFontSize,
  autoOpen = false,
  onInstanceStatusChange, // (dayIndex, status) => void
  onRequestClose, // called when the panel closes while in edit mode
  onShownInstanceChange, // (dayIndex | null) => void — moves the table selection while the panel is open
  focusDayIndex = null, // day index of this row's selected day cell (the focused instance), if any
}) {
  const instances = getMultiInstances(rowData, totalDays);
  const currentIdx = getCurrentInstanceIndex(instances);
  // Index of the externally focused instance (selected day cell), -1 if none
  const focusIdx = focusDayIndex != null
    ? instances.findIndex((inst) => inst.dayIndex === focusDayIndex)
    : -1;
  // The instance last shown in the panel (a ref: set in close(), which
  // re-renders via setOpen, so no extra state is needed). After closing, the
  // chip stays on this date instead of snapping back to the first
  // non-terminal ("current") instance.
  const stickyRef = useRef(null);
  const stickyIdx = stickyRef.current != null && stickyRef.current < instances.length
    ? stickyRef.current
    : null;
  // The instance the chip rests on when closed / starts on when opening:
  // 1. the selected day cell's instance, else
  // 2. the instance last shown in the panel (sticky), else
  // 3. the current instance (first non-terminal, else last).
  const restIdx = focusIdx !== -1 ? focusIdx : (stickyIdx ?? currentIdx);

  const [open, setOpen] = useState(autoOpen);
  const [shownIdx, setShownIdx] = useState(restIdx);
  const [hovered, setHovered] = useState(null);
  // null until measured — the panel is not rendered before then, so it
  // never paints a frame at the viewport origin (top-left flash).
  const [panelPos, setPanelPos] = useState(null);
  const anchorRef = useRef(null);
  const closeRef = useRef(null);

  const pz = getPageZoom();
  const PANEL_WIDTH = 176 * pz;
  const safeShownIdx = Math.min(shownIdx, instances.length - 1);
  const shown = instances[safeShownIdx];
  // While the panel is open, the trigger pill mirrors the SHOWN instance —
  // paging the footer chevrons cycles the chip through each date's status
  // (statuses are independent; paging never commits anything). When closed,
  // it rests on the selected day cell's instance if one is selected, else
  // the current instance (first non-terminal, else last).
  const trigger = open ? instances[safeShownIdx] : instances[restIdx];
  const triggerIdx = open ? safeShownIdx : restIdx;
  const triggerColors = PILLBOX_COLORS[trigger?.status] || PILLBOX_COLORS['-'];

  const close = () => {
    stickyRef.current = Math.min(shownIdx, instances.length - 1); // chip stays on the last shown date
    setOpen(false);
    if (onRequestClose) onRequestClose();
  };
  closeRef.current = close;

  const toggle = () => {
    if (!open) setShownIdx(restIdx); // opening starts on the focused (selected) instance
    setOpen((v) => !v);
  };

  // If the selection moves to another of this row's instance cells while the
  // panel is open, follow it (no-op when paging already moved the selection).
  useEffect(() => {
    if (open && focusIdx !== -1) setShownIdx(focusIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDayIndex]);

  // Position the panel; flip above the cell when it won't fit below.
  // useLayoutEffect: measure and place before the browser paints.
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const estimatedHeight = 320 * pz;
      const fitsBelow = rect.bottom + estimatedHeight < window.innerHeight - 8;
      setPanelPos({
        top: fitsBelow ? rect.bottom : rect.top - estimatedHeight,
        left: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tell the row which day cell to focus-ring: the shown instance's cell
  // while the panel is open, cleared on close/unmount. Paging via the
  // footer chevrons advances the ring with the shown date.
  const shownChangeRef = useRef(onShownInstanceChange);
  shownChangeRef.current = onShownInstanceChange;
  useEffect(() => {
    shownChangeRef.current?.(open && shown ? shown.dayIndex : null);
  }, [open, shown?.dayIndex]);
  useEffect(() => () => shownChangeRef.current?.(null), []);

  // Outside click / Escape / Enter close (per-date edits are already committed)
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) closeRef.current();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeRef.current(); }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!shown) return null;

  const handleSelect = (option) => {
    onInstanceStatusChange?.(shown.dayIndex, option);
    // Panel stays open so several dates can be set in one visit
  };

  return (
    <div
      ref={anchorRef}
      className="w-full h-full flex items-center overflow-hidden"
      style={{ paddingLeft: '3px', paddingRight: '3px' }}
    >
      {/* Clicks on the pill body propagate to the cell's own mousedown so the
          cell is selectable (and copy/paste-able) like any other; only the
          chevron hotspot and the portal panel stop propagation. */}
      {/* Trigger pill: current instance colours + counter badge */}
      <div
        className="text-xs flex items-center justify-between gap-1 flex-1"
        style={{
          backgroundColor: triggerColors.bg,
          color: triggerColors.text,
          fontSize: `${cellFontSize}px`,
          borderRadius: '5px',
          paddingLeft: '6px',
          paddingRight: '2px',
          border: '2px solid white',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          title={trigger?.status || '-'}
        >
          {trigger?.status || '-'}
        </span>
        <span
          style={{
            fontFamily: 'monospace', fontSize: 'calc(10.5px * var(--pz))', fontWeight: 700,
            letterSpacing: '.04em', opacity: 0.9, flexShrink: 0, userSelect: 'none',
          }}
        >
          {triggerIdx + 1}/{instances.length}
        </span>
        <span
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggle();
          }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '2px 4px' }}
        >
          <ChevronDown size={10} style={{ color: triggerColors.text }} />
        </span>
      </div>

      {open && panelPos && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH,
            background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999, overflow: 'hidden',
            paddingTop: 3,
          }}
        >
          {/* Status options for the shown date */}
          {DROPDOWN_OPTIONS.map((option, i) => {
            const colors = PILLBOX_COLORS[option] || PILLBOX_COLORS['-'];
            const isCurrent = option === shown.status;
            return (
              <div
                key={option}
                onMouseEnter={() => setHovered(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(option);
                }}
                style={{
                  display: 'flex', alignItems: 'center', padding: 'calc(2px * var(--pz)) calc(12px * var(--pz))',
                  cursor: 'pointer',
                  background: i === hovered ? '#f3f4f6' : 'transparent',
                }}
              >
                <div
                  style={{
                    minHeight: 'calc(22px * var(--pz))', display: 'flex', alignItems: 'center', flex: 1, borderRadius: 5,
                    background: colors.bg, color: colors.text, fontSize: 'calc(11.5px * var(--pz))', fontWeight: 500,
                    paddingLeft: 'calc(8px * var(--pz))', paddingRight: 'calc(8px * var(--pz))',
                    boxShadow: isCurrent ? 'inset 0 0 0 1.5px var(--brand-deep)' : 'none',
                  }}
                >
                  {option}
                  {isCurrent && (
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <Check size={11} style={{ color: colors.text }} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Date footer: ‹ 08-Mon › with n/N beneath */}
          <div style={{ padding: '4px 6px 5px', borderTop: '1px solid #e5e7eb', marginTop: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <FooterArrow
                dir="prev"
                disabled={safeShownIdx === 0}
                onClick={() => setShownIdx((i) => Math.max(0, i - 1))}
              />
              <span style={{ fontSize: 'calc(11px * var(--pz))', fontWeight: 600, color: 'var(--brand-deep)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {formatInstanceDate(dates[shown.dayIndex])}
              </span>
              <FooterArrow
                dir="next"
                disabled={safeShownIdx === instances.length - 1}
                onClick={() => setShownIdx((i) => Math.min(instances.length - 1, i + 1))}
              />
            </div>
            <div style={{ textAlign: 'center', fontSize: 'calc(11.5px * var(--pz))', fontWeight: 600, color: '#777777', userSelect: 'none' }}>
              {safeShownIdx + 1}/{instances.length}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MultiStatusDropdownCell;
