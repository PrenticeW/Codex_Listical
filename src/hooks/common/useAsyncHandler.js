/**
 * Generic Async Handler Hook
 * Provides a wrapper for async operations with loading state management
 *
 * This hook eliminates the repetitive try-catch-finally pattern
 * with setIsLoading(true) -> operation -> setIsLoading(false).
 */

import { useCallback } from 'react';

/**
 * Creates a wrapper for an async function with automatic loading state management
 *
 * @param {Function} asyncFunction - The async function to wrap
 * @param {Function} setIsLoading - State setter for loading indicator
 * @returns {Function} Wrapped async function
 *
 * @example
 * const handleLogin = useAsyncHandler(async (email, password) => {
 *   const mockUser = { id: 'user-123', email };
 *   setUser(mockUser);
 *   return { user: mockUser, error: null };
 * }, setIsLoading);
 */
export default function useAsyncHandler(asyncFunction, setIsLoading) {
  return useCallback(
    async (...args) => {
      try {
        setIsLoading(true);
        return await asyncFunction(...args);
      } catch (error) {
        console.error('Async operation error:', error);
        return { error };
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFunction, setIsLoading]
  );
}
