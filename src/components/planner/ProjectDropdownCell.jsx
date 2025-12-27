import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * ProjectDropdownCell Component
 * Dropdown selector for project selection with grey chip styling
 */

// Color configuration for project chips
const PROJECT_COLORS = {
  '-': { bg: '#ffffff', text: '#000000' }, // White for default
  default: { bg: '#e5e5e5', text: '#000000' } // Grey for projects
};

function ProjectDropdownCell({
  initialValue,
  onComplete,
  onCancel,
  onKeyDown,
  cellFontSize,
  rowHeight,
  options = ['-'],
  autoOpen = false,
}) {
  const PROJECT_OPTIONS = options;
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = PROJECT_OPTIONS.indexOf(valueToFind);
    return index === -1 ? 0 : index;
  });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside the dropdown button and dropdown list
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        handleComplete(PROJECT_OPTIONS[selectedIndex]);
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

  const handleCancel = () => {
    setIsOpen(false);
    if (onCancel) {
      onCancel();
    } else {
      onComplete(initialValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleComplete(PROJECT_OPTIONS[selectedIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, PROJECT_OPTIONS.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Pass through to parent handler
    onKeyDown(e, PROJECT_OPTIONS[selectedIndex]);
  };

  const handleSelect = (e, option) => {
    e.preventDefault();
    e.stopPropagation();
    handleComplete(option);
  };

  const currentOption = PROJECT_OPTIONS[selectedIndex];
  const currentColors = currentOption === '-' ? PROJECT_COLORS['-'] : PROJECT_COLORS.default;

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
        className="py-0.5 rounded-full flex-1 border-2 border-blue-500 focus:outline-none flex items-center justify-between gap-1"
        style={{
          fontSize: `${cellFontSize}px`,
          backgroundColor: currentColors.bg,
          color: currentColors.text,
          fontWeight: '500',
          paddingLeft: '8px',
          paddingRight: '8px'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {PROJECT_OPTIONS[selectedIndex] || '\u00A0'}
        </span>
        <ChevronDown size={10} className="flex-shrink-0" style={{ color: currentColors.text }} />
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
          {PROJECT_OPTIONS.map((option, index) => {
            const optionColors = option === '-' ? PROJECT_COLORS['-'] : PROJECT_COLORS.default;
            return (
              <div
                key={option}
                className={`py-1 cursor-pointer ${
                  index === selectedIndex ? 'ring-2 ring-inset ring-blue-500' : ''
                } ${option === '-' ? 'text-left' : ''}`}
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: optionColors.bg,
                  color: optionColors.text,
                  borderRadius: '9999px',
                  margin: '2px 4px',
                  fontWeight: '500',
                  paddingLeft: '8px',
                  paddingRight: '8px'
                }}
                onMouseDown={(e) => handleSelect(e, option)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {option}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export default ProjectDropdownCell;
