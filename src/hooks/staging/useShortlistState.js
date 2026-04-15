import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadStagingState, saveStagingState } from '../../lib/stagingStorage';
import {
  buildProjectPlanSummary,
  clonePlanTableEntries,
  defineRowMetadata,
  PLAN_TABLE_COLS,
} from '../../utils/staging/planTableHelpers';
import { ensurePlanPairingMetadata } from '../../utils/staging/rowPairing';
import { SECTION_CONFIG } from '../../utils/staging/sectionConfig';
import { createStateMutationExecutor } from '../../utils/staging/commandHelpers';
import { pickProjectColour } from '../../utils/staging/projectColour';

// Row type constants
const ROW_TYPE = {
  HEADER: 'header',
  PROMPT: 'prompt',
  RESPONSE: 'response',
  DATA: 'data',
};

/**
 * Create a row with optional type metadata
 * @param {string} firstCellValue - Value for the first cell
 * @param {string} rowType - Row type (header, prompt, response, data)
 * @param {string} sectionType - Section type for header rows (Reasons, Outcomes, Actions, Schedule, Subprojects)
 */
const createRow = (firstCellValue = '', rowType = ROW_TYPE.DATA, sectionType = null) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) =>
    i === 0 ? firstCellValue : ''
  );
  return defineRowMetadata(row, { rowType, sectionType });
};

/**
 * Create a prompt row with text in the second cell
 */
const createPromptRow = (promptText) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) =>
    i === 1 ? promptText : ''
  );
  return defineRowMetadata(row, { rowType: ROW_TYPE.PROMPT });
};

/**
 * Create a Schedule prompt row with text in the third cell (to match column layout with time elements)
 */
const createSchedulePromptRow = (promptText) => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) =>
    i === 2 ? promptText : ''
  );
  return defineRowMetadata(row, { rowType: ROW_TYPE.PROMPT });
};

/**
 * Create a response row (lighter grey, starts in third cell)
 * @param {string} placeholder - Optional placeholder text for the third cell
 */
const createResponseRow = (placeholder = '') => {
  const row = Array.from({ length: PLAN_TABLE_COLS }, (_, i) =>
    i === 2 ? placeholder : ''
  );
  return defineRowMetadata(row, { rowType: ROW_TYPE.RESPONSE });
};

/**
 * Create a simple table with header rows, prompt rows, response rows, and empty data rows
 */
const createSimpleTable = () => {
  const rows = [
    // Reasons section
    createRow(SECTION_CONFIG.Reasons.header, ROW_TYPE.HEADER, 'Reasons'),
    createPromptRow(SECTION_CONFIG.Reasons.prompt),
    createRow('', ROW_TYPE.DATA),
    // Outcomes section
    createRow(SECTION_CONFIG.Outcomes.header, ROW_TYPE.HEADER, 'Outcomes'),
    createPromptRow(SECTION_CONFIG.Outcomes.prompt),
    createResponseRow(SECTION_CONFIG.Outcomes.placeholder),
    createRow('', ROW_TYPE.DATA),
    // Actions section
    createRow(SECTION_CONFIG.Actions.header, ROW_TYPE.HEADER, 'Actions'),
    createPromptRow(SECTION_CONFIG.Actions.prompt),
    createResponseRow(SECTION_CONFIG.Actions.placeholder),
    createRow('', ROW_TYPE.DATA),
    // Subprojects section
    createRow(SECTION_CONFIG.Subprojects.header, ROW_TYPE.HEADER, 'Subprojects'),
    createPromptRow(SECTION_CONFIG.Subprojects.prompt),
    createRow('', ROW_TYPE.DATA),
    // Schedule section
    createRow(SECTION_CONFIG.Schedule.header, ROW_TYPE.HEADER, 'Schedule'),
    createSchedulePromptRow(SECTION_CONFIG.Schedule.prompt),
    createRow('', ROW_TYPE.DATA),
  ];
  return rows;
};

/**
 * Hook to manage shortlist and archived items state
 * Handles loading, saving, and updating shortlist items
 *
 * @param {Object} options
 * @param {number} options.currentYear - Current year for storage
 * @param {Function} options.executeCommand - Optional command executor for undo/redo support
 */
export default function useShortlistState({ currentYear, executeCommand }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadStagingState(currentYear));

  // Create memoized state mutation executor
  const executeStateMutation = useMemo(
    () => createStateMutationExecutor(setState, executeCommand),
    [setState, executeCommand]
  );

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

    const newItem = {
      id,
      text,
      color: pickProjectColour(shortlist),
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
    };

    executeStateMutation((prev) => ({
      shortlist: [...prev.shortlist, newItem],
      archived: prev.archived,
    }));
    setInputValue('');
  }, [inputValue, shortlist, executeStateMutation]);

  // Remove item from shortlist
  const handleRemove = useCallback((id) => {
    executeStateMutation((prev) => ({
      shortlist: prev.shortlist.filter((item) => item.id !== id),
      archived: prev.archived,
    }));
  }, [executeStateMutation]);

  // Move item from shortlist to archived with a completion status
  // status: 'archived' | 'completed'
  const handleArchiveWithStatus = useCallback((id, status) => {
    executeStateMutation((prev) => {
      const item = prev.shortlist.find((i) => i.id === id);
      if (!item) return prev;
      const archivedItem = {
        ...item,
        completionStatus: status,
        completionArchivedAt: new Date().toISOString(),
      };
      return {
        shortlist: prev.shortlist.filter((i) => i.id !== id),
        archived: [...(prev.archived || []), archivedItem],
      };
    });
  }, [executeStateMutation]);

  // Toggle plan table collapse state
  const togglePlanTable = useCallback((id) => {
    executeStateMutation((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== id || !item.planTableVisible) return item;
        return { ...item, planTableCollapsed: !item.planTableCollapsed };
      }),
    }));
  }, [executeStateMutation]);

  return {
    inputValue,
    setInputValue,
    shortlist,
    archived,
    setState,
    handleAdd,
    handleRemove,
    handleArchiveWithStatus,
    togglePlanTable,
  };
}
