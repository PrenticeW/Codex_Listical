import { useCallback } from 'react';
import { clonePlanTableEntries } from '../../utils/staging/planTableHelpers';
import { ensurePlanPairingMetadata } from '../../utils/staging/rowPairing';

/**
 * Hook to handle plan modal actions (save, close)
 */
export default function usePlanModalActions({ planModal, setState, closePlanModal }) {
  /**
   * Handle "Next" button in plan modal - save project metadata and show/update plan table
   */
  const handlePlanNext = useCallback(() => {
    if (planModal.itemId) {
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== planModal.itemId) return item;

          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;

          const planTableEntries = clonePlanTableEntries(item.planTableEntries);
          ensurePlanPairingMetadata({
            entries: planTableEntries,
            reasonRowCount: reasonCount,
            outcomeRowCount: outcomeCount,
            questionRowCount: questionCount,
            needsQuestionRowCount: needsQuestionCount,
            needsPlanRowCount: needsPlanCount,
          });

          const nextProjectMetadata = {
            projectName: planModal.projectName,
            projectNickname: planModal.projectNickname,
            color: planModal.color ?? item.color,
          };

          // If plan table is already visible, just update metadata
          if (item.planTableVisible) {
            return {
              ...item,
              ...nextProjectMetadata,
              hasPlan: true,
              planOutcomeRowCount: outcomeCount,
              planOutcomeQuestionRowCount: questionCount,
              planNeedsQuestionRowCount: needsQuestionCount,
              planNeedsPlanRowCount: needsPlanCount,
              planSubprojectRowCount: subprojectCount,
              planXxxRowCount: xxxCount,
              planTableEntries,
            };
          }

          // Otherwise, initialize plan table
          return {
            ...item,
            ...nextProjectMetadata,
            planTableVisible: true,
            planTableCollapsed: false,
            hasPlan: true,
            planTableEntries,
            planReasonRowCount: reasonCount,
            planOutcomeRowCount: outcomeCount,
            planOutcomeQuestionRowCount: questionCount,
            planNeedsQuestionRowCount: needsQuestionCount,
            planNeedsPlanRowCount: needsPlanCount,
            planSubprojectRowCount: subprojectCount,
            planXxxRowCount: xxxCount,
          };
        }),
      }));
    }
    closePlanModal();
  }, [planModal, setState, closePlanModal]);

  return {
    handlePlanNext,
  };
}
