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
import { useGoalPanel } from '../contexts/GoalPanelContext';
import usePageSize from '../hooks/usePageSize';
import { COLOR_PALETTE } from '../utils/staging/planTableHelpers';

// Action event — consumed by StagingPageV2
export const GOAL_PANEL_ACTION_EVENT = 'goal-panel-action';
// State event — fired by StagingPageV2 when undo/redo availability changes
export const GOAL_PANEL_STATE_EVENT = 'goal-panel-state';
// Selection event — fired by StagingPageV2 when the selected goal changes
export const GOAL_PANEL_SELECTION_EVENT = 'goal-panel-selection';

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

function ActionBtn({ icon, label, disabled, onClick, danger, style }) {
  const [hovered, setHovered] = useState(false);
  const hoverColor = danger ? '#c0392b' : C.green;
  const hoverBorder = danger ? '#fca5a5' : C.green;
  const hoverBg = danger ? '#fef2f2' : 'none';

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
      {icon}
      {label}
    </button>
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

// Palette grouped by hue family (10 columns × rows), matching the prototype layout
// We use the existing COLOR_PALETTE which is hue × lightness order
const PALETTE_COLS = 10;

function ColourView({ currentColor, onSelect, onBack }) {
  const customInputRef = useRef(null);

  return (
    <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '20px 22px 16px',
        borderBottom: `1px solid ${C.borderLight}`,
        position: 'sticky', top: 0, background: C.bg, zIndex: 2,
      }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.text }}>Colour</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Custom colour input */}
            <label
              title="Custom colour"
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: `1px solid ${C.border}`, borderRadius: 7,
                cursor: 'pointer', color: C.textFaint,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.borderColor = C.border; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/>
                <path d="M20 23a2 2 0 001.4-3.4L16 14"/>
                <line x1="3.5" y1="11.5" x2="13" y2="2"/>
              </svg>
              <input
                ref={customInputRef}
                type="color"
                defaultValue={currentColor || '#c9daf8'}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                onChange={e => onSelect(e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Swatch grid */}
      <div style={{ padding: '16px 22px', overflowY: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PALETTE_COLS}, 1fr)`,
          gap: 3,
        }}>
          {COLOR_PALETTE.map((color, i) => {
            const isActive = color === currentColor;
            return (
              <button
                key={i}
                onClick={() => onSelect(color)}
                title={color}
                style={{
                  aspectRatio: '1',
                  borderRadius: 3,
                  background: color,
                  border: isActive ? '2px solid rgba(0,0,0,0.4)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'transform 0.1s, border-color 0.1s',
                  padding: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Goal section ─────────────────────────────────────────────────────────────

function GoalSection({ goal, onOpenColour }) {
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

  const planBtn = goal.addedToPlan ? (
    <ActionBtn
      icon={
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          <polyline points="9 16 11 18 15 14"/>
        </svg>
      }
      label="Added to Plan"
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
            border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '0 10px', fontFamily: FONT, fontSize: 13,
            color: C.text, textTransform: 'uppercase',
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = '#aaa'}
          onBlur={e => e.target.style.borderColor = C.border}
        />
      </FieldRow>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12, alignItems: 'flex-end' }}>
          {(goal.subprojects || []).map((sub, i) => (
            <span
              key={i}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: 120, background: '#f1f5f9', border: `1px solid #e2e8f0`,
                borderRadius: 5, padding: '4px 6px', fontSize: 12, color: '#334155',
                boxSizing: 'border-box',
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
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '4px 0 12px' }} />

      {/* Plan toggle */}
      {planBtn}

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, margin: '4px 0 12px' }} />

      {/* Archive */}
      <ActionBtn
        icon={
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
        }
        label="Archive Goal"
        danger
        onClick={() => dispatchGoalAction('archiveGoal', { goalId: goal.id })}
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
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [colourViewOpen, setColourViewOpen] = useState(false);

  // Listen for goal selection from StagingPageV2
  useEffect(() => {
    const handler = (e) => {
      setSelectedGoal(e.detail?.goal ?? null);
      setColourViewOpen(false);
    };
    window.addEventListener(GOAL_PANEL_SELECTION_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_SELECTION_EVENT, handler);
  }, []);

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

  return createPortal(
    <>
      {/* ── Main panel ── */}
      <div style={{ ...panelStyle, transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}>
        {/* Scrollable goal section */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <GoalSection goal={selectedGoal} onOpenColour={() => setColourViewOpen(true)} />
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
          />
        )}
      </div>
    </>,
    document.body
  );
}
