import React, { useCallback, useEffect } from 'react';
import { SquarePlus, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
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
} from '../hooks/staging';
import {
  clonePlanTableEntries,
  PLAN_TABLE_COLS,
  PLAN_ESTIMATE_OPTIONS,
} from '../utils/staging/planTableHelpers';
import { getRowPairId, buildPairedRowGroups } from '../utils/staging/rowPairing';

/**
 * StagingPage (Goals/Staging) - Refactored with extracted hooks
 *
 * Manages project shortlist and planning tables
 */
export default function StagingPageV2() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { currentYear } = useYear();

  // Global page size setting (shared across all pages)
  // Note: StagingPage uses Tailwind hardcoded sizes; full dynamic sizing would require
  // converting text-[14px] classes to inline styles throughout the component
  const { sizeScale } = usePageSize();
  const textSizeScale = sizeScale; // Alias for consistency

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
  } = useShortlistState({ currentYear });

  // Plan modal state
  const {
    planModal,
    openPlanModal,
    closePlanModal,
    updatePlanModal,
  } = usePlanModal();

  // Plan modal actions
  const { handlePlanNext } = usePlanModalActions({
    planModal,
    setState,
    closePlanModal,
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
  } = usePlanTableState({ setState });

  // Focus management
  usePlanTableFocus({ pendingFocusRequestRef, shortlist });

  // Add to Plan handler
  const handleTogglePlanStatus = useCallback((itemId, addToPlan) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === itemId ? { ...item, addedToPlan: addToPlan } : item
      ),
    }));
    closePlanModal();
  }, [setState, closePlanModal]);

  // Render helper functions (kept inline as they're component-specific)
  const renderQuestionPromptRow = (item, rowValues, rowIdx) => (
    <tr key={`${item.id}-plan-question-row-${rowIdx}`}>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9d9d9' }}
      >
        <input
          type="text"
          value={rowValues[0] ?? ''}
          onChange={(e) => handlePlanTableCellChange(item.id, rowIdx, 0, e.target.value)}
          className="w-full bg-transparent text-[14px] focus:outline-none border-none"
          data-plan-item={item.id}
          data-plan-row={rowIdx}
          data-plan-col={0}
        />
      </td>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        colSpan={PLAN_TABLE_COLS - 2}
        style={{ backgroundColor: '#d9d9d9' }}
      >
        <input
          type="text"
          value={rowValues[1] ?? ''}
          onChange={(e) => handlePlanTableCellChange(item.id, rowIdx, 1, e.target.value)}
          placeholder="What do I want to be true in 12 weeks?"
          className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
          data-plan-item={item.id}
          data-plan-row={rowIdx}
          data-plan-col={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              addQuestionPromptWithOutcomeRow(item.id);
            }
          }}
        />
      </td>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        style={{
          width: '32px',
          minWidth: '32px',
          textAlign: 'center',
          backgroundColor: '#d9d9d9',
        }}
      >
        <button
          type="button"
          aria-label="Delete question row"
          className="text-[14px] font-semibold text-slate-800"
          onClick={() => removePlanPromptRow(item.id, rowIdx, 'question')}
        >
          X
        </button>
      </td>
    </tr>
  );

  const renderOutcomePromptRow = (item, rowValues, rowIdx) => (
    <tr key={`${item.id}-plan-row-${rowIdx}`}>
      {rowValues.map((cellValue, cellIdx) => {
        const style = { backgroundColor: '#f3f3f3' };
        if (cellIdx === 0 || cellIdx === 1) {
          style.width = '120px';
          style.minWidth = '120px';
        }
        if (cellIdx === PLAN_TABLE_COLS - 1) {
          style.width = '32px';
          style.minWidth = '32px';
          style.textAlign = 'center';
        }
        const isPromptCell = cellIdx === 2;
        const isDeleteCell = cellIdx === PLAN_TABLE_COLS - 1;
        return (
          <td
            key={`${item.id}-outcome-row-${rowIdx}-${cellIdx}`}
            className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
            style={style}
          >
            {isPromptCell ? (
              <input
                type="text"
                value={cellValue}
                onChange={(e) =>
                  handlePlanTableCellChange(item.id, rowIdx, 2, e.target.value)
                }
                placeholder="Measurable Outcome"
                className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
                data-plan-item={item.id}
                data-plan-row={rowIdx}
                data-plan-col={2}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    addPlanPromptRow(item.id, rowIdx, 'outcome');
                  }
                }}
              />
            ) : isDeleteCell ? (
              <button
                type="button"
                aria-label="Delete outcome row"
                className="text-[14px] font-semibold text-slate-800"
                onClick={() => removePlanPromptRow(item.id, rowIdx, 'outcome')}
              >
                X
              </button>
            ) : (
              <input
                type="text"
                value={cellValue}
                onChange={(e) =>
                  handlePlanTableCellChange(item.id, rowIdx, cellIdx, e.target.value)
                }
                className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                data-plan-item={item.id}
                data-plan-row={rowIdx}
                data-plan-col={cellIdx}
              />
            )}
          </td>
        );
      })}
    </tr>
  );

  const renderReasonPromptRow = (item, rowValues, rowIdx) => (
    <tr key={`${item.id}-plan-row-${rowIdx}`}>
      {rowValues.map((cellValue, cellIdx) => {
        const baseStyle =
          cellIdx === 0 || cellIdx === 1
            ? { width: '120px', minWidth: '120px', backgroundColor: '#f3f3f3' }
            : { backgroundColor: '#f3f3f3' };
        const isPromptCell = cellIdx === 2;
        const isDeleteCell = cellIdx === PLAN_TABLE_COLS - 1;
        if (isDeleteCell) {
          baseStyle.width = '32px';
          baseStyle.minWidth = '32px';
          baseStyle.textAlign = 'center';
        }
        return (
          <td
            key={`${item.id}-plan-row-${rowIdx}-cell-${cellIdx}`}
            className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
            style={baseStyle}
          >
            {isDeleteCell ? (
              <button
                type="button"
                aria-label="Delete prompt row"
                className="text-[14px] font-semibold text-slate-800"
                onClick={() => removePlanPromptRow(item.id, rowIdx)}
              >
                X
              </button>
            ) : (
              <input
                type="text"
                value={cellValue}
                onChange={(e) =>
                  handlePlanTableCellChange(item.id, rowIdx, cellIdx, e.target.value)
                }
                onKeyDown={
                  isPromptCell
                    ? (event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          addPlanPromptRow(item.id, rowIdx);
                        }
                      }
                    : undefined
                }
                placeholder={isPromptCell ? 'Reason' : undefined}
                className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                data-plan-item={item.id}
                data-plan-row={rowIdx}
                data-plan-col={cellIdx}
              />
            )}
          </td>
        );
      })}
    </tr>
  );

  const renderNeedsQuestionRow = (item, rowValues, rowIdx) => (
    <tr key={`${item.id}-needs-question-row-${rowIdx}`}>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9d9d9' }}
      >
        <input
          type="text"
          value={rowValues[0] ?? ''}
          onChange={(e) => handlePlanTableCellChange(item.id, rowIdx, 0, e.target.value)}
          className="w-full bg-transparent text-[14px] focus:outline-none border-none"
          data-plan-item={item.id}
          data-plan-row={rowIdx}
          data-plan-col={0}
        />
      </td>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        colSpan={PLAN_TABLE_COLS - 2}
        style={{ backgroundColor: '#d9d9d9' }}
      >
        <input
          type="text"
          value={rowValues[1] ?? ''}
          onChange={(e) => handlePlanTableCellChange(item.id, rowIdx, 1, e.target.value)}
          placeholder="What needs to be true in order for the outcomes to happen?"
          className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
          data-plan-item={item.id}
          data-plan-row={rowIdx}
          data-plan-col={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              addNeedsPromptWithPlanRow(item.id);
            }
          }}
        />
      </td>
      <td
        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
        style={{
          width: '32px',
          minWidth: '32px',
          textAlign: 'center',
          backgroundColor: '#d9d9d9',
        }}
      >
        <button
          type="button"
          aria-label="Delete needs question row"
          className="text-[14px] font-semibold text-slate-800"
          onClick={() => removePlanPromptRow(item.id, rowIdx, 'needsQuestion')}
        >
          X
        </button>
      </td>
    </tr>
  );

  const renderNeedsPlanRow = (item, rowValues, rowIdx) => {
    const estimateValue = rowValues[3] || '-';
    const isCustomEstimate = estimateValue === 'Custom';
    const displayedTimeValue = rowValues[4] || '0.00';
    return (
      <tr key={`${item.id}-needs-plan-row-${rowIdx}`}>
        {rowValues.map((cellValue, cellIdx) => {
          const isPromptCell = cellIdx === 2;
          const isEstimateCell = cellIdx === 3;
          const isTimeValueCell = cellIdx === 4;
          const isDeleteCell = cellIdx === PLAN_TABLE_COLS - 1;
          const style = { backgroundColor: '#f3f3f3' };
          if (cellIdx === 0 || cellIdx === 1) {
            style.width = '120px';
            style.minWidth = '120px';
          }
          if (isEstimateCell) {
            style.width = '140px';
            style.minWidth = '140px';
          }
          if (isTimeValueCell) {
            style.width = '120px';
            style.minWidth = '120px';
            style.textAlign = 'right';
            style.paddingRight = '10px';
          }
          if (isDeleteCell) {
            style.width = '32px';
            style.minWidth = '32px';
            style.textAlign = 'center';
          }
          return (
            <td
              key={`${item.id}-needs-plan-row-${rowIdx}-${cellIdx}`}
              className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
              style={style}
            >
              {isPromptCell ? (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, 2, e.target.value)
                  }
                  placeholder="Plan"
                  className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      addPlanPromptRow(item.id, rowIdx, 'needsPlan');
                    }
                  }}
                />
              ) : isDeleteCell ? (
                <button
                  type="button"
                  aria-label="Delete plan row"
                  className="text-[14px] font-semibold text-slate-800"
                  onClick={() => removePlanPromptRow(item.id, rowIdx, 'needsPlan')}
                >
                  X
                </button>
              ) : isEstimateCell ? (
                <select
                  className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                  value={estimateValue}
                  onChange={(e) =>
                    handlePlanEstimateChange(item.id, rowIdx, e.target.value)
                  }
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={3}
                >
                  {PLAN_ESTIMATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : isTimeValueCell ? (
                <input
                  type="text"
                  value={displayedTimeValue}
                  onChange={(e) => {
                    if (!isCustomEstimate) return;
                    handlePlanTableCellChange(item.id, rowIdx, 4, e.target.value);
                  }}
                  readOnly={!isCustomEstimate}
                  className="w-full bg-transparent text-[14px] text-right focus:outline-none border-none"
                  placeholder="0.00"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={4}
                />
              ) : (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, cellIdx, e.target.value)
                  }
                  className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={cellIdx}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  const renderScheduleRow = (item, rowValues, rowIdx) => {
    const estimateValue = rowValues[3] || '-';
    const isCustomEstimate = estimateValue === 'Custom';
    const displayedTimeValue = rowValues[4] || '0.00';
    return (
      <tr key={`${item.id}-schedule-row-${rowIdx}`}>
        {rowValues.map((cellValue, cellIdx) => {
          const isPromptCell = cellIdx === 2;
          const isEstimateCell = cellIdx === 3;
          const isTimeValueCell = cellIdx === 4;
          const isDeleteCell = cellIdx === PLAN_TABLE_COLS - 1;
          const style = { backgroundColor: '#f3f3f3' };
          if (cellIdx === 0 || cellIdx === 1) {
            style.width = '120px';
            style.minWidth = '120px';
          }
          if (isEstimateCell) {
            style.width = '140px';
            style.minWidth = '140px';
          }
          if (isTimeValueCell) {
            style.width = '120px';
            style.minWidth = '120px';
            style.textAlign = 'right';
            style.paddingRight = '10px';
          }
          if (isDeleteCell) {
            style.width = '32px';
            style.minWidth = '32px';
            style.textAlign = 'center';
          }
          return (
            <td
              key={`${item.id}-schedule-row-${rowIdx}-${cellIdx}`}
              className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
              style={style}
            >
              {isPromptCell ? (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, 2, e.target.value)
                  }
                  placeholder="Schedule Item"
                  className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      addPlanPromptRow(item.id, rowIdx, 'subproject');
                    }
                  }}
                />
              ) : isDeleteCell ? (
                <button
                  type="button"
                  aria-label="Delete schedule row"
                  className="text-[14px] font-semibold text-slate-800"
                  onClick={() => removePlanPromptRow(item.id, rowIdx, 'subproject')}
                >
                  X
                </button>
              ) : isEstimateCell ? (
                <select
                  className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                  value={estimateValue}
                  onChange={(e) =>
                    handlePlanEstimateChange(item.id, rowIdx, e.target.value)
                  }
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={3}
                >
                  {PLAN_ESTIMATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : isTimeValueCell ? (
                <input
                  type="text"
                  value={displayedTimeValue}
                  onChange={(e) => {
                    if (!isCustomEstimate) return;
                    handlePlanTableCellChange(item.id, rowIdx, 4, e.target.value);
                  }}
                  readOnly={!isCustomEstimate}
                  className="w-full bg-transparent text-[14px] text-right focus:outline-none border-none"
                  placeholder="0.00"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={4}
                />
              ) : (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, cellIdx, e.target.value)
                  }
                  className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={cellIdx}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  const renderSubprojectRow = (item, rowValues, rowIdx) => {
    return (
      <tr key={`${item.id}-subproject-row-${rowIdx}`}>
        {rowValues.map((cellValue, cellIdx) => {
          // Skip estimate (column 3) and time value (column 4) cells for Subprojects
          const isEstimateCell = cellIdx === 3;
          const isTimeValueCell = cellIdx === 4;
          if (isEstimateCell || isTimeValueCell) {
            return null;
          }

          const isPromptCell = cellIdx === 2;
          const isDeleteCell = cellIdx === PLAN_TABLE_COLS - 1;
          const style = { backgroundColor: '#f3f3f3' };
          if (cellIdx === 0 || cellIdx === 1) {
            style.width = '120px';
            style.minWidth = '120px';
          }
          if (isDeleteCell) {
            style.width = '32px';
            style.minWidth = '32px';
            style.textAlign = 'center';
          }

          // For the prompt cell, we need to span across the estimate and time value columns
          const colSpan = isPromptCell ? 3 : 1;

          return (
            <td
              key={`${item.id}-subproject-row-${rowIdx}-${cellIdx}`}
              className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
              style={style}
              colSpan={colSpan}
            >
              {isPromptCell ? (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, 2, e.target.value)
                  }
                  placeholder="Subproject"
                  className="w-full bg-transparent text-[14px] font-semibold text-slate-800 focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      addPlanPromptRow(item.id, rowIdx, 'xxx');
                    }
                  }}
                />
              ) : isDeleteCell ? (
                <button
                  type="button"
                  aria-label="Delete subproject row"
                  className="text-[14px] font-semibold text-slate-800"
                  onClick={() => removePlanPromptRow(item.id, rowIdx, 'xxx')}
                >
                  X
                </button>
              ) : (
                <input
                  type="text"
                  value={cellValue}
                  onChange={(e) =>
                    handlePlanTableCellChange(item.id, rowIdx, cellIdx, e.target.value)
                  }
                  className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                  data-plan-item={item.id}
                  data-plan-row={rowIdx}
                  data-plan-col={cellIdx}
                />
              )}
            </td>
          );
        })}
      </tr>
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
          <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm" style={{ marginBottom: '30px' }}>
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
                  const reasonRowCount = item.planReasonRowCount ?? 1;
                  const outcomeRowCount = item.planOutcomeRowCount ?? 1;
                  const questionRowCount = item.planOutcomeQuestionRowCount ?? 1;
                  const needsQuestionRowCount = item.planNeedsQuestionRowCount ?? 1;
                  const needsPlanRowCount = item.planNeedsPlanRowCount ?? 1;
                  const scheduleRowCount = item.planSubprojectRowCount ?? 1;
                  const subprojectRowCount = item.planXxxRowCount ?? 1;

                  // Calculate row positions
                  const reasonRowLimit = 2 + reasonRowCount;
                  const outcomeHeadingRow = reasonRowLimit;
                  const outcomePromptStart = outcomeHeadingRow + 1;
                  const outcomePromptEnd = outcomePromptStart + Math.max(outcomeRowCount - 1, 0);
                  const questionPromptStart = outcomePromptEnd + 1;
                  const questionPromptEnd = questionPromptStart + Math.max(questionRowCount - 1, 0);
                  const needsHeadingRow = questionPromptEnd + 1;
                  const needsQuestionStart = needsHeadingRow + 1;
                  const needsQuestionEnd = needsQuestionStart + Math.max(needsQuestionRowCount - 1, 0);
                  const needsPlanStart = needsQuestionEnd + 1;
                  const scheduleHeadingRow = needsPlanStart + Math.max(needsPlanRowCount, 0);
                  const schedulePromptRow = scheduleHeadingRow + 1;
                  const scheduleStart = schedulePromptRow + 1;
                  const subprojectsHeadingRow = scheduleStart + Math.max(scheduleRowCount, 0);
                  const subprojectsPromptRow = subprojectsHeadingRow + 1;
                  const subprojectStart = subprojectsPromptRow + 1;

                  const buildRowEntry = (rowIdx) => {
                    const rowValues =
                      planEntries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
                    return {
                      rowIdx,
                      rowValues,
                      pairId: getRowPairId(planEntries[rowIdx]),
                    };
                  };

                  // Build row entries
                  const reasonPromptEntries = Array.from({ length: reasonRowCount }, (_, idx) =>
                    buildRowEntry(2 + idx)
                  );

                  const outcomeEntries = Array.from({ length: Math.max(outcomeRowCount, 0) }, (_, idx) => {
                    const rowIdx = outcomePromptStart + idx;
                    return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                  });

                  const questionEntries = Array.from({ length: Math.max(questionRowCount, 0) }, (_, idx) => {
                    const rowIdx = questionPromptStart + idx;
                    return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                  });

                  const {
                    pairs: questionOutcomeGroups,
                    leftoverPrimary: leftoverQuestionEntries,
                    leftoverSecondary: leftoverOutcomeEntries,
                  } = buildPairedRowGroups(questionEntries, outcomeEntries);

                  const needsQuestionEntries = Array.from(
                    { length: Math.max(needsQuestionRowCount, 0) },
                    (_, idx) => {
                      const rowIdx = needsQuestionStart + idx;
                      return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                    }
                  );

                  const needsPlanEntries = Array.from({ length: Math.max(needsPlanRowCount, 0) }, (_, idx) => {
                    const rowIdx = needsPlanStart + idx;
                    return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                  });

                  const scheduleEntries = Array.from({ length: Math.max(scheduleRowCount, 0) }, (_, idx) => {
                    const rowIdx = scheduleStart + idx;
                    return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                  });

                  const subprojectEntries = Array.from({ length: Math.max(subprojectRowCount, 0) }, (_, idx) => {
                    const rowIdx = subprojectStart + idx;
                    return { ...buildRowEntry(rowIdx), promptIndex: idx + 1 };
                  });

                  // Calculate totals (NOTE: moved this calculation inside the map to have access to entries)
                  const parseTimeValueToMinutes = (value) => {
                    if (value == null) return 0;
                    const stringValue = typeof value === 'string' ? value : String(value);
                    const trimmed = stringValue.trim();
                    if (!trimmed) return 0;
                    const [hrsPart, minsPart = '0'] = trimmed.split('.');
                    const hours = parseInt(hrsPart, 10);
                    const minutes = parseInt(minsPart.padEnd(2, '0').slice(0, 2), 10);
                    if (Number.isNaN(hours)) return 0;
                    const safeMinutes = Number.isNaN(minutes) ? 0 : Math.min(Math.max(minutes, 0), 59);
                    return hours * 60 + safeMinutes;
                  };

                  const formatMinutesToHHmm = (minutes) => {
                    const hrs = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    return `${hrs}.${mins.toString().padStart(2, '0')}`;
                  };

                  const needsPlanTotalMinutes = needsPlanEntries.reduce((sum, entry) => {
                    const value = entry.rowValues?.[4] ?? '';
                    return sum + parseTimeValueToMinutes(value);
                  }, 0);

                  const scheduleTotalMinutes = scheduleEntries.reduce((sum, entry) => {
                    const value = entry.rowValues?.[4] ?? '';
                    return sum + parseTimeValueToMinutes(value);
                  }, 0);

                  const needsPlanTimeTotal = formatMinutesToHHmm(needsPlanTotalMinutes);
                  const projectPlanTimeTotal = formatMinutesToHHmm(
                    needsPlanTotalMinutes + scheduleTotalMinutes
                  );

                  const {
                    pairs: needsQuestionPlanGroups,
                    leftoverPrimary: leftoverNeedsQuestionEntries,
                    leftoverSecondary: leftoverNeedsPlanEntries,
                  } = buildPairedRowGroups(needsQuestionEntries, needsPlanEntries);

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
                              aria-label={item.planTableCollapsed ? 'Expand plan table' : 'Collapse plan table'}
                            >
                              <SquarePlus
                                size={18}
                                className={`transition-transform ${item.planTableCollapsed ? '' : 'rotate-45'}`}
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
                            <div className="text-right text-[14px] font-semibold pr-2">
                              {projectPlanTimeTotal}
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
                                    <label className="text-sm font-semibold text-slate-700" htmlFor="plan-color-inline">
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
                                    <label className="text-sm font-semibold text-slate-700" htmlFor="plan-name-inline">
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
                                    <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname-inline">
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
                                  <div className="flex flex-wrap items-center justify-between gap-2" style={{ paddingTop: '15px' }}>
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
                                        onClick={closePlanModal}
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          {item.planTableVisible && !item.planTableCollapsed ? (
                            <div className="rounded border border-dashed border-[#ced3d0] bg-white p-3">
                              <table className="w-full border-collapse text-left text-[14px]">
                                <tbody>
                                  <tr key={`${item.id}-plan-row-0`}>
                                    <td
                                      colSpan={PLAN_TABLE_COLS}
                                      className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                      style={{ backgroundColor: '#b7b7b7', color: '#1f2937' }}
                                    >
                                      &nbsp;&nbsp;&nbsp;Reasons
                                    </td>
                                  </tr>
                                  <tr key={`${item.id}-plan-row-1`}>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9d9d9' }}
                                    >
                                      <input
                                        type="text"
                                        value={planEntries[1]?.[0] ?? ''}
                                        onChange={(e) => handlePlanTableCellChange(item.id, 1, 0, e.target.value)}
                                        className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                                        data-plan-item={item.id}
                                        data-plan-row={1}
                                        data-plan-col={0}
                                      />
                                    </td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      colSpan={PLAN_TABLE_COLS - 1}
                                      style={{ backgroundColor: '#d9d9d9' }}
                                    >
                                      <span className="text-[14px] font-semibold text-slate-800">
                                        Why do I want to start this?
                                      </span>
                                    </td>
                                  </tr>
                                  {reasonPromptEntries.map(({ rowIdx, rowValues }) =>
                                    renderReasonPromptRow(item, rowValues, rowIdx)
                                  )}
                                  <tr key={`${item.id}-plan-row-${outcomeHeadingRow}`}>
                                    <td
                                      colSpan={PLAN_TABLE_COLS}
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px] text-left font-semibold text-[14px]"
                                      style={{ backgroundColor: '#b7b7b7', color: '#1f2937', paddingLeft: '10px' }}
                                    >
                                      Outcomes
                                    </td>
                                  </tr>
                                  {questionOutcomeGroups.map(({ primary, secondaryList }) => (
                                    <React.Fragment
                                      key={`${item.id}-plan-pair-${primary.pairId || primary.rowIdx}`}
                                    >
                                      {renderQuestionPromptRow(item, primary.rowValues, primary.rowIdx)}
                                      {secondaryList.map((outcome) =>
                                        renderOutcomePromptRow(item, outcome.rowValues, outcome.rowIdx)
                                      )}
                                    </React.Fragment>
                                  ))}
                                  {leftoverOutcomeEntries.map(({ rowIdx, rowValues }) =>
                                    renderOutcomePromptRow(item, rowValues, rowIdx)
                                  )}
                                  {leftoverQuestionEntries.map(({ rowIdx, rowValues }) =>
                                    renderQuestionPromptRow(item, rowValues, rowIdx)
                                  )}
                                  <tr key={`${item.id}-plan-row-${needsHeadingRow}`}>
                                    <td
                                      colSpan={PLAN_TABLE_COLS - 2}
                                      className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                      style={{ backgroundColor: '#b7b7b7', color: '#1f2937' }}
                                    >
                                      &nbsp;&nbsp;&nbsp;Needs
                                    </td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 text-right text-[14px] font-semibold"
                                      style={{
                                        backgroundColor: '#b7b7b7',
                                        width: '120px',
                                        minWidth: '120px',
                                        color: '#1f2937',
                                        paddingRight: '10px',
                                      }}
                                    >
                                      {needsPlanTimeTotal}
                                    </td>
                                    <td
                                      className="border border-[#e5e7eb]"
                                      style={{
                                        backgroundColor: '#b7b7b7',
                                        width: '32px',
                                        minWidth: '32px',
                                      }}
                                    ></td>
                                  </tr>
                                  {needsQuestionPlanGroups.map(({ primary, secondaryList }) => (
                                    <React.Fragment
                                      key={`${item.id}-needs-pair-${primary.pairId || primary.rowIdx}`}
                                    >
                                      {renderNeedsQuestionRow(item, primary.rowValues, primary.rowIdx)}
                                      {secondaryList.map((plan) =>
                                        renderNeedsPlanRow(item, plan.rowValues, plan.rowIdx)
                                      )}
                                    </React.Fragment>
                                  ))}
                                  {leftoverNeedsQuestionEntries.map(({ rowIdx, rowValues }) =>
                                    renderNeedsQuestionRow(item, rowValues, rowIdx)
                                  )}
                                  {leftoverNeedsPlanEntries.map(({ rowIdx, rowValues }) =>
                                    renderNeedsPlanRow(item, rowValues, rowIdx)
                                  )}
                                  <tr key={`${item.id}-plan-row-schedule-header`}>
                                    <td
                                      colSpan={PLAN_TABLE_COLS}
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px] text-left font-semibold text-[14px]"
                                      style={{ backgroundColor: '#b7b7b7', color: '#1f2937', paddingLeft: '10px' }}
                                    >
                                      Schedule
                                    </td>
                                  </tr>
                                  <tr key={`${item.id}-schedule-row-prompt`}>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9d9d9' }}
                                    ></td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      colSpan={PLAN_TABLE_COLS - 2}
                                      style={{ backgroundColor: '#d9d9d9' }}
                                    >
                                      <span className="text-[14px] font-semibold text-slate-800">
                                        Which activities need time alotted each week?
                                      </span>
                                    </td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      style={{
                                        width: '32px',
                                        minWidth: '32px',
                                        textAlign: 'center',
                                        backgroundColor: '#d9d9d9',
                                      }}
                                    ></td>
                                  </tr>
                                  {scheduleEntries.map(({ rowIdx, rowValues }) =>
                                    renderScheduleRow(item, rowValues, rowIdx)
                                  )}
                                  <tr key={`${item.id}-plan-row-subprojects-header`}>
                                    <td
                                      colSpan={PLAN_TABLE_COLS}
                                      className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                      style={{ backgroundColor: '#b7b7b7', color: '#1f2937' }}
                                    >
                                      &nbsp;&nbsp;&nbsp;Subprojects
                                    </td>
                                  </tr>
                                  <tr key={`${item.id}-subprojects-row-prompt`}>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9d9d9' }}
                                    ></td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      colSpan={PLAN_TABLE_COLS - 2}
                                      style={{ backgroundColor: '#d9d9d9' }}
                                    >
                                      <span className="text-[14px] font-semibold text-slate-800">
                                        What are the stages or weekly habits required to make these outcomes happen?
                                      </span>
                                    </td>
                                    <td
                                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                      style={{
                                        width: '32px',
                                        minWidth: '32px',
                                        textAlign: 'center',
                                        backgroundColor: '#d9d9d9',
                                      }}
                                    ></td>
                                  </tr>
                                  {subprojectEntries.map(({ rowIdx, rowValues }) =>
                                    renderSubprojectRow(item, rowValues, rowIdx)
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
