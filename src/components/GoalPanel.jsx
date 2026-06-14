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
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useGoalPanel } from '../contexts/GoalPanelContext';
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
  green:       '#1a7a5c',
  greenDark:   '#1a5c3a',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SECTION = {
  borderBottom: `1px solid ${C.borderLight}`,
  padding: '20px 22px',
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textLight, marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function ActionBtn({ icon, label, disabled, onClick, danger, hoverIcon, hoverLabel, hoverDanger, style }) {
  const [hovered, setHovered] = useState(false);
  // hoverDanger: button looks neutral at rest but previews a destructive
  // action on hover (e.g. "Added to Plan" → "Remove from Plan")
  const isDanger = danger || hoverDanger;
  const hoverColor = isDanger ? '#c0392b' : C.green;
  const hoverBorder = isDanger ? '#fca5a5' : C.green;
  const hoverBg = isDanger ? '#fef2f2' : 'none';
  const showHoverContent = hovered && !disabled;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%',
        background: hovered && !disabled ? hoverBg : 'none',
        border: `1px solid ${hovered && !disabled ? hoverBorder : C.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: disabled ? C.textFaint : (hovered ? hoverColor : C.textDim),
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        opacity: disabled ? 0.45 : 1,
        marginBottom: 8,
        ...style,
      }}
    >
      {showHoverContent && hoverIcon ? hoverIcon : icon}
      {showHoverContent && hoverLabel ? hoverLabel : label}
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
            padding: '10px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 400,
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
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px',
    }}>
      <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <StepBtn onClick={onDecrease} disabled={decreaseDisabled}>−</StepBtn>
        <span style={{
          minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 500, color: C.text,
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

// Build the same group structure as ColourPicker: 30 hue families sorted by
// hue ascending, split into 3 groups of 10. Each family has 4 lightness steps
// sorted l:68 (light) → l:44 (dark). Grid renders row-first: 10 cols × 4 rows.
function buildColourGroups() {
  const sorted = [...PALETTE].sort((a, b) => a.h - b.h);
  const families = [];
  for (let i = 0; i < sorted.length; i += 4) {
    const family = sorted.slice(i, i + 4);
    family.sort((a, b) => b.l - a.l); // l:68 first
    families.push(family);
  }
  return [families.slice(0, 10), families.slice(10, 20), families.slice(20, 30)];
}

const COLOUR_GROUPS = buildColourGroups();
const COLOUR_GROUP_LABELS = ['Warm tones', 'Cool tones', 'Blues & purples'];
const COLOUR_ROWS = 4;

// Neutrals — same as ColourPicker
const NEUTRALS = [
  { name: 'white',      h: 0,   s: 0,  l: 100 },
  { name: 'white warm', h: 35,  s: 20, l: 97  },
  { name: 'silver',     h: 0,   s: 0,  l: 88  },
  { name: 'lt grey',    h: 0,   s: 0,  l: 78  },
  { name: 'grey',       h: 0,   s: 0,  l: 62  },
  { name: 'mid grey',   h: 0,   s: 0,  l: 50  },
  { name: 'dk grey',    h: 0,   s: 0,  l: 38  },
  { name: 'charcoal',   h: 0,   s: 0,  l: 22  },
  { name: 'near black', h: 0,   s: 0,  l: 12  },
  { name: 'black',      h: 0,   s: 0,  l: 4   },
  { name: 'cream',      h: 40,  s: 60, l: 95  },
  { name: 'beige',      h: 35,  s: 30, l: 88  },
  { name: 'sand',       h: 38,  s: 35, l: 78  },
  { name: 'tan',        h: 35,  s: 30, l: 65  },
  { name: 'camel',      h: 33,  s: 35, l: 52  },
  { name: 'brown',      h: 25,  s: 40, l: 35  },
  { name: 'dk brown',   h: 22,  s: 45, l: 22  },
  { name: 'warm grey',  h: 35,  s: 8,  l: 72  },
  { name: 'warm mid',   h: 35,  s: 8,  l: 50  },
  { name: 'warm dark',  h: 35,  s: 8,  l: 30  },
  { name: 'ice',        h: 210, s: 30, l: 97  },
  { name: 'lt slate',   h: 215, s: 18, l: 82  },
  { name: 'slate',      h: 215, s: 16, l: 68  },
  { name: 'mid slate',  h: 215, s: 14, l: 55  },
  { name: 'steel',      h: 215, s: 14, l: 42  },
  { name: 'dk slate',   h: 218, s: 18, l: 30  },
  { name: 'navy grey',  h: 220, s: 20, l: 20  },
  { name: 'blue black', h: 222, s: 25, l: 12  },
  { name: 'ink',        h: 225, s: 30, l: 6   },
  null, // empty placeholder (row 2 col 9)
  { name: 'blush mist', h: 340, s: 18, l: 88  },
  { name: 'dusty rose', h: 340, s: 18, l: 72  },
  { name: 'mauve',      h: 300, s: 12, l: 62  },
  { name: 'lavender',   h: 265, s: 18, l: 78  },
  { name: 'periwinkle', h: 240, s: 18, l: 72  },
  { name: 'sage mist',  h: 140, s: 14, l: 72  },
  { name: 'mint mist',  h: 160, s: 16, l: 78  },
  { name: 'duck egg',   h: 185, s: 18, l: 78  },
  { name: 'straw',      h: 48,  s: 30, l: 82  },
  { name: 'peach',      h: 20,  s: 35, l: 82  },
];

function hslStr(entry) {
  return `hsl(${entry.h}, ${entry.s}%, ${entry.l}%)`;
}

function isActiveEntry(entry, value) {
  if (!value || !entry) return false;
  const m = value.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/i);
  if (!m) return false;
  const { h, s, l } = { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
  return Math.abs(entry.h - h) < 1 && Math.abs(entry.s - s) < 2 && Math.abs(entry.l - l) < 2;
}

const EYEDROPPER_SUPPORTED = typeof window !== 'undefined' && 'EyeDropper' in window;

function ColourView({ currentColor, onSelect, onBack, customColors = [], onAddCustomColor }) {
  const customInputRef = useRef(null);

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

  const renderGrid = (cells, keyPrefix) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, padding: '10px 22px' }}>
      {cells.map((entry, idx) => {
        if (!entry) return <div key={`${keyPrefix}-empty-${idx}`} style={{ aspectRatio: '1' }} />;
        const bg = hslStr(entry);
        const active = isActiveEntry(entry, currentColor);
        const paleBorder = entry.l >= 95 ? { border: '0.5px solid #ccc' } : {};
        return (
          <button
            key={`${keyPrefix}-${idx}`}
            onClick={() => handleSwatchSelect(bg)}
            title={`${entry.name}`}
            style={{
              aspectRatio: '1', borderRadius: 2, background: bg,
              border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
              transition: 'transform 0.1s',
              ...paleBorder,
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {active && (
              <span style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  width: '55%', height: '55%', borderRadius: 2,
                  border: '2px solid rgba(255,255,255,0.9)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header — back button + title only */}
      <div style={{
        position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        borderBottom: `1px solid ${C.borderLight}`,
      }}>
        <div style={{ padding: '20px 22px 16px' }}>
          <button
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.textLight, display: 'flex', alignItems: 'center',
              padding: 0, marginBottom: 10, transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.text}
            onMouseLeave={e => e.currentTarget.style.color = C.textLight}
          >
            <svg width="9" height="14" viewBox="0 0 7 11" fill="none">
              <path d="M6 1L1 5.5 6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.text }}>Colour</span>
        </div>
      </div>

      {/* Palette sections — swatches apply immediately */}
      {COLOUR_GROUPS.map((group, gi) => {
        // Build a flat row-first array: 4 rows × 10 cols
        const cells = Array.from({ length: COLOUR_ROWS }, (_, row) =>
          group.map(family => family[row])
        ).flat();
        return (
          <div key={gi}>
            <div style={{
              padding: '12px 22px 4px',
              fontFamily: FONT, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight,
            }}>
              {COLOUR_GROUP_LABELS[gi]}
            </div>
            {renderGrid(cells, `group-${gi}`)}
          </div>
        );
      })}

      {/* Neutrals */}
      <div>
        <div style={{
          padding: '12px 22px 4px',
          fontFamily: FONT, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight,
        }}>
          Neutrals
        </div>
        {renderGrid(NEUTRALS, 'neutrals')}
      </div>

      {/* Custom */}
      <div style={{ borderTop: `1px solid ${C.borderLight}` }}>
        <div style={{
          padding: '12px 22px 4px',
          fontFamily: FONT, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight,
        }}>
          Custom
        </div>
        {/* Picker icons row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, padding: '10px 22px 0' }}>
          {EYEDROPPER_SUPPORTED && (
            <button
              onClick={handleEyedropper}
              title="Pick from screen"
              style={{
                aspectRatio: '1', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f7f7f5', border: `1px solid ${C.border}`,
                cursor: 'pointer', color: C.textFaint,
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = '#f7f7f5'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
              </svg>
            </button>
          )}
          <label
            title="Custom colour mixer"
            style={{
              aspectRatio: '1', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f7f7f5', border: `1px solid ${C.border}`,
              cursor: 'pointer', color: C.textFaint,
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = '#f7f7f5'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/>
              <path d="M20 23a2 2 0 001.4-3.4L16 14"/>
              <line x1="3.5" y1="11.5" x2="13" y2="2"/>
            </svg>
            <input
              ref={customInputRef}
              type="color"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              onChange={e => handleCustomPick(e.target.value)}
            />
          </label>
        </div>

        {/* Saved custom swatches — separate grid row below the icons */}
        {customColors.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, padding: '2px 22px 10px' }}>
            {customColors.map((color, i) => {
              const active = color === currentColor;
              const isVeryLight = color.startsWith('#fff') || color === '#ffffff';
              return (
                <button
                  key={i}
                  onClick={() => handleSwatchSelect(color)}
                  title={color}
                  style={{
                    aspectRatio: '1', borderRadius: 2,
                    background: color, cursor: 'pointer', padding: 0, position: 'relative',
                    border: isVeryLight ? '0.5px solid #ccc' : 'none',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {active && (
                    <span style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{
                        width: '55%', height: '55%', borderRadius: 2,
                        border: '2px solid rgba(255,255,255,0.9)',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                      }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row section ──────────────────────────────────────────────────────────────
// Shown in place of the Goal section while a table row/cell is selected.

function RowSection({ row }) {
  return (
    <div style={{ ...SECTION }}>
      <SectionLabel>Row</SectionLabel>

      {/* Section / row-type context */}
      {row.sectionType ? (
        <div style={{
          fontFamily: FONT, fontSize: 11, color: C.textFaint,
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4,
            padding: '2px 7px', fontWeight: 600, letterSpacing: '0.05em',
            textTransform: 'uppercase', fontSize: 10, color: '#64748b',
          }}>
            {row.sectionType}
          </span>
        </div>
      ) : null}

      <ActionBtn
        danger
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        }
        label="Delete Row"
        onClick={() => dispatchGoalAction('deleteRow', { goalId: row.goalId, rowIdx: row.rowIdx })}
      />

      <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '4px 0 12px' }} />

      <ActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
          </svg>
        }
        label={row.showOutcomeTotals ? 'Hide Totals' : 'Show Totals'}
        onClick={() => dispatchGoalAction('toggleTotals', { goalId: row.goalId })}
        style={{ marginBottom: 0 }}
      />

      {/* Times toggle only applies to Actions rows — kept below its own divider */}
      {row.sectionType === 'Actions' && (
        <>
          <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '12px 0 12px' }} />
          <ActionBtn
            icon={
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            }
            label={row.showActionTimes ? 'Hide Times' : 'Show Times'}
            onClick={() => dispatchGoalAction('toggleActionTimes', { goalId: row.goalId })}
            style={{ marginBottom: 0 }}
          />
        </>
      )}
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

  if (!goal) {
    return (
      <div style={{ ...SECTION }}>
        <SectionLabel>Goal</SectionLabel>
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
    <div style={{ ...SECTION }}>
      <SectionLabel>Goal</SectionLabel>

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

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '4px 0 12px' }} />

      {/* Plan toggle */}
      {planBtn}

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '4px 0 12px' }} />

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
    <div style={{ ...SECTION, borderBottom: 'none' }}>
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

  const panelStyle = {
    position: 'fixed', right: 0, top: navBottom, bottom: 0,
    width: 320,
    background: C.bg,
    borderLeft: `1px solid ${C.border}`,
    zIndex: 99994,
    overflow: 'hidden',
    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
    display: 'flex',
    flexDirection: 'column',
  };

  // Page panels are mounted globally in Layout; render only on the Goal
  // page so panels never stack across page switches. Open state is kept,
  // so the panel is still there when the user returns.
  if (pathname !== '/staging') return null;

  return createPortal(
    <>
      {/* ── Main panel ── */}
      <div style={{ ...panelStyle, transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}>
        {/* Scrollable goal section */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {selectedRow
            ? <RowSection row={selectedRow} />
            : <GoalSection goal={selectedGoal} onOpenColour={() => setColourViewOpen(true)} />}
        </div>
        {/* Page actions pinned to bottom */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.borderLight}` }}>
          <PageSection />
        </div>
      </div>

      {/* ── Colour picker overlay — slides in on top of the main panel ── */}
      <div style={{
        ...panelStyle,
        zIndex: 99995,
        transform: (isOpen && colourViewOpen) ? 'translateX(0)' : 'translateX(100%)',
        overflowY: 'auto',
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
    </>,
    document.body
  );
}
