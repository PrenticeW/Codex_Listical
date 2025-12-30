import React, { useState } from 'react';
import { useYear } from '../contexts/YearContext';
import { ChevronDown, Archive } from 'lucide-react';

/**
 * YearSelector Component
 *
 * Dropdown selector for switching between years.
 * Shows current year and allows viewing archived years.
 */
export function YearSelector({ className = '' }) {
  const {
    currentYear,
    currentYearInfo,
    allYears,
    activeYear,
    switchToYear,
    switchToActiveYear,
  } = useYear();

  const [isOpen, setIsOpen] = useState(false);

  const handleYearSelect = (yearNumber) => {
    switchToYear(yearNumber);
    setIsOpen(false);
  };

  const handleBackToActive = () => {
    switchToActiveYear();
    setIsOpen(false);
  };

  if (!currentYearInfo) {
    return null; // Not yet initialized
  }

  const isViewingArchive = currentYearInfo.status === 'archived';

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          border transition-colors
          ${isViewingArchive
            ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
          }
        `}
      >
        {isViewingArchive && <Archive className="w-4 h-4" />}
        <span className="font-medium">
          Year {currentYear}
          {isViewingArchive ? ' (Archived)' : ' (Active)'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown menu */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
            {/* Active year section */}
            {activeYear && (
              <div className="border-b border-gray-200">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Active
                </div>
                <button
                  onClick={() => handleYearSelect(activeYear.yearNumber)}
                  className={`
                    w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                    ${currentYear === activeYear.yearNumber ? 'bg-blue-50' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                      Year {activeYear.yearNumber}
                    </span>
                    {currentYear === activeYear.yearNumber && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Started {new Date(activeYear.startDate).toLocaleDateString()}
                  </div>
                </button>
              </div>
            )}

            {/* Archived years section */}
            {allYears.filter(y => y.status === 'archived').length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Archived
                </div>
                {allYears
                  .filter(y => y.status === 'archived')
                  .sort((a, b) => b.yearNumber - a.yearNumber) // Most recent first
                  .map(year => (
                    <button
                      key={year.yearNumber}
                      onClick={() => handleYearSelect(year.yearNumber)}
                      className={`
                        w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                        ${currentYear === year.yearNumber ? 'bg-amber-50' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Archive className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            Year {year.yearNumber}
                          </span>
                        </div>
                        {currentYear === year.yearNumber && (
                          <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">
                            Viewing
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-1 ml-6">
                        {year.totalWeeksCompleted} weeks · {year.totalHoursCompleted}h completed
                      </div>
                      <div className="text-xs text-gray-400 mt-1 ml-6">
                        {new Date(year.startDate).toLocaleDateString()} - {new Date(year.endDate).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {/* Quick action to return to active year */}
            {isViewingArchive && (
              <div className="border-t border-gray-200">
                <button
                  onClick={handleBackToActive}
                  className="w-full text-left px-4 py-3 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
                >
                  Return to Active Year
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default YearSelector;
