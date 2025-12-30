import { useCallback, useRef } from 'react';
import {
  clonePlanTableEntries,
  parseEstimateLabelToMinutes,
  formatMinutesToHHmm,
  PLAN_TABLE_COLS,
} from '../../utils/staging/planTableHelpers';
import {
  createRowPairId,
  getRowPairId,
  setRowPairId,
  ensurePlanPairingMetadata,
} from '../../utils/staging/rowPairing';

/**
 * Hook to manage plan table state operations (add/remove rows, cell updates, etc.)
 */
export default function usePlanTableState({ setState }) {
  const pendingFocusRequestRef = useRef(null);

  /**
   * Add a plan prompt row (reason, outcome, question, etc.)
   */
  const addPlanPromptRow = useCallback(
    (itemId, afterRowIdx, type = 'reason') => {
      let nextFocus = null;
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;

          const entries = clonePlanTableEntries(item.planTableEntries);
          const blankRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');

          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;

          ensurePlanPairingMetadata({
            entries,
            reasonRowCount: reasonCount,
            outcomeRowCount: outcomeCount,
            questionRowCount: questionCount,
            needsQuestionRowCount: needsQuestionCount,
            needsPlanRowCount: needsPlanCount,
          });

          // Calculate row positions
          const reasonRowLimit = 2 + reasonCount;
          const outcomeHeadingRow = reasonRowLimit;
          const outcomePromptStart = outcomeHeadingRow + 1;
          const outcomePromptEnd = outcomePromptStart + outcomeCount - 1;
          const questionPromptStart = outcomePromptEnd + 1;
          const questionPromptEnd = questionPromptStart + questionCount - 1;
          const needsHeadingRow = questionPromptEnd + 1;
          const needsQuestionStart = needsHeadingRow + 1;
          const needsQuestionEnd = needsQuestionStart + needsQuestionCount - 1;
          const needsPlanStart = needsQuestionEnd + 1;
          const needsPlanEnd = needsPlanStart + needsPlanCount - 1;
          const subprojectsHeadingRow = needsPlanStart + Math.max(needsPlanCount, 0);
          const subprojectsPromptRow = subprojectsHeadingRow + 1;
          const subprojectStart = subprojectsPromptRow + 1;
          const subprojectEnd = subprojectStart + Math.max(subprojectCount - 1, 0);
          const xxxHeadingRow = subprojectStart + Math.max(subprojectCount, 0);
          const xxxPromptRow = xxxHeadingRow + 1;
          const xxxStart = xxxPromptRow + 1;
          const xxxEnd = xxxStart + Math.max(xxxCount - 1, 0);

          let insertIndex = afterRowIdx + 1;

          // Adjust insert index based on type
          if (type === 'question') {
            if (outcomeCount > 0) {
              insertIndex = Math.min(questionPromptStart + 1, entries.length);
            }
          }
          if (type === 'needsPlan') {
            const minIndex = Math.max(needsPlanStart, 0);
            const maxIndex = Math.min(needsPlanEnd + 1, entries.length);
            insertIndex = Math.min(Math.max(insertIndex, minIndex), maxIndex);
          }
          if (type === 'subproject') {
            const minIndex = Math.max(subprojectStart, 0);
            const maxIndex = Math.min(subprojectEnd + 1, entries.length);
            insertIndex = Math.min(Math.max(insertIndex, minIndex), maxIndex);
          }
          if (type === 'xxx') {
            const minIndex = Math.max(xxxStart, 0);
            const maxIndex = Math.min(xxxEnd + 1, entries.length);
            insertIndex = Math.min(Math.max(insertIndex, minIndex), maxIndex);
          }

          entries.splice(insertIndex, 0, blankRow);

          // Set pair ID for outcome/needsPlan types
          if (type === 'outcome') {
            const sourcePairId = getRowPairId(entries[afterRowIdx]) || createRowPairId('outcome');
            setRowPairId(entries[insertIndex], sourcePairId);
          }
          if (type === 'needsPlan') {
            const sourcePairId = getRowPairId(entries[afterRowIdx]) || createRowPairId('needs');
            setRowPairId(entries[insertIndex], sourcePairId);
          }

          const nextState = { ...item, planTableEntries: entries };

          // Update row counts
          if (type === 'reason') {
            nextState.planReasonRowCount = (item.planReasonRowCount ?? 1) + 1;
          }
          if (type === 'outcome') {
            nextState.planOutcomeRowCount = (item.planOutcomeRowCount ?? 1) + 1;
          }
          if (type === 'question') {
            nextState.planOutcomeQuestionRowCount = (item.planOutcomeQuestionRowCount ?? 1) + 1;
          }
          if (type === 'needsPlan') {
            nextState.planNeedsPlanRowCount = (item.planNeedsPlanRowCount ?? 1) + 1;
          }
          if (type === 'subproject') {
            nextState.planSubprojectRowCount = (item.planSubprojectRowCount ?? 1) + 1;
          }
          if (type === 'xxx') {
            nextState.planXxxRowCount = (item.planXxxRowCount ?? 1) + 1;
          }

          nextFocus = {
            itemId,
            row: insertIndex,
            col: type === 'question' ? 1 : 2,
          };

          return nextState;
        }),
      }));

      if (nextFocus) {
        pendingFocusRequestRef.current = nextFocus;
      }
    },
    [setState]
  );

  /**
   * Add question row with matching outcome row
   */
  const addQuestionPromptWithOutcomeRow = useCallback(
    (itemId) => {
      let nextFocus = null;
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;

          const entries = clonePlanTableEntries(item.planTableEntries);
          const createBlankRow = () => Array.from({ length: PLAN_TABLE_COLS }, () => '');

          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;

          ensurePlanPairingMetadata({
            entries,
            reasonRowCount: reasonCount,
            outcomeRowCount: outcomeCount,
            questionRowCount: questionCount,
            needsQuestionRowCount: needsQuestionCount,
            needsPlanRowCount: needsPlanCount,
          });

          const reasonRowLimit = 2 + reasonCount;
          const outcomeHeadingRow = reasonRowLimit;
          const outcomePromptStart = outcomeHeadingRow + 1;
          const outcomeInsertIndex = outcomePromptStart + Math.max(outcomeCount, 0);

          entries.splice(outcomeInsertIndex, 0, createBlankRow());
          const pairId = createRowPairId('outcome');
          setRowPairId(entries[outcomeInsertIndex], pairId);

          const questionPromptStart = outcomePromptStart + Math.max(outcomeCount + 1, 0);
          const questionInsertIndex = questionPromptStart + Math.max(questionCount, 0);
          entries.splice(questionInsertIndex, 0, createBlankRow());
          setRowPairId(entries[questionInsertIndex], pairId);

          nextFocus = {
            itemId,
            row: questionInsertIndex,
            col: 1,
          };

          return {
            ...item,
            planTableEntries: entries,
            planOutcomeRowCount: outcomeCount + 1,
            planOutcomeQuestionRowCount: questionCount + 1,
          };
        }),
      }));

      if (nextFocus) {
        pendingFocusRequestRef.current = nextFocus;
      }
    },
    [setState]
  );

  /**
   * Add needs question row with matching plan row
   */
  const addNeedsPromptWithPlanRow = useCallback(
    (itemId) => {
      let nextFocus = null;
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;

          const entries = clonePlanTableEntries(item.planTableEntries);
          const createBlankRow = () => Array.from({ length: PLAN_TABLE_COLS }, () => '');

          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;

          const reasonRowLimit = 2 + reasonCount;
          const outcomeHeadingRow = reasonRowLimit;
          const outcomePromptStart = outcomeHeadingRow + 1;
          const outcomePromptEnd = outcomePromptStart + Math.max(outcomeCount - 1, 0);
          const questionPromptStart = outcomePromptEnd + 1;
          const questionPromptEnd = questionPromptStart + Math.max(questionCount - 1, 0);
          const needsHeadingRow = questionPromptEnd + 1;
          const needsQuestionStart = needsHeadingRow + 1;
          const needsQuestionEnd = needsQuestionStart + Math.max(needsQuestionCount - 1, 0);
          const needsPlanStart = needsQuestionEnd + 1;

          const planInsertIndex = needsPlanStart + Math.max(needsPlanCount, 0);
          entries.splice(planInsertIndex, 0, createBlankRow());
          const pairId = createRowPairId('needs');
          setRowPairId(entries[planInsertIndex], pairId);

          const questionInsertIndex = needsQuestionStart + Math.max(needsQuestionCount, 0);
          entries.splice(questionInsertIndex, 0, createBlankRow());
          setRowPairId(entries[questionInsertIndex], pairId);

          nextFocus = {
            itemId,
            row: questionInsertIndex,
            col: 1,
          };

          return {
            ...item,
            planTableEntries: entries,
            planNeedsQuestionRowCount: needsQuestionCount + 1,
            planNeedsPlanRowCount: needsPlanCount + 1,
          };
        }),
      }));

      if (nextFocus) {
        pendingFocusRequestRef.current = nextFocus;
      }
    },
    [setState]
  );

  /**
   * Remove a plan prompt row
   */
  const removePlanPromptRow = useCallback(
    (itemId, rowIdx, type = 'reason') => {
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;

          const entries = clonePlanTableEntries(item.planTableEntries);

          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;

          // Calculate section boundaries
          const reasonStart = 2;
          const reasonEnd = reasonStart + reasonCount;
          const outcomeStart = reasonEnd + 1;
          const outcomeEnd = outcomeStart + outcomeCount;
          const questionStart = outcomeEnd;
          const questionEnd = questionStart + questionCount;
          const needsHeadingRow = questionEnd;
          const needsQuestionStart = needsHeadingRow + 1;
          const needsQuestionEnd = needsQuestionStart + needsQuestionCount;
          const needsPlanStart = needsQuestionEnd;
          const needsPlanEnd = needsPlanStart + needsPlanCount;
          const subprojectHeadingRow = needsPlanEnd;
          const subprojectPromptRow = subprojectHeadingRow + 1;
          const subprojectStart = subprojectPromptRow + 1;
          const subprojectEnd = subprojectStart + subprojectCount;
          const xxxHeadingRow = subprojectEnd;
          const xxxPromptRow = xxxHeadingRow + 1;
          const xxxStart = xxxPromptRow + 1;
          const xxxEnd = xxxStart + xxxCount;

          // Validate row index is within the correct section
          const withinReason = rowIdx >= reasonStart && rowIdx < reasonEnd;
          const withinOutcome = rowIdx >= outcomeStart && rowIdx < outcomeEnd;
          const withinQuestion = rowIdx >= questionStart && rowIdx < questionEnd;
          const withinNeedsQuestion = rowIdx >= needsQuestionStart && rowIdx < needsQuestionEnd;
          const withinNeedsPlan = rowIdx >= needsPlanStart && rowIdx < needsPlanEnd;
          const withinSubproject = rowIdx >= subprojectStart && rowIdx < subprojectEnd;
          const withinXxx = rowIdx >= xxxStart && rowIdx < xxxEnd;

          if (
            rowIdx < 2 ||
            rowIdx >= entries.length ||
            (type === 'reason' && !withinReason) ||
            (type === 'outcome' && !withinOutcome) ||
            (type === 'question' && !withinQuestion) ||
            (type === 'needsQuestion' && !withinNeedsQuestion) ||
            (type === 'needsPlan' && !withinNeedsPlan) ||
            (type === 'subproject' && !withinSubproject) ||
            (type === 'xxx' && !withinXxx)
          ) {
            return item;
          }

          const blankRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
          const existingPairId = getRowPairId(entries[rowIdx]);

          // Check if this is the only row in the section
          const onlyReasonRow = type === 'reason' && reasonCount <= 1;
          const onlyOutcomeRow = type === 'outcome' && outcomeCount <= 1;
          const onlyQuestionRow = type === 'question' && questionCount <= 1;
          const onlyNeedsQuestionRow = type === 'needsQuestion' && needsQuestionCount <= 1;
          const onlyNeedsPlanRow = type === 'needsPlan' && needsPlanCount <= 1;
          const onlySubprojectRow = type === 'subproject' && subprojectCount <= 1;
          const onlyXxxRow = type === 'xxx' && xxxCount <= 1;

          if (
            onlyReasonRow ||
            onlyOutcomeRow ||
            onlyQuestionRow ||
            onlyNeedsQuestionRow ||
            onlyNeedsPlanRow ||
            onlySubprojectRow ||
            onlyXxxRow
          ) {
            // Clear the row instead of removing it
            entries[rowIdx] = blankRow;
            if (existingPairId) {
              setRowPairId(entries[rowIdx], existingPairId);
            }
            return { ...item, planTableEntries: entries };
          }

          // Remove the row
          entries.splice(rowIdx, 1);

          const nextState = { ...item, planTableEntries: entries };

          // Update row counts
          if (type === 'reason') {
            nextState.planReasonRowCount = Math.max((item.planReasonRowCount ?? 1) - 1, 1);
          }
          if (type === 'outcome') {
            nextState.planOutcomeRowCount = Math.max((item.planOutcomeRowCount ?? 1) - 1, 1);
          }
          if (type === 'question') {
            nextState.planOutcomeQuestionRowCount = Math.max((item.planOutcomeQuestionRowCount ?? 1) - 1, 1);
          }
          if (type === 'needsQuestion') {
            nextState.planNeedsQuestionRowCount = Math.max((item.planNeedsQuestionRowCount ?? 1) - 1, 1);
          }
          if (type === 'needsPlan') {
            nextState.planNeedsPlanRowCount = Math.max((item.planNeedsPlanRowCount ?? 1) - 1, 1);
          }
          if (type === 'subproject') {
            nextState.planSubprojectRowCount = Math.max((item.planSubprojectRowCount ?? 1) - 1, 1);
          }
          if (type === 'xxx') {
            nextState.planXxxRowCount = Math.max((item.planXxxRowCount ?? 1) - 1, 1);
          }

          return nextState;
        }),
      }));
    },
    [setState]
  );

  /**
   * Update a cell value in the plan table
   */
  const handlePlanTableCellChange = useCallback(
    (itemId, rowIdx, colIdx, value) => {
      if (rowIdx < 0 || colIdx < 0 || colIdx >= PLAN_TABLE_COLS) {
        return;
      }
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;
          const nextEntries = clonePlanTableEntries(item.planTableEntries);
          nextEntries[rowIdx][colIdx] = value;
          return { ...item, planTableEntries: nextEntries };
        }),
      }));
    },
    [setState]
  );

  /**
   * Update estimate and auto-calculate time value
   */
  const handlePlanEstimateChange = useCallback(
    (itemId, rowIdx, nextEstimate) => {
      if (rowIdx < 0) return;
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;
          const nextEntries = clonePlanTableEntries(item.planTableEntries);
          const row =
            nextEntries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
          if (!nextEntries[rowIdx]) {
            nextEntries[rowIdx] = row;
          }
          row[3] = nextEstimate;
          const minutes = parseEstimateLabelToMinutes(nextEstimate);
          let nextTimeValue = '0.00';
          if (minutes != null) {
            nextTimeValue = formatMinutesToHHmm(minutes);
          } else if (nextEstimate === 'Custom') {
            nextTimeValue = '0.00';
          }
          row[4] = nextTimeValue;
          return { ...item, planTableEntries: nextEntries };
        }),
      }));
    },
    [setState]
  );

  return {
    pendingFocusRequestRef,
    addPlanPromptRow,
    addQuestionPromptWithOutcomeRow,
    addNeedsPromptWithPlanRow,
    removePlanPromptRow,
    handlePlanTableCellChange,
    handlePlanEstimateChange,
  };
}
