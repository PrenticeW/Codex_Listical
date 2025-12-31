/**
 * Generic Auto-Persist Hook
 * Automatically saves a value to storage when it changes (after initial mount)
 *
 * This hook eliminates the need for repetitive useEffect + isInitialMount patterns
 * by providing a reusable abstraction for auto-saving state to localStorage.
 */

import { useEffect, useRef } from 'react';

/**
 * Automatically persists a value to storage when it changes
 *
 * @param {*} value - The value to persist
 * @param {Function} saveFunction - Function to call to save the value (receives value, projectId, yearNumber)
 * @param {Object} options - Configuration options
 * @param {string} options.projectId - Project identifier
 * @param {number|null} options.yearNumber - Year number for scoped storage
 * @param {boolean} options.skipInitialSave - Whether to skip saving on initial mount (default: true)
 * @param {Function} options.shouldSave - Optional predicate to determine if value should be saved
 *
 * @example
 * const [startDate, setStartDate] = useState(() => readStartDate(projectId, yearNumber));
 * useAutoPersist(startDate, saveStartDate, { projectId, yearNumber });
 */
export default function useAutoPersist(value, saveFunction, options = {}) {
  const {
    projectId,
    yearNumber,
    skipInitialSave = true,
    shouldSave = () => true,
  } = options;

  const isInitialMount = useRef(skipInitialSave);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (shouldSave(value)) {
      saveFunction(value, projectId, yearNumber);
    }
  }, [value, saveFunction, projectId, yearNumber, shouldSave]);
}
