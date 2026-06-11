import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getContrastTextColor } from '../utils/colorUtils';
import { SquarePlus, CalendarCheck, Archive, CheckCircle2 } from 'lucide-react';
import { GOAL_PANEL_ACTION_EVENT, GOAL_PANEL_STATE_EVENT, GOAL_PANEL_SELECTION_EVENT, GOAL_PANEL_ROW_SELECTION_EVENT } from '../components/GoalPanel';
import { useGoalPanel } from '../contexts/GoalPanelContext';
import { useYear } from '../contexts/YearContext';
import { useAuth } from '../contexts/AuthContext';
import NavigationBar from '../components/planner/NavigationBar';
import { undoDraftYear } from '../utils/planner/undoDraftYear';
import { revertArchive } from '../utils/planner/revertArchive';
import { createDraftYearFromActive } from '../utils/planner/createDraftYear';
import { ArchiveYearModal } from '../components/ArchiveYearModal';
import usePageSize from '../hooks/usePageSize';
import {
  useShortlistState,
  usePlanTableState,
  usePlanTableFocus,
  useCommandPattern,
  usePlanTableSelection,
  useStagingKeyboardHandlers,
  usePlanTableDragAndDrop,
  useContextMenu,
  useRowCommands,
} from '../hooks/staging';
import ContextMenu from '../components/staging/ContextMenu';
import TableRow from '../components/staging/TableRow';
import InlineEditableText from '../components/staging/InlineEditableText';
import {
  clonePlanTableEntries,
  cloneStagingState,
  COL,
  PLAN_TABLE_COLS,
  parseTimeValueToMinutes,
  formatMinutesToHHmm,
  calculateOutcomeTotals,
  calculateOutcomeSectionTotal,
  defineRowMetadata,
  cloneRowWithMetadata,
} from '../utils/staging/planTableHelpers';
import {
  handleCopyOperation,
  handlePasteOperation,
} from '../utils/staging/clipboardOperations';
import { loadTacticsChipsState, saveTacticsChipsState } from '../lib/tacticsStorage';
import { readTaskRows, saveTaskRows } from '../utils/planner/storage';
import { DEFAULT_PROJECT_ID } from '../constants/plannerStorageKeys';

/**
 * Helper to get section type for any row by finding the nearest header above
 */
const getSectionTypeForRow = (entries, rowIdx) => {
  if (!entries || rowIdx < 0) return '';
  if (entries[rowIdx]?.__rowType === 'header') {
    return entries[rowIdx].__sectionType || '';
  }
  for (let i = rowIdx; i >= 0; i--) {
    if (entries[i]?.__rowType === 'header') {
      return entries[i].__sectionType || '';
    }
  }
  return '';
};

/**
 * Calculate time totals for an item's plan table
 * Project total only includes Schedule section (not Actions)
 */
const calculateTimeTotals = (planEntries) => {
  let scheduleTotalMinutes = 0;
  let currentSection = '';

  for (let i = 0; i < planEntries.length; i++) {
    const row = planEntries[i];
    if (row?.__rowType === 'header') {
      // Use __sectionType metadata for reliable section detection
      currentSection = row.__sectionType || '';
    } else if (currentSection === 'Schedule') {
      if (row?.__rowType === 'response' || row?.__rowType === 'prompt') {
        const value = row[COL.TIME_VALUE] ?? '';
        const minutes = parseTimeValueToMinutes(value);
        scheduleTotalMinutes += minutes;
      }
    }
  }

  return {
    scheduleTotal: formatMinutesToHHmm(scheduleTotalMinutes),
    projectTotal: formatMinutesToHHmm(scheduleTotalMinutes),
  };
};

/**
 * StagingPage (Goals/Staging) - Refactored version
 *
 * Manages project shortlist and planning tables with unified row rendering
 */
export default function StagingPageV2() {
  const navigate = useNavigate();
  const { currentYear, draftYear, activeYear, allYears, isCurrentYearArchived, refreshMetadata, switchToYear } = useYear();
  const { isOpen: goalPanelOpen, open: openGoalPanel } = useGoalPanel();

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  const handleUndoDraft = useCallback(async () => {
    const result = await undoDraftYear();
    if (result.success) {
      refreshMetadata();
    }
  }, [refreshMetadata]);

  // Dev revert archive handler — remove before launch
  const handleRevertArchive = useCallback(async () => {
    const result = await revertArchive();
    if (result.success) {
      refreshMetadata();
    } else {
      // eslint-disable-next-line no-alert
      alert(`Could not revert archive: ${result.error}`);
    }
  }, [refreshMetadata]);

  const handlePlanNextYear = useCallback(async () => {
    if (!activeYear) return;
    const result = await createDraftYearFromActive(activeYear.yearNumber);
    if (result.success) {
      refreshMetadata();
      navigate('/staging');
    } else {
      // eslint-disable-next-line no-alert
      alert(`Could not create draft year: ${result.error}`);
    }
  }, [activeYear, refreshMetadata, navigate]);
  const { isLoading: isAuthLoading } = useAuth();

  const { sizeScale } = usePageSize('goal');
  const textSizeScale = sizeScale;

  // Command pattern for undo/redo
  const { canUndo, canRedo, executeCommand, undo, redo } = useCommandPattern();

  // Broadcast undo/redo availability to GoalPanel whenever it changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(GOAL_PANEL_STATE_EVENT, {
      detail: { undoAvailable: canUndo, redoAvailable: canRedo },
    }));
  }, [canUndo, canRedo]);

  // Listen for actions fired by GoalPanel (undo/redo — no shortlist dependency)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'undo') undo();
      else if (e.detail?.action === 'redo') redo();
    };
    window.addEventListener(GOAL_PANEL_ACTION_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_ACTION_EVENT, handler);
  }, [undo, redo]);

  // Selected goal — drives GoalPanel Goal section
  const [selectedGoalId, setSelectedGoalId] = useState(null);

  const fireGoalSelection = useCallback((item, subprojectsOverride) => {
    if (!item) {
      window.dispatchEvent(new CustomEvent(GOAL_PANEL_SELECTION_EVENT, { detail: { goal: null } }));
      return;
    }
    // Extract subproject names from plan entries (unless caller supplies override)
    let subprojects = subprojectsOverride;
    if (!subprojects) {
      const entries = item.planTableEntries || [];
      let inSubprojects = false;
      subprojects = [];
      for (const row of entries) {
        if (row?.__rowType === 'header') {
          inSubprojects = row.__sectionType === 'Subprojects';
        } else if (inSubprojects && row?.__rowType === 'prompt') {
          // Prompt rows: name at col 1 (matches useProjectsData format)
          const name = (row[COL.LABEL] ?? '').trim();
          if (name && name !== 'Subproject') subprojects.push(name);
        }
      }
    }
    window.dispatchEvent(new CustomEvent(GOAL_PANEL_SELECTION_EVENT, {
      detail: {
        goal: {
          id: item.id,
          name: item.projectName || item.text || '',
          tagline: item.projectTagline ?? '',
          color: item.color ?? '',
          projectNickname: item.projectNickname ?? '',
          addedToPlan: !!item.addedToPlan,
          subprojects,
        },
      },
    }));
  }, []);

  // Shortlist state management
  const {
    inputValue,
    setInputValue,
    shortlist,
    archived,
    setState,
    handleAdd,
    handleRemove,
    handleArchiveWithStatus,
    togglePlanTable,
  } = useShortlistState({ currentYear, executeCommand });

  const isDraftYearView = Boolean(draftYear && currentYear === draftYear.yearNumber);

  // Archive project and clean up associated chips + task rows
  const handleArchiveAndCleanup = useCallback(async (id, status) => {
    handleArchiveWithStatus(id, status);

    // Remove chips for the archived project. After helper #4's Supabase port
    // these calls are async; the callback now returns a Promise but no caller
    // awaits it, which is fine — the cleanup is fire-and-forget by design.
    try {
      const chipState = await loadTacticsChipsState(currentYear);
      const projectChips = Array.isArray(chipState.projectChips) ? chipState.projectChips : [];
      const filteredChips = projectChips.filter((chip) => chip.projectId !== id);
      if (filteredChips.length !== projectChips.length) {
        const remainingIds = new Set(filteredChips.map((chip) => chip.id));
        const overrides = chipState.chipTimeOverrides && typeof chipState.chipTimeOverrides === 'object'
          ? chipState.chipTimeOverrides
          : null;
        const filteredOverrides = overrides
          ? Object.fromEntries(Object.entries(overrides).filter(([chipId]) => remainingIds.has(chipId)))
          : overrides;
        await saveTacticsChipsState(
          {
            projectChips: filteredChips,
            customProjects: chipState.customProjects,
            chipTimeOverrides: filteredOverrides,
          },
          currentYear
        );
      }
    } catch (err) {
      console.error('Failed to clean up chips on archive', err);
    }
  }, [handleArchiveWithStatus, currentYear]);

  // Plan table operations
  const {
    pendingFocusRequestRef,
    addPlanPromptRow,
    addQuestionPromptWithOutcomeRow,
    addNeedsPromptWithPlanRow,
    removePlanPromptRow,
    handlePlanTableCellChange,
    handlePlanEstimateChange,
  } = usePlanTableState({ setState, executeCommand });

  // Focus management
  usePlanTableFocus({ pendingFocusRequestRef, shortlist });

  // Cell selection for tables
  const {
    selectedCells,
    selectedRows,
    setSelectedCells,
    isCellSelected,
    isRowSelected,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleMouseUp,
    selectRow,
    clearSelection,
    getSelectedCellsByItem,
  } = usePlanTableSelection();

  // Drag and drop for rows
  const {
    draggedRows,
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    isRowDragged,
    isDropTarget,
  } = usePlanTableDragAndDrop({
    setState,
    selectedRows,
    executeCommand,
  });

  // Row commands (insert, delete, duplicate, etc.)
  const {
    insertRowAbove,
    insertRowBelow,
    deleteRows,
    duplicateRows,
    clearCells,
    insertRowType,
    addRowOnEnter,
    toggleItemOutcomeTotals,
  } = useRowCommands({
    setState,
    executeCommand,
    clearSelection,
    pendingFocusRequestRef,
    setSelectedCells,
  });

  // Row/cell selection → GoalPanel Row section. Fires the first selected
  // row's context (section + row type); null when nothing is selected.
  useEffect(() => {
    const firstKey = selectedRows.size > 0
      ? selectedRows.values().next().value
      : (selectedCells.size > 0 ? selectedCells.values().next().value : null);

    const fireNull = () => window.dispatchEvent(
      new CustomEvent(GOAL_PANEL_ROW_SELECTION_EVENT, { detail: { row: null } })
    );

    if (!firstKey) { fireNull(); return; }
    const [itemIdStr, rowIdxStr] = firstKey.split('|');
    const rowIdx = parseInt(rowIdxStr, 10);
    const item = shortlist.find((i) => String(i.id) === itemIdStr);
    const entries = item?.planTableEntries || [];
    const entry = entries[rowIdx];
    if (!item || !entry) { fireNull(); return; }

    // Section type: from row metadata, else walk back to the owning header
    let sectionType = entry.__sectionType || '';
    if (!sectionType) {
      for (let i = rowIdx; i >= 0; i--) {
        if (entries[i]?.__rowType === 'header') {
          sectionType = entries[i].__sectionType || '';
          break;
        }
      }
    }

    window.dispatchEvent(new CustomEvent(GOAL_PANEL_ROW_SELECTION_EVENT, {
      detail: {
        row: {
          goalId: item.id,
          rowIdx,
          sectionType,
          rowType: entry.__rowType || 'row',
        },
      },
    }));
  }, [selectedRows, selectedCells, shortlist]);

  // Global mouseup listener for drag selection
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Copy handler
  const handleCopy = useCallback(
    (e) => {
      const tsvData = handleCopyOperation({ selectedCells, shortlist });
      if (tsvData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', tsvData);
      }
    },
    [selectedCells, shortlist]
  );

  // Paste handler
  const handlePaste = useCallback(
    (e) => {
      const clipboardText = e.clipboardData.getData('text/plain');
      const command = handlePasteOperation({
        clipboardText,
        selectedCells,
        shortlist,
        setState,
      });
      if (command) {
        e.preventDefault();
        executeCommand(command);
      }
    },
    [selectedCells, shortlist, setState, executeCommand]
  );

  // Keyboard handlers for undo/redo, delete, etc.
  useStagingKeyboardHandlers({
    selectedCells,
    selectedRows,
    undo,
    redo,
    executeCommand,
    setState,
    clearSelection,
    handleCopy,
    handlePaste,
  });

  // Context menu
  const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu();

  // Context menu action handlers - wrapped to use the hook
  const handleInsertRowAbove = useCallback(() => {
    if (contextMenu.itemId != null && contextMenu.rowIdx != null) {
      insertRowAbove(contextMenu.itemId, contextMenu.rowIdx);
    }
  }, [contextMenu.itemId, contextMenu.rowIdx, insertRowAbove]);

  const handleInsertRowBelow = useCallback(() => {
    if (contextMenu.itemId != null && contextMenu.rowIdx != null) {
      insertRowBelow(contextMenu.itemId, contextMenu.rowIdx);
    }
  }, [contextMenu.itemId, contextMenu.rowIdx, insertRowBelow]);

  const handleDeleteRows = useCallback(() => {
    deleteRows(selectedRows, contextMenu.itemId, contextMenu.rowIdx);
  }, [selectedRows, contextMenu.itemId, contextMenu.rowIdx, deleteRows]);

  const handleDuplicateRow = useCallback(() => {
    duplicateRows(selectedRows, contextMenu.itemId, contextMenu.rowIdx);
  }, [selectedRows, contextMenu.itemId, contextMenu.rowIdx, duplicateRows]);

  const handleClearCells = useCallback(() => {
    clearCells(selectedCells);
  }, [selectedCells, clearCells]);

  const handleInsertRowType = useCallback(
    (rowType) => {
      if (contextMenu.itemId != null && contextMenu.rowIdx != null) {
        insertRowType(contextMenu.itemId, contextMenu.rowIdx, contextMenu.sectionType, rowType);
      }
    },
    [contextMenu.itemId, contextMenu.rowIdx, contextMenu.sectionType, insertRowType]
  );

  const handleToggleOutcomeTotals = useCallback(() => {
    if (contextMenu.itemId != null) {
      toggleItemOutcomeTotals(contextMenu.itemId);
    }
  }, [contextMenu.itemId, toggleItemOutcomeTotals]);

  // Add to Plan handler
  const handleTogglePlanStatus = useCallback(
    (itemId, addToPlan) => {
      let capturedState = null;
      let capturedChipState = null;
      let capturedTaskRows = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      addedToPlan: addToPlan,
                    }
                  : item
              ),
            };
          });
          if (!addToPlan) {
            const removedItem = shortlist.find((item) => item.id === itemId);
            const projectKey = ((removedItem?.projectNickname || '').trim()) || ((removedItem?.projectName || '').trim());
            if (projectKey) {
              // Task-row cleanup is now async (Supabase). The command
              // pattern's execute is synchronous and not awaited, so wrap
              // the read + filter + save in an async IIFE. capturedTaskRows
              // is set inside the IIFE so undo() restores the pre-archive
              // state; same trade-off as the chip cleanup just below.
              (async () => {
                try {
                  const taskRows = await readTaskRows(DEFAULT_PROJECT_ID, currentYear);
                  if (capturedTaskRows === null) {
                    capturedTaskRows = taskRows;
                  }
                  const projectGroupId = `project-${projectKey}`;
                  const groupIdsToRemove = new Set([projectGroupId]);
                  taskRows.forEach((row) => {
                    if (
                      row?._rowType === 'subprojectHeader' &&
                      row?.parentGroupId === projectGroupId &&
                      row?.groupId
                    ) {
                      groupIdsToRemove.add(row.groupId);
                    }
                  });
                  const isArchived = (row) => {
                    const rowType = row?._rowType || '';
                    return rowType.toLowerCase().startsWith('archive') || !!row?.archiveWeekLabel;
                  };
                  const filteredRows = taskRows.filter((row) => {
                    if (isArchived(row)) return true;
                    if (row?._rowType === 'projectHeader' && row.projectNickname === projectKey) return false;
                    if (row?.parentGroupId && groupIdsToRemove.has(row.parentGroupId)) return false;
                    if (row?.projectNickname === projectKey) return false;
                    return true;
                  });
                  if (filteredRows.length !== taskRows.length) {
                    await saveTaskRows(filteredRows, DEFAULT_PROJECT_ID, currentYear);
                  }
                } catch (err) {
                  console.error('Failed to clean up task rows on remove from plan', err);
                }
              })();
            }
            // Chip cleanup is now async (Supabase). The command pattern's
            // execute is synchronous and not awaited, so wrap the chip
            // section in an async IIFE. capturedChipState is set inside the
            // IIFE so undo() restores the pre-archive state — the slight
            // delay before capture is acceptable because the command can't
            // be undone until executeCommand returns and the user takes a
            // distinct action.
            (async () => {
              try {
                const chipState = await loadTacticsChipsState(currentYear);
                if (capturedChipState === null) {
                  capturedChipState = chipState;
                }
                const projectChips = Array.isArray(chipState.projectChips) ? chipState.projectChips : [];
                const filteredChips = projectChips.filter((chip) => chip.projectId !== itemId);
                if (filteredChips.length !== projectChips.length) {
                  const remainingIds = new Set(filteredChips.map((chip) => chip.id));
                  const overrides = chipState.chipTimeOverrides && typeof chipState.chipTimeOverrides === 'object'
                    ? chipState.chipTimeOverrides
                    : null;
                  const filteredOverrides = overrides
                    ? Object.fromEntries(Object.entries(overrides).filter(([chipId]) => remainingIds.has(chipId)))
                    : overrides;
                  await saveTacticsChipsState(
                    {
                      projectChips: filteredChips,
                      customProjects: chipState.customProjects,
                      chipTimeOverrides: filteredOverrides,
                    },
                    currentYear
                  );
                }
              } catch (err) {
                console.error('Failed to clean up chips on remove from plan', err);
              }
            })();
          }
        },
        undo: () => {
          if (capturedState) setState(capturedState);
          if (capturedChipState) {
            // Fire-and-forget restore; matches the async pattern in execute.
            saveTacticsChipsState(capturedChipState, currentYear).catch((err) => {
              console.error('Failed to restore chips on undo', err);
            });
          }
          if (capturedTaskRows) {
            // Fire-and-forget restore; matches the async pattern in execute.
            saveTaskRows(capturedTaskRows, DEFAULT_PROJECT_ID, currentYear).catch((err) => {
              console.error('Failed to restore task rows on undo', err);
            });
          }
        },
      };
      executeCommand(command);
    },
    [setState, executeCommand, currentYear, shortlist]
  );

  // ── Per-row inline button handlers (TableRow action buttons) ──────────────

  // Shared: index after the last prompt/response row of the clicked row's
  // section (keeps the blank 'data' separator row at the section bottom)
  const findSectionEndInsertIdx = (entries, fromRowIdx) => {
    let headerIdx = -1;
    for (let i = fromRowIdx; i >= 0; i--) {
      if (entries[i]?.__rowType === 'header') { headerIdx = i; break; }
    }
    if (headerIdx === -1) return -1;
    let insertAt = headerIdx + 1;
    for (let i = headerIdx + 1; i < entries.length; i++) {
      const t = entries[i]?.__rowType;
      if (t === 'header') break;
      if (t === 'prompt' || t === 'response') insertAt = i + 1;
    }
    return insertAt;
  };

  // Add a row of the same type. In paired sections (Outcomes, Actions) the
  // new row is appended at the bottom of the section — same as the pair
  // button. Elsewhere it inserts directly below the clicked row.
  const handleAddRowBelow = useCallback(
    (itemId, rowIdx, rowType, sectionType) => {
      const isPairedSection = sectionType === 'Outcomes' || sectionType === 'Actions';
      if (!isPairedSection) {
        insertRowType(itemId, rowIdx, sectionType, rowType);
        return;
      }
      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) capturedState = cloneStagingState(prev);
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                const insertAt = findSectionEndInsertIdx(entries, rowIdx);
                if (insertAt === -1) return item;
                const newRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                defineRowMetadata(newRow, { rowType });
                entries.splice(insertAt, 0, newRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => { if (capturedState) setState(capturedState); },
      };
      executeCommand(command);
    },
    [insertRowType, setState, executeCommand]
  );

  // Add a prompt + response pair at the END of the clicked row's section
  // (e.g. add-pair on any Outcomes row appends an outcome + action pair
  // beneath the section's last row, not below the clicked row).
  const handleAddPairBelow = useCallback(
    (itemId, rowIdx) => {
      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) capturedState = cloneStagingState(prev);
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);

                const insertAt = findSectionEndInsertIdx(entries, rowIdx);
                if (insertAt === -1) return item;

                const promptRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                defineRowMetadata(promptRow, { rowType: 'prompt' });
                const responseRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                defineRowMetadata(responseRow, { rowType: 'response' });
                entries.splice(insertAt, 0, promptRow, responseRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => { if (capturedState) setState(capturedState); },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  // Send an Outcomes row to the Actions section: appends a Measurable
  // Outcome prompt (pre-filled with the outcome text) + an empty response
  // row at the end of the Actions section.
  const handleSendToActions = useCallback(
    (itemId, rowIdx) => {
      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) capturedState = cloneStagingState(prev);
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) => {
                if (item.id !== itemId) return item;
                const entries = item.planTableEntries.map(cloneRowWithMetadata);
                const source = entries[rowIdx];
                if (!source) return item;
                // Outcome text: prompt rows keep it at col 1, responses at col 2
                const text = ((source.__rowType === 'prompt' ? source[1] : source[2]) ?? '').trim();

                // Find the Actions section's last prompt/response row — NOT
                // the blank 'data' row that visually separates sections
                let inActions = false;
                let insertAt = -1;
                for (let i = 0; i < entries.length; i++) {
                  const t = entries[i]?.__rowType;
                  if (t === 'header') {
                    if (inActions) break;
                    inActions = entries[i].__sectionType === 'Actions';
                    if (inActions) insertAt = i + 1;
                  } else if (inActions && (t === 'prompt' || t === 'response')) {
                    insertAt = i + 1;
                  }
                }
                if (insertAt === -1) return item; // no Actions section

                const promptRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                promptRow[1] = text;
                defineRowMetadata(promptRow, { rowType: 'prompt' });
                const responseRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                defineRowMetadata(responseRow, { rowType: 'response' });
                entries.splice(insertAt, 0, promptRow, responseRow);
                return { ...item, planTableEntries: entries };
              }),
            };
          });
        },
        undo: () => { if (capturedState) setState(capturedState); },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  // Handle click on drag handle to select row
  const handleHandleClick = useCallback(
    (e, itemId, rowIdx) => {
      e.stopPropagation();
      const addToSelection = e.metaKey || e.ctrlKey || e.shiftKey;
      selectRow(itemId, rowIdx, PLAN_TABLE_COLS, addToSelection);
    },
    [selectRow]
  );

  // Clear row selection when focusing into a cell input
  const handleInputFocus = useCallback(() => {
    if (selectedRows.size > 0) {
      clearSelection();
    }
  }, [selectedRows, clearSelection]);

  // Inline-edit a single project metadata field (name or tagline)
  const handleInlineProjectUpdate = useCallback(
    (itemId, field, newValue) => {
      let capturedState = null;
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) capturedState = cloneStagingState(prev);
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) =>
                item.id === itemId ? { ...item, [field]: newValue } : item
              ),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
    },
    [setState, executeCommand]
  );

  // GoalPanel action handler — goal-level mutations
  useEffect(() => {
    const handler = (e) => {
      const { action, goalId, color, nickname, name, index, rowIdx } = e.detail ?? {};

      if (action === 'deleteRow' && goalId != null && rowIdx != null) {
        deleteRows(selectedRows, goalId, rowIdx);
        clearSelection(); // reverts panel to the Goal section
      }

      if (action === 'toggleTotals' && goalId != null) {
        toggleItemOutcomeTotals(goalId);
      }

      if (action === 'setColor' && goalId && color) {
        handleInlineProjectUpdate(goalId, 'color', color);
        const item = shortlist.find((i) => i.id === goalId);
        if (item) fireGoalSelection({ ...item, color });
      }

      if (action === 'setNickname' && goalId && nickname !== undefined) {
        handleInlineProjectUpdate(goalId, 'projectNickname', nickname);
        const item = shortlist.find((i) => i.id === goalId);
        if (item) fireGoalSelection({ ...item, projectNickname: nickname });
      }

      if (action === 'deleteGoal' && goalId) {
        const item = shortlist.find((i) => i.id === goalId);
        if (!item) return;
        // If the goal is on the plan, run the same cleanup as removing it
        // (Plan chips + System task rows) before deleting the project itself.
        if (item.addedToPlan) {
          handleTogglePlanStatus(goalId, false, false);
        }
        handleRemove(goalId);
        fireGoalSelection(null);
      }

      if (action === 'archiveGoal' && goalId) {
        // Same path as the goal table's archive button — moves the goal to
        // archived and cleans up its Plan chips. Selection is cleared since
        // the goal no longer exists on the page.
        handleArchiveAndCleanup(goalId, 'archived');
        fireGoalSelection(null);
      }

      if ((action === 'addToPlan' || action === 'removeFromPlan') && goalId) {
        const item = shortlist.find((i) => i.id === goalId);
        if (!item) return;
        const adding = action === 'addToPlan';
        handleTogglePlanStatus(goalId, adding);
        fireGoalSelection({ ...item, addedToPlan: adding });
      }

      // Shared helper: extract real (non-blank, non-placeholder) subproject rows
      // Returns { names: string[], entryIndices: number[] } — both arrays are
      // index-aligned so names[i] always corresponds to entryIndices[i].
      const extractRealSubprojects = (entries) => {
        let inSubs = false;
        const names = [];
        const entryIndices = [];
        for (let i = 0; i < entries.length; i++) {
          const row = entries[i];
          if (row?.__rowType === 'header') {
            inSubs = row.__sectionType === 'Subprojects';
          } else if (inSubs && row?.__rowType === 'prompt') {
            // Prompt rows: name at col 1 (matches useProjectsData format)
            const n = (row[COL.LABEL] ?? '').trim();
            if (n && n !== 'Subproject') {
              names.push(n);
              entryIndices.push(i);
            }
          }
        }
        return { names, entryIndices };
      };

      if (action === 'addSubproject' && goalId && name) {
        const item = shortlist.find((i) => i.id === goalId);
        if (!item) return;
        const { names: currentSubs } = extractRealSubprojects(item.planTableEntries || []);
        const newSubs = [...currentSubs, name];

        let capturedState = null;
        const command = {
          execute: () => {
            setState((prev) => {
              if (capturedState === null) capturedState = cloneStagingState(prev);
              return {
                ...prev,
                shortlist: prev.shortlist.map((it) => {
                  if (it.id !== goalId) return it;
                  const entries = it.planTableEntries.map(cloneRowWithMetadata);
                  // Insert after the last real subproject row, or after the prompt row
                  // if there are none yet. `insertAt` tracks the position after every
                  // non-prompt, non-header Subprojects row (including blank placeholders)
                  // so the new row always lands at the end of the section.
                  let inSubs = false;
                  let insertAt = entries.length;
                  for (let i = 0; i < entries.length; i++) {
                    const row = entries[i];
                    if (row?.__rowType === 'header') {
                      inSubs = row.__sectionType === 'Subprojects';
                    } else if (inSubs) {
                      // Advance past every row in the section (blank placeholders,
                      // section prompt, and added prompt rows) so new entries
                      // always land at the end in the order they were added.
                      insertAt = i + 1;
                    }
                  }
                  const newRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                  newRow[COL.LABEL] = name;
                  defineRowMetadata(newRow, { rowType: 'prompt', sectionType: 'Subprojects' });
                  entries.splice(insertAt, 0, newRow);
                  return {
                    ...it,
                    planTableEntries: entries,
                    planSubprojectRowCount: (it.planSubprojectRowCount ?? 1) + 1,
                  };
                }),
              };
            });
            fireGoalSelection(item, newSubs);
          },
          undo: () => { if (capturedState) setState(capturedState); },
        };
        executeCommand(command);
      }

      if (action === 'reorderSubprojects' && goalId) {
        const { fromIndex, toIndex } = e.detail ?? {};
        if (fromIndex === undefined || toIndex === undefined) return;
        const item = shortlist.find((i) => i.id === goalId);
        if (!item) return;
        const { names: currentSubs, entryIndices } = extractRealSubprojects(item.planTableEntries || []);

        // toIndex may equal currentSubs.length (drop at end) — that's valid
        if (fromIndex < 0 || fromIndex >= currentSubs.length || toIndex < 0 || toIndex > currentSubs.length) return;

        const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
        if (insertAt === fromIndex) return;

        const newSubs = [...currentSubs];
        const [moved] = newSubs.splice(fromIndex, 1);
        newSubs.splice(insertAt, 0, moved);

        let capturedState = null;
        const command = {
          execute: () => {
            setState((prev) => {
              if (capturedState === null) capturedState = cloneStagingState(prev);
              return {
                ...prev,
                shortlist: prev.shortlist.map((it) => {
                  if (it.id !== goalId) return it;
                  const entries = it.planTableEntries.map(cloneRowWithMetadata);
                  const fromEntryIdx = entryIndices[fromIndex];
                  // End-drop: insert just after the last real subproject row,
                  // NOT at entries.length (that lands past the Subprojects
                  // section and creates a phantom row in the next section).
                  const toEntryIdx = entryIndices[toIndex] ?? (entryIndices[entryIndices.length - 1] + 1);
                  if (fromEntryIdx === undefined) return it;
                  const [movedRow] = entries.splice(fromEntryIdx, 1);
                  const adjustedEntry = fromIndex < toIndex ? toEntryIdx - 1 : toEntryIdx;
                  entries.splice(adjustedEntry, 0, movedRow);
                  return { ...it, planTableEntries: entries };
                }),
              };
            });
            fireGoalSelection(item, newSubs);
          },
          undo: () => { if (capturedState) setState(capturedState); },
        };
        executeCommand(command);
      }

      if (action === 'removeSubproject' && goalId && index !== undefined) {
        const item = shortlist.find((i) => i.id === goalId);
        if (!item) return;
        // Use only real rows so chip index === entry index — blank placeholders excluded
        const { names: currentSubs, entryIndices } = extractRealSubprojects(item.planTableEntries || []);
        const newSubs = currentSubs.filter((_, i) => i !== index);
        const targetEntryIdx = entryIndices[index];
        if (targetEntryIdx === undefined) return;

        let capturedState = null;
        const command = {
          execute: () => {
            setState((prev) => {
              if (capturedState === null) capturedState = cloneStagingState(prev);
              return {
                ...prev,
                shortlist: prev.shortlist.map((it) => {
                  if (it.id !== goalId) return it;
                  const entries = it.planTableEntries.map(cloneRowWithMetadata);
                  const count = it.planSubprojectRowCount ?? 1;
                  if (count <= 1) {
                    // Clear rather than remove to keep section structure intact
                    entries[targetEntryIdx] = Array.from({ length: PLAN_TABLE_COLS }, () => '');
                    defineRowMetadata(entries[targetEntryIdx], { rowType: 'response', sectionType: 'Subprojects' });
                    return { ...it, planTableEntries: entries };
                  }
                  entries.splice(targetEntryIdx, 1);
                  return { ...it, planTableEntries: entries, planSubprojectRowCount: count - 1 };
                }),
              };
            });
            fireGoalSelection(item, newSubs);
          },
          undo: () => { if (capturedState) setState(capturedState); },
        };
        executeCommand(command);
      }
    };
    window.addEventListener(GOAL_PANEL_ACTION_EVENT, handler);
    return () => window.removeEventListener(GOAL_PANEL_ACTION_EVENT, handler);
  }, [handleInlineProjectUpdate, handleTogglePlanStatus, handleArchiveAndCleanup, handleRemove, deleteRows, selectedRows, clearSelection, toggleItemOutcomeTotals, shortlist, fireGoalSelection, setState, executeCommand]);

  // Wait for auth to complete before rendering content that depends on user-scoped data
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Render the simple table (unified row rendering)
  const renderTable = (item) => {
    const entries = item.planTableEntries || [];

    // Calculate outcome totals for this item
    const outcomeTotals = calculateOutcomeTotals(entries);
    const outcomeSectionTotal = calculateOutcomeSectionTotal(entries, outcomeTotals);

    return (
      <div className="rounded border border-dashed border-[#ced3d0] bg-white p-3">
        <table
          className="w-full border-collapse text-left"
          style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
        >
          <tbody>
            {entries.map((rowValues, rowIdx) => {
              const rowType = rowValues.__rowType || 'data';
              const sectionType = getSectionTypeForRow(entries, rowIdx);

              // Subprojects are managed via the side panel — skip table rendering
              if (sectionType === 'Subprojects') return null;

              return (
                <TableRow
                  key={`${item.id}-row-${rowIdx}`}
                  item={item}
                  rowValues={rowValues}
                  rowIdx={rowIdx}
                  rowType={rowType}
                  sectionType={sectionType}
                  isCellSelected={isCellSelected}
                  isRowSelected={isRowSelected(item.id, rowIdx)}
                  isDropTarget={isDropTarget(item.id, rowIdx)}
                  isDragged={isRowDragged(item.id, rowIdx)}
                  onCellChange={handlePlanTableCellChange}
                  onEstimateChange={handlePlanEstimateChange}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onHandleClick={handleHandleClick}
                  onInputFocus={handleInputFocus}
                  onEnterKeyAddRow={addRowOnEnter}
                  onContextMenu={handleContextMenu}
                  onAddRowBelow={handleAddRowBelow}
                  onAddPairBelow={handleAddPairBelow}
                  onSendToActions={handleSendToActions}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  textSizeScale={textSizeScale}
                  selectedCells={selectedCells}
                  selectedRows={selectedRows}
                  outcomeTotals={outcomeTotals}
                  outcomeSectionTotal={outcomeSectionTotal}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="h-screen overflow-y-auto bg-gray-100 text-slate-800">
        <div
          className="sticky top-0 z-20 bg-gray-100 px-4 pt-4 pb-4"
        >
          <NavigationBar
            listicalButton={
              <span className="font-serif text-sm font-medium text-slate-900 select-none">Listical</span>
            }
            onUndoDraft={draftYear ? handleUndoDraft : null}
            onRevertArchive={!draftYear && allYears.some(y => y.status === 'archived') ? handleRevertArchive : null}
          />
          <div
            className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm mt-2"
            style={{ maxWidth: 'calc(100% - 336px)' }}
          >
            <input
              id="staging-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              className="w-full rounded border border-[#ced3d0] px-3 py-2 text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              style={{ fontSize: `${Math.round(18 * textSizeScale)}px` }}
              placeholder="What would you like to get done?"
            />
          </div>
        </div>

        <div className="px-4 pb-4" style={{ isolation: 'isolate' }}>
          <div
            className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm"
            style={{ maxWidth: 'calc(100% - 336px)' }}
          >
            <div className="grid gap-[5px]">
              {shortlist.map((item) => {
                const planEntries = clonePlanTableEntries(item.planTableEntries);
                const { projectTotal } = calculateTimeTotals(planEntries);

                const headerBackground = item.color || '#f3f4f6';
                const headerTextColor = item.color ? getContrastTextColor(item.color) : '#0f172a';

                return (
                  <div key={item.id}>
                    <div className="flex items-start gap-2">
                      <div className="mt-1 flex h-7 w-7 items-center justify-center">
                        {item.planTableVisible ? (
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-slate-700 hover:text-slate-900"
                            onClick={() => togglePlanTable(item.id)}
                            aria-label={
                              item.planTableCollapsed ? 'Expand plan table' : 'Collapse plan table'
                            }
                          >
                            <SquarePlus
                              size={18}
                              className={`transition-transform ${
                                item.planTableCollapsed ? '' : 'rotate-45'
                              }`}
                            />
                          </button>
                        ) : null}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div
                          className="relative grid rounded border border-[#ced3d0] pr-3 py-2 shadow-inner"
                          style={{
                            backgroundColor: headerBackground,
                            color: headerTextColor,
                            paddingLeft: '12px',
                            fontWeight: 600,
                            // Trailing column only exists in draft view (archive /
                            // complete buttons); otherwise the total is the last
                            // column so it aligns with the table's time column
                            gridTemplateColumns: `1fr auto 140px 24px 80px${isDraftYearView ? ' auto' : ''}`,
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            outline: selectedGoalId === item.id ? '2px solid rgba(0,0,0,0.25)' : 'none',
                            outlineOffset: '-2px',
                          }}
                          onClick={() => {
                            setSelectedGoalId(item.id);
                            // Clear any row/cell selection so the panel shows
                            // the Goal section instead of the Row section
                            clearSelection();
                            fireGoalSelection(item);
                            if (!goalPanelOpen) openGoalPanel();
                          }}
                        >
                          <div className="w-full flex items-center gap-2 font-semibold min-w-0 overflow-hidden" style={{ maskImage: 'linear-gradient(to right, black 97%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 97%, transparent 100%)' }}>
                            <span className="flex items-baseline gap-0 min-w-0">
                              <InlineEditableText
                                value={item.projectName || item.text}
                                onSave={(v) => handleInlineProjectUpdate(item.id, 'projectName', v)}
                                placeholder="Project name"
                                style={{ fontWeight: 600, flexShrink: 0 }}
                              />
                              <span className="mx-1.5 opacity-50 shrink-0 select-none" style={{ fontWeight: 400 }}>·</span>
                              <InlineEditableText
                                value={item.projectTagline ?? ''}
                                onSave={(v) => handleInlineProjectUpdate(item.id, 'projectTagline', v)}
                                placeholder="Add tagline"
                                className="truncate"
                                style={{ fontWeight: 400, opacity: item.projectTagline ? 0.85 : 0.5, minWidth: 0 }}
                              />
                            </span>
                          </div>
                          <div></div>
                          <div style={{ width: '140px', minWidth: '140px' }}></div>
                          <div
                            style={{ width: '24px', minWidth: '24px' }}
                            className="flex items-center justify-end"
                          >
                            {item.addedToPlan && (
                              <div title="Added to scheduling plan">
                                <CalendarCheck size={20} strokeWidth={2.5} color="#ffffff" />
                              </div>
                            )}
                          </div>
                          <div
                            className="text-right font-semibold"
                            // Right inset matched to the table's time column:
                            // container border (1) + p-3 (12) + cell border (1)
                            // + cell paddingRight (10) = 24px; header card is
                            // border (1) + pr-3 (12) + 11px = 24px
                            style={{ fontSize: `${Math.round(14 * textSizeScale)}px`, paddingRight: '11px' }}
                          >
                            {projectTotal}
                          </div>
                          {isDraftYearView && (
                            <div className="flex items-center justify-end gap-1.5">
                              <>
                                <button
                                  type="button"
                                  className="rounded-full p-1 text-slate-700 hover:text-slate-900 focus:outline-none"
                                  style={{ backgroundColor: 'rgba(255,255,255,0.9)', border: 'none' }}
                                  onClick={() => handleArchiveAndCleanup(item.id, 'completed')}
                                  aria-label="Mark project completed"
                                  title="Mark completed"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full p-1 text-slate-700 hover:text-slate-900 focus:outline-none"
                                  style={{ backgroundColor: 'rgba(255,255,255,0.9)', border: 'none' }}
                                  onClick={() => handleArchiveAndCleanup(item.id, 'archived')}
                                  aria-label="Archive project"
                                  title="Archive"
                                >
                                  <Archive size={14} />
                                </button>
                              </>
                            </div>
                          )}
                        </div>
                        {item.planTableVisible && !item.planTableCollapsed
                          ? renderTable(item)
                          : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <ContextMenu
        contextMenu={contextMenu}
        onClose={closeContextMenu}
        onDeleteRows={handleDeleteRows}
        onInsertRowAbove={handleInsertRowAbove}
        onInsertRowBelow={handleInsertRowBelow}
        onDuplicateRow={handleDuplicateRow}
        onClearCells={handleClearCells}
        onInsertRowType={handleInsertRowType}
        onToggleOutcomeTotals={handleToggleOutcomeTotals}
      />
      <ArchiveYearModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        yearNumber={activeYear?.yearNumber}
      />
    </>
  );
}

