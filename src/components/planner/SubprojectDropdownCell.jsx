import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * SubprojectDropdownCell Component
 * Dropdown selector for subproject selection with black text
 */

function SubprojectDropdownCell({
  initialValue,
  onComplete,
  onKeyDown,
  cellFontSize,
  rowHeight,
  options = ['-'],
}) {
  const SUBPROJECT_OPTIONS = options;
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = SUBPROJECT_OPTIONS.indexOf(valueToFind);
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
        handleComplete(SUBPROJECT_OPTIONS[selectedIndex]);
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
      handleComplete(SUBPROJECT_OPTIONS[selectedIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, SUBPROJECT_OPTIONS.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Pass through to parent handler
    onKeyDown(e, SUBPROJECT_OPTIONS[selectedIndex]);
  };

  const handleSelect = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    handleComplete(option);
  };

  return (
    <div
      ref={dropdownRef}
      className="relative w-full h-full flex items-center"
      style={{ paddingLeft: '3px', paddingRight: '3px' }}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()} // Prevent parent cell handlers from interfering
      tabIndex={0}
    >
      <button
        ref={buttonRef}
        className="w-full h-full px-1 border-2 border-blue-500 focus:outline-none flex items-center justify-between gap-1"
        style={{
          fontSize: `${cellFontSize}px`,
          backgroundColor: '#ffffff',
          color: '#000000'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex-1 text-left">
          {SUBPROJECT_OPTIONS[selectedIndex] || '\u00A0'}
        </span>
        <ChevronDown size={12} className="flex-shrink-0" style={{ color: '#9ca3af' }} />
      </button>

      {isOpen && createPortal(
        <div
          className="border border-gray-300 shadow-lg"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            backgroundColor: '#ffffff',
            zIndex: 9999
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {SUBPROJECT_OPTIONS.map((option, index) => (
            <div
              key={option}
              className={`py-1 px-2 cursor-pointer ${
                index === selectedIndex ? 'ring-2 ring-inset ring-blue-500' : ''
              } ${option === '-' ? 'text-left' : ''}`}
              style={{
                fontSize: `${cellFontSize}px`,
                minHeight: `${rowHeight}px`,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: index === selectedIndex ? '#eff6ff' : '#ffffff',
                color: '#000000'
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

export default SubprojectDropdownCell;
