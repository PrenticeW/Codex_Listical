import React, { useState, useEffect, useRef } from 'react';

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

  // Sync with external changes (e.g., when editing starts)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Auto-focus when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
    } else if (e.key === 'Enter') {
      // Mark that we should save (in case blur happens after Enter)
      shouldSaveRef.current = true;
    }

    // Pass the local value to the key handler
    onKeyDown(e, localValue);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full h-full px-1 border-2 border-blue-500 focus:outline-none"
      style={{ fontSize: `${cellFontSize}px` }}
    />
  );
}

export default EditableCell;
