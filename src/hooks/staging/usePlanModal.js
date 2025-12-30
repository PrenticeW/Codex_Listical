import { useState } from 'react';
import { COLOR_PALETTE } from '../../utils/staging/planTableHelpers';

/**
 * Hook to manage plan modal state
 */
export default function usePlanModal() {
  const [planModal, setPlanModal] = useState({
    open: false,
    itemId: null,
    projectName: '',
    projectNickname: '',
    color: COLOR_PALETTE[0],
  });

  const openPlanModal = (item) => {
    setPlanModal({
      open: true,
      itemId: item.id,
      projectName: item.projectName ?? item.text,
      projectNickname: item.projectNickname ?? '',
      color: item.color ?? COLOR_PALETTE[0],
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
