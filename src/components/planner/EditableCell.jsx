import React, { useState, useEffect, useRef } from 'react';
import { containsUrl } from '../../utils/linkify';
import { pasteKeepingLinks } from '../../utils/clipboardText';
import useAddLink from '../../hooks/useAddLink';

/**
 * EditableCell Component
 * Optimized cell input with local state to prevent parent re-renders on every keystroke
 */
function EditableCell({
  initialValue,
  onComplete,
  onKeyDown,
  cellFontSize,
}) {
  const [localValue, setLocalValue] = useState(initialValue);
  const inputRef = useRef(null);
  const shouldSaveRef = useRef(true); // Track if we should save on blur
  const localValueRef = useRef(localValue); // Track current value for unmount
  const onCompleteRef = useRef(onComplete); // Keep latest onComplete without retriggering effects
  const initialValueRef = useRef(initialValue);

  // Cmd/Ctrl+K → Add link popup (see useAddLink).
  const addLink = useAddLink({
    inputRef,
    value: localValue,
    setValue: setLocalValue,
    // Confirm commits straight away so the cell closes and shows the link.
    onCommit: (next) => {
      shouldSaveRef.current = false; // the unmount/blur path must not double-save
      localValueRef.current = next;
      onCompleteRef.current(next);
    },
  });
  const addLinkOpenRef = useRef(false);
  addLinkOpenRef.current = addLink.isOpen;

  // Update refs when values change
  useEffect(() => {
    localValueRef.current = localValue;
  }, [localValue]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Auto-focus when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Position cursor at end instead of selecting all
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, []);

  // Save on true unmount only. Deliberately no dependencies: with deps,
  // React runs this cleanup whenever a parent re-render changes the
  // onComplete identity, which force-committed edits mid-type.
  useEffect(() => {
    return () => {
      if (shouldSaveRef.current && localValueRef.current !== initialValueRef.current) {
        onCompleteRef.current(localValueRef.current);
      }
    };
  }, []);

  const handleBlur = () => {
    // Focus moving into the Add link popup is not the end of the edit.
    if (addLinkOpenRef.current) return;
    // Only save if we haven't cancelled (e.g., via Escape)
    if (shouldSaveRef.current) {
      onComplete(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (addLink.onKeyDown(e)) return;
    if (e.key === 'Escape') {
      // Don't save on blur when escape is pressed
      shouldSaveRef.current = false;
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Enter saves; prevent newline insertion in textarea
      e.preventDefault();
      shouldSaveRef.current = true;
    }

    // Pass the local value to the key handler
    onKeyDown(e, localValue);
  };

  const adjustHeight = (el) => {
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.parentElement?.offsetHeight || 0, el.scrollHeight)}px`;
    }
  };

  // Adjust height when value changes
  useEffect(() => {
    adjustHeight(inputRef.current);
  }, [localValue]);

  // While the value contains a URL, the textarea's own text is made
  // transparent (caret stays visible) and an identically laid-out mirror
  // behind it paints the same text with URLs styled as links.
  const hasUrl = containsUrl(localValue);

  const sharedTextStyle = {
    width: '100%',
    padding: '0 4px',
    fontSize: `${cellFontSize}px`,
    fontFamily: 'inherit',
    lineHeight: 'normal',
    position: 'absolute',
    top: 0,
    left: 0,
    minHeight: '100%',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };

  return (
    <>
      {hasUrl && (
        <div
          aria-hidden
          style={{
            ...sharedTextStyle,
            border: '2px solid transparent',
            background: '#fff',
            zIndex: 10,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {addLink.renderMirror()}
        </div>
      )}
      <textarea
        ref={(el) => {
          inputRef.current = el;
          adjustHeight(el);
        }}
        value={addLink.viewValue}
        onChange={addLink.onViewChange}
        onPaste={(e) => pasteKeepingLinks(e, addLink.onViewChange)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          ...sharedTextStyle,
          border: '2px solid var(--brand)',
          outline: 'none',
          resize: 'none',
          background: hasUrl ? 'transparent' : '#fff',
          color: hasUrl ? 'transparent' : undefined,
          caretColor: '#000',
          overflow: 'hidden',
          zIndex: 11,
        }}
      />
      {addLink.dialog}
    </>
  );
}

export default EditableCell;
