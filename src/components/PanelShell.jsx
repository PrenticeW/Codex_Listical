/**
 * PanelShell — shared bento panel wrapper.
 *
 * Three-layer background:
 *   1. Grid layer  — portaled to document.body (no transformed ancestor →
 *                    background-attachment:fixed works correctly in Chrome)
 *   2. Gradient    — radial orbs inside the panel div
 *   3. Frosted tray — rgba(255,255,255,0.82) inset 7px, radius 14, clips children
 *
 * Props
 *   isOpen      boolean   — drives slide-in / slide-out
 *   navBottom   number    — px from viewport top where the panel should start
 *   width       number    — panel width in px (default 320)
 *   zIndex      number    — default 99994; use higher value for sub-panels
 *   children    ReactNode — rendered inside the frosted tray
 */

import React from 'react';
import { createPortal } from 'react-dom';

const MAUVE = (a) => `rgba(130,155,210,${a})`;
const EASE  = '0.25s cubic-bezier(0.4,0,0.2,1)';

export default function PanelShell({
  isOpen,
  navBottom = 62,
  width = 320,
  zIndex = 99994,
  children,
}) {
  const nb = navBottom;

  // Grid layer — portaled so it has no CSS-transformed ancestor
  const gridLayer = createPortal(
    <div
      style={{
        position: 'fixed',
        right: isOpen ? 0 : -width,
        top: nb,
        bottom: 0,
        width,
        backgroundColor: '#fff',
        backgroundImage: [
          `linear-gradient(${MAUVE(0.50)} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${MAUVE(0.50)} 1px, transparent 1px)`,
        ].join(','),
        backgroundSize: '32px 32px',
        backgroundPosition: '-1px -1px',
        backgroundAttachment: 'fixed',
        borderTopLeftRadius: 20,
        zIndex: zIndex - 1,
        pointerEvents: 'none',
        transition: `right ${EASE}`,
      }}
    />,
    document.body,
  );

  return (
    <>
      {gridLayer}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: nb,
          bottom: 0,
          width,
          borderTopLeftRadius: 20,
          zIndex,
          overflow: 'hidden',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform ${EASE}`,
        }}
      >
        {/* Gradient layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            backgroundImage: [
              `radial-gradient(ellipse 130% 50% at 110% -5%, ${MAUVE(0.45)} 0%, transparent 62%)`,
              `linear-gradient(180deg, ${MAUVE(0.04)} 0%, ${MAUVE(0.22)} 100%)`,
              `linear-gradient(to top right, ${MAUVE(0.28)} 0%, ${MAUVE(0.12)} 45%, transparent 70%)`,
            ].join(','),
          }}
        />

        {/* Frosted tray — clips children */}
        <div
          style={{
            position: 'absolute',
            top: 7,
            left: 7,
            right: 7,
            bottom: 7,
            borderRadius: 14,
            zIndex: 2,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.82)',
            border: `1px solid ${MAUVE(0.25)}`,
            boxShadow: '0 2px 12px rgba(72,50,75,0.06)',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
