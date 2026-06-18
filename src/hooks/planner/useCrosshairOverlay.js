import { useRef, useEffect, useCallback } from 'react';

const LINE_COLOR = '100, 116, 139'; // slate-500
const LINE_OPACITY = 0.55;
const FADE_ZONE_MAX = 64; // max px for the fade region
const HEADER_ROWS = 1;    // thead rows (column letters row)
const PINNED_ROWS = 7;    // first sticky tbody rows (month → daily max)

/**
 * Draws a crosshair overlay over the day columns of the planner table.
 *
 * Vertical line  — right edge of hovered column, from data-area top to current cell bottom.
 * Horizontal line — bottom edge of hovered row, from timeValue column right to current cell right.
 * Both lines fade toward the boundary (header rows / timeValue column).
 *
 * @param {object} opts
 * @param {React.RefObject} opts.tableBodyRef - ref to the scrollable container div
 * @param {object}          opts.table        - TanStack table instance
 * @param {number}          opts.rowHeight    - height of every row in px
 */
export function useCrosshairOverlay({ tableBodyRef, table, rowHeight }) {
  const vLineRef = useRef(null);
  const hLineRef = useRef(null);
  const lastMouseRef = useRef(null);

  // Number of px from the top of the scrollable viewport before data rows begin.
  // (1 header row + 7 pinned tbody rows, all rowHeight px tall)
  const pinnedBottom = (HEADER_ROWS + PINNED_ROWS) * rowHeight;

  // ── helpers ──────────────────────────────────────────────

  const getDayColumn = useCallback((tableX) => {
    if (!table) return null;
    for (const col of table.getAllLeafColumns()) {
      if (!col.id.startsWith('day-')) continue;
      const start = col.getStart('left');
      if (tableX >= start && tableX < start + col.getSize()) return col;
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

  // ── drawing ───────────────────────────────────────────────

  const applyLines = useCallback((clientX, clientY) => {
    const container = tableBodyRef.current;
    const vLine = vLineRef.current;
    const hLine = hLineRef.current;
    if (!container || !vLine || !hLine) return;

    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;

    const vx = clientX - rect.left; // viewport-relative x
    const vy = clientY - rect.top;  // viewport-relative y

    // Must be inside container bounds
    if (vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    // Only active in the data area (below pinned rows)
    if (vy < pinnedBottom) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    const tableX = vx + scrollLeft;
    const dayCol = getDayColumn(tableX);
    if (!dayCol) {
      vLine.style.display = 'none';
      hLine.style.display = 'none';
      return;
    }

    // Column right edge in viewport coords
    const colRightVP = dayCol.getStart('left') + dayCol.getSize() - scrollLeft;

    // Cell bottom in viewport coords (snap to row grid)
    const cellBottomVP = (Math.floor(vy / rowHeight) + 1) * rowHeight;

    // ── Vertical line ──────────────────────────────────────────
    const vHeight = cellBottomVP - pinnedBottom;
    if (vHeight > 0) {
      const fadeZone = Math.min(FADE_ZONE_MAX, vHeight * 0.4);
      const fadePct  = ((fadeZone / vHeight) * 100).toFixed(1);

      vLine.style.display  = 'block';
      vLine.style.left     = `${rect.left + colRightVP - 1}px`;
      vLine.style.top      = `${rect.top  + pinnedBottom}px`;
      vLine.style.width    = '1.5px';
      vLine.style.height   = `${vHeight}px`;
      vLine.style.background =
        `linear-gradient(to bottom,` +
        `  transparent 0%,` +
        `  rgba(${LINE_COLOR}, ${LINE_OPACITY}) ${fadePct}%,` +
        `  rgba(${LINE_COLOR}, ${LINE_OPACITY}) 100%)`;
    } else {
      vLine.style.display = 'none';
    }

    // ── Horizontal line ────────────────────────────────────────
    const rowNumWidth       = getRowNumWidth();
    const timeValueRightAbs = getTimeValueRightAbs();
    const timeValueRightVP  = timeValueRightAbs - scrollLeft; // may be negative if scrolled away

    // Clamp left edge to the sticky rowNum column right edge
    const hLeftVP       = Math.max(rowNumWidth, timeValueRightVP);
    const hRightVP      = colRightVP;
    const hWidth        = hRightVP - hLeftVP;

    if (hWidth > 0) {
      // Only fade if the timeValue column boundary is visible
      const boundaryVisible = timeValueRightVP > rowNumWidth;
      const fadeZone = boundaryVisible
        ? Math.min(FADE_ZONE_MAX, hWidth * 0.4)
        : 0;
      const fadePct  = hWidth > 0
        ? ((fadeZone / hWidth) * 100).toFixed(1)
        : '0';

      hLine.style.display  = 'block';
      hLine.style.left     = `${rect.left + hLeftVP}px`;
      hLine.style.top      = `${rect.top  + cellBottomVP - 1}px`;
      hLine.style.width    = `${hWidth}px`;
      hLine.style.height   = '1.5px';
      hLine.style.background = boundaryVisible
        ? `linear-gradient(to right,` +
          `  transparent 0%,` +
          `  rgba(${LINE_COLOR}, ${LINE_OPACITY}) ${fadePct}%,` +
          `  rgba(${LINE_COLOR}, ${LINE_OPACITY}) 100%)`
        : `rgba(${LINE_COLOR}, ${LINE_OPACITY})`;
    } else {
      hLine.style.display = 'none';
    }
  }, [tableBodyRef, table, rowHeight, pinnedBottom, getDayColumn, getTimeValueRightAbs, getRowNumWidth]);

  const hideLines = useCallback(() => {
    if (vLineRef.current) vLineRef.current.style.display = 'none';
    if (hLineRef.current) hLineRef.current.style.display = 'none';
  }, []);

  // ── event wiring ──────────────────────────────────────────

  useEffect(() => {
    const container = tableBodyRef.current;
    if (!container) return;

    const onMove = (e) => {
      lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
      applyLines(e.clientX, e.clientY);
    };

    const onDragOver = (e) => {
      // dragover doesn't expose clientX/Y in all browsers without this
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

    // Re-evaluate on scroll (mouse may not move while user scrolls)
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

  return { vLineRef, hLineRef };
}
