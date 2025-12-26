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

// Pillbox color configuration
const PILLBOX_COLORS = {
  '-': { bg: '#ffffff', text: '#000000' },
  'Not Scheduled': { bg: '#e5e5e5', text: '#000000' },
  'Scheduled': { bg: '#ffe5a0', text: '#473821' },
  'Done': { bg: '#c9e9c0', text: '#276436' },
  'Abandoned': { bg: '#e8d9f3', text: '#5a3b74' },
  'Blocked': { bg: '#f3c4c4', text: '#9c2f2f' },
  'On Hold': { bg: '#505050', text: '#ffffff' },
  'Special': { bg: '#cce3ff', text: '#3a70b7' }
};

function DropdownCell({
  initialValue,
  onComplete,
  onKeyDown,
  cellFontSize,
  rowHeight,
  isPillbox = false, // New prop to enable pillbox styling
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

  const currentOption = DROPDOWN_OPTIONS[selectedIndex];
  const colors = isPillbox ? PILLBOX_COLORS[currentOption] : null;

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
        className={`${isPillbox ? 'py-0.5 rounded-full flex-1' : 'w-full h-full px-1'} border-2 border-blue-500 focus:outline-none flex items-center justify-between gap-1`}
        style={{
          fontSize: isPillbox ? `${cellFontSize}px` : `${cellFontSize}px`,
          backgroundColor: isPillbox && colors ? colors.bg : '#ffffff',
          color: isPillbox && colors ? colors.text : 'inherit',
          fontWeight: isPillbox ? '500' : 'normal',
          paddingLeft: isPillbox ? '8px' : undefined,
          paddingRight: isPillbox ? '8px' : undefined
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={isPillbox ? '' : 'flex-1 text-left'}>
          {DROPDOWN_OPTIONS[selectedIndex] || '\u00A0'}
        </span>
        <ChevronDown size={isPillbox ? 10 : 12} className="flex-shrink-0" style={{ color: isPillbox && colors ? colors.text : '#9ca3af' }} />
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
          {DROPDOWN_OPTIONS.map((option, index) => {
            const optionColors = isPillbox ? PILLBOX_COLORS[option] : null;
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
                  backgroundColor: isPillbox && optionColors ? optionColors.bg : (index === selectedIndex ? '#eff6ff' : '#ffffff'),
                  color: isPillbox && optionColors ? optionColors.text : 'inherit',
                  borderRadius: isPillbox ? '9999px' : '0',
                  margin: isPillbox ? '2px 4px' : '0',
                  fontWeight: isPillbox ? '500' : 'normal',
                  paddingLeft: isPillbox ? '8px' : '8px',
                  paddingRight: isPillbox ? '8px' : '8px'
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

export default DropdownCell;
export { PILLBOX_COLORS };
