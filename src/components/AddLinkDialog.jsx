import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link as LinkIcon } from 'lucide-react';
import { getPageZoom } from '../utils/pageZoom';
import { findLinks } from '../utils/linkify';

/**
 * Add link popup — opened with Cmd+K (Mac) / Ctrl+K (Windows) while editing
 * text. Opens in situ: a 480px card anchored directly under the editor
 * (`anchorRef`), flipping above it when there is no room below. No scrim;
 * clicking anywhere outside, or Escape, dismisses without applying.
 *
 * Design: design_handoff_add_link (Link UI). Chrome borrows the filter
 * dropdown (white, 1px #ced3d0 divider, 4px radius); Confirm is the
 * dropdown's full-width "Clear" row. Theme accent via --brand tokens.
 * All sizes are multiplied by --pz so the card scales with page zoom.
 */

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace";
const CARD_W = 480;
const CARD_H = 142; // top pad 14 + two 31px rows + 9 gap + 16 pad + divider + 37 confirm
const pz = (n) => `calc(${n}px * var(--pz))`;

const LABEL_STYLE = {
  fontFamily: MONO, fontSize: pz(9), fontWeight: 700, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--brand-ink)', width: pz(36), flex: 'none',
};

const INPUT_BASE = {
  flex: 1, minWidth: 0, boxSizing: 'border-box',
  border: '1px solid #e0ded6', borderRadius: pz(6), padding: `${pz(7)} ${pz(9)}`,
  fontFamily: FONT, fontSize: pz(12.5), color: '#1F1F1F', background: '#FCFBF8',
  outline: 'none',
};

function useFocusStyle() {
  const [focused, setFocused] = useState(false);
  return {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: focused ? { borderColor: 'var(--brand)', background: '#fff' } : {},
  };
}

export default function AddLinkDialog({
  open,
  anchorRef,
  initialText = '',
  initialUrl = '',
  onConfirm,
  onCancel,
}) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const urlRef = useRef(null);
  const [confirmHover, setConfirmHover] = useState(false);
  const textFocus = useFocusStyle();
  const urlFocus = useFocusStyle();

  // Reset fields and focus the LINK input each time the popup opens.
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setUrl(initialUrl);
    const id = requestAnimationFrame(() => urlRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, initialText, initialUrl]);

  // Anchor under the editor; flip above if it would run off the bottom.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const el = anchorRef?.current;
      const z = getPageZoom();
      const w = CARD_W * z;
      const h = CARD_H * z;
      const gap = 2 * z;
      if (!el) {
        setPos({ top: (window.innerHeight - h) / 2, left: (window.innerWidth - w) / 2, width: w });
        return;
      }
      // Horizontally align with the enclosing cell (when there is one), but
      // take the vertical extent from whichever is taller: the editor grows
      // past the cell while editing, so the card must clear the editor, not
      // just the cell.
      const er = el.getBoundingClientRect();
      const cr = (el.closest?.('td') ?? el).getBoundingClientRect();
      const r = {
        left: cr.left,
        top: Math.min(er.top, cr.top),
        bottom: Math.max(er.bottom, cr.bottom),
      };
      const fitsBelow = r.bottom + gap + h < window.innerHeight - 8;
      setPos({
        top: fitsBelow ? r.bottom + gap : Math.max(8, r.top - gap - h),
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        width: w,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef]);

  // Click anywhere outside the card dismisses without applying.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      onCancel();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, onCancel]);

  if (!open || !pos) return null;

  const canConfirm = url.trim().length > 0;

  // Some sources (Google Maps "share", browser address bars with page
  // titles) put "Name https://url" on the clipboard as one string. Keep only
  // the URL in the LINK field; leftover words fill TEXT when it is empty.
  const splitUrlPaste = (raw) => {
    const found = findLinks(raw);
    if (!found.length) return null;
    const rest = (raw.slice(0, found[0].start) + raw.slice(found[0].end)).trim();
    return { url: found[0].raw, rest };
  };

  const handleUrlPaste = (e) => {
    const plain = (e.clipboardData?.getData('text/plain') ?? '').trim();
    const split = splitUrlPaste(plain);
    if (!split) return; // no URL in the paste — let it behave normally
    // Pasting a link into the LINK field replaces the field, never appends.
    e.preventDefault();
    setUrl(split.url);
    if (!text.trim() && split.rest) setText(split.rest);
  };

  const confirm = () => {
    if (!canConfirm) return;
    let cleanUrl = url.trim();
    let label = text.trim();
    // Backstop: if the field still holds "words + url", store only the URL.
    if (/\s/.test(cleanUrl)) {
      const split = splitUrlPaste(cleanUrl);
      if (split) {
        cleanUrl = split.url;
        if (!label && split.rest) label = split.rest;
      }
    }
    onConfirm({ text: label, url: cleanUrl });
  };

  const handleKeyDown = (e) => {
    // Keep popup keys away from the editor underneath (its Escape/Enter
    // handlers would otherwise cancel or commit the cell).
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  };

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Add link"
      onKeyDown={handleKeyDown}
      // The card is portaled to <body>, but React bubbles its events up the
      // COMPONENT tree — into the cell/display that opened it. Swallow every
      // pointer interaction so a click or double-click inside the popup
      // (e.g. double-clicking the URL to select it) never reaches the cell,
      // which would flip it into edit mode and unmount this popup.
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      onBlur={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
        background: '#fff', border: '1px solid #e8e8e4', borderRadius: pz(4),
        boxShadow: '0 2px 4px rgba(31,31,31,0.05), 0 16px 40px rgba(31,31,31,0.22)',
        paddingTop: pz(14), display: 'flex', flexDirection: 'column',
        fontFamily: FONT, boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: pz(9), padding: `0 ${pz(16)} ${pz(16)}`, borderBottom: '1px solid #ced3d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: pz(10) }}>
          <span style={LABEL_STYLE}>Text</span>
          <input
            type="text"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={textFocus.onFocus}
            onBlur={textFocus.onBlur}
            style={{ ...INPUT_BASE, ...textFocus.style }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: pz(10) }}>
          <span style={LABEL_STYLE}>Link</span>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
            <span
              style={{
                position: 'absolute', left: pz(9), top: '50%', transform: 'translateY(-50%)',
                color: '#9E9E9E', display: 'flex', pointerEvents: 'none',
              }}
            >
              <LinkIcon style={{ width: pz(13), height: pz(13) }} strokeWidth={2} />
            </span>
            <input
              ref={urlRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={handleUrlPaste}
              onFocus={urlFocus.onFocus}
              onBlur={urlFocus.onBlur}
              style={{
                ...INPUT_BASE,
                paddingLeft: pz(28),
                fontFamily: MONO, fontSize: pz(11.5), color: 'var(--brand-deep)',
                ...urlFocus.style,
              }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={confirm}
        disabled={!canConfirm}
        onMouseEnter={() => setConfirmHover(true)}
        onMouseLeave={() => setConfirmHover(false)}
        style={{
          alignSelf: 'stretch', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          // Same hover wash as the filter dropdown rows — follows the theme.
          background: confirmHover && canConfirm ? 'var(--brand-hover-bg)' : 'none', border: 'none',
          padding: `${pz(10)} ${pz(12)}`, marginTop: 1,
          cursor: canConfirm ? 'pointer' : 'default',
          fontFamily: MONO, fontSize: pz(11.5), fontWeight: 400, color: 'var(--brand-deep)',
          opacity: canConfirm ? 1 : 0.45,
        }}
      >
        Confirm
      </button>
    </div>,
    document.body
  );
}
