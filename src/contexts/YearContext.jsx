import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  readYearMetadata,
  initializeYearMetadata,
  setCurrentYear as setCurrentYearStorage,
} from '../lib/yearMetadataStorage';
import { supabase } from '../lib/supabase';
import { maybeSnapshotOnSessionStart } from '../lib/snapshotStorage';

/**
 * YearContext provides year-level state management across the application.
 *
 * Since the move to Supabase (step 5 of SUPABASE_MIGRATION_PLAN.md) the
 * helpers are async, so the provider does an initial fetch in useEffect
 * and gates rendering on that completing. Consumers continue to read
 * `currentYear`, `allYears`, etc. synchronously from the context value.
 *
 * The `yearMetadataStorage` window event is dispatched by the helper after
 * every successful mutation. The provider listens for it and replaces the
 * local cache so child pages re-render with the new state.
 */

const YearContext = createContext(null);

/**
 * Hook to access year context.
 */
export function useYear() {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error('useYear must be used within a YearProvider');
  }
  return context;
}

export function YearProvider({ children }) {
  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initial load (and first-time init for fresh users).
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      let next = await readYearMetadata();
      if (!next) {
        const today = new Date().toISOString().split('T')[0];
        next = await initializeYearMetadata(today);
      }
      setMetadata(next);
      // Fire a session-start snapshot (if 4+ hours have passed) once we know
      // the current year. Best-effort — a failure here must never block the load.
      const activeYearNumber = next?.currentYear ?? null;
      if (activeYearNumber != null) {
        maybeSnapshotOnSessionStart(activeYearNumber).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to load year metadata', error);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch when the authenticated user changes (sign in / sign out).
  // Skip INITIAL_SESSION because the mount effect above already loads on
  // first render; if we don't filter it out we end up with two concurrent
  // loads, two concurrent initializeYearMetadata inserts, and a 409 on the
  // unique (user_id, year_number) constraint.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      load();
    });
    return () => subscription?.unsubscribe?.();
  }, [load]);

  // Listen for explicit metadata mutations from yearMetadataStorage.
  useEffect(() => {
    const handler = (event) => {
      if (event.detail) {
        setMetadata(event.detail);
      }
    };
    window.addEventListener('yearMetadataStorage', handler);
    return () => window.removeEventListener('yearMetadataStorage', handler);
  }, []);

  const refreshMetadata = useCallback(async () => {
    const fresh = await readYearMetadata();
    if (fresh) setMetadata(fresh);
  }, []);

  const switchToYear = useCallback(async (yearNumber) => {
    if (!metadata) return;
    const yearInfo = metadata.years.find((y) => y.yearNumber === yearNumber);
    if (!yearInfo) {
      console.error(`Year ${yearNumber} does not exist`);
      return;
    }
    // setCurrentYearStorage fires the metadata event, which updates our cache.
    await setCurrentYearStorage(yearNumber);
  }, [metadata]);

  const switchToActiveYear = useCallback(async () => {
    if (!metadata) return;
    const activeYear = metadata.years.find((y) => y.status === 'active');
    if (activeYear) {
      await switchToYear(activeYear.yearNumber);
    }
  }, [metadata, switchToYear]);

  // Derive view values from cached metadata.
  const currentYear = metadata?.currentYear ?? 1;
  const currentYearInfo = metadata?.years.find((y) => y.yearNumber === currentYear) ?? null;
  const isCurrentYearArchived = currentYearInfo?.status === 'archived';
  const isCurrentYearDraft = currentYearInfo?.status === 'draft';
  const allYears = metadata?.years ?? [];
  const activeYear = metadata?.years.find((y) => y.status === 'active') ?? null;
  const draftYear = metadata?.years.find((y) => y.status === 'draft') ?? null;

  // Synchronous accessor exposed on the context value, served from the cache.
  const getYearInfoFromCache = useCallback(
    (yearNumber) => metadata?.years.find((y) => y.yearNumber === yearNumber) ?? null,
    [metadata],
  );

  // Gate rendering on the first load so callers can rely on currentYear
  // being a real number (every page does loadStagingState(currentYear) and
  // similar; passing null would force a wide rewrite).
  if (isLoading || !metadata) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-500">
        Loading…
      </div>
    );
  }

  const value = {
    // Current state
    currentYear,
    currentYearInfo,
    isCurrentYearArchived,
    isCurrentYearDraft,
    isLoading,

    // Metadata
    metadata,
    allYears,
    activeYear,
    draftYear,

    // Operations
    switchToYear,
    switchToActiveYear,
    refreshMetadata,

    // Helper functions
    getYearInfo: getYearInfoFromCache,
  };

  return (
    <YearContext.Provider value={value}>
      {children}
    </YearContext.Provider>
  );
}

export default YearContext;
