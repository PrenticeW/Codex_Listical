/**
 * GoalPanel
 *
 * Page-level action panel for the Goal page, opened by the list icon in
 * NavigationBar. Fixed right-side overlay, 320 px wide.
 *
 * Sections:
 *   - Goal  (colour, nickname, subprojects, plan toggle, archive)
 *   - Page  (undo/redo, zoom)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import PanelShell from './PanelShell';
import { useGoalPanel } from '../contexts/GoalPanelContext';
import { useYear } from '../contexts/YearContext';
import usePageSize from '../hooks/usePageSize';
import { PALETTE } from '../utils/staging/projectColour';

// Action event — consumed by StagingPageV2
export const GOAL_PANEL_ACTION_EVENT = 'goal-panel-action';
// State event — fired by StagingPageV2 when undo/redo availability changes
export const GOAL_PANEL_STATE_EVENT = 'goal-panel-state';
// Selection event — fired by StagingPageV2 when the selected goal changes
export const GOAL_PANEL_SELECTION_EVENT = 'goal-panel-selection';
// Row selection event — fired by StagingPageV2 when a table row/cell is selected
export const GOAL_PANEL_ROW_SELECTION_EVENT = 'goal-panel-row-selection';

function dispatchGoalAction(action, payload = {}) {
  window.dispatchEvent(new CustomEvent(GOAL_PANEL_ACTION_EVENT, { detail: { action, ...payload } }));
}

// ─── Design tokens (match SystemPanel / GearPanel) ────────────────────────────

const C = {
  bg:          '#fff',
  border:      '#e8e8e4',
  borderLight: '#f0f0ed',
  text:        '#1a1a1a',
  textDim:     '#555',
  textFaint:   '#999',
  textLight:   '#bbb',
  green:       'var(--brand-deep)',
  greenDark:   'var(--brand-ink)',
  greenBg:     'var(--brand-tint)',
  greenBorder: 'var(--brand-bd)',
};

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const BENTO_CARD = {
  background: '#FFFFFF',
  borderRadius: 12,
  padding: '15px 16px',
  margin: '0 11px 7px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--brand-ink)',
      marginBottom: 14,
      borderBottom: '1px solid var(--brand-bd)',
      paddingBottom: 6,
    }}>
      {children}
    </div>
  );
}

// Flash checkmark badge — active when action is staged/confirmed
function ConfirmBadge({ active }) {
  return (
    <span style={{
      opacity: active ? 1 : 0,
      transform: active ? 'scale(1)' : 'scale(0.7)',
      transition: 'opacity 0.2s, transform 0.2s',
      width: 40, height: 24,
      background: 'var(--brand-deep)',
      borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, pointerEvents: 'none',
    }}>
      <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

function ActionBtn({ icon, label, disabled, onClick, danger, hoverIcon, hoverLabel, hoverDanger, rightSlot, style }) {
  const [hovered, setHovered] = useState(false);
  // hoverDanger: button looks neutral at rest but previews a destructive
  // action on hover (e.g. "Added to Plan" → "Remove from Plan")
  const isDanger = danger || hoverDanger;
  const hoverColor = isDanger ? '#c0392b' : C.green;
  const hoverBorder = isDanger ? '#fca5a5' : C.green;
  const hoverBg = isDanger ? '#fef2f2' : 'var(--brand-hover-bg)';
  const showHoverContent = hovered && !disabled;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%',
        background: hovered && !disabled ? hoverBg : 'transparent',
        border: `1px solid ${hovered && !disabled ? hoverBorder : C.border}`,
        borderRadius: 10,
        padding: '12px 16px',
        fontFamily: FONT, fontSize: 14, fontWeight: 400,
        color: disabled ? C.textFaint : (hovered ? hoverColor : C.textDim),
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        opacity: disabled ? 0.45 : 1,
        marginBottom: 8,
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showHoverContent && hoverIcon ? hoverIcon : icon}
        {showHoverContent && hoverLabel ? hoverLabel : label}
      </span>
      {rightSlot}
    </button>
  );
}

// Two-step destructive button: first click arms it ("Confirm ..."), second
// click fires. Disarms automatically after 3s if the user doesn't confirm.
function ConfirmActionBtn({ icon, label, confirmLabel, onConfirm, style }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <ActionBtn
      icon={icon}
      label={armed ? confirmLabel : label}
      danger
      rightSlot={<ConfirmBadge active={armed} />}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      style={{
        ...(armed ? {
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          color: '#c0392b',
        } : {}),
        ...style,
      }}
    />
  );
}

function ButtonPair({ left, right }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      {[left, right].map((btn, i) => (
        <button
          key={i}
          onClick={btn.onClick}
          disabled={btn.disabled}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '12px 16px', fontFamily: FONT, fontSize: 14, fontWeight: 400,
            color: btn.disabled ? C.textFaint : C.textDim,
            cursor: btn.disabled ? 'not-allowed' : 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
            opacity: btn.disabled ? 0.45 : 1,
          }}
          onMouseEnter={e => {
            if (!btn.disabled) {
              e.currentTarget.style.borderColor = C.green;
              e.currentTarget.style.color = C.green;
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.color = btn.disabled ? C.textFaint : C.textDim;
          }}
        >
          {btn.icon}
          {btn.label}
        </button>
      ))}
    </div>
  );
}

function StepBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18, fontWeight: 300, color: disabled ? C.textFaint : C.textDim,
        background: '#fafaf8', border: 'none',
        transition: 'background 0.1s, color 0.1s',
        padding: 0, lineHeight: 1, fontFamily: FONT,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.borderLight; e.currentTarget.style.color = C.text; } }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.color = disabled ? C.textFaint : C.textDim; }}
    >
      {children}
    </button>
  );
}

function StepperRow({ icon, label, value, onDecrease, onIncrease, decreaseDisabled, increaseDisabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px',
    }}>
      <span style={{ fontFamily: FONT, fontSize: 14, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <StepBtn onClick={onDecrease} disabled={decreaseDisabled}>−</StepBtn>
        <span style={{
          minWidth: 38, textAlign: 'center', fontSize: 14, fontWeight: 500, color: C.text,
          borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
          lineHeight: '28px',
        }}>
          {value}
        </span>
        <StepBtn onClick={onIncrease} disabled={increaseDisabled}>+</StepBtn>
      </div>
    </div>
  );
}

// ─── Inline field row (label left, control right) ─────────────────────────────

function FieldRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      marginBottom: 10,
    }}>
      <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── Colour picker sub-view ───────────────────────────────────────────────────

// 8 named colour groups — each group has hue families, each family has 6 shades
// as [h, s, l] arrays from light (L76) to dark (L36).
const JUNE_GROUPS = [
  { label: 'Purples & Pinks', families: [
    { name: 'purple',     shades: [[272,72,76],[272,72,68],[272,72,60],[272,72,52],[272,72,44],[272,72,36]] },
    { name: 'plum',       shades: [[290,56,76],[290,58,68],[290,60,60],[290,62,52],[290,64,44],[290,66,36]] },
    { name: 'pink',       shades: [[326,72,76],[326,72,68],[326,72,60],[326,72,52],[326,72,44],[326,72,36]] },
  ]},
  { label: 'Reds', families: [
    { name: 'rose',       shades: [[348,77,76],[348,74,68],[348,70,60],[348,64,52],[348,59,44],[348,54,36]] },
    { name: 'red',        shades: [[2,72,76],[2,72,68],[2,72,60],[2,72,52],[2,72,44],[2,72,36]] },
    { name: 'scarlet',    shades: [[12,77,76],[12,72,68],[12,68,60],[12,62,52],[12,57,44],[12,52,36]] },
  ]},
  { label: 'Oranges', families: [
    { name: 'tangerine',  shades: [[22,100,76],[22,100,68],[22,100,60],[22,100,52],[22,100,44],[22,100,36]] },
    { name: 'orange',     shades: [[28,90,76],[28,90,68],[28,90,60],[28,90,52],[28,90,44],[28,90,36]] },
    { name: 'amber',      shades: [[36,80,76],[36,80,68],[36,80,60],[36,80,52],[36,80,44],[36,80,36]] },
  ]},
  { label: 'Yellows', families: [
    { name: 'gold',       shades: [[54,85,76],[54,85,68],[54,85,60],[54,85,52],[54,85,44],[54,85,36]] },
    { name: 'yellow',     shades: [[58,90,76],[58,90,68],[58,90,60],[58,90,52],[58,90,44],[58,90,36]] },
    { name: 'chartreuse', shades: [[62,85,76],[62,85,68],[62,85,60],[62,85,52],[62,85,44],[62,85,36]] },
  ]},
  { label: 'Greens', families: [
    { name: 'lime',       shades: [[82,72,76],[82,72,68],[82,72,60],[82,72,52],[82,72,44],[82,72,36]] },
    { name: 'green',      shades: [[110,72,76],[110,72,68],[110,72,60],[110,72,52],[110,72,44],[110,72,36]] },
    { name: 'sage',       shades: [[155,34,76],[155,42,68],[155,50,60],[155,58,52],[155,66,44],[155,74,36]] },
  ]},
  { label: 'Teals & Aquas', families: [
    { name: 'teal',       shades: [[173,57,76],[173,60,68],[173,62,60],[173,65,52],[173,68,44],[173,71,36]] },
    { name: 'aqua',       shades: [[188,34,76],[188,42,68],[188,50,60],[188,58,52],[188,66,44],[188,74,36]] },
    { name: 'sky',        shades: [[200,72,76],[200,72,68],[200,72,60],[200,72,52],[200,72,44],[200,72,36]] },
  ]},
  { label: 'Blues & Indigos', families: [
    { name: 'blue',       shades: [[217,56,76],[217,58,68],[217,60,60],[217,62,52],[217,64,44],[217,66,36]] },
    { name: 'cobalt',     shades: [[232,34,76],[232,42,68],[232,50,60],[232,58,52],[232,66,44],[232,74,36]] },
    { name: 'indigo',     shades: [[252,72,76],[252,72,68],[252,72,60],[252,72,52],[252,72,44],[252,72,36]] },
  ]},
  { label: 'Neutrals', families: [
    { name: 'neutral',    shades: [[0,0,100],[0,0,96],[0,0,72],[0,0,44],[0,0,25],[0,0,6]] },
  ]},
];

// hsl string from [h, s, l] array
function hslStr([h, s, l]) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Active check: compare [h,s,l] array against a stored hsl() string
function isActiveEntry([h, s, l], value) {
  if (!value) return false;
  const m = value.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/i);
  if (!m) return false;
  return Math.abs(h - +m[1]) < 1 && Math.abs(s - +m[2]) < 2 && Math.abs(l - +m[3]) < 2;
}

const EYEDROPPER_SUPPORTED = typeof window !== 'undefined' && 'EyeDropper' in window;
const MONO_FONT = "'DM Sans Mono', 'Roboto Mono', 'Courier New', monospace";

// ─── HSB canvas colour picker ─────────────────────────────────────────────────
function ColourPicker({ currentColor, onSelect, onConfirm }) {
  const [h, setH]       = useState(0);
  const [s, setS]       = useState(1);
  const [br, setBr]     = useState(1);
  const [hexVal, setHexVal] = useState('');
  const sbRef  = useRef(null);
  const hueRef = useRef(null);

  const hsbToRgb = (hh, ss, bb) => {
    const i = Math.floor(hh / 60) % 6, f = hh / 60 - Math.floor(hh / 60);
    const p = bb * (1 - ss), q = bb * (1 - f * ss), t = bb * (1 - (1 - f) * ss);
    return [[bb,t,p],[q,bb,p],[p,bb,t],[p,q,bb],[t,p,bb],[bb,p,q]][i].map(v => Math.round(v * 255));
  };
  const toHex    = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const hexToRgb = hex => {
    const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? m.slice(1).map(v => parseInt(v, 16)) : null;
  };
  const rgbToHsb = (r, g, b) => {
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), d = mx - mn;
    let hh = 0;
    if (d) {
      if (mx === rr) hh = 60 * (((gg - bb) / d) % 6);
      else if (mx === gg) hh = 60 * ((bb - rr) / d + 2);
      else hh = 60 * ((rr - gg) / d + 4);
    }
    return [((hh % 360) + 360) % 360, mx ? d / mx : 0, mx];
  };
  const parseToHex = str => {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = str;
      return c.fillStyle;
    } catch { return '#1a1a1a'; }
  };

  // Initialise from currentColor on mount
  useEffect(() => {
    const hex = parseToHex(currentColor || '#1a1a1a');
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const [hh, ss, bb] = rgbToHsb(...rgb);
    setH(hh); setS(ss); setBr(bb);
    setHexVal(hex.slice(1).toUpperCase());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw SB canvas when hue changes
  useEffect(() => {
    const canvas = sbRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width: w, height: ht } = canvas;
    ctx.fillStyle = `hsl(${h}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, ht);
    const wg = ctx.createLinearGradient(0, 0, w, 0);
    wg.addColorStop(0, 'rgba(255,255,255,1)');
    wg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, w, ht);
    const bg = ctx.createLinearGradient(0, 0, 0, ht);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, ht);
  }, [h]);

  const curHex = toHex(...hsbToRgb(h, s, br));

  const updateSB = e => {
    const rect = sbRef.current.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nb = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setS(ns); setBr(nb);
    const hex = toHex(...hsbToRgb(h, ns, nb));
    setHexVal(hex.slice(1).toUpperCase());
    onSelect(hex);
  };
  const updateHue = e => {
    const rect = hueRef.current.getBoundingClientRect();
    const nh = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    setH(nh);
    const hex = toHex(...hsbToRgb(nh, s, br));
    setHexVal(hex.slice(1).toUpperCase());
    onSelect(hex);
  };
  const applyHex = () => {
    const rgb = hexToRgb('#' + hexVal);
    if (!rgb) return;
    const [hh, ss, bb] = rgbToHsb(...rgb);
    setH(hh); setS(ss); setBr(bb);
    onSelect(toHex(...rgb));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {/* Saturation / brightness canvas */}
      <div
        style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateSB(e); }}
        onPointerMove={e => { if (e.buttons) updateSB(e); }}
      >
        <canvas ref={sbRef} width={232} height={120} style={{ display: 'block', width: '100%', height: 120 }} />
        {/* Crosshair */}
        <div style={{
          position: 'absolute',
          left: `${s * 100}%`, top: `${(1 - br) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: '50%',
          border: '2.5px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          pointerEvents: 'none', boxSizing: 'border-box',
          background: curHex,
        }} />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        style={{
          height: 12, borderRadius: 6, cursor: 'pointer', position: 'relative', touchAction: 'none',
          background: 'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)',
        }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); updateHue(e); }}
        onPointerMove={e => { if (e.buttons) updateHue(e); }}
      >
        <div style={{
          position: 'absolute',
          left: `${(h / 360) * 100}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 18, height: 18, borderRadius: '50%',
          background: `hsl(${h}, 100%, 50%)`,
          border: '2.5px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      </div>

      {/* Preview + hex input + confirm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0, background: curHex, border: '1px solid rgba(0,0,0,0.1)' }} />
        <div style={{
          display: 'flex', alignItems: 'center', flex: 1,
          border: `1px solid ${C.border}`, borderRadius: 6, height: 28, overflow: 'hidden',
        }}>
          <span style={{ padding: '0 4px 0 8px', fontFamily: MONO_FONT, fontSize: 12, color: C.textFaint, userSelect: 'none' }}>#</span>
          <input
            type="text"
            value={hexVal}
            onChange={e => setHexVal(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && applyHex()}
            onBlur={applyHex}
            maxLength={6}
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontFamily: MONO_FONT, fontSize: 12, color: C.text,
              background: 'transparent', padding: '0 8px 0 0', height: '100%',
            }}
          />
        </div>
        <button
          onClick={() => onConfirm && onConfirm(curHex)}
          style={{
            width: 28, height: 28, borderRadius: 5, flexShrink: 0,
            background: '#1a1a1a', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <svg width="11" height="9" viewBox="0 0 12 10" fill="none">
            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function BackButton({ onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 11px',
        background: hov ? C.greenBg : C.bg,
        border: `1px solid ${hov ? C.greenBorder : C.border}`,
        borderRadius: 8,
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
        cursor: 'pointer',
        color: hov ? C.greenDark : C.textDim,
        fontFamily: FONT, fontSize: 13, fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
        <path d="M4.5 1L1 4.5l3.5 3.5" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  );
}

function ColourView({ currentColor, onSelect, onBack, customColors = [], onAddCustomColor }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Swatch clicks apply immediately
  const handleSwatchSelect = (color) => { onSelect(color); };

  // Custom pick: apply immediately and save to custom list
  const handleCustomPick = (color) => {
    onSelect(color);
    onAddCustomColor?.(color);
  };

  const handleEyedropper = async () => {
    if (!EYEDROPPER_SUPPORTED) return;
    try {
      // eslint-disable-next-line no-undef
      const result = await new EyeDropper().open();
      handleCustomPick(result.sRGBHex);
    } catch { /* cancelled */ }
  };

  // Render a single family's 6 shades as a horizontal strip
  const renderFamilyRow = (shades, keyPrefix) => (
    <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
      {shades.map((hsl, idx) => {
        const bg = hslStr(hsl);
        const active = isActiveEntry(hsl, currentColor);
        const paleBorder = hsl[2] >= 95 ? { outline: '0.5px solid #ddd', outlineOffset: -1 } : {};
        return (
          <button
            key={`${keyPrefix}-${idx}`}
            onClick={() => handleSwatchSelect(bg)}
            style={{
              flex: 1, height: 14, borderRadius: 2, background: bg,
              border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
              transition: 'transform 0.1s',
              outline: active ? '2px solid rgba(0,0,0,0.35)' : 'none',
              outlineOffset: -1,
              ...paleBorder,
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Back button — bento card style */}
      <div style={{ padding: '16px 12px 8px', flexShrink: 0 }}>
        <BackButton onClick={onBack} />
      </div>

      {/* Palette sections — one card per JUNE_GROUPS entry */}
      {JUNE_GROUPS.map(({ label, families }) => (
        <div key={label} style={{ ...BENTO_CARD, margin: '8px 12px 0', padding: '10px 12px' }}>
          <div style={{
            fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
            fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-ink)',
            marginBottom: 2,
          }}>
            {label}
          </div>
          {families.map(({ name, shades }) => renderFamilyRow(shades, `${label}-${name}`))}
        </div>
      ))}

      {/* Custom */}
      <div style={{ ...BENTO_CARD, margin: '8px 12px 12px', padding: '10px 12px' }}>
        <div style={{
          fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-ink)',
          marginBottom: 6,
        }}>
          Custom
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {EYEDROPPER_SUPPORTED && (
            <button
              onClick={handleEyedropper}
              title="Pick from screen"
              style={{
                width: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f7f7f5', border: `1px solid ${C.border}`,
                cursor: 'pointer', color: C.textFaint,
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = '#f7f7f5'; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
              </svg>
            </button>
          )}
          <button
            title="Custom colour mixer"
            onClick={() => setPickerOpen(v => !v)}
            style={{
              width: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: pickerOpen ? C.borderLight : '#f7f7f5',
              border: `1px solid ${pickerOpen ? '#aaa' : C.border}`,
              cursor: 'pointer', color: pickerOpen ? C.text : C.textFaint,
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
            onMouseLeave={e => {
              if (!pickerOpen) {
                e.currentTarget.style.color = C.textFaint;
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.background = '#f7f7f5';
              }
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/>
              <path d="M20 23a2 2 0 001.4-3.4L16 14"/>
              <line x1="3.5" y1="11.5" x2="13" y2="2"/>
            </svg>
          </button>
          {customColors.map((color, i) => {
            const active = color === currentColor;
            const isVeryLight = color.startsWith('#fff') || color === '#ffffff';
            return (
              <button
                key={i}
                onClick={() => handleSwatchSelect(color)}
                title={color}
                style={{
                  width: 26, height: 26, borderRadius: 4,
                  background: color, cursor: 'pointer', padding: 0,
                  border: isVeryLight ? '0.5px solid #ccc' : 'none',
                  outline: active ? '2px solid rgba(0,0,0,0.35)' : 'none',
                  outlineOffset: -1,
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            );
          })}
        </div>
        {pickerOpen && (
          <ColourPicker
            currentColor={currentColor}
            onSelect={onSelect}
            onConfirm={c => { handleCustomPick(c); setPickerOpen(false); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Row section ──────────────────────────────────────────────────────────────
// Always visible in the Goal panel. Buttons grey out when no row is selected
// or when a header row is selected.

function RowSection({ row }) {
  // All buttons disabled when nothing selected or it's a grey header row
  const noSelection = !row;
  const isHeader = row?.rowType === 'header';
  const allDisabled = noSelection || isHeader;

  const deleteDisabled = allDisabled || row?.isFirstOfType;
  const totalsDisabled = allDisabled || !(row?.sectionType === 'Actions' && row?.rowType === 'prompt');
  const timesDisabled  = allDisabled || !(row?.sectionType === 'Actions' && row?.rowType === 'response');

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Row Actions</SectionLabel>

      <ActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        }
        label={row?.showActionTimes ? 'Hide Times' : 'Show Times'}
        disabled={timesDisabled}
        onClick={() => row && dispatchGoalAction('toggleActionTimes', { goalId: row.goalId })}
      />

      <ActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
          </svg>
        }
        label={row?.showOutcomeTotals ? 'Hide Totals' : 'Show Totals'}
        disabled={totalsDisabled}
        onClick={() => row && dispatchGoalAction('toggleTotals', { goalId: row.goalId })}
      />

      <ActionBtn
        danger={!deleteDisabled && !row?.isFirstOfType}
        disabled={deleteDisabled}
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        }
        label="Delete Row"
        onClick={() => row && dispatchGoalAction('deleteRow', { goalId: row.goalId, rowIdx: row.rowIdx })}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}

// ─── Goal section ─────────────────────────────────────────────────────────────

function GoalSection({ goal, onOpenColour }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  // Ref so onDrop always reads the current drag source index,
  // avoiding stale-closure issues with batched React state.
  const dragIdxRef = useRef(null);
  const { draftYear, currentYear } = useYear();
  const isDraftYearView = Boolean(draftYear && currentYear === draftYear.yearNumber);

  if (!goal) {
    return (
      <div style={BENTO_CARD}>
        <SectionLabel>Goal Info</SectionLabel>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.textFaint, fontStyle: 'italic' }}>
          Click a goal to select it
        </p>
      </div>
    );
  }

  // Same rule the old edit modal enforced: a nickname is required before a
  // goal can be added to the plan
  const nicknameMissing = !(goal.projectNickname || '').trim();

  const planBtn = goal.addedToPlan ? (
    <ActionBtn
      icon={
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <polyline points="9 16 11 18 15 14"/>
        </svg>
      }
      label="Added to Plan"
      hoverDanger
      hoverLabel="Remove from Plan"
      hoverIcon={
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/>
        </svg>
      }
      onClick={() => dispatchGoalAction('removeFromPlan', { goalId: goal.id })}
    />
  ) : (
    <ActionBtn
      icon={
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
        </svg>
      }
      label="Add to Plan"
      disabled={nicknameMissing}
      onClick={() => dispatchGoalAction('addToPlan', { goalId: goal.id })}
    />
  );

  return (
    <div>
    <div style={BENTO_CARD}>
      <SectionLabel>Goal Info</SectionLabel>

      {/* Colour */}
      <FieldRow label="Colour">
        <button
          onClick={onOpenColour}
          style={{
            width: 120, height: 28, borderRadius: 6,
            background: goal.color || '#c9daf8',
            border: '1px solid rgba(0,0,0,0.1)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        />
      </FieldRow>

      {/* Nickname */}
      <FieldRow label="Nickname">
        <input
          type="text"
          value={goal.projectNickname || ''}
          onChange={e => dispatchGoalAction('setNickname', { goalId: goal.id, nickname: e.target.value.toUpperCase() })}
          placeholder="e.g. TOUR"
          style={{
            width: 120, height: 28, flexShrink: 0,
            border: `1px solid ${nicknameMissing ? '#fca5a5' : C.border}`, borderRadius: 8,
            background: nicknameMissing ? '#fef2f2' : 'none',
            padding: '0 10px', fontFamily: FONT, fontSize: 13,
            color: C.text, textTransform: 'uppercase',
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = nicknameMissing ? '#fca5a5' : '#aaa'}
          onBlur={e => e.target.style.borderColor = nicknameMissing ? '#fca5a5' : C.border}
        />
      </FieldRow>
      {nicknameMissing && !goal.addedToPlan && (
        <p style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 500, color: '#c0392b',
          margin: '-6px 0 12px', textAlign: 'right',
        }}>
          A nickname is required to add to plan
        </p>
      )}

      {/* Subprojects */}
      <FieldRow label="Subprojects">
        <input
          type="text"
          placeholder="Add subproject"
          style={{
            width: 120, height: 28, flexShrink: 0,
            border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '0 10px', fontFamily: FONT, fontSize: 13,
            color: C.text, outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = '#aaa'}
          onBlur={e => e.target.style.borderColor = C.border}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.target.value.trim()) {
              dispatchGoalAction('addSubproject', { goalId: goal.id, name: e.target.value.trim() });
              e.target.value = '';
            }
          }}
        />
      </FieldRow>

      {/* Subproject chips */}
      {(goal.subprojects || []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 12, alignItems: 'flex-end' }}>
          {(goal.subprojects || []).map((sub, i) => (
            <div key={i} style={{ width: 120 }}>
              {/* Drop line above this chip */}
              {dropIdx === i && dragIdx !== i && dragIdx !== i - 1 && (
                <div style={{ height: 2, background: '#3b82f6', borderRadius: 1, margin: '1px 0' }} />
              )}
              <span
                draggable
                onDragStart={() => { dragIdxRef.current = i; setDragIdx(i); }}
                onDragOver={e => {
                  e.preventDefault();
                  // Top half → insert before this chip; bottom half → insert after
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > rect.top + rect.height / 2;
                  setDropIdx(after ? i + 1 : i);
                }}
                onDrop={e => {
                  e.preventDefault();
                  const from = dragIdxRef.current;
                  const to = dropIdx; // captured from state — set by onDragOver
                  dragIdxRef.current = null;
                  setDragIdx(null);
                  setDropIdx(null);
                  if (from !== null && to !== null) {
                    dispatchGoalAction('reorderSubprojects', { goalId: goal.id, fromIndex: from, toIndex: to });
                  }
                }}
                onDragEnd={() => { dragIdxRef.current = null; setDragIdx(null); setDropIdx(null); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: 120, background: '#f1f5f9', border: '1px solid #e2e8f0',
                  borderRadius: 5, padding: '4px 6px', fontSize: 12, color: '#334155',
                  boxSizing: 'border-box', marginBottom: 3,
                  opacity: dragIdx === i ? 0.35 : 1,
                  cursor: 'grab',
                  transition: 'opacity 0.1s',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span style={{ color: '#cbd5e1', fontSize: 10, flexShrink: 0, letterSpacing: 1 }}>⠿</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>
                    {sub}
                  </span>
                </span>
                <button
                  onClick={() => dispatchGoalAction('removeSubproject', { goalId: goal.id, index: i })}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', fontSize: 14, lineHeight: 1,
                    padding: '0 2px', flexShrink: 0,
                  }}
                >×</button>
              </span>
              {/* Drop line below the last chip */}
              {i === goal.subprojects.length - 1 && dropIdx === goal.subprojects.length && dragIdx !== i && (
                <div style={{ height: 2, background: '#3b82f6', borderRadius: 1, margin: '1px 0' }} />
              )}
            </div>
          ))}
        </div>
      )}

    </div>

    {/* Goal Actions section */}
    <div style={BENTO_CARD}>
      <SectionLabel>Goal Actions</SectionLabel>

      {/* Plan toggle */}
      {planBtn}

      {/* Mark as Completed — draft year only */}
      {isDraftYearView && (
        <ConfirmActionBtn
          icon={
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          }
          label="Mark as Completed"
          confirmLabel="Confirm Complete"
          onConfirm={() => dispatchGoalAction('completeGoal', { goalId: goal.id })}
        />
      )}

      {/* Archive — two-step confirm */}
      <ConfirmActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
        }
        label="Archive Goal"
        confirmLabel="Confirm Archive"
        onConfirm={() => dispatchGoalAction('archiveGoal', { goalId: goal.id })}
      />

      {/* Delete — permanent, unlike archive; two-step confirm */}
      <ConfirmActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        }
        label="Delete Goal"
        confirmLabel="Confirm Delete"
        onConfirm={() => dispatchGoalAction('deleteGoal', { goalId: goal.id })}
        style={{ marginBottom: 0 }}
      />
    </div>
    </div>
  );
}

// ─── Page section ─────────────────────────────────────────────────────────────

function PageSection() {
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  const { sizeScale, increaseSize, decreaseSize, minScale, maxScale } = usePageSize('goal');

  useEffect(() => {
    const handler = (e) => {
      setUndoAvailable(e.detail?.undoAvailable ?? false);
      setRedoAvailable(e.detail?.redoAvailable ?? false);
    };
    window.addEventListener(GOAL_PANEL_STATE_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_STATE_EVENT, handler);
  }, []);

  const displayScale = Math.round(sizeScale * 10);

  return (
    <div style={{ ...BENTO_CARD, margin: '11px 11px 11px' }}>
      <SectionLabel>Page</SectionLabel>

      <ButtonPair
        left={{
          icon: (
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5a4.5 4.5 0 114.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M2 4v2.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          label: 'Undo',
          disabled: !undoAvailable,
          onClick: () => dispatchGoalAction('undo'),
        }}
        right={{
          icon: (
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
              <path d="M11 6.5a4.5 4.5 0 10-4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11 4v2.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          label: 'Redo',
          disabled: !redoAvailable,
          onClick: () => dispatchGoalAction('redo'),
        }}
      />

      <StepperRow
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="#999" strokeWidth="1.2"/>
            <path d="M8.5 8.5L12 12" stroke="#999" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        }
        label="Zoom"
        value={displayScale}
        onDecrease={decreaseSize}
        onIncrease={increaseSize}
        decreaseDisabled={sizeScale <= minScale}
        increaseDisabled={sizeScale >= maxScale}
      />
    </div>
  );
}

// ─── Panel shell ──────────────────────────────────────────────────────────────

export default function GoalPanel() {
  const { isOpen, close } = useGoalPanel();
  const [navBottom, setNavBottom] = useState(0);
  const { pathname } = useLocation();
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [colourViewOpen, setColourViewOpen] = useState(false);
  // Custom colours keyed by goalId — persists across colour view open/close
  const [customColorsByGoal, setCustomColorsByGoal] = useState({});

  const handleAddCustomColor = (color) => {
    if (!selectedGoal) return;
    setCustomColorsByGoal(prev => {
      const existing = prev[selectedGoal.id] || [];
      if (existing.includes(color)) return prev;
      return { ...prev, [selectedGoal.id]: [...existing, color] };
    });
  };

  // Listen for goal selection from StagingPageV2
  useEffect(() => {
    const handler = (e) => {
      const incoming = e.detail?.goal ?? null;
      setSelectedGoal(prev => {
        // Only close the colour view when switching to a different goal
        if (incoming?.id !== prev?.id) setColourViewOpen(false);
        return incoming;
      });
    };
    window.addEventListener(GOAL_PANEL_SELECTION_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_SELECTION_EVENT, handler);
  }, []);

  // Listen for row selection from StagingPageV2 — switches Goal section to Row section
  useEffect(() => {
    const handler = (e) => setSelectedRow(e.detail?.row ?? null);
    window.addEventListener(GOAL_PANEL_ROW_SELECTION_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_ROW_SELECTION_EVENT, handler);
  }, []);

  // Clear stale goal/row selection when leaving the Goal page. StagingPageV2
  // re-mounts on return and resets selectedGoalId to null, so the sync effect
  // won't re-fire — the panel would show old data. Clearing here ensures the
  // user sees "Click a goal to select it" on return rather than a stale card.
  useEffect(() => {
    if (pathname !== '/staging') {
      setSelectedGoal(null);
      setSelectedRow(null);
    }
  }, [pathname]);

  // Close colour view when panel closes
  useEffect(() => {
    if (!isOpen) setColourViewOpen(false);
  }, [isOpen]);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('[data-nav]');
      if (el) setNavBottom(el.getBoundingClientRect().bottom);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    const el = document.querySelector('[data-nav]');
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Page panels are mounted globally in Layout; render only on the Goal
  // page so panels never stack across page switches. Open state is kept,
  // so the panel is still there when the user returns.
  if (pathname !== '/staging') return null;

  return (
    <PanelShell isOpen={isOpen} navBottom={navBottom} width={320} zIndex={99994}>
      {/* Scrollable content + pinned footer */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 20, paddingBottom: 24 }}>
          <GoalSection goal={selectedGoal} onOpenColour={() => setColourViewOpen(true)} />
          <RowSection row={selectedRow} />
        </div>
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--brand-bd)' }}>
          <PageSection />
        </div>
      </div>

      {/* Colour picker overlay — slides in from the right on top */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(255,255,255,0.98)',
        overflowY: 'auto',
        transform: colourViewOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {selectedGoal && (
          <ColourView
            currentColor={selectedGoal.color}
            onSelect={color => dispatchGoalAction('setColor', { goalId: selectedGoal.id, color })}
            onBack={() => setColourViewOpen(false)}
            customColors={customColorsByGoal[selectedGoal.id] || []}
            onAddCustomColor={handleAddCustomColor}
          />
        )}
      </div>
    </PanelShell>
  );
}
