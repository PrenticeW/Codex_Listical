import React, { useEffect, useRef, useState } from 'react';

/**
 * GroupToast — bottom-center confirmation toast for "Group selection by"
 * (design bundle design_handoff_group_by, live demo frame): check disc +
 * "Grouped by <Field>" + Undo chip. Auto-dismisses after ~4.5s; Undo
 * restores the previous order (wired by the page) and dismisses.
 */

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const AUTO_DISMISS_MS = 4500;

export default function GroupToast({ toast, onUndo, onDismiss }) {
  // `visible` drives the enter transition (fade + 8px rise, .2s)
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!toast) { setVisible(false); return undefined; }
    const raf = requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(() => onDismiss?.(), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
    };
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 28, left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 8}px)`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s, transform 0.2s',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#ffffff', borderRadius: 10,
        border: '1px solid #e8e8e4',
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 4px 16px rgba(72,50,75,0.14)',
        padding: '9px 10px 9px 16px',
        fontFamily: FONT, userSelect: 'none',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--brand-deep)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="8" height="7" viewBox="0 0 12 10" fill="none">
          <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ fontSize: 13, color: '#1F1F1F', whiteSpace: 'nowrap' }}>{toast.label}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          background: 'var(--brand-tint)', color: 'var(--brand-deep)',
          border: 'none', borderRadius: 6, padding: '4px 12px',
          fontFamily: FONT, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Undo
      </button>
    </div>
  );
}
