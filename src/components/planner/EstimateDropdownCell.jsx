import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { ESTIMATE_VALUES, ESTIMATE_COLOR_MAP } from '../../constants/planner/rowTypes';

/**
 * EstimateDropdownCell Component
 * Simple dropdown selector for estimate values without pillbox styling
 */
function EstimateDropdownCell({
  initialValue,
  onComplete,
  onCancel,
  onKeyDown,
  cellFontSize,
  rowHeight,
  autoOpen = false,
}) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = ESTIMATE_VALUES.indexOf(valueToFind);
    return index === -1 ? 0 : index;
  });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Calculate position when dropdown opens — flip above the cell if too close to viewport bottom
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(ESTIMATE_VALUES.length * rowHeight + 8, 300);
      const fitsBelow = rect.bottom + estimatedHeight < window.innerHeight - 8;
      setDropdownPosition({
        top: fitsBelow ? rect.bottom : rect.top - estimatedHeight,
        left: Math.min(rect.left, window.innerWidth - rect.width - 8),
        width: rect.width
      });
    }
  }, [isOpen, rowHeight]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside the dropdown button and dropdown list
      if (buttonRef.current && !buttonRef.current.contains(e.target)) {
        handleComplete(ESTIMATE_VALUES[selectedIndex]);
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
      handleComplete(ESTIMATE_VALUES[selectedIndex]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, ESTIMATE_VALUES.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }

    // Pass through to parent handler
    onKeyDown(e, ESTIMATE_VALUES[selectedIndex]);
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
        className="w-full h-full px-1 focus:outline-none flex items-center justify-between gap-1"
        style={{
          fontSize: `${cellFontSize}px`,
          backgroundColor: '#ffffff',
          border: '2px solid var(--sel-ring)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex-1 text-left">
          {ESTIMATE_VALUES[selectedIndex] || '\u00A0'}
        </span>
        <ChevronDown size={12} className="flex-shrink-0" style={{ color: '#9ca3af' }} />
      </button>

      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            backgroundColor: '#ffffff',
            border: '1px solid #e8e8e4',
            borderRadius: 6,
            boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
            zIndex: 9999,
            maxHeight: '300px',
            overflowY: 'auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ESTIMATE_VALUES.map((option, index) => {
            const optionColor = ESTIMATE_COLOR_MAP[option]?.text;
            const isSelected = index === selectedIndex;
            return (
              <div
                key={option}
                className={`py-1 cursor-pointer ${option === '-' ? 'text-left' : ''}`}
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: isSelected ? 'inset 0 0 0 2px var(--brand-deep)' : 'none',
                  backgroundColor: isSelected ? 'var(--sel-row)' : '#ffffff',
                  color: optionColor || 'inherit',
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

export default EstimateDropdownCell;
