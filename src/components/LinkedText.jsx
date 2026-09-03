import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, ExternalLink, Link2Off } from 'lucide-react';
import { linkifyText, formatMarkdownLink } from '../utils/linkify';
import { getPageZoom } from '../utils/pageZoom';
import AddLinkDialog from './AddLinkDialog';

/**
 * Renders text with clickable links plus the link hover toolbar
 * (Edit · Visit · Remove) from the Link UI handoff.
 *
 *   <LinkedText text={storedText} onChange={(nextStored) => save(nextStored)} />
 *
 * The toolbar appears under a link after a short hover delay so a plain
 * click on the link still just opens it. Without `onChange` the text is
 * read-only: only Visit is offered. Remove is hidden for bare URLs (there is
 * no separate text to keep).
 */

const MONO = "'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace";
const SHOW_DELAY_MS = 500;
const HIDE_DELAY_MS = 180;
const pz = (n) => `calc(${n}px * var(--pz))`;

function Action({ icon, label, danger, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: pz(6),
        padding: `${pz(7)} ${pz(12)}`, border: 'none', cursor: 'pointer',
        background: hover ? 'var(--brand-hover-bg)' : 'none',
        fontFamily: MONO, fontSize: pz(11), color: danger ? '#DD2C2C' : 'var(--brand-deep)',
        whiteSpace: 'nowrap',
      }}
    >
      {React.createElement(icon, { style: { width: pz(11), height: pz(11) }, strokeWidth: 2 })}
      {label}
    </button>
  );
}

const Divider = () => <span style={{ width: 1, background: '#e8e8e4', alignSelf: 'stretch' }} />;

export default function LinkedText({ text, onChange }) {
  const [hovered, setHovered] = useState(null); // { link, el }
  const [editing, setEditing] = useState(null); // link being edited
  const [pos, setPos] = useState(null);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const anchorElRef = useRef(null);
  const toolbarRef = useRef(null);
  const textRef = useRef(text);
  textRef.current = text;

  const clearTimers = () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  };

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHovered(null), HIDE_DELAY_MS);
  }, []);

  const cancelHide = useCallback(() => clearTimeout(hideTimer.current), []);

  const onEnter = useCallback((link, el) => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      anchorElRef.current = el;
      setHovered({ link, el });
    }, SHOW_DELAY_MS);
  }, []);

  const onLeave = useCallback(() => {
    clearTimeout(showTimer.current);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => () => clearTimers(), []);

  // Position the toolbar 6px under the hovered link, kept inside the window.
  useEffect(() => {
    if (!hovered) { setPos(null); return; }
    const place = () => {
      const el = hovered.el;
      if (!el || !el.isConnected) { setHovered(null); return; }
      const r = el.getBoundingClientRect();
      const z = getPageZoom();
      const w = toolbarRef.current?.offsetWidth || 220 * z;
      const h = toolbarRef.current?.offsetHeight || 30 * z;
      const gap = 6 * z;
      const fitsBelow = r.bottom + gap + h < window.innerHeight - 8;
      setPos({
        top: fitsBelow ? r.bottom + gap : r.top - gap - h,
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [hovered]);

  const replaceRange = (link, replacement) => {
    const src = textRef.current ?? '';
    onChange?.(src.slice(0, link.start) + replacement + src.slice(link.end));
  };

  const handleVisit = (link) => {
    window.open(link.href, '_blank', 'noopener,noreferrer');
    setHovered(null);
  };
  const handleEdit = (link) => {
    clearTimers();
    setHovered(null);
    setEditing(link);
  };
  const handleRemove = (link) => {
    replaceRange(link, link.label);
    setHovered(null);
  };

  const nodes = linkifyText(text, {
    anchorProps: (link) => ({
      onMouseEnter: (e) => onEnter(link, e.currentTarget),
      onMouseLeave: onLeave,
    }),
  });

  const canEdit = typeof onChange === 'function';
  const link = hovered?.link;

  return (
    <>
      {nodes}
      {hovered && pos && createPortal(
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Link actions"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
            display: 'flex', alignItems: 'stretch', overflow: 'hidden',
            background: '#fff', border: '1px solid #ced3d0', borderRadius: pz(4),
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          }}
        >
          {canEdit && <Action icon={Pencil} label="Edit" onClick={() => handleEdit(link)} />}
          {canEdit && <Divider />}
          <Action icon={ExternalLink} label="Visit" onClick={() => handleVisit(link)} />
          {canEdit && link.isMarkdown && <Divider />}
          {canEdit && link.isMarkdown && (
            <Action icon={Link2Off} label="Remove" danger onClick={() => handleRemove(link)} />
          )}
        </div>,
        document.body
      )}
      {canEdit && (
        <AddLinkDialog
          open={!!editing}
          anchorRef={anchorElRef}
          initialText={editing?.label ?? ''}
          initialUrl={editing?.href ?? ''}
          onConfirm={({ text: label, url }) => {
            replaceRange(editing, formatMarkdownLink(label, url));
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
