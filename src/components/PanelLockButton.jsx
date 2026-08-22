/**
 * PanelLockButton — lock toggle shown at the top of every page panel view.
 *
 * While locked, the page panels ignore incoming selection events (table
 * rows, cells, chips) and keep showing their current content. State lives in
 * PagePanelContext so the lock follows the panel across pages and sub-views.
 *
 * Rendered inside PanelShell's zoom wrapper, so it scales with the rest of
 * the panel content automatically.
 *
 * Props
 *   size   'sm' | 'md' — 'sm' (22px) sits on a section-label line,
 *                        'md' (30px) matches the Back pill height
 *   style  object     — merged onto the button (e.g. marginLeft: 'auto')
 */

import React, { useState } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { usePanelLock } from '../contexts/PagePanelContext';

const SIZES = { sm: { box: 22, icon: 12 }, md: { box: 30, icon: 14 } };

export default function PanelLockButton({ size = 'md', style }) {
  const { locked, toggleLock } = usePanelLock();
  const [hovered, setHovered] = useState(false);
  const { box, icon } = SIZES[size] ?? SIZES.md;
  const Icon = locked ? LockKeyhole : LockKeyholeOpen;
  const active = locked || hovered;

  return (
    <button
      type="button"
      onClick={toggleLock}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={locked}
      aria-label={locked ? 'Unlock panel' : 'Lock panel'}
      title={locked ? 'Unlock panel (follow selection)' : 'Lock panel (ignore selection)'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: box, height: box, padding: 0, flexShrink: 0,
        background: active ? 'var(--brand-tint)' : '#ffffff',
        border: `1px solid ${active ? 'var(--brand-bd)' : '#e8e8e4'}`,
        borderRadius: 8,
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
        color: active ? 'var(--brand-ink)' : '#616161',
        cursor: 'pointer',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      <Icon size={icon} strokeWidth={2} />
    </button>
  );
}
