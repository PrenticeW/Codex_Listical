import { useRef, useEffect, useCallback } from 'react';

// Rose highlight colour — matches the app's selection rose (#cf7d9a)
const LINE_COLOR   = '207, 125, 154';
const LINE_OPACITY = 0.75;
const LINE_WIDTH   = 2;          // px
const FADE_ZONE_MAX = 64;        // max px for the gradient fade zone
const HEADER_ROWS   = 1;         // thead rows (column-letter row)
const PINNED_ROWS   = 7;         // first sticky-tbody rows (month → daily max)

/**
 * Crosshair overlay for the planner's day columns.
 *
 * Vertical line  – right edge of the hovered column, from the data-area top
 *                  down to the current cell bottom, fading at the top.
 * Horizontal line – bottom edge of the hovered row, from the timeValue
 *                   column right edge to the current column right edge,
 *                   fading on the left.
 *
 * DOM elements are appended directly to document.body so they are never
 * clipped or offset by ancestor CSS transforms.
 */
export function useCrosshairOverlay({ tableBodyRef, table, rowHeight }) {
  // DOM refs (not React-managed elements — created imperatively)
  const vLineRef    = useRef(null);
  const hLineRef    = useRef(null);
  const lastMouseRef = useRef(null);

  // ── one-time DOM element creation ─────────────────────────────────────────

  if (!vLineRef.current) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      display:  'none',
      pointerEvents: 'none',
      zIndex: '9999',
      width: `${LINE_WIDTH}px`,
    });
    vLineRef.current = el;
  }

  if (!hLineRef.current) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      display:  'none',
      pointerEvents: 'none',
      zIndex: '9999',
      height: `${LINE_WIDTH}px`,
    });
    hLineRef.current = el;
  }

  // Attach/detach from document.body on mount/unmount
  useEffect(() => {
    const vLine = vLineRef.current;
    const hLine = hLineRef.current;
    document.body.appendChild(vLine);
    document.body.appendChild(hLine);
    return () => {
      vLine.remove();
      hLine.remove();
    };
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────

  const getDayColumn = useCallback((tableX) => {
    if (!table) return null;
    for (const col of table.getAllLeafColumns()) {
      if (!col.id.startsWith('day-')) continue;
      const start = col.getStart('left');
      const size  = col.getSize();
      if (size > 0 && tableX >= start && tableX < start + size) return col;
    }
    return null;
  }, [table]);

  const getTimeValueRightAbs = useCallback(() => {
    if (!table) return 0;
    const col = table.getColumn('timeValue');
    return col ? col.getStart('left') + col.getSize() : 0;
  }, [table]);

  const getRowNumWidth = useCallback(() => {
    if (!table) return 0;
    const col = table.getColumn('rowNum');
    return col ? col.getSize() : 0;
  }, [table]);

  // ── draw ──────────────────────────────────────────────────────────────────

  const applyLines = useCallback((clientX, clientY) => {
    const container = tableBodyRef.current;
    const vLine = vLineRef.current;
    const hLine = hLineRef.current;
    if (!container || !vLine || !hLine) return;

    const rect       = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;

    const vx = clientX - rect.left;   // x relative to container viewport
    const vy = clientY - rect.top;    // y relative to container viewport

    // Bail if outside the container
    if (vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    // Only active below the pinned header area
    const pinnedBottom = (HEADER_ROWS + PINNED_ROWS) * rowHeight;
    if (vy < pinnedBottom) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    // Find which day column the cursor is over
    const tableX = vx + scrollLeft;
    const dayCol  = getDayColumn(tableX);
    if (!dayCol) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    // Column right edge in viewport coords
    const colRightVP = dayCol.getStart('left') + dayCol.getSize() - scrollLeft;

    // Snap cell bottom to row-height grid
    const cellBottomVP = (Math.floor(vy / rowHeight) + 1) * rowHeight;

    // ── Vertical line ──────────────────────────────────────────────────────
    const vHeight = cellBottomVP - pinnedBottom;
    if (vHeight > 0) {
      const fadeZone = Math.min(FADE_ZONE_MAX, vHeight * 0.4);
      const fadePct  = ((fadeZone / vHeight) * 100).toFixed(1);

      vLine.style.display    = 'block';
      vLine.style.left       = `${rect.left + colRightVP - LINE_WIDTH / 2}px`;
      vLine.style.top        = `${rect.top  + pinnedBottom}px`;
      vLine.style.height     = `${vHeight}px`;
      vLine.style.background =
        `linear-gradient(to bottom,` +
        ` transparent 0%,` +
        ` rgba(${LINE_COLOR},${LINE_OPACITY}) ${fadePct}%,` +
        ` rgba(${LINE_COLOR},${LINE_OPACITY}) 100%)`;
    } else {
      vLine.style.display = 'none';
    }

    // ── Horizontal line ────────────────────────────────────────────────────
    const rowNumWidth      = getRowNumWidth();
    const timeValueRightVP = getTimeValueRightAbs() - scrollLeft;

    // Left edge: clamp to sticky rowNum right if col H has scrolled off-screen
    const hLeftVP  = Math.max(rowNumWidth, timeValueRightVP);
    const hRightVP = colRightVP;
    const hWidth   = hRightVP - hLeftVP;

    if (hWidth > 0) {
      const boundaryVisible = timeValueRightVP > rowNumWidth;
      const fadeZone = boundaryVisible ? Math.min(FADE_ZONE_MAX, hWidth * 0.4) : 0;
      const fadePct  = ((fadeZone / hWidth) * 100).toFixed(1);

      hLine.style.display    = 'block';
      hLine.style.left       = `${rect.left + hLeftVP}px`;
      hLine.style.top        = `${rect.top  + cellBottomVP - LINE_WIDTH / 2}px`;
      hLine.style.width      = `${hWidth}px`;
      hLine.style.background = boundaryVisible
        ? `linear-gradient(to right,` +
          ` transparent 0%,` +
          ` rgba(${LINE_COLOR},${LINE_OPACITY}) ${fadePct}%,` +
          ` rgba(${LINE_COLOR},${LINE_OPACITY}) 100%)`
        : `rgba(${LINE_COLOR},${LINE_OPACITY})`;
    } else {
      hLine.style.display = 'none';
    }
  }, [tableBodyRef, table, rowHeight, getDayColumn, getTimeValueRightAbs, getRowNumWidth]);

  const hideLines = useCallback(() => {
    if (vLineRef.current) vLineRef.current.style.display = 'none';
    if (hLineRef.current) hLineRef.current.style.display = 'none';
  }, []);

  // ── event wiring ──────────────────────────────────────────────────────────

  useEffect(() => {
    const container = tableBodyRef.current;
    if (!container) return;

    const onMove = (e) => {
      lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
      applyLines(e.clientX, e.clientY);
    };
    const onDragOver = (e) => {
      lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
      applyLines(e.clientX, e.clientY);
    };
    const onLeave = () => {
      lastMouseRef.current = null;
      hideLines();
    };
    const onDragLeave = (e) => {
      if (!container.contains(e.relatedTarget)) {
        lastMouseRef.current = null;
        hideLines();
      }
    };
    const onDragEnd = () => {
      lastMouseRef.current = null;
      hideLines();
    };
    const onScroll = () => {
      if (lastMouseRef.current) {
        applyLines(lastMouseRef.current.clientX, lastMouseRef.current.clientY);
      }
    };

    container.addEventListener('mousemove',  onMove,     { passive: true });
    container.addEventListener('dragover',   onDragOver);
    container.addEventListener('mouseleave', onLeave);
    container.addEventListener('dragleave',  onDragLeave);
    container.addEventListener('scroll',     onScroll,   { passive: true });
    document.addEventListener('dragend',     onDragEnd);

    return () => {
      container.removeEventListener('mousemove',  onMove);
      container.removeEventListener('dragover',   onDragOver);
      container.removeEventListener('mouseleave', onLeave);
      container.removeEventListener('dragleave',  onDragLeave);
      container.removeEventListener('scroll',     onScroll);
      document.removeEventListener('dragend',     onDragEnd);
      hideLines();
    };
  }, [tableBodyRef, applyLines, hideLines]);
}
