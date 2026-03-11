import React, { useCallback, useEffect } from 'react';
import { SquarePlus, Pencil } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';
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
import {
  clonePlanTableEntries,
  cloneStagingState,
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
        const value = row[5] ?? '';
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
  const location = useLocation();
  const currentPath = location.pathname;
  const { currentYear } = useYear();

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
      const command = {
        execute: () => {
          setState((prev) => {
            if (capturedState === null) {
              capturedState = cloneStagingState(prev);
            }
            return {
              ...prev,
              shortlist: prev.shortlist.map((item) =>
                item.id === itemId ? { ...item, addedToPlan: addToPlan } : item
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
    [setState, closePlanModal, executeCommand]
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
      <div className="min-h-screen bg-gray-100 text-slate-800 p-4 relative">
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
        <div className="space-y-6" style={{ marginTop: '75px' }}>
          <div
            className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm"
            style={{ marginBottom: '30px' }}
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
              className="w-full rounded border border-[#ced3d0] px-3 py-2 text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              style={{ fontSize: `${Math.round(18 * textSizeScale)}px` }}
              placeholder="What would you like to get done?"
            />
          </div>

          <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm">
            <div className="grid gap-[5px]">
              {shortlist.map((item) => {
                const planEntries = clonePlanTableEntries(item.planTableEntries);
                const { projectTotal } = calculateTimeTotals(planEntries);

                const isEditing = planModal.open && planModal.itemId === item.id;
                const activeColor = isEditing ? planModal.color ?? item.color : item.color;
                const headerBackground = activeColor || '#f3f4f6';
                const headerTextColor = activeColor ? '#ffffff' : '#0f172a';

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
                            gridTemplateColumns: '1fr auto 140px 120px 32px',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            {item.projectName || item.text}
                          </div>
                          <div></div>
                          <div style={{ width: '140px', minWidth: '140px' }}></div>
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
                            <div
                              className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[#ced3d0] bg-white p-4 shadow-xl z-[9999]"
                              style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                            >
                              <div className="space-y-3">
                                <div className="space-y-2" style={{ paddingTop: '15px' }}>
                                  <label
                                    className="text-sm font-semibold text-slate-700"
                                    htmlFor="plan-color-inline"
                                  >
                                    Project colour
                                  </label>
                                  <input
                                    id="plan-color-inline"
                                    type="color"
                                    className="h-10 w-full cursor-pointer rounded border border-[#ced3d0] p-1"
                                    value={planModal.color || '#c9daf8'}
                                    onChange={(e) => updatePlanModal({ color: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1" style={{ paddingTop: '15px' }}>
                                  <label
                                    className="text-sm font-semibold text-slate-700"
                                    htmlFor="plan-name-inline"
                                  >
                                    Project Name
                                  </label>
                                  <input
                                    id="plan-name-inline"
                                    type="text"
                                    value={planModal.projectName}
                                    onChange={(e) =>
                                      updatePlanModal({ projectName: e.target.value })
                                    }
                                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                  />
                                </div>
                                <div className="space-y-1" style={{ paddingTop: '15px' }}>
                                  <label
                                    className="text-sm font-semibold text-slate-700"
                                    htmlFor="plan-nickname-inline"
                                  >
                                    Project Nickname
                                  </label>
                                  <input
                                    id="plan-nickname-inline"
                                    type="text"
                                    value={planModal.projectNickname}
                                    onChange={(e) => {
                                      const nextValue = (e.target.value || '').toUpperCase();
                                      updatePlanModal({ projectNickname: nextValue });
                                    }}
                                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                  />
                                </div>
                                <div
                                  className="flex flex-wrap items-center justify-between gap-2"
                                  style={{ paddingTop: '15px' }}
                                >
                                  <button
                                    type="button"
                                    className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-100"
                                    onClick={() => handleRemove(item.id)}
                                  >
                                    Delete Project
                                  </button>
                                  <div className="flex gap-2">
                                    {item.addedToPlan ? (
                                      <button
                                        type="button"
                                        className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 shadow-sm hover:bg-orange-100"
                                        onClick={() => handleTogglePlanStatus(item.id, false)}
                                      >
                                        Remove From Plan
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                                        onClick={() => handleTogglePlanStatus(item.id, true)}
                                      >
                                        Add To Plan
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                      onClick={handlePlanNext}
                                    >
                                      Close
                                    </button>
                                  </div>
                                </div>
                              </div>
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
    </>
  );
}
