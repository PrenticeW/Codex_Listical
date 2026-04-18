import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Inline-editable text span. Displays as plain text; on click, switches to an input.
 * Saves on blur or Enter, cancels on Escape.
 */
export default function InlineEditableText({
  value,
  onSave,
  placeholder = '',
  className = '',
  inputClassName = '',
  style = {},
  inputStyle = {},
  maxLength = 120,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  // Sync draft when value changes externally while not editing
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Auto-focus and select on edit start
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== (value ?? '').trim()) {
      onSave(trimmed);
    }
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value ?? '');
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
      // Stop propagation so parent shortcuts don't fire
      e.stopPropagation();
    },
    [commit, cancel]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={inputClassName}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderBottom: '1px solid currentColor',
          outline: 'none',
          color: 'inherit',
          font: 'inherit',
          padding: '0 2px',
          margin: 0,
          minWidth: '60px',
          ...inputStyle,
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
      className={className}
      style={{
        cursor: 'text',
        borderBottom: '1px dashed transparent',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderBottomColor = 'currentColor';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderBottomColor = 'transparent';
      }}
      title="Click to edit"
    >
      {value || <span style={{ opacity: 0.5 }}>{placeholder}</span>}
    </span>
  );
}
