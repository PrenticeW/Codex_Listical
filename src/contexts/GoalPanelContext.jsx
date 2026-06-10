/**
 * Goal page panel context — delegates to the shared PagePanelContext so the
 * panel's open state persists across page navigation. Kept as a separate
 * module so existing imports keep working.
 */
import { usePagePanel } from './PagePanelContext';

// Pass-through: state now lives in PagePanelProvider (see Layout.jsx)
export function GoalPanelProvider({ children }) {
  return children;
}

export function useGoalPanel() {
  return usePagePanel();
}
