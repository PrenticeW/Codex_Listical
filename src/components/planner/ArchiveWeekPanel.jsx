/**
 * ArchiveWeekPanel — Archive Week detail view content.
 *
 * Exports ArchiveWeekContent: the read-only detail slide shown when an
 * Archive week row is selected in the System table. SystemPanel owns the
 * panel shell and the outer slide (same pattern as TaskRowPanel's
 * TaskDetailContent).
 *
 * Built from the design handoff (05_ARCHIVE_WEEK_PANEL.md,
 * reference/ArchiveWeekPanelUI.jsx) on the shared bento-card treatment.
 * All colours come from the --th-* / shared CSS variables in src/index.css —
 * no hardcoded palette (the spec's hexes are the blue family's defaults).
 *
 * Delta column = current week − previous week (NOT vs quota — that variant
 * is deferred, see docs/known-issues.md). Projects with no frozen quota
 * (archivedWeeklyQuota null) render '—'.
 */

import React, { useState } from 'react';
import PanelLockButton from '../PanelLockButton';
import usePanelWidth from '../../hooks/usePanelWidth';
import { TASK_ROW_DETAIL_EVENT } from '../../contexts/TaskRowPanelContext';

// ─── Design tokens (match GearPanel/SystemPanel/TaskRowPanel) ────────────────

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace";

const C = {
  ink: 'var(--ink)',
  inkSoft: 'var(--ink-soft)',
  inkMute: 'var(--ink-mute)',
  inkFaint: 'var(--ink-faint)',
  line: 'var(--line)',
  border: '#e8e8e4',
};

const BENTO_CARD = {
  background: '#FFFFFF',
  borderRadius: 12,
  padding: '15px 16px',
  margin: '0 11px 7px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
};

// Wheel ramp + darkened label ramp — theme variables, per family (index.css).
const RAMP = [
  'var(--th-wheel-1)',
  'var(--th-wheel-2)',
  'var(--th-wheel-3)',
  'var(--th-wheel-4)',
];
const LABEL_RAMP = [
  'var(--th-wheel-label-1)',
  'var(--th-wheel-label-2)',
  'var(--th-wheel-label-3)',
  'var(--th-wheel-label-4)',
];
const UNASSIGNED = 'var(--th-wheel-unassigned)';
const DELTA_POS = 'var(--th-delta-pos)';
const DELTA_NEG = 'var(--th-delta-neg)';

// ─── Formatting ──────────────────────────────────────────────────────────────

// Decimal hours → explicit "7h 05m" (0 minutes → "7h", under an hour → "45m").
function fmtH(v) {
  if (v == null) return '—';
  const m = Math.round(v * 60);
  const h = Math.floor(m / 60), mm = m % 60;
  if (h === 0 && mm === 0) return '0h';
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${String(mm).padStart(2, '0')}m`;
}

// ─── Back button (same pill as TaskRowPanel) ─────────────────────────────────

function BackBtn({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ padding: '16px 18px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 11px',
          background: hovered ? 'var(--brand-tint)' : '#ffffff',
          border: `1px solid ${hovered ? 'var(--brand)' : C.border}`,
          borderRadius: 8,
          boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
          cursor: 'pointer',
          color: hovered ? 'var(--brand-deep)' : 'var(--ink-mute)',
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          transition: 'all 0.15s',
        }}
      >
        <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
          <path d="M4.5 1L1 4.5l3.5 3.5" stroke="var(--brand-deep)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>
      <PanelLockButton />
    </div>
  );
}

function SectionLabel({ children, scale = 1 }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 9 * scale, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--brand-ink)',
      paddingBottom: 9, borderBottom: '1px solid var(--brand-bd)',
      marginBottom: 11,
    }}>
      {children}
    </div>
  );
}

// ─── Week pager chevron — bordered button with hover/press states ────────────

function PagerBtn({ dir, disabled, onClick }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  return (
    <button
      onClick={() => !disabled && onClick && onClick()}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous week' : 'Next week'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        width: 24, height: 24, borderRadius: 6,
        border: `1px solid ${!disabled && hover ? 'var(--brand-ink)' : C.line}`,
        background: disabled ? '#fff' : press ? 'var(--brand-ink)' : hover ? 'var(--brand-hover-bg)' : '#fff',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: 15, lineHeight: 1, paddingBottom: 2,
        color: disabled ? C.inkFaint : press ? '#fff' : 'var(--brand-ink)',
        transform: press ? 'scale(0.92)' : 'none',
        transition: 'background 120ms, border-color 120ms, color 120ms, transform 80ms',
      }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

// ─── Areas / Projects toggle pill ────────────────────────────────────────────

function WheelToggle({ mode, setMode }) {
  const btn = (key, label) => (
    <button
      key={key}
      onClick={() => setMode(key)}
      style={{
        border: 'none', cursor: 'pointer', borderRadius: 5, padding: '3px 9px',
        fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em',
        textTransform: 'uppercase',
        background: mode === key ? 'var(--brand-ink)' : 'transparent',
        color: mode === key ? '#fff' : C.inkMute,
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{
      display: 'flex', gap: 2, borderRadius: 7, padding: 2,
      background: 'color-mix(in srgb, var(--th-68) 12%, transparent)',
    }}>
      {btn('areas', 'Areas')}
      {btn('projects', 'Projects')}
    </div>
  );
}

// ─── Wheel — segmented ring with leader-tick labels ──────────────────────────
// items = [{ name, hours, color?, labelColor?, unassigned? }]; items without
// a colour get the theme blue ramp.

function AreaWheel({ items, total, range, scale = 1 }) {
  const CX = 135, CY = 96, R = 56, W = 9;
  const H = 192;
  const sum = items.reduce((s, a) => s + a.hours, 0);
  const pt = (ang) => [CX + R * Math.sin(ang), CY - R * Math.cos(ang)];
  const PAD = 0.09; // angular gap either side of each segment (radians)

  let acc = 0, ci = 0;
  const segs = items.filter((a) => a.hours > 0).map((a) => {
    const a0 = (acc / sum) * Math.PI * 2;
    acc += a.hours;
    const a1 = (acc / sum) * Math.PI * 2;
    const idx = ci;
    const color = a.color || (a.unassigned ? UNASSIGNED : RAMP[ci++ % RAMP.length]);
    const labelColor = a.labelColor || a.color || (a.unassigned ? C.inkFaint : LABEL_RAMP[idx % LABEL_RAMP.length]);
    return {
      a0: a0 + PAD, a1: Math.max(a0 + PAD, a1 - PAD), color, labelColor,
      mid: (a0 + a1) / 2, name: a.name, hours: a.hours,
    };
  });

  const arc = (a0, a1) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };

  return (
    <svg viewBox={`0 0 270 ${H}`} style={{ display: 'block', width: '100%', maxWidth: 270 * scale, height: 'auto', overflow: 'visible' }}>
      {segs.map((s, i) => (
        <path key={i} d={arc(s.a0, s.a1)} fill="none" stroke={s.color} strokeWidth={W} strokeLinecap="round" />
      ))}
      {segs.map((s, i) => {
        const LR = R + 15;
        const lx = CX + LR * Math.sin(s.mid), ly = CY - LR * Math.cos(s.mid);
        const cos = Math.cos(s.mid), sin = Math.sin(s.mid);
        const anchor = Math.abs(sin) < 0.35 ? 'middle' : sin > 0 ? 'start' : 'end';
        const baseY = ly + (cos > 0.35 ? -10 : cos < -0.35 ? 6 : -3);
        const words = s.name.toUpperCase().split(' ');
        const lines = words.length > 1 && s.name.length > 9
          ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
          : [s.name.toUpperCase()];
        const nameY = lines.length > 1 ? baseY - 10 : baseY;
        const t0 = R + W / 2 + 2, t1 = R + 10;
        return (
          <g key={'l' + i}>
            <line x1={CX + t0 * sin} y1={CY - t0 * cos} x2={CX + t1 * sin} y2={CY - t1 * cos}
              stroke={s.color} strokeWidth="1.4" />
            <text x={lx} y={nameY} textAnchor={anchor}
              style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 600, letterSpacing: '.1em', fill: s.labelColor }}>
              {lines.map((ln, li) => (
                <tspan key={li} x={lx} dy={li === 0 ? 0 : 10}>{ln}</tspan>
              ))}
            </text>
            <text x={lx} y={baseY + 11} textAnchor={anchor}
              style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 600, fill: C.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
              {fmtH(s.hours)} · {Math.round((s.hours / sum) * 100)}%
            </text>
          </g>
        );
      })}
      <text x={CX} y={CY - 2} textAnchor="middle"
        style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, fill: C.ink, fontVariantNumeric: 'tabular-nums' }}>
        {fmtH(total)}
      </text>
      <text x={CX} y={CY + 12} textAnchor="middle"
        style={{ fontFamily: FONT, fontSize: 9, fontWeight: 500, fill: C.inkMute, fontVariantNumeric: 'tabular-nums' }}>
        {range ? `of ${fmtH(range[0])} – ${fmtH(range[1])}` : 'hrs'}
      </text>
    </svg>
  );
}

// ─── Comparison card pieces ──────────────────────────────────────────────────

function ColHead({ lastLabel, thisLabel, scale = 1 }) {
  const cell = (txt) => (
    <span key={txt} style={{
      width: 52 * scale, textAlign: 'center', fontSize: 8.5 * scale, fontWeight: 600,
      letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkFaint,
      fontFamily: MONO, lineHeight: 1.3,
    }}>{txt}</span>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      gap: 6, paddingBottom: 7, borderBottom: `1px solid ${C.line}`, marginBottom: 2,
    }}>
      {cell(lastLabel)}{cell('+/−')}{cell(thisLabel)}
    </div>
  );
}

// One project row: colour chip + three tabular hour cells. Delta compares
// this week to last week; no frozen quota (unplanned project) → '—'.
function ProjectRow({ name, color, last, current, quota, isLast, scale = 1 }) {
  const d = (quota == null || last == null || current == null)
    ? null
    : Math.round((current - last) * 60) / 60; // whole-minute delta
  const trendColor = d == null ? C.inkFaint : d > 0 ? DELTA_POS : d < 0 ? DELTA_NEG : C.inkMute;
  const cell = (v, emph) => (
    <span style={{
      width: 52 * scale, textAlign: 'center', fontSize: 12.5 * scale,
      fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
      color: v == null ? C.inkFaint : emph ? C.ink : C.inkMute,
      fontWeight: emph && v != null ? 700 : 500,
    }}>
      {fmtH(v)}
    </span>
  );
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0',
      borderBottom: isLast ? 'none' : `1px solid ${C.line}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'inline-block', width: 108 * scale, background: color, color: '#fff',
          fontWeight: 700, fontSize: 9.5 * scale, letterSpacing: '.03em', textTransform: 'uppercase',
          fontFamily: FONT, borderRadius: 4, padding: '3px 7px', whiteSpace: 'nowrap',
          textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box',
        }}>{name}</span>
      </div>
      {cell(last)}
      <span style={{
        width: 52 * scale, textAlign: 'center', fontSize: 12.5 * scale, fontFamily: FONT,
        fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: trendColor,
      }}>
        {d == null ? '—' : d === 0 ? '0' : `${d > 0 ? '+' : '−'}${fmtH(Math.abs(d))}`}
      </span>
      {cell(current, true)}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * ArchiveWeekContent
 * Props:
 *   week — payload from buildArchiveWeekPanelData (may be null for one frame
 *          while the page computes it after selection)
 *   onBack — return to the top System panel view
 */
export function ArchiveWeekContent({ week, onBack }) {
  // Toggle state persists across week changes (component stays mounted while
  // the pager re-selects adjacent archive rows).
  const [wheelMode, setWheelMode] = useState('areas');

  // Responsive scale: 1 at the 320px default panel width, growing to ~1.4
  // at the 600px maximum. The archive pane is exactly as wide as the panel
  // (50% of SystemPanel's 200% slide track), so the shared panel width is
  // the right thing to key off.
  const { width: panelWidth } = usePanelWidth();
  const scale = Math.min(Math.max(panelWidth / 320, 1), 1.4);

  const selectWeek = (row) => {
    if (!row) return;
    // `force`: the pager is an explicit panel action, so it bypasses the panel lock
    window.dispatchEvent(new CustomEvent(TASK_ROW_DETAIL_EVENT, { detail: { task: row, force: true } }));
  };

  if (!week) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn onClick={onBack} />
      </div>
    );
  }

  const weekTotal = week.projects.reduce((s, p) => s + (p.current || 0), 0);
  const wheelItems = wheelMode === 'areas'
    ? week.areas
    : week.projects.filter((p) => p.current > 0).map((p) => ({ name: p.name, hours: p.current, color: p.color }));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackBtn onClick={onBack} />
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ paddingBottom: 24 }}>

          <div style={BENTO_CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px 0' }}>
              <PagerBtn dir="prev" disabled={week.isFirstWeek} onClick={() => selectWeek(week.prevRow)} />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 12 * scale, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: 'var(--brand-ink)', fontFamily: MONO,
                }}>{week.label}</div>
                {week.range && (
                  <div style={{ fontSize: 10 * scale, color: C.inkMute, fontFamily: MONO, marginTop: 6 }}>{week.range}</div>
                )}
                {week.nameLines.map((line, i) => (
                  <div key={i} style={{ fontSize: 10.5 * scale, color: C.inkSoft, fontStyle: 'italic', fontFamily: FONT, marginTop: 5 }}>
                    {line}
                  </div>
                ))}
              </div>
              <PagerBtn dir="next" disabled={week.isLatestWeek} onClick={() => selectWeek(week.nextRow)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 20px' }}>
              <WheelToggle mode={wheelMode} setMode={setWheelMode} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
              <AreaWheel items={wheelItems} total={weekTotal} range={week.quotaRange} scale={scale} />
            </div>
          </div>

          <div style={{ ...BENTO_CARD, marginBottom: 0 }}>
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <SectionLabel scale={scale}>Comparison</SectionLabel>
            </div>
            <ColHead lastLabel={week.lastLabel} thisLabel={week.thisLabel} scale={scale} />
            {week.projects.map((p, i) => (
              <ProjectRow key={i} {...p} scale={scale} isLast={i === week.projects.length - 1} />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

export default ArchiveWeekContent;
