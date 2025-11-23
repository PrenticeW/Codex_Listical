import React, { useCallback, useEffect, useState } from 'react';
import { SquarePlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import NavigationBar from './NavigationBar';

const STORAGE_KEY = 'staging-shortlist';
const PLAN_TABLE_ROWS = 11;
const PLAN_TABLE_COLS = 5;
const COLOR_PALETTE = [
  '#8e7cc3',
  '#f6b26b',
  '#b4a7d6',
  '#93c47d',
  '#6fa8dc',
  '#76a5af',
  '#c9b4e6',
  '#a2d2a8',
];

const loadState = () => {
  if (typeof window === 'undefined') return { shortlist: [], archived: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shortlist: [], archived: [] };
    const parsed = JSON.parse(raw);
    return {
      shortlist: Array.isArray(parsed?.shortlist) ? parsed.shortlist : [],
      archived: Array.isArray(parsed?.archived) ? parsed.archived : [],
    };
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
};

const saveState = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

const clonePlanTableEntries = (entries, ensureRows = PLAN_TABLE_ROWS) => {
  const source = Array.isArray(entries) ? entries : [];
  const rowCount = Math.max(source.length, ensureRows);
  const normalized = [];
  for (let row = 0; row < rowCount; row += 1) {
    const sourceRow = Array.isArray(source[row]) ? source[row] : [];
    const nextRow = [];
    for (let col = 0; col < PLAN_TABLE_COLS; col += 1) {
      const value = sourceRow[col];
      nextRow.push(typeof value === 'string' ? value : '');
    }
    normalized.push(nextRow);
  }
  return normalized;
};

const createEmptyPlanTable = () => clonePlanTableEntries(null);
export default function StagingPage({ currentPath = '/staging', onNavigate = () => {} }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadState());
  const [planModal, setPlanModal] = useState({
    open: false,
    itemId: null,
    projectName: '',
    projectNickname: '',
    color: COLOR_PALETTE[0],
  });
  const [pendingPlanFocus, setPendingPlanFocus] = useState(null);

  useEffect(() => {
    saveState({ shortlist, archived });
  }, [shortlist, archived]);

  useEffect(() => {
    if (!pendingPlanFocus) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      const { itemId, row, col } = pendingPlanFocus;
      const selector = `[data-plan-item="${itemId}"][data-plan-row="${row}"][data-plan-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target instanceof HTMLElement) {
        target.focus();
        if (target instanceof HTMLInputElement) {
          target.select();
        }
      }
      setPendingPlanFocus(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingPlanFocus, shortlist]);

  const handleAdd = () => {
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
  };

  const handleRemove = (id) => {
    setState((prev) => ({
      shortlist: prev.shortlist.filter((item) => item.id !== id),
      archived: prev.archived,
    }));
  };

  const handleArchive = (id) => {
    setState((prev) => {
      const target = prev.shortlist.find((item) => item.id === id);
      if (!target) return prev;
      return {
        shortlist: prev.shortlist.filter((item) => item.id !== id),
        archived: [...prev.archived, target],
      };
    });
  };

  const openPlanModal = (item) => {
    setPlanModal({
      open: true,
      itemId: item.id,
      projectName: item.projectName ?? item.text,
      projectNickname: item.projectNickname ?? '',
      color: item.color ?? COLOR_PALETTE[0],
    });
  };

  const handlePlanModalClose = () => {
    setPlanModal((prev) => ({ ...prev, open: false, itemId: null }));
  };

  const handlePlanNext = () => {
    if (planModal.itemId) {
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== planModal.itemId) return item;
          if (item.planTableVisible) {
            return { ...item, hasPlan: true };
          }
          return {
            ...item,
            planTableVisible: true,
            planTableCollapsed: false,
            hasPlan: true,
            planTableEntries: clonePlanTableEntries(item.planTableEntries),
          };
        }),
      }));
    }
    setPlanModal((prev) => ({ ...prev, open: false, itemId: null }));
  };

  const togglePlanTable = (id) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== id || !item.planTableVisible) return item;
        return { ...item, planTableCollapsed: !item.planTableCollapsed };
      }),
    }));
  };

  const addPlanPromptRow = useCallback(
    (itemId, afterRowIdx) => {
      setState((prev) => ({
        ...prev,
        shortlist: prev.shortlist.map((item) => {
          if (item.id !== itemId) return item;
          const entries = clonePlanTableEntries(item.planTableEntries);
          const blankRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
          entries.splice(afterRowIdx + 1, 0, blankRow);
          return { ...item, planTableEntries: entries };
        }),
      }));
      setPendingPlanFocus({ itemId, row: afterRowIdx + 1, col: 2 });
    },
    [setState, setPendingPlanFocus]
  );

  const handlePlanTableCellChange = (itemId, rowIdx, colIdx, value) => {
    if (
      rowIdx < 0 ||
      rowIdx >= PLAN_TABLE_ROWS ||
      colIdx < 0 ||
      colIdx >= PLAN_TABLE_COLS
    ) {
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
  };

  return (
    <>
      <div className="min-h-screen bg-gray-100 text-slate-800 p-4 relative">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
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
        <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm" style={{ marginBottom: '10px' }}>
          <label
            className="block font-bold text-slate-700 mb-2 tracking-wide"
            style={{ fontSize: '22px' }}
            htmlFor="staging-input"
          >
            What would you like to get done?
          </label>
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
            style={{ fontSize: '18px', marginTop: '10px' }}
            placeholder="Add to project shortlist and press Enter"
          />
        </div>

        <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm">
          {shortlist.length === 0 ? (
            <p className="text-sm text-slate-600">No items yet. Add something above to get started.</p>
          ) : (
            <div className="grid gap-[5px]">
              {shortlist.map((item) => {
                const planEntries = clonePlanTableEntries(item.planTableEntries);
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
                        className="relative flex flex-wrap items-center justify-between gap-3 rounded border border-[#ced3d0] pr-3 py-2 shadow-inner"
                        style={{
                          backgroundColor: item.color || '#f3f4f6',
                          color: '#0f172a',
                          paddingLeft: '12px',
                        }}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {item.projectName || item.text}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                            onClick={() => handleRemove(item.id)}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                            onClick={() => openPlanModal(item)}
                          >
                            {item.hasPlan ? 'Edit' : 'Make Plan'}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                            onClick={() => handleArchive(item.id)}
                          >
                            Archive
                          </button>
                        </div>
                        {planModal.open && planModal.itemId === item.id && (
                          <div
                            className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[#ced3d0] bg-white p-4 shadow-xl z-[9999]"
                            style={{ backgroundColor: '#ffffff' }}
                          >
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <span className="text-sm font-semibold text-slate-700">Project colour</span>
                                <div className="flex flex-wrap gap-2">
                                  {COLOR_PALETTE.map((color) => {
                                    const isActive = color === (planModal.color || COLOR_PALETTE[0]);
                                    return (
                                      <button
                                        key={color}
                                        type="button"
                                        className={`border ${isActive ? 'border-black ring-2 ring-black/50' : 'border-[#ced3d0]'}`}
                                        style={{
                                          backgroundColor: color,
                                          borderRadius: '9999px',
                                          height: '15px',
                                          width: '30px',
                                          padding: 0,
                                        }}
                                        onClick={() => setPlanModal((prev) => ({ ...prev, color }))}
                                        aria-label={`Select color ${color}`}
                                      ></button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-sm font-semibold text-slate-700" htmlFor="plan-name">
                                  Project Name
                                </label>
                                <input
                                  id="plan-name"
                                  type="text"
                                  value={planModal.projectName}
                                  onChange={(e) =>
                                    setPlanModal((prev) => ({ ...prev, projectName: e.target.value }))
                                  }
                                  className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname">
                                  Project Nickname
                                </label>
                                <input
                                  id="plan-nickname"
                                  type="text"
                                  value={planModal.projectNickname}
                                  onChange={(e) =>
                                    setPlanModal((prev) => ({ ...prev, projectNickname: e.target.value }))
                                  }
                                  className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                  onClick={handlePlanNext}
                                >
                                  Next
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                  onClick={handlePlanModalClose}
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {item.planTableVisible && !item.planTableCollapsed ? (
                        <div className="rounded border border-dashed border-[#ced3d0] bg-white p-3">
                          <table className="w-full border-collapse text-left text-[14px]">
                            <tbody>
                              {planEntries.map((rowValues, rowIdx) => {
                                if (rowIdx === 0) {
                                  return (
                                    <tr key={`${item.id}-plan-row-${rowIdx}`}>
                                      <td
                                        colSpan={PLAN_TABLE_COLS}
                                        className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                        style={{ backgroundColor: '#d5a6bd', color: '#1f2937' }}
                                      >
                                        &nbsp;&nbsp;&nbsp;Reasons
                                      </td>
                                    </tr>
                                  );
                                }
                                if (rowIdx === 1) {
                                  return (
                                    <tr key={`${item.id}-plan-row-${rowIdx}`}>
                                      <td
                                        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                        style={{ width: '120px', minWidth: '120px', backgroundColor: '#ead1dc' }}
                                      >
                                        <input
                                          type="text"
                                          value={rowValues[0] ?? ''}
                                          onChange={(e) =>
                                            handlePlanTableCellChange(
                                              item.id,
                                              rowIdx,
                                              0,
                                              e.target.value
                                            )
                                          }
                                          className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                                          data-plan-item={item.id}
                                          data-plan-row={rowIdx}
                                          data-plan-col={0}
                                        />
                                      </td>
                                      <td
                                        className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                        colSpan={PLAN_TABLE_COLS - 1}
                                        style={{ backgroundColor: '#ead1dc' }}
                                      >
                                        <span className="text-[14px] font-semibold text-slate-800">
                                          Why do I want to start this?
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                }
                                return (
                                  <tr key={`${item.id}-plan-row-${rowIdx}`}>
                                    {rowValues.map((cellValue, cellIdx) => {
                                      const baseStyle =
                                        cellIdx === 0 || cellIdx === 1
                                          ? { width: '120px', minWidth: '120px' }
                                          : {};
                                      if (rowIdx === 2) {
                                        baseStyle.backgroundColor = '#f9f3f6';
                                      }
                                      const isPromptCell = rowIdx >= 2 && cellIdx === 2;
                                      return (
                                        <td
                                          key={`${item.id}-plan-row-${rowIdx}-cell-${cellIdx}`}
                                          className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                          style={Object.keys(baseStyle).length ? baseStyle : undefined}
                                        >
                                          <input
                                            type="text"
                                            value={cellValue}
                                            onChange={(e) =>
                                              handlePlanTableCellChange(
                                                item.id,
                                                rowIdx,
                                                cellIdx,
                                                e.target.value
                                              )
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
                                            placeholder={isPromptCell && rowIdx === 2 ? 'Reason' : undefined}
                                            className="w-full bg-transparent text-[14px] focus:outline-none border-none"
                                            data-plan-item={item.id}
                                            data-plan-row={rowIdx}
                                            data-plan-col={cellIdx}
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
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
          )}
        </div>
      </div>
      </div>
      {planModal.open && (() => {
        const modalContent = (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg border border-[#ced3d0] bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Plan Project</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Project colour</span>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((color) => {
                      const isActive = color === (planModal.color || COLOR_PALETTE[0]);
                      return (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-full border ${isActive ? 'border-black ring-2 ring-black/50' : 'border-[#ced3d0]'}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setPlanModal((prev) => ({ ...prev, color }))}
                          aria-label={`Select color ${color}`}
                        ></button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="plan-name">
                    Project Name
                  </label>
                  <input
                    id="plan-name"
                    type="text"
                    value={planModal.projectName}
                    onChange={(e) => setPlanModal((prev) => ({ ...prev, projectName: e.target.value }))}
                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname">
                    Project Nickname
                  </label>
                  <input
                    id="plan-nickname"
                    type="text"
                    value={planModal.projectNickname}
                    onChange={(e) =>
                      setPlanModal((prev) => ({ ...prev, projectNickname: e.target.value }))
                    }
                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={handlePlanNext}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
      })()}
    </>
  );
}
