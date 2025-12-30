import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  readYearMetadata,
  getCurrentYear,
  getYearInfo,
  getAllYears,
  getActiveYear,
  setCurrentYear as setCurrentYearStorage
} from '../lib/yearMetadataStorage';

/**
 * YearContext provides year-level state management across the application
 */
const YearContext = createContext(null);

/**
 * Hook to access year context
 * @returns {Object} Year context value
 */
export function useYear() {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
}

/**
 * YearProvider component
 * Manages the current year state and provides year-related operations
 */
export function YearProvider({ children }) {
  const [currentYear, setCurrentYearState] = useState(() => getCurrentYear());
  const [metadata, setMetadata] = useState(() => readYearMetadata());
  const [isLoading, setIsLoading] = useState(false);

  // Sync with localStorage changes (cross-tab support)
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.type === 'yearMetadataStorage') {
        setMetadata(event.detail);
        setCurrentYearState(event.detail.currentYear);
      }
    };

    window.addEventListener('yearMetadataStorage', handleStorageChange);
    return () => window.removeEventListener('yearMetadataStorage', handleStorageChange);
  }, []);

  // Refresh metadata from storage
  const refreshMetadata = useCallback(() => {
    const freshMetadata = readYearMetadata();
    setMetadata(freshMetadata);
    if (freshMetadata) {
      setCurrentYearState(freshMetadata.currentYear);
    }
  }, []);

  // Switch to a different year (for viewing history)
  const switchToYear = useCallback((yearNumber) => {
    if (!metadata) return;

    const yearInfo = metadata.years.find(y => y.yearNumber === yearNumber);
    if (!yearInfo) {
      console.error(`Year ${yearNumber} does not exist`);
      return;
    }

    setCurrentYearStorage(yearNumber);
    setCurrentYearState(yearNumber);
    refreshMetadata();
  }, [metadata, refreshMetadata]);

  // Switch back to the active year
  const switchToActiveYear = useCallback(() => {
    const activeYear = getActiveYear();
    if (activeYear) {
      switchToYear(activeYear.yearNumber);
    }
  }, [switchToYear]);

  // Get current year info
  const currentYearInfo = metadata?.years.find(y => y.yearNumber === currentYear) || null;

  // Check if current year is archived
  const isCurrentYearArchived = currentYearInfo?.status === 'archived';

  // Get all years
  const allYears = getAllYears();

  // Get active year
  const activeYear = getActiveYear();

  const value = {
    // Current state
    currentYear,
    currentYearInfo,
    isCurrentYearArchived,
    isLoading,

    // Metadata
    metadata,
    allYears,
    activeYear,

    // Operations
    switchToYear,
    switchToActiveYear,
    refreshMetadata,

    // Helper functions
    getYearInfo: (yearNumber) => getYearInfo(yearNumber)
  };

  return (
    <YearContext.Provider value={value}>
      {children}
    </YearContext.Provider>
  );
}

export default YearContext;
