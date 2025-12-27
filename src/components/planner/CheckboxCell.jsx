import React, { useState, useEffect, useRef } from 'react';

/**
 * CheckboxCell Component
 * Renders a checkbox that participates in copy/paste and selection like other cells
 */
function CheckboxCell({
  initialValue,
  onComplete,
  onKeyDown,
  cellFontSize,
}) {
  // Parse initial value - accept boolean, string "true"/"false", or empty string
  const parseValue = (val) => {
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0' || val === '' || val === null || val === undefined) return false;
    return false;
  };

  const [checked, setChecked] = useState(parseValue(initialValue));
  const checkboxRef = useRef(null);

  // Auto-focus when component mounts
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.focus();
    }
  }, []);

  const handleChange = (e) => {
    const newValue = e.target.checked;
    setChecked(newValue);
    // Immediately save the value
    onComplete(newValue.toString());
  };

  const handleKeyDown = (e) => {
    // Handle navigation keys
    if (['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) {
      // Pass the current checked state as a string for consistency
      onKeyDown(e, checked.toString());
    } else if (e.key === ' ') {
      // Space toggles checkbox - let default behavior handle it
      // Don't pass to onKeyDown to avoid navigation
      return;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center border-2 border-blue-500">
      {/* Hidden input for copy/paste compatibility */}
      <input
        type="text"
        value={checked.toString()}
        onChange={() => {}}
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px' }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="cursor-pointer focus:outline-none"
        style={{
          accentColor: '#c9e9c0', // Done status background color
          width: '20px',
          height: '20px',
          minWidth: '20px',
          minHeight: '20px',
        }}
      />
    </div>
  );
}

export default CheckboxCell;
