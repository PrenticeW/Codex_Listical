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
 *   isOpen        boolean   — drives slide-in / slide-out
 *   navBottom     number    — px from viewport top where the panel should start
 *   width         number    — panel width in px (default 320)
 *   zIndex        number    — default 99994; use higher value for sub-panels
 *   onWidthChange function  — optional. When provided, a drag handle is
 *                             rendered on the left edge of the frosted tray;
 *                             dragging it live-resizes the panel and calls
 *                             onWidthChange(newWidth) once on mouseup so the
 *                             caller can persist the final value.
 *   minWidth      number    — clamp floor while dragging (default 280)
 *   maxWidth      number    — clamp ceiling while dragging (default 600)
 *   children      ReactNode — rendered inside the frosted tray
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const MAUVE = (a) => `rgba(130,155,210,${a})`;
const EASE  = '0.25s cubic-bezier(0.4,0,0.2,1)';

export default function PanelShell({
  isOpen,
  navBottom = 62,
  width = 320,
  zIndex = 99994,
  onWidthChange,
  minWidth = 280,
  maxWidth = 600,
  children,
}) {
  const nb = navBottom;

  // Live width while dragging the resize handle; null when not dragging, in
  // which case the committed `width` prop is used.
  const [liveWidth, setLiveWidth] = useState(null);
  const [handleHovered, setHandleHovered] = useState(false);
  const effectiveWidth = liveWidth ?? width;

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    // Panel is anchored to the right edge of the viewport, so dragging the
    // handle left (away from the edge) should grow the panel.
    const delta = startXRef.current - e.clientX;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
    setLiveWidth(nextWidth);
  }, [minWidth, maxWidth]);

  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    setLiveWidth((current) => {
      if (current != null) onWidthChange?.(current);
      return null;
    });
  }, [handleMouseMove, onWidthChange]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setLiveWidth(width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width, handleMouseMove, handleMouseUp]);

  // Clean up window listeners if the panel unmounts mid-drag
  useEffect(() => () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  // Grid layer — portaled so it has no CSS-transformed ancestor
  const gridLayer = createPortal(
    <div
      style={{
        position: 'fixed',
        right: isOpen ? 0 : -effectiveWidth,
        top: nb,
        bottom: 0,
        width: effectiveWidth,
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
        transition: liveWidth != null ? 'none' : `right ${EASE}`,
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
          width: effectiveWidth,
          borderTopLeftRadius: 20,
          zIndex,
          overflow: 'hidden',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: liveWidth != null ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' : `transform ${EASE}`,
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

        {/* Resize handle — left edge of the panel itself (outside the tray
            inset), full height */}
        {onWidthChange && (
          <div
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setHandleHovered(true)}
            onMouseLeave={() => setHandleHovered(false)}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 8,
              zIndex: 10,
              cursor: 'col-resize',
              background: 'transparent',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 3,
                width: 2,
                borderRadius: 1,
                background: (handleHovered || liveWidth != null) ? MAUVE(0.55) : 'transparent',
                transition: 'background 0.15s',
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
