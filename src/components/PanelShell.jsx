/**
 * PanelShell — shared bento panel wrapper.
 *
 * Two-layer background:
 *   1. Grid layer  — portaled to document.body (no transformed ancestor →
 *                    background-attachment:fixed works correctly in Chrome).
 *                    Carries the panel's left-edge shadow (--sh-panel),
 *                    applied only while open so nothing smudges the viewport
 *                    edge when the panel is parked off-canvas.
 *   2. Frosted tray — rgba(255,255,255,0.82) inset 7px, radius 14, clips children
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
 *   maxWidth      number    — clamp ceiling while dragging (default 800)
 *   scaleBaseWidth number   — width at which content renders 1:1 (default 420).
 *                             Widened past this, the tray content keeps its
 *                             base-width layout and scales up uniformly
 *                             (text, fields, spacing) via CSS zoom. At or
 *                             below it, the panel stretches/squeezes exactly
 *                             as before.
 *   children      ReactNode — rendered inside the frosted tray
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { gridSvgLayer, useThemeVersion } from '../utils/themeBackground';

// Broadcast while the resize handle is being dragged so page content can
// track the live panel width (see hooks/usePanelInset.js). detail is the
// current width in px during the drag, or null once the drag ends.
export const PANEL_LIVE_WIDTH_EVENT = 'panel-live-width';

const emitLiveWidth = (value) => {
  window.dispatchEvent(new CustomEvent(PANEL_LIVE_WIDTH_EVENT, { detail: value }));
};

// Theme-tinted: derives from the active family's main step (--th-60)
const MAUVE = (a) => `color-mix(in srgb, var(--th-68) ${Math.round(a * 100)}%, transparent)`;
const EASE  = '0.25s cubic-bezier(0.4,0,0.2,1)';

export default function PanelShell({
  isOpen,
  navBottom = 62,
  width = 320,
  zIndex = 99994,
  onWidthChange,
  minWidth = 280,
  maxWidth = 800,
  scaleBaseWidth = 420,
  children,
}) {
  const nb = navBottom;

  // Re-render when the theme family changes so the grid tile (which bakes in
  // a resolved colour) recomputes.
  useThemeVersion();

  // Live width while dragging the resize handle; null when not dragging, in
  // which case the committed `width` prop is used.
  const [liveWidth, setLiveWidth] = useState(null);
  const [handleHovered, setHandleHovered] = useState(false);
  const effectiveWidth = liveWidth ?? width;

  // Uniform content scale. Above the base width the tray content keeps its
  // base-width layout and is magnified via CSS zoom (which, unlike
  // transform:scale, participates in layout — scrolling, hit-testing and
  // overflow all stay correct). At or below the base width, scale is 1 and
  // the content reflows (stretch/squeeze) as it always did.
  const contentScale = effectiveWidth > scaleBaseWidth
    ? effectiveWidth / scaleBaseWidth
    : 1;

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
    emitLiveWidth(nextWidth);
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
    emitLiveWidth(null);
  }, [handleMouseMove, onWidthChange]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setLiveWidth(width);
    emitLiveWidth(width);
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
        // Grid lines as an SVG tile rather than 1px gradient hard-stops:
        // gradient hairlines round to zero device pixels and vanish when the
        // effective DPR drops below 1 (browser zoom < 100% on a 1x monitor).
        // The SVG stroke antialiases instead, so the grid survives any zoom.
        backgroundImage: gridSvgLayer(0.15),
        backgroundSize: '32px 32px',
        backgroundPosition: '-1px -1px',
        backgroundAttachment: 'fixed',
        borderTopLeftRadius: 20,
        zIndex: zIndex - 1,
        pointerEvents: 'none',
        // Left-edge shadow lives here (the rearmost, untransformed layer of
        // the panel stack) and only while open — when parked off-canvas the
        // blur would otherwise smudge the viewport's right edge.
        boxShadow: isOpen ? 'var(--sh-panel)' : 'none',
        transition: liveWidth != null ? 'none' : `right ${EASE}, box-shadow ${EASE}`,
      }}
    />,
    document.body,
  );

  return (
    <>
      {gridLayer}
      <div
        // Marks the panel as a "safe" click target for selection-clearing
        // listeners (e.g. the Goal page clears cell selection on outside
        // clicks but must keep it while interacting with the panel).
        data-selection-safe
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
          {/* Scale wrapper — zoom > 1 makes this lay out at the base width
              and render magnified to fill the tray */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zoom: contentScale,
            }}
          >
            {children}
          </div>
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
