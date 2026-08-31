/**
 * useStatuses — React subscription to the statuses registry
 * (src/lib/statusesStorage.js). Re-renders on STATUSES_UPDATED_EVENT so
 * chips/dropdowns repaint when the user edits statuses in the Manage
 * Statuses panel. Triggers the initial Supabase load once per app session.
 */
import { useSyncExternalStore } from 'react';
import {
  STATUSES_UPDATED_EVENT,
  getActiveStatuses,
  loadStatuses,
  statusesReady,
} from '../lib/statusesStorage';

let loadKicked = false;

const subscribe = (cb) => {
  if (!loadKicked) {
    loadKicked = true;
    loadStatuses(); // fire and forget; registry event triggers re-render
  }
  window.addEventListener(STATUSES_UPDATED_EVENT, cb);
  return () => window.removeEventListener(STATUSES_UPDATED_EVENT, cb);
};

let cachedSnapshot = null;
let cachedReady = false;
const getSnapshot = () => {
  const ready = statusesReady();
  // getActiveStatuses returns a new array each call; keep referential
  // stability between events so useSyncExternalStore doesn't loop.
  if (!cachedSnapshot || cachedReady !== ready) {
    cachedSnapshot = getActiveStatuses();
    cachedReady = ready;
  }
  return cachedSnapshot;
};

if (typeof window !== 'undefined') {
  window.addEventListener(STATUSES_UPDATED_EVENT, () => { cachedSnapshot = null; });
}

/** Active statuses in order (excludes '-'). */
export function useStatuses() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
