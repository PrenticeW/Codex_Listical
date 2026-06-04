/**
 * PlanPanel
 *
 * Page-level action panel for the Plan page, opened by the list icon in
 * NavigationBar. Fixed right-side overlay, 320 px wide.
 *
 * Sections:
 *   - Page (undo/redo, zoom)
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlanPanel } from '../contexts/PlanPanelContext';
import usePageSize from '../hooks/usePageSize';

// Action event — consumed by TacticsPage
export const PLAN_PANEL_ACTION_EVENT = 'plan-panel-action';
// State event — fired by TacticsPage when undo/redo availability changes
export const PLAN_PANEL_STATE_EVENT = 'plan-panel-state';

function dispatchPlanAction(action) {
  window.dispatchEvent(new CustomEvent(PLAN_PANEL_ACTION_EVENT, { detail: { action } }));
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
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SECTION = {
  borderBottom: `1px solid ${C.borderLight}`,
  padding: '20px 22px',
};

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

// Pair of equal-width buttons side by side
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

// Stepper row (label on left, −/value/+ on right)
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

// ─── Page section ─────────────────────────────────────────────────────────────

function PageSection() {
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);

  const { sizeScale, increaseSize, decreaseSize, minScale, maxScale } = usePageSize('plan');

  useEffect(() => {
    const handler = (e) => {
      setUndoAvailable(e.detail?.undoAvailable ?? false);
      setRedoAvailable(e.detail?.redoAvailable ?? false);
    };
    window.addEventListener(PLAN_PANEL_STATE_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_STATE_EVENT, handler);
  }, []);

  // Display scale as a rounded integer (1–10 range mapped from 0.5–1.5, or just show as ×N)
  // Match the mockup's integer stepper: scale steps of 0.1, displayed as a number 1–20
  const displayScale = Math.round(sizeScale * 10);

  return (
    <div style={SECTION}>
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
          onClick: () => dispatchPlanAction('undo'),
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
          onClick: () => dispatchPlanAction('redo'),
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

export default function PlanPanel() {
  const { isOpen, close } = usePlanPanel();
  const [navBottom, setNavBottom] = useState(0);

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

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  return createPortal(
    <div
      style={{
        position: 'fixed', right: 0, top: navBottom, bottom: 0,
        width: 320,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        zIndex: 99994,
        overflowY: 'auto',
        overflowX: 'hidden',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <PageSection />
    </div>,
    document.body
  );
}
