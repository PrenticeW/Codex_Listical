import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * CalendarPopup — custom month-calendar picker (web port of the mobile
 * CalendarPopup in tacular-mobile screens/SystemScreen.js).
 *
 * Replaces native <input type="date"> popups so the calendar matches the
 * app's design system instead of the browser's. Anchored to a trigger
 * element via a portal; closes on outside click or Escape.
 *
 * Values in and out are plain `yyyy-mm-dd` strings (same contract as the
 * native date inputs it replaces), interpreted as local dates.
 *
 * Props:
 *   isOpen        — controlled visibility
 *   anchorRef     — ref to the trigger element (positioning)
 *   value         — 'yyyy-mm-dd' or '' / null
 *   onSelect      — (dateStr) => void; called on day pick (also closes)
 *   onClose       — () => void
 *   onClear       — optional; shows a Clear action in the footer
 *   minDate/maxDate — optional 'yyyy-mm-dd' bounds (inclusive)
 *   weekStartsOn  — 0 = Sunday … 6 = Saturday (default 1, Monday)
 *   footerText    — optional string; defaults to the selected date label
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const toStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromStr = (s) => {
  if (!s || typeof s !== 'string') return null;
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const sameDate = (a, b) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const MONO = "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace";
// Default / minimum panel width; the popup matches the anchor's width when
// the anchor is wider (so it tracks a resizable host panel, like the gear
// panel's blocks do).
const PANEL_MIN_W = 260;
const PANEL_DEFAULT_W = 302;

export default function CalendarPopup({
  isOpen,
  anchorRef,
  value,
  onSelect,
  onClose,
  onClear,
  minDate,
  maxDate,
  weekStartsOn = 1,
  footerText,
}) {
  const selectedDate = fromStr(value);
  const min = fromStr(minDate);
  const max = fromStr(maxDate);
  const panelRef = useRef(null);
  const [cursor, setCursor] = useState(null); // { y, m } month being viewed
  const [pos, setPos] = useState({ top: 0, left: 0, width: PANEL_DEFAULT_W, zoom: 1 });

  // Reset the viewed month to the selection (or today) each time it opens.
  useEffect(() => {
    if (isOpen) {
      const base = selectedDate || new Date();
      setCursor({ y: base.getFullYear(), m: base.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Position against the anchor; flip above when there's no room below.
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) return;
    const measure = () => {
      const el = anchorRef.current;
      const rect = el.getBoundingClientRect();
      // Hosts like PanelShell scale their content with CSS zoom; the portal
      // renders outside that wrapper, so recover the anchor's effective zoom
      // (rect is zoomed px, offsetWidth is layout px) and apply it to the
      // popup so its text scales with the panel like the other elements.
      const zoom = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
      const width = Math.max(PANEL_MIN_W, Math.min(el.offsetWidth || rect.width, (window.innerWidth - 16) / zoom));
      const estH = 330 * zoom;
      const fitsBelow = rect.bottom + estH < window.innerHeight - 8;
      setPos({
        top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - estH - 6),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width * zoom - 8),
        width,
        zoom,
      });
    };
    measure();
    // Track the anchor while open so the popup follows a host panel resize.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(anchorRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isOpen, anchorRef]);

  // Outside click + Escape close.
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        !(anchorRef?.current && anchorRef.current.contains(e.target))
      ) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen || !cursor) return null;

  const monthStart = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const leadingBlanks = (monthStart.getDay() - weekStartsOn + 7) % 7;
  const cells = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.y, cursor.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthKey = cursor.y * 12 + cursor.m;
  const today = new Date();
  const canPrev = !min || monthKey > min.getFullYear() * 12 + min.getMonth();
  const canNext = !max || monthKey < max.getFullYear() * 12 + max.getMonth();
  const shiftMonth = (delta) =>
    setCursor(({ y, m }) => {
      const k = y * 12 + m + delta;
      return { y: Math.floor(k / 12), m: ((k % 12) + 12) % 12 };
    });

  const dowLabels = Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(weekStartsOn + i) % 7]);
  const footer = footerText != null
    ? footerText
    : selectedDate
      ? `${DAY_NAMES[selectedDate.getDay()]} ${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`
      : 'No date set';

  const navBtn = (enabled) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, padding: 0,
    background: 'none', border: 'none', borderRadius: 6,
    cursor: enabled ? 'pointer' : 'default',
  });

  return createPortal(
    <div
      ref={panelRef}
      // Marker for ancestor outside-click handlers (menus/panels close on
      // clicks outside their own DOM subtree; the portal panel lives in
      // document.body, so they must whitelist it via this attribute).
      data-calendar-popup=""
      // React portals bubble synthetic events to the React-tree parent (e.g.
      // a toggling trigger <label>) — stop them so panel clicks stay internal.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        // CSS zoom multiplies every length on the element, including the
        // fixed-position offsets — divide them back out so the popup lands
        // at the intended viewport coordinates.
        top: pos.top / pos.zoom,
        left: pos.left / pos.zoom,
        width: pos.width,
        zoom: pos.zoom,
        background: '#ffffff',
        border: '1px solid #e8e8e4',
        borderRadius: 14,
        padding: '8px 12px 10px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.22)',
        // Above PanelShell overlays (zIndex 99994) — the gear panel hosts
        // the Cycle start trigger, so the calendar must render over it.
        zIndex: 100000,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header — month/year with prev/next */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 6px' }}>
        <button type="button" style={navBtn(canPrev)} disabled={!canPrev} onClick={() => canPrev && shiftMonth(-1)}>
          <ChevronLeft size={16} strokeWidth={2} style={{ color: canPrev ? 'var(--brand-deep)' : '#C8C4B8' }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-deep)' }}>
          {`${MONTHS[cursor.m]} ${cursor.y}`}
        </span>
        <button type="button" style={navBtn(canNext)} disabled={!canNext} onClick={() => canNext && shiftMonth(1)}>
          <ChevronRight size={16} strokeWidth={2} style={{ color: canNext ? 'var(--brand-deep)' : '#C8C4B8' }} />
        </button>
      </div>

      {/* Day-of-week row */}
      <div style={{ display: 'flex', paddingBottom: 2 }}>
        {dowLabels.map((d, i) => (
          <span
            key={i}
            style={{
              flex: 1, textAlign: 'center', fontFamily: MONO,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.5px',
              color: '#8BA8D8', textTransform: 'uppercase', userSelect: 'none',
            }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'flex' }}>
          {week.map((date, di) => {
            if (!date) return <span key={di} style={{ flex: 1, height: 36 }} />;
            const inRange = (!min || date >= min) && (!max || date <= max);
            const selected = sameDate(date, selectedDate);
            const isToday = sameDate(date, today);
            return (
              <span key={di} style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  type="button"
                  disabled={!inRange}
                  onClick={() => { onSelect(toStr(date)); onClose(); }}
                  style={{
                    width: 30, height: 30, borderRadius: 15, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selected ? 'var(--brand-deep)' : 'transparent',
                    border: isToday && !selected ? '1.5px solid var(--brand)' : 'none',
                    cursor: inRange ? 'pointer' : 'default',
                    fontSize: 12,
                    fontWeight: selected ? 600 : 500,
                    fontFamily: 'inherit',
                    color: selected ? '#FFFFFF' : !inRange ? '#C8C4B8' : '#3A3A3A',
                  }}
                >
                  {date.getDate()}
                </button>
              </span>
            );
          })}
        </div>
      ))}

      {/* Footer — selected-date label (+ optional Clear) */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderTop: '1px solid rgba(130,155,210,0.25)',
          marginTop: 6, paddingTop: 8, paddingLeft: 4, paddingRight: 4,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, color: '#6B6660', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {footer}
        </span>
        {onClear && (
          <button
            type="button"
            onClick={() => { onClear(); onClose(); }}
            style={{
              background: 'none', border: 'none', padding: '0 0 0 8px',
              fontSize: 11, fontWeight: 600, color: '#C0392B', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
