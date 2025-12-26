import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * DropdownCell Component
 * Dropdown selector for spreadsheet cells with keyboard navigation
 */
const DROPDOWN_OPTIONS = [
  '-',
  'Not Scheduled',
  'Scheduled',
  'Done',
  'Abandoned',
  'Blocked',
  'On Hold',
  'Special'
];

function DropdownCell({
  initialValue,
  onComplete,
  onKeyDown,
  cellFontSize,
  rowHeight,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = DROPDOWN_OPTIONS.indexOf(valueToFind);
    return index === -1 ? 0 : index;
  });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Auto-open dropdown when component mounts and calculate position
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
    setIsOpen(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside the dropdown button and dropdown list
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        handleComplete(DROPDOWN_OPTIONS[selectedIndex]);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, selectedIndex]);

  const handleComplete = (value) => {
    setIsOpen(false);
    onComplete(value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleComplete(initialValue); // Cancel - use initial value
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleComplete(DROPDOWN_OPTIONS[selectedIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, DROPDOWN_OPTIONS.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Pass through to parent handler
    onKeyDown(e, DROPDOWN_OPTIONS[selectedIndex]);
  };

  const handleSelect = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    handleComplete(option);
  };

  return (
    <div
      ref={dropdownRef}
      className="relative w-full h-full"
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()} // Prevent parent cell handlers from interfering
      tabIndex={0}
    >
      <button
        ref={buttonRef}
        className="w-full h-full px-1 border-2 border-blue-500 focus:outline-none flex items-center justify-between bg-white"
        style={{ fontSize: `${cellFontSize}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex-1 text-left">
          {DROPDOWN_OPTIONS[selectedIndex] || '\u00A0'}
        </span>
        <ChevronDown size={12} className="flex-shrink-0 text-gray-400 ml-1" />
      </button>

      {isOpen && createPortal(
        <div
          className="bg-white border border-gray-300 shadow-lg"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 9999
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {DROPDOWN_OPTIONS.map((option, index) => (
            <div
              key={option}
              className={`px-2 py-1 cursor-pointer hover:bg-blue-100 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              } ${option === '-' ? 'text-left' : ''}`}
              style={{
                fontSize: `${cellFontSize}px`,
                minHeight: `${rowHeight}px`,
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseDown={(e) => handleSelect(e, option)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {option}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default DropdownCell;
