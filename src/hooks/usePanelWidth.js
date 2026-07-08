/**
 * Panel Width Hook
 *
 * Manages a single, global panel width (px) shared by every side panel that
 * renders through PanelShell — Gear, System, Goal, Plan, and (via SystemPanel's
 * 50%-width slide track) the Task Row sub-pane. Unlike usePageSize, this is a
 * single value, not scoped per page, since all panels should resize together.
 *
 * Persisted to localStorage via storageService and kept in sync across every
 * mounted panel instance with a CustomEvent — same pattern as usePageSize.js.
 */

import { useState, useCallback, useEffect } from 'react';
import storage from '../lib/storageService';

const STORAGE_KEY = 'panel-width';
const EVENT_NAME = 'panel-width-change';

export const DEFAULT_PANEL_WIDTH = 320;
export const MIN_PANEL_WIDTH = 280;
export const MAX_PANEL_WIDTH = 600;

const clampWidth = (value) =>
  Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, value));

/**
 * Read the persisted panel width from storage.
 * @returns {number} Panel width in px (defaults to 320)
 */
const readPanelWidth = () => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PANEL_WIDTH;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_PANEL_WIDTH;
  } catch (error) {
    console.error('Failed to read panel width', error);
    return DEFAULT_PANEL_WIDTH;
  }
};

/**
 * Save the panel width to storage and notify other mounted panel instances.
 * @param {number} width - Requested width (will be clamped)
 * @returns {number} The clamped width that was actually saved
 */
const savePanelWidth = (width) => {
  const clamped = clampWidth(width);
  try {
    const currentValue = storage.getItem(STORAGE_KEY);
    const newValue = clamped.toString();

    // Only save and dispatch if the value actually changed
    if (currentValue === newValue) {
      return clamped;
    }

    storage.setItem(STORAGE_KEY, newValue);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: clamped }));
  } catch (error) {
    console.error('Failed to save panel width', error);
  }
  return clamped;
};

/**
 * Hook for the shared, persisted panel width used by every PanelShell
 * instance (Gear, System, Goal, Plan, Task Row sub-pane).
 * @returns {{ width: number, setWidth: (value: number) => void, minWidth: number, maxWidth: number }}
 */
export default function usePanelWidth() {
  const [width, setWidthState] = useState(() => readPanelWidth());

  // Sync with storage and every other mounted panel instance
  useEffect(() => {
    const handleChange = (event) => {
      if (event.detail !== undefined) {
        setWidthState(event.detail);
      }
    };
    window.addEventListener(EVENT_NAME, handleChange);
    return () => window.removeEventListener(EVENT_NAME, handleChange);
  }, []);

  // Wrapped setter that saves to storage immediately (clamped)
  const setWidth = useCallback((value) => {
    const clamped = savePanelWidth(value);
    setWidthState(clamped);
  }, []);

  return {
    width,
    setWidth,
    minWidth: MIN_PANEL_WIDTH,
    maxWidth: MAX_PANEL_WIDTH,
  };
}
