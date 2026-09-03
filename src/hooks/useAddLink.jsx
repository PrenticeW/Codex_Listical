import React, { useCallback, useMemo, useRef, useState } from 'react';
import AddLinkDialog from '../components/AddLinkDialog';
import { applyLinkToView, fromEditView, renderEditView, toEditView } from '../utils/linkEditView';

/** True when the event is Cmd+K (Mac) or Ctrl+K (Windows/Linux). */
export function isAddLinkShortcut(e) {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K');
}

/**
 * Wires linked text + the Add link popup into a text input / textarea.
 *
 *   const link = useAddLink({ inputRef, value, setValue, onCommit });
 *   <textarea ref={inputRef} value={link.viewValue} onChange={link.onViewChange}
 *             onKeyDown={(e) => { if (link.onKeyDown(e)) return; ... }} />
 *   {link.dialog}
 *
 * `value` is the stored text (may contain [label](url)); the box shows
 * `viewValue` — labels only, never the URL or brackets. `renderMirror()`
 * paints the same text with labels styled as links for the mirror layer.
 * Cmd/Ctrl+K opens the popup (selection → TEXT; caret in a link → edit mode).
 * Confirm writes the link and calls `onCommit(nextStored)` when given so the
 * editor can close and show the clickable link; otherwise it refocuses.
 * `isOpen` is true while the popup is up — editors skip blur-to-save then.
 */
export default function useAddLink({ inputRef, value, setValue, onCommit }) {
  const [state, setState] = useState(null); // { start, end, text, url } in view coords
  const valueRef = useRef(value);
  valueRef.current = value;

  const view = useMemo(() => toEditView(value ?? ''), [value]);

  const onViewChange = useCallback((eOrText) => {
    const next = typeof eOrText === 'string' ? eOrText : eOrText?.target?.value ?? '';
    setValue(fromEditView(next, toEditView(valueRef.current ?? '').links));
  }, [setValue]);

  const onKeyDown = useCallback((e) => {
    if (!isAddLinkShortcut(e)) return false;
    const el = inputRef.current;
    if (!el) return false;
    e.preventDefault();
    e.stopPropagation();

    const { text, links } = toEditView(valueRef.current ?? '');
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const existing = links.find((l) => start <= l.end && end >= l.start);
    if (existing) {
      setState({ start: existing.start, end: existing.end, text: existing.label, url: existing.url });
    } else {
      setState({ start, end, text: text.slice(start, end), url: '' });
    }
    return true;
  }, [inputRef]);

  const close = useCallback(() => {
    setState(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputRef]);

  const handleConfirm = useCallback(({ text, url }) => {
    if (!state) return;
    const next = applyLinkToView(valueRef.current ?? '', state.start, state.end, text, url);
    const caret = state.start + ((text || '').trim() || url).length;
    setValue(next);
    setState(null);
    if (onCommit) {
      onCommit(next);
      return;
    }
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(caret, caret); } catch { /* not all inputs support this */ }
    });
  }, [state, setValue, inputRef, onCommit]);

  const dialog = (
    <AddLinkDialog
      open={!!state}
      anchorRef={inputRef}
      initialText={state?.text ?? ''}
      initialUrl={state?.url ?? ''}
      onConfirm={handleConfirm}
      onCancel={close}
    />
  );

  const renderMirror = useCallback(() => renderEditView(valueRef.current ?? ''), []);

  return { onKeyDown, dialog, isOpen: !!state, viewValue: view.text, onViewChange, renderMirror };
}
