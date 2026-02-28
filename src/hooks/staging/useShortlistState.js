import { useState, useEffect, useCallback } from 'react';
import { loadStagingState, saveStagingState } from '../../lib/stagingStorage';
import {
  buildProjectPlanSummary,
  clonePlanTableEntries,
  PLAN_TABLE_COLS,
} from '../../utils/staging/planTableHelpers';
import { ensurePlanPairingMetadata } from '../../utils/staging/rowPairing';

// Default number of rows for new simple tables
const DEFAULT_SIMPLE_TABLE_ROWS = 10;

/**
 * Create a simple table with empty rows (no sections)
 */
const createSimpleTable = (rowCount = DEFAULT_SIMPLE_TABLE_ROWS) => {
  return Array.from({ length: rowCount }, () =>
    Array.from({ length: PLAN_TABLE_COLS }, () => '')
  );
};

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

  // Generate a random color for new projects
  const generateRandomColor = () => {
    const colors = [
      '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

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
          color: generateRandomColor(),
          planTableVisible: true,
          planTableCollapsed: false, // Start expanded for new simple tables
          hasPlan: true,
          // Simple table: just rows with no special sections
          planTableEntries: createSimpleTable(),
          // Keep legacy section counts at 0 for simple tables
          planReasonRowCount: 0,
          planOutcomeRowCount: 0,
          planOutcomeQuestionRowCount: 0,
          planNeedsQuestionRowCount: 0,
          planNeedsPlanRowCount: 0,
          planSubprojectRowCount: 0,
          planXxxRowCount: 0,
          // Flag to indicate this is a simple table (no sections)
          isSimpleTable: true,
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
