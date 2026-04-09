import { useState } from 'react';
import { pickProjectColour } from '../../utils/staging/projectColour';

/**
 * Hook to manage plan modal state
 */
export default function usePlanModal() {
  const [planModal, setPlanModal] = useState({
    open: false,
    itemId: null,
    projectName: '',
    projectNickname: '',
    projectTagline: '',
    color: pickProjectColour([]),
  });

  const openPlanModal = (item, event) => {
    const rect = event?.currentTarget?.getBoundingClientRect() ?? null;
    setPlanModal({
      open: true,
      itemId: item.id,
      projectName: item.projectName ?? item.text,
      projectNickname: item.projectNickname ?? '',
      projectTagline: item.projectTagline ?? '',
      color: item.color ?? pickProjectColour([]),
      anchorRect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
    });
  };

  const closePlanModal = () => {
    setPlanModal((prev) => ({ ...prev, open: false, itemId: null }));
  };

  const updatePlanModal = (updates) => {
    setPlanModal((prev) => ({ ...prev, ...updates }));
  };

  return {
    planModal,
    openPlanModal,
    closePlanModal,
    updatePlanModal,
  };
}
