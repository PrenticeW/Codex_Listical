import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SquarePlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import NavigationBar from './NavigationBar';

const STORAGE_KEY = 'staging-shortlist';
const PLAN_TABLE_ROWS = 11;
const PLAN_TABLE_COLS = 6;
const PLAN_PAIR_META_KEY = '__pairId';
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

const createRowPairId = (prefix = 'pair') => {
  const base =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${base}`;
};

const getRowPairId = (row) => {
  if (!row) return null;
  const value = row?.[PLAN_PAIR_META_KEY];
  return typeof value === 'string' && value ? value : null;
};

const setRowPairId = (row, pairId) => {
  if (!row) return;
  Object.defineProperty(row, PLAN_PAIR_META_KEY, {
    value: pairId,
    writable: true,
    configurable: true,
    enumerable: false,
  });
};

const ensureSectionPairMetadata = ({
  entries,
  primaryStart,
  primaryCount,
  secondaryStart,
  secondaryCount,
  prefix,
}) => {
  if (!Array.isArray(entries)) return;
  const pairableCount = Math.min(primaryCount, secondaryCount);
  for (let i = 0; i < pairableCount; i += 1) {
    const primaryIdx = primaryStart + i;
    const secondaryIdx = secondaryStart + i;
    const primaryRow = entries[primaryIdx];
    const secondaryRow = entries[secondaryIdx];
    if (!primaryRow && !secondaryRow) continue;
    const primaryPairId = getRowPairId(primaryRow);
    const secondaryPairId = getRowPairId(secondaryRow);
    if (primaryPairId && secondaryPairId && primaryPairId !== secondaryPairId) {
      continue;
    }
    const pairId = primaryPairId || secondaryPairId || createRowPairId(prefix);
    setRowPairId(primaryRow, pairId);
    setRowPairId(secondaryRow, pairId);
  }
  let lastPairId = null;
  for (let i = 0; i < primaryCount; i += 1) {
    const idx = primaryStart + i;
    const row = entries[idx];
    if (!row) continue;
    const rowPairId = getRowPairId(row);
    if (rowPairId) {
      lastPairId = rowPairId;
    } else if (lastPairId) {
      setRowPairId(row, lastPairId);
    }
  }
  lastPairId = null;
  for (let i = 0; i < secondaryCount; i += 1) {
    const idx = secondaryStart + i;
    const row = entries[idx];
    if (!row) continue;
    const rowPairId = getRowPairId(row);
    if (rowPairId) {
      lastPairId = rowPairId;
    } else if (lastPairId) {
      setRowPairId(row, lastPairId);
    }
  }
};

const ensurePlanPairingMetadata = ({
  entries,
  reasonRowCount,
  outcomeRowCount,
  questionRowCount,
  needsQuestionRowCount,
  needsPlanRowCount,
}) => {
  if (!Array.isArray(entries)) return;
  const outcomeHeadingRow = 2 + reasonRowCount;
  const outcomeStart = outcomeHeadingRow + 1;
  const questionStart = outcomeStart + outcomeRowCount;
  ensureSectionPairMetadata({
    entries,
    primaryStart: outcomeStart,
    primaryCount: outcomeRowCount,
    secondaryStart: questionStart,
    secondaryCount: questionRowCount,
    prefix: 'outcome',
  });
  const needsHeadingRow = questionStart + questionRowCount;
  const needsQuestionStart = needsHeadingRow + 1;
  const needsPlanStart = needsQuestionStart + needsQuestionRowCount;
  ensureSectionPairMetadata({
    entries,
    primaryStart: needsQuestionStart,
    primaryCount: needsQuestionRowCount,
    secondaryStart: needsPlanStart,
    secondaryCount: needsPlanRowCount,
    prefix: 'needs',
  });
};

const buildPairedRowGroups = (primaryEntries, secondaryEntries) => {
  const groupedSecondary = new Map();
  const fallbackSecondary = [];
  secondaryEntries.forEach((entry) => {
    if (entry.pairId) {
      if (!groupedSecondary.has(entry.pairId)) {
        groupedSecondary.set(entry.pairId, []);
      }
      groupedSecondary.get(entry.pairId).push(entry);
    } else {
      fallbackSecondary.push(entry);
    }
  });

  const pairs = [];
  const leftoverPrimary = [];
  primaryEntries.forEach((entry) => {
    if (entry.pairId && groupedSecondary.has(entry.pairId)) {
      const grouped = groupedSecondary.get(entry.pairId);
      pairs.push({ primary: entry, secondaryList: grouped });
      groupedSecondary.delete(entry.pairId);
    } else if (fallbackSecondary.length) {
      pairs.push({ primary: entry, secondaryList: [fallbackSecondary.shift()] });
    } else {
      leftoverPrimary.push(entry);
    }
  });

  const leftoverSecondary = [
    ...fallbackSecondary,
    ...Array.from(groupedSecondary.values()).flat(),
  ];
  return { pairs, leftoverPrimary, leftoverSecondary };
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
    if (sourceRow && sourceRow[PLAN_PAIR_META_KEY]) {
      Object.defineProperty(nextRow, PLAN_PAIR_META_KEY, {
        value: sourceRow[PLAN_PAIR_META_KEY],
        writable: true,
        configurable: true,
        enumerable: false,
      });
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
  const pendingFocusRequestRef = useRef(null);
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
          entries.some((row, idx) => getRowPairId(row) !== getRowPairId(originalEntries[idx]));
        if (hasDiff) {
          changed = true;
          return { ...item, planTableEntries: entries };
        }
        return item;
      });
      return changed ? { ...prev, shortlist: nextShortlist } : prev;
    });
  }, []);

  useEffect(() => {
    saveState({ shortlist, archived });
  }, [shortlist, archived]);

  useEffect(() => {
    if (!pendingFocusRequestRef.current) return;
    setPendingPlanFocus(pendingFocusRequestRef.current);
    pendingFocusRequestRef.current = null;
  }, [shortlist]);

  useEffect(() => {
    if (!pendingPlanFocus) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    let cancelled = false;
    let frame = null;
    const tryFocus = (attempt = 0) => {
      if (cancelled) return;
      const { itemId, row, col } = pendingPlanFocus;
      const selector = `[data-plan-item="${itemId}"][data-plan-row="${row}"][data-plan-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target instanceof HTMLElement) {
        target.focus();
        if (target instanceof HTMLInputElement) {
          target.select();
        }
        setPendingPlanFocus(null);
        return;
      }
      if (attempt >= 4) {
        setPendingPlanFocus(null);
        return;
      }
      frame = window.requestAnimationFrame(() => tryFocus(attempt + 1));
    };
    frame = window.requestAnimationFrame(() => tryFocus(0));
    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
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
          const reasonCount = item.planReasonRowCount ?? 1;
          const outcomeCount = item.planOutcomeRowCount ?? 1;
          const questionCount = item.planOutcomeQuestionRowCount ?? 1;
          const needsQuestionCount = item.planNeedsQuestionRowCount ?? 1;
          const needsPlanCount = item.planNeedsPlanRowCount ?? 1;
          const planTableEntries = clonePlanTableEntries(item.planTableEntries);
          ensurePlanPairingMetadata({
            entries: planTableEntries,
            reasonRowCount: reasonCount,
            outcomeRowCount: outcomeCount,
            questionRowCount: questionCount,
            needsQuestionRowCount: needsQuestionCount,
            needsPlanRowCount: needsPlanCount,
          });
          if (item.planTableVisible) {
            return {
              ...item,
              hasPlan: true,
              planOutcomeRowCount: outcomeCount,
              planOutcomeQuestionRowCount: questionCount,
              planNeedsQuestionRowCount: needsQuestionCount,
              planNeedsPlanRowCount: needsPlanCount,
              planTableEntries,
            };
          }
          return {
            ...item,
            planTableVisible: true,
            planTableCollapsed: false,
            hasPlan: true,
            planTableEntries,
            planReasonRowCount: reasonCount,
            planOutcomeRowCount: outcomeCount,
            planOutcomeQuestionRowCount: questionCount,
            planNeedsQuestionRowCount: needsQuestionCount,
            planNeedsPlanRowCount: needsPlanCount,
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
          const outcomePromptEnd = outcomePromptStart + outcomeCount - 1;
          const questionPromptStart = outcomePromptEnd + 1;
          const questionPromptEnd = questionPromptStart + questionCount - 1;
          const needsHeadingRow = questionPromptEnd + 1;
          const needsQuestionStart = needsHeadingRow + 1;
          const needsQuestionEnd = needsQuestionStart + needsQuestionCount - 1;
          const needsPlanStart = needsQuestionEnd + 1;
          const needsPlanEnd = needsPlanStart + needsPlanCount - 1;
          let insertIndex = afterRowIdx + 1;
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
          entries.splice(insertIndex, 0, blankRow);
          if (type === 'outcome') {
            const sourcePairId = getRowPairId(entries[afterRowIdx]) || createRowPairId('outcome');
            setRowPairId(entries[insertIndex], sourcePairId);
          }
          if (type === 'needsPlan') {
            const sourcePairId = getRowPairId(entries[afterRowIdx]) || createRowPairId('needs');
            setRowPairId(entries[insertIndex], sourcePairId);
          }
          const nextState = { ...item, planTableEntries: entries };
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
          nextFocus = {
            itemId,
            row: insertIndex,
            col: type === 'question' ? 1 : type === 'needsPlan' ? 2 : 2,
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

  const addQuestionPromptWithOutcomeRow = useCallback(
    (itemId, _questionRowIdx) => {
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

  const addNeedsPromptWithPlanRow = useCallback(
    (itemId, _needsRowIdx) => {
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
          const reasonStart = 2;
          const reasonEnd = reasonStart + reasonCount; // exclusive limit
          const outcomeStart = reasonEnd + 1;
          const outcomeEnd = outcomeStart + outcomeCount;
          const questionStart = outcomeEnd;
          const questionEnd = questionStart + questionCount;
          const needsHeadingRow = questionEnd;
          const needsQuestionStart = needsHeadingRow + 1;
          const needsQuestionEnd = needsQuestionStart + needsQuestionCount;
          const needsPlanStart = needsQuestionEnd;
          const needsPlanEnd = needsPlanStart + needsPlanCount;

          const withinReason = rowIdx >= reasonStart && rowIdx < reasonEnd;
          const withinOutcome = rowIdx >= outcomeStart && rowIdx < outcomeEnd;
          const withinQuestion = rowIdx >= questionStart && rowIdx < questionEnd;
          const withinNeedsQuestion = rowIdx >= needsQuestionStart && rowIdx < needsQuestionEnd;
          const withinNeedsPlan = rowIdx >= needsPlanStart && rowIdx < needsPlanEnd;

          if (
            rowIdx < 2 ||
            rowIdx >= entries.length ||
            (type === 'reason' && !withinReason) ||
            (type === 'outcome' && !withinOutcome) ||
            (type === 'question' && !withinQuestion) ||
            (type === 'needsQuestion' && !withinNeedsQuestion) ||
            (type === 'needsPlan' && !withinNeedsPlan)
          ) {
            return item;
          }
          const blankRow = Array.from({ length: PLAN_TABLE_COLS }, () => '');
          const existingPairId = getRowPairId(entries[rowIdx]);
          const onlyReasonRow = type === 'reason' && reasonCount <= 1;
          const onlyOutcomeRow = type === 'outcome' && outcomeCount <= 1;
          const onlyQuestionRow = type === 'question' && questionCount <= 1;
          const onlyNeedsQuestionRow = type === 'needsQuestion' && needsQuestionCount <= 1;
          const onlyNeedsPlanRow = type === 'needsPlan' && needsPlanCount <= 1;
          if (onlyReasonRow || onlyOutcomeRow || onlyQuestionRow || onlyNeedsQuestionRow || onlyNeedsPlanRow) {
            entries[rowIdx] = blankRow;
            if (existingPairId) {
              setRowPairId(entries[rowIdx], existingPairId);
            }
            return { ...item, planTableEntries: entries };
          }
          entries.splice(rowIdx, 1);
          const nextState = { ...item, planTableEntries: entries };
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
          return nextState;
        }),
      }));
    },
    [setState]
  );

  const handlePlanTableCellChange = (itemId, rowIdx, colIdx, value) => {
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
                const reasonRowCount = item.planReasonRowCount ?? 1;
                const outcomeRowCount = item.planOutcomeRowCount ?? 1;
                const questionRowCount = item.planOutcomeQuestionRowCount ?? 1;
                const needsQuestionRowCount = item.planNeedsQuestionRowCount ?? 1;
                const needsPlanRowCount = item.planNeedsPlanRowCount ?? 1;
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
                const buildRowEntry = (rowIdx) => {
                  const rowValues =
                    planEntries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
                  return {
                    rowIdx,
                    rowValues,
                    pairId: getRowPairId(planEntries[rowIdx]),
                  };
                };
                const renderQuestionPromptRow = (rowValues, rowIdx, promptIndex) => (
                  <tr key={`${item.id}-plan-question-row-${rowIdx}`}>
                    <td
                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                      style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9ead3' }}
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
                      style={{ backgroundColor: '#d9ead3' }}
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
                            addQuestionPromptWithOutcomeRow(item.id, rowIdx);
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
                        backgroundColor: '#d9ead3',
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
                const renderOutcomePromptRow = (rowValues, rowIdx) => (
                  <tr key={`${item.id}-plan-row-${rowIdx}`}>
                    {rowValues.map((cellValue, cellIdx) => {
                      const style = { backgroundColor: '#f1f7ee' };
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
                const renderReasonPromptRow = (rowValues, rowIdx) => (
                  <tr key={`${item.id}-plan-row-${rowIdx}`}>
                    {rowValues.map((cellValue, cellIdx) => {
                      const baseStyle =
                        cellIdx === 0 || cellIdx === 1
                          ? { width: '120px', minWidth: '120px', backgroundColor: '#f9f3f6' }
                          : { backgroundColor: '#f9f3f6' };
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
                const renderNeedsQuestionRow = (rowValues, rowIdx) => (
                  <tr key={`${item.id}-needs-question-row-${rowIdx}`}>
                    <td
                      className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                      style={{ width: '120px', minWidth: '120px', backgroundColor: '#ead1dc' }}
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
                      style={{ backgroundColor: '#ead1dc' }}
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
                            addNeedsPromptWithPlanRow(item.id, rowIdx);
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
                        backgroundColor: '#ead1dc',
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
                const renderNeedsPlanRow = (rowValues, rowIdx) => (
                  <tr key={`${item.id}-needs-plan-row-${rowIdx}`}>
                    {rowValues.map((cellValue, cellIdx) => {
                      const style = { backgroundColor: '#f9f3f6' };
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
                const {
                  pairs: needsQuestionPlanGroups,
                  leftoverPrimary: leftoverNeedsQuestionEntries,
                  leftoverSecondary: leftoverNeedsPlanEntries,
                } = buildPairedRowGroups(needsQuestionEntries, needsPlanEntries);
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
                              <tr key={`${item.id}-plan-row-0`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS}
                                  className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#d5a6bd', color: '#1f2937' }}
                                >
                                  &nbsp;&nbsp;&nbsp;Reasons
                                </td>
                              </tr>
                              <tr key={`${item.id}-plan-row-1`}>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                  style={{ width: '120px', minWidth: '120px', backgroundColor: '#ead1dc' }}
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
                                  style={{ backgroundColor: '#ead1dc' }}
                                >
                                  <span className="text-[14px] font-semibold text-slate-800">
                                    Why do I want to start this?
                                  </span>
                                </td>
                              </tr>
                              {reasonPromptEntries.map(({ rowIdx, rowValues }) =>
                                renderReasonPromptRow(rowValues, rowIdx)
                              )}
                              <tr key={`${item.id}-plan-row-${outcomeHeadingRow}`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS}
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px] text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#93c47d', color: '#1f2937' }}
                                >
                                  Outcomes
                                </td>
                              </tr>
                              {questionOutcomeGroups.map(({ primary, secondaryList }) => (
                                <React.Fragment
                                  key={`${item.id}-plan-pair-${primary.pairId || primary.rowIdx}`}
                                >
                                  {renderQuestionPromptRow(
                                    primary.rowValues,
                                    primary.rowIdx,
                                    primary.promptIndex
                                  )}
                                  {secondaryList.map((outcome) =>
                                    renderOutcomePromptRow(outcome.rowValues, outcome.rowIdx)
                                  )}
                                </React.Fragment>
                              ))}
                              {leftoverOutcomeEntries.map(({ rowIdx, rowValues }) =>
                                renderOutcomePromptRow(rowValues, rowIdx)
                              )}
                              {leftoverQuestionEntries.map(({ rowIdx, rowValues, promptIndex }) =>
                                renderQuestionPromptRow(rowValues, rowIdx, promptIndex)
                              )}
                              <tr key={`${item.id}-plan-row-${needsHeadingRow}`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS}
                                  className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#d5a6bd', color: '#1f2937' }}
                                >
                                  &nbsp;&nbsp;&nbsp;Needs
                                </td>
                              </tr>
                              {needsQuestionPlanGroups.map(({ primary, secondaryList }) => (
                                <React.Fragment
                                  key={`${item.id}-needs-pair-${primary.pairId || primary.rowIdx}`}
                                >
                                  {renderNeedsQuestionRow(primary.rowValues, primary.rowIdx)}
                                  {secondaryList.map((plan) =>
                                    renderNeedsPlanRow(plan.rowValues, plan.rowIdx)
                                  )}
                                </React.Fragment>
                              ))}
                              {leftoverNeedsQuestionEntries.map(({ rowIdx, rowValues }) =>
                                renderNeedsQuestionRow(rowValues, rowIdx)
                              )}
                              {leftoverNeedsPlanEntries.map(({ rowIdx, rowValues }) =>
                                renderNeedsPlanRow(rowValues, rowIdx)
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
