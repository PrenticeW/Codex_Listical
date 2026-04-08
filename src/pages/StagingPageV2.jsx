import React, { useCallback, useEffect } from 'react';
import { getContrastTextColor } from '../utils/colorUtils';
import { SquarePlus, Pencil, CalendarCheck } from 'lucide-react';
import { useYear } from '../contexts/YearContext';
import { useAuth } from '../contexts/AuthContext';
import NavigationBar from '../components/planner/NavigationBar';
import usePageSize from '../hooks/usePageSize';
import {
  useShortlistState,
  usePlanModal,
  usePlanModalActions,
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
import ProjectEditModal from '../components/staging/ProjectEditModal';
import {
  clonePlanTableEntries,
  cloneStagingState,
  COL,
  PLAN_TABLE_COLS,
  parseTimeValueToMinutes,
  formatMinutesToHHmm,
  calculateOutcomeTotals,
  calculateOutcomeSectionTotal,
} from '../utils/staging/planTableHelpers';
import {
  handleCopyOperation,
  handlePasteOperation,
} from '../utils/staging/clipboardOperations';

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
  const { currentYear } = useYear();
  const { isLoading: isAuthLoading } = useAuth();

  const { sizeScale } = usePageSize('goal');
  const textSizeScale = sizeScale;

  // Command pattern for undo/redo
  const { canUndo, canRedo, executeCommand, undo, redo } = useCommandPattern();

  // Shortlist state management
  const {
    inputValue,
    setInputValue,
    shortlist,
    archived,
    setState,
    handleAdd,
    handleRemove,
    togglePlanTable,
  } = useShortlistState({ currentYear, executeCommand });

  // Plan modal state
  const { planModal, openPlanModal, closePlanModal, updatePlanModal } = usePlanModal();

  // Plan modal actions
  const { handlePlanNext } = usePlanModalActions({
    planModal,
    setState,
    closePlanModal,
    executeCommand,
  });

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
      const modalMetadata = {
        projectName: planModal.projectName,
        projectNickname: planModal.projectNickname,
        color: planModal.color,
      };
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
                      ...(addToPlan ? modalMetadata : {}),
                    }
                  : item
              ),
            };
          });
        },
        undo: () => {
          if (capturedState) setState(capturedState);
        },
      };
      executeCommand(command);
      closePlanModal();
    },
    [setState, closePlanModal, executeCommand, planModal]
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
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
              >
                <span>Listical</span>
              </button>
            }
          />
          <div
            className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm mt-2"
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
          <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm">
            <div className="grid gap-[5px]">
              {shortlist.map((item) => {
                const planEntries = clonePlanTableEntries(item.planTableEntries);
                const { projectTotal } = calculateTimeTotals(planEntries);

                const isEditing = planModal.open && planModal.itemId === item.id;
                const activeColor = isEditing ? planModal.color ?? item.color : item.color;
                const headerBackground = activeColor || '#f3f4f6';
                const headerTextColor = activeColor ? getContrastTextColor(activeColor) : '#0f172a';

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
                            gridTemplateColumns: '1fr auto 140px 24px 80px 32px',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div className="w-full flex items-center gap-2 font-semibold min-w-0 overflow-hidden" style={{ maskImage: 'linear-gradient(to right, black 97%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 97%, transparent 100%)' }}>
                            <span className="block truncate">{item.projectName || item.text}{item.projectTagline ? <><span className="font-semibold">:</span><span className="font-normal opacity-80"> {item.projectTagline}</span></> : null}</span>
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
                            className="text-right font-semibold pr-2"
                            style={{ fontSize: `${Math.round(14 * textSizeScale)}px` }}
                          >
                            {projectTotal}
                          </div>
                          <div
                            style={{ width: '32px', minWidth: '32px' }}
                            className="flex items-center justify-end"
                          >
                            <button
                              type="button"
                              className="rounded-full p-1 text-slate-700 hover:text-slate-900 focus:outline-none"
                              style={{ backgroundColor: 'rgba(255,255,255,0.9)', border: 'none' }}
                              onClick={() => openPlanModal(item)}
                              aria-label="Edit project"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                          {planModal.open && planModal.itemId === item.id && (
                            <ProjectEditModal
                              item={item}
                              planModal={planModal}
                              updatePlanModal={updatePlanModal}
                              handlePlanNext={handlePlanNext}
                              handleRemove={handleRemove}
                              handleTogglePlanStatus={handleTogglePlanStatus}
                            />
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
    </>
  );
}
