import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadStagingState, saveStagingState } from '../../lib/stagingStorage';
import {
  buildProjectPlanSummary,
  clonePlanTableEntries,
  defineRowMetadata,
  PLAN_TABLE_COLS,
} from '../../utils/staging/planTableHelpers';
import { ensurePlanPairingMetadata, ensureScheduleRowIds } from '../../utils/staging/rowPairing';
import { SECTION_CONFIG, LEGACY_SEED_VALUES, LEGACY_HEADERS } from '../../utils/staging/sectionConfig';
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
    // 01 Reasons — prompt (reason) + response (detail)
    createRow(SECTION_CONFIG.Reasons.header, ROW_TYPE.HEADER, 'Reasons'),
    createPromptRow(''),
    createRow('', ROW_TYPE.DATA), // inert spacer before next section
    // 02 Outcomes — one prompt+response pair (more are added per goal)
    createRow(SECTION_CONFIG.Outcomes.header, ROW_TYPE.HEADER, 'Outcomes'),
    createPromptRow(''),
    createResponseRow(''),
    createRow('', ROW_TYPE.DATA), // inert spacer before next section
    // 03 Actions — prompt (action) + response (sub + time)
    createRow(SECTION_CONFIG.Actions.header, ROW_TYPE.HEADER, 'Actions'),
    createPromptRow(''),
    createResponseRow(''),
    createRow('', ROW_TYPE.DATA), // inert spacer before next section
    // Subprojects — panel-managed, hidden from table render
    createRow(SECTION_CONFIG.Subprojects.header, ROW_TYPE.HEADER, 'Subprojects'),
    createPromptRow(''),
    // 04 Schedule — prompt rows only (time + estimate)
    createRow(SECTION_CONFIG.Schedule.header, ROW_TYPE.HEADER, 'Schedule'),
    createSchedulePromptRow(''),
    createRow('', ROW_TYPE.DATA), // inert spacer closing the table
  ];
  return rows;
};

/**
 * Ensure every rendered section ends with a blank, inert 'data' spacer row
 * before the next section header (and at the end of the table). Older
 * tables — and tables whose spacer was deleted — otherwise end a section
 * with an editable prompt/response row butted against the next header.
 * The Subprojects section is panel-managed and hidden from the table, so
 * the spacer that visually closes the section *before* it (Actions) is the
 * one inserted ahead of the Subprojects header; a spacer inside the hidden
 * Subprojects section itself is never added.
 */
const ensureSectionSpacerRows = (shortlist) =>
  shortlist.map((item) => {
    const entries = item.planTableEntries;
    if (!Array.isArray(entries) || entries.length === 0) return item;

    let changed = false;
    let next = clonePlanTableEntries(entries, entries.length);

    // The Reasons section holds prompt rows only — it has no response
    // ("action") rows. Drop empty ones left over from older seeds; a
    // response row the user actually typed in is converted to a prompt row
    // (text moves from the response column to the prompt column) so no
    // content is lost.
    {
      let inReasons = false;
      next = next.filter((row) => {
        if (row?.__rowType === 'header') {
          inReasons = row.__sectionType === 'Reasons';
          return true;
        }
        if (!inReasons || row?.__rowType !== 'response') return true;
        const text = (row[2] ?? '').trim();
        if (!text) {
          changed = true;
          return false; // empty leftover response row — remove
        }
        row[1] = text;
        row[2] = '';
        defineRowMetadata(row, { rowType: ROW_TYPE.PROMPT });
        changed = true;
        return true;
      });
    }

    const prevSectionType = (idx) => {
      for (let i = idx; i >= 0; i--) {
        if (next[i]?.__rowType === 'header') return next[i].__sectionType || '';
      }
      return '';
    };

    // Insert before each header (except the first) when the preceding row
    // isn't already a data spacer — walking backwards keeps indices stable.
    for (let i = next.length - 1; i > 0; i--) {
      if (next[i]?.__rowType !== 'header') continue;
      const prevRow = next[i - 1];
      const prevType = prevRow?.__rowType || 'data';
      if (prevType === 'data' || prevType === 'header') continue;
      if (prevSectionType(i - 1) === 'Subprojects') continue; // hidden section
      next.splice(i, 0, createRow('', ROW_TYPE.DATA));
      changed = true;
    }

    // Close the table with a spacer if the last visible section lacks one.
    const last = next[next.length - 1];
    const lastType = last?.__rowType || 'data';
    if (lastType !== 'data' && prevSectionType(next.length - 1) !== 'Subprojects') {
      next.push(createRow('', ROW_TYPE.DATA));
      changed = true;
    }

    return changed ? { ...item, planTableEntries: next } : item;
  });

/**
 * One-time cleanup of legacy seeded text. Older tables stored the prompt
 * labels ("Reason", "Measurable Outcome", ...) and old header questions as
 * real cell values. Ghost copy now lives in input placeholders instead, so
 * legacy seed values are blanked and old headers upgraded to the current
 * wording. Only the columns the seeds were written to are touched
 * (prompt: cols 1-2, response: col 2) so user content elsewhere is safe.
 */
const normalizeLegacySeedText = (shortlist) =>
  shortlist.map((item) => {
    const entries = item.planTableEntries;
    if (!Array.isArray(entries) || entries.length === 0) return item;
    let changed = false;
    const next = clonePlanTableEntries(entries, entries.length);
    for (const row of next) {
      const rowType = row?.__rowType;
      if (rowType === 'header') {
        const upgraded = LEGACY_HEADERS[(row[0] ?? '').trim()];
        if (upgraded) {
          row[0] = upgraded;
          changed = true;
        }
      } else if (rowType === 'prompt' || rowType === 'response') {
        const cols = rowType === 'prompt' ? [1, 2] : [2];
        for (const c of cols) {
          if (LEGACY_SEED_VALUES.has((row[c] ?? '').trim())) {
            row[c] = '';
            changed = true;
          }
        }
      }
    }
    return changed ? { ...item, planTableEntries: next } : item;
  });

/**
 * Hook to manage shortlist and archived items state
 * Handles loading, saving, and updating shortlist items
 *
 * @param {Object} options
 * @param {number} options.currentYear - Current year for storage
 * @param {Function} options.executeCommand - Optional command executor for undo/redo support
 */
export default function useShortlistState({ currentYear, executeCommand, isCurrentYearArchived = false }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState({ shortlist: [], archived: [] });
  // Skip the autosave effect until the initial load has populated state.
  // Without this, an empty shortlist would be written back to Supabase on
  // first render, wiping out whatever the user already had.
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  // Initial load (and reload on year change). Async since the Supabase port.
  useEffect(() => {
    let cancelled = false;
    setHasInitialLoaded(false);
    (async () => {
      const data = await loadStagingState(currentYear);
      if (!cancelled) {
        setState({
          shortlist: ensureSectionSpacerRows(normalizeLegacySeedText(
            Array.isArray(data?.shortlist) ? data.shortlist : []
          )),
          archived: Array.isArray(data?.archived) ? data.archived : [],
        });
        setHasInitialLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [currentYear]);

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

  // Debounced autosave: every state change resets a 500ms timer; once the
  // user pauses, we hit Supabase. Without the debounce, every keystroke
  // would be a network round-trip and concurrent writes could land out of
  // order, persisting stale state. The cleanup cancels any pending save
  // when state changes or the hook unmounts.
  useEffect(() => {
    if (!hasInitialLoaded) return;
    if (isCurrentYearArchived) return;
    const timer = setTimeout(() => {
      const enrichedShortlist = shortlist.map((item) => {
        // Lazily mint permanent schedule-item ids (__scheduleId) before the
        // summary is built, so every persisted summary/chip id is stable.
        // Ids are set as non-enumerable metadata on the existing row arrays
        // (render-invisible, same pattern as pairing metadata backfill).
        ensureScheduleRowIds(item.planTableEntries);
        return {
          ...item,
          planSummary: buildProjectPlanSummary(item),
        };
      });
      saveStagingState({ shortlist: enrichedShortlist, archived }, currentYear);
    }, 500);
    return () => clearTimeout(timer);
  }, [shortlist, archived, currentYear, hasInitialLoaded, isCurrentYearArchived]);

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
