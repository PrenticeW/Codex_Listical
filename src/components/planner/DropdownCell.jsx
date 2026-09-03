import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getActiveStatuses, getStatusColors, getStatusLabel } from '../../lib/statusesStorage';
import { useStatuses } from '../../hooks/useStatuses';

// Open list is wider than the cell so it stands out from the rows; options
// keep the cell width, leaving blank space on the right.
const DROPDOWN_EXTRA_WIDTH = 48;
const DROPDOWN_EXTRA_HEIGHT = 24;

/**
 * DropdownCell Component
 * Dropdown selector for spreadsheet cells with keyboard navigation
 */
// Status ids for the dropdown, in user order. Data-driven since the Status
// Manager (docs/STATUS_MANAGER_SPEC.md); '-' stays first as the blank
// default. Call at render time — the list changes when statuses are edited.
export const getStatusDropdownOptions = () =>
  ['-', ...getActiveStatuses().map((s) => s.id)];

// Pillbox colours — kept as a keyed lookup for existing call sites
// (PILLBOX_COLORS[id] → { bg, text }) but backed by the statuses registry so
// edits/renames/recolours flow through everywhere. Values update live.
export const PILLBOX_COLORS = new Proxy({}, {
  get: (_t, key) => (typeof key === 'string' ? getStatusColors(key) : undefined),
  has: () => true,
});

function DropdownCell({
  initialValue,
  onComplete,
  onCancel,
  onKeyDown,
  cellFontSize,
  rowHeight,
  isPillbox = false, // New prop to enable pillbox styling
  autoOpen = false, // Auto-open dropdown when mounted
}) {
  const activeStatuses = useStatuses();
  // Recompute when statuses change; include the current value even if it is
  // a soft-deleted status (so an archived/stale row still shows its chip).
  const DROPDOWN_OPTIONS = useMemo(() => {
    const opts = ['-', ...activeStatuses.map((s) => s.id)];
    const current = initialValue === '' ? '-' : initialValue;
    if (current && !opts.includes(current)) opts.push(current);
    return opts;
  }, [activeStatuses, initialValue]);
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Handle empty string as "-"
    const valueToFind = initialValue === '' ? '-' : initialValue;
    const index = ['-', ...getActiveStatuses().map((s) => s.id)].indexOf(valueToFind);
    return index === -1 ? 0 : index;
  });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Calculate position when dropdown opens — flip above the cell if too close to viewport bottom
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(DROPDOWN_OPTIONS.length * rowHeight + 8 + DROPDOWN_EXTRA_HEIGHT, 300);
      const fitsBelow = rect.bottom + estimatedHeight < window.innerHeight - 8;
      setDropdownPosition({
        top: fitsBelow ? rect.bottom : rect.top - estimatedHeight,
        left: Math.min(rect.left, window.innerWidth - rect.width - DROPDOWN_EXTRA_WIDTH - 8),
        width: rect.width
      });
    }
  }, [isOpen, rowHeight]);

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

  // Whenever the dropdown opens, make sure the trigger owns keyboard focus.
  // The cell can mount already open with focus left on <body>, so Escape /
  // Enter never reached the wrapper's onKeyDown (same fix as
  // EstimateDropdownCell).
  useEffect(() => {
    if (isOpen && buttonRef.current && document.activeElement !== buttonRef.current) {
      buttonRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

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
        className={`${isPillbox ? 'py-0.5 flex-1' : 'w-full h-full px-1'} focus:outline-none flex items-center justify-between gap-1`}
        style={{
          fontSize: isPillbox ? `${cellFontSize}px` : `${cellFontSize}px`,
          backgroundColor: isPillbox && colors ? colors.bg : '#ffffff',
          color: isPillbox && colors ? colors.text : 'inherit',
          fontWeight: isPillbox ? '500' : 'normal',
          // Design handover (reference/SystemDropdowns.jsx, PillTrigger) uses
          // a squarer borderRadius: 5 chip, not a fully-rounded pill.
          borderRadius: isPillbox ? '5px' : undefined,
          paddingLeft: isPillbox ? '8px' : undefined,
          paddingRight: isPillbox ? '8px' : undefined,
          border: '2px solid var(--sel-ring)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={isPillbox ? '' : 'flex-1 text-left'}>
          {getStatusLabel(DROPDOWN_OPTIONS[selectedIndex]) || '\u00A0'}
        </span>
        <ChevronDown size={14} className="flex-shrink-0" style={{ color: isPillbox && colors ? colors.text : '#9ca3af' }} />
      </button>

      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width + DROPDOWN_EXTRA_WIDTH}px`,
            backgroundColor: '#ffffff',
            border: '1px solid #e8e8e4',
            borderRadius: 6,
            boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
            zIndex: 9999,
            paddingBottom: `${DROPDOWN_EXTRA_HEIGHT}px`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {DROPDOWN_OPTIONS.map((option, index) => {
            const optionColors = isPillbox ? PILLBOX_COLORS[option] : null;
            return (
              <div
                key={option}
                className={`py-1 cursor-pointer ${option === '-' ? 'text-left' : ''}`}
                style={{
                  fontSize: `${cellFontSize}px`,
                  minHeight: `${rowHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: (!isPillbox && index === selectedIndex) ? 'inset 0 0 0 2px var(--brand-deep)' : 'none',
                  backgroundColor: isPillbox && optionColors ? optionColors.bg : (index === selectedIndex ? 'var(--sel-row)' : '#ffffff'),
                  color: isPillbox && optionColors ? optionColors.text : 'inherit',
                  borderRadius: isPillbox ? '5px' : '0',
                  margin: isPillbox ? '2px 4px' : '0',
                  fontWeight: isPillbox ? '500' : 'normal',
                  paddingLeft: isPillbox ? '8px' : '8px',
                  paddingRight: isPillbox ? '8px' : '8px',
                  width: `${dropdownPosition.width - (isPillbox ? 8 : 0)}px`
                }}
                onMouseDown={(e) => handleSelect(e, option)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getStatusLabel(option)}
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
