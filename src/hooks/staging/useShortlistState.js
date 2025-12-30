import { useState, useEffect, useCallback } from 'react';
import { loadStagingState, saveStagingState } from '../../lib/stagingStorage';
import {
  buildProjectPlanSummary,
  clonePlanTableEntries,
} from '../../utils/staging/planTableHelpers';
import { ensurePlanPairingMetadata } from '../../utils/staging/rowPairing';

/**
 * Hook to manage shortlist and archived items state
 * Handles loading, saving, and updating shortlist items
 */
export default function useShortlistState({ currentYear }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadStagingState(currentYear));

  // Initialize pairing metadata on mount
  useEffect(() => {
    setState((prev) => {
      let changed = false;
      const nextShortlist = prev.shortlist.map((item) => {
        if (!Array.isArray(item.planTableEntries) || item.planTableEntries.length === 0) {
          return item;
        }

        const entries = clonePlanTableEntries(item.planTableEntries, item.planTableEntries.length);
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

        const originalEntries = item.planTableEntries;
        const hasDiff =
          entries.length !== originalEntries.length ||
          entries.some((row, idx) => {
            const getRowPairId = (r) => r?.['__pairId'];
            return getRowPairId(row) !== getRowPairId(originalEntries[idx]);
          });

        if (hasDiff) {
          changed = true;
          return { ...item, planTableEntries: entries };
        }
        return item;
      });

      return changed ? { ...prev, shortlist: nextShortlist } : prev;
    });
  }, []);

  // Save to storage whenever shortlist or archived changes
  useEffect(() => {
    const enrichedShortlist = shortlist.map((item) => ({
      ...item,
      planSummary: buildProjectPlanSummary(item),
    }));
    saveStagingState({ shortlist: enrichedShortlist, archived }, currentYear);
  }, [shortlist, archived, currentYear]);

  // Add new item to shortlist
  const handleAdd = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setState((prev) => ({
      shortlist: [
        ...prev.shortlist,
        {
          id,
          text,
          color: null,
        },
      ],
      archived: prev.archived,
    }));
    setInputValue('');
  }, [inputValue]);

  // Remove item from shortlist
  const handleRemove = useCallback((id) => {
    setState((prev) => ({
      shortlist: prev.shortlist.filter((item) => item.id !== id),
      archived: prev.archived,
    }));
  }, []);

  // Toggle plan table collapse state
  const togglePlanTable = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== id || !item.planTableVisible) return item;
        return { ...item, planTableCollapsed: !item.planTableCollapsed };
      }),
    }));
  }, []);

  return {
    inputValue,
    setInputValue,
    shortlist,
    archived,
    setState,
    handleAdd,
    handleRemove,
    togglePlanTable,
  };
}
