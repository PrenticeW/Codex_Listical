import React, { useState, useEffect, useRef } from 'react';
import { containsUrl, renderUrlSegments } from '../../utils/linkify';

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

  // Update ref when local value changes
  useEffect(() => {
    localValueRef.current = localValue;
  }, [localValue]);

  // Auto-focus when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Position cursor at end instead of selecting all
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, []);

  // Save on unmount if we should save
  useEffect(() => {
    return () => {
      if (shouldSaveRef.current && localValueRef.current !== initialValue) {
        onComplete(localValueRef.current);
      }
    };
  }, [initialValue, onComplete]);

  const handleBlur = () => {
    // Only save if we haven't cancelled (e.g., via Escape)
    if (shouldSaveRef.current) {
      onComplete(localValue);
    }
  };

  const handleKeyDown = (e) => {
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
          {renderUrlSegments(localValue)}
        </div>
      )}
      <textarea
        ref={(el) => {
          inputRef.current = el;
          adjustHeight(el);
        }}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
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
    </>
  );
}

export default EditableCell;
