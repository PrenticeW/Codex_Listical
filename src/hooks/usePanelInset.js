/**
 * usePanelInset
 *
 * Returns how many pixels of the viewport's right edge are currently covered
 * by a side panel (Gear panel or the shared page panel — Goal/Plan/System),
 * so page content can reserve that space and the last columns/weeks can still
 * scroll fully into view instead of being hidden under the panel.
 *
 * The value is dynamic:
 *   - 0 when no panel is open
 *   - the persisted panel width (usePanelWidth) when a panel is open
 *   - the live width while the user is dragging the panel's resize handle
 *     (PanelShell broadcasts PANEL_LIVE_WIDTH_EVENT during the drag)
 *
 * Returns { inset, isResizing } — apply `inset` as paddingRight/marginRight on
 * the page's content wrapper; disable any CSS transition while `isResizing`
 * so the content tracks the drag 1:1 instead of lagging behind it.
 */

import { useEffect, useState } from 'react';
import usePanelWidth from './usePanelWidth';
import { useGearPanel } from '../contexts/GearPanelContext';
import { usePagePanel } from '../contexts/PagePanelContext';
import { PANEL_LIVE_WIDTH_EVENT } from '../components/PanelShell';

export default function usePanelInset() {
  const { width } = usePanelWidth();
  const { isOpen: gearOpen } = useGearPanel();
  const { isOpen: pagePanelOpen } = usePagePanel();

  // Live width while a PanelShell resize drag is in progress; null otherwise.
  const [liveWidth, setLiveWidth] = useState(null);
  useEffect(() => {
    const handler = (e) => setLiveWidth(e.detail ?? null);
    window.addEventListener(PANEL_LIVE_WIDTH_EVENT, handler);
    return () => window.removeEventListener(PANEL_LIVE_WIDTH_EVENT, handler);
  }, []);

  const anyOpen = gearOpen || pagePanelOpen;
  return {
    inset: anyOpen ? (liveWidth ?? width) : 0,
    isResizing: liveWidth != null,
  };
}
