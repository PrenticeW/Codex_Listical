import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SquarePlus, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useYear } from '../contexts/YearContext';
import NavigationBar from '../components/planner/NavigationBar';
import { loadStagingState, saveStagingState } from '../lib/stagingStorage';

const PLAN_TABLE_ROWS = 15;
const PLAN_TABLE_COLS = 6;
const PLAN_PAIR_META_KEY = '__pairId';
const COLOR_SWATCH_HUES = [0, 28, 45, 90, 150, 210, 270, 300];
const COLOR_SWATCH_LIGHTNESS = [40, 50, 60, 70];
const COLOR_SATURATION = 75;
const COLOR_PALETTE = COLOR_SWATCH_HUES.flatMap((hue) =>
  COLOR_SWATCH_LIGHTNESS.map(
    (lightness) => `hsl(${hue}, ${COLOR_SATURATION}%, ${lightness}%)`
  )
);

const ColorSwatchGrid = ({
  selectedColor,
  onSelect = () => {},
  buttonSize = 28,
  columns = 4,
}) => {
  const normalizedColor = selectedColor || COLOR_PALETTE[0];
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {COLOR_PALETTE.map((color) => {
        const isActive = color === normalizedColor;
        return (
          <button
            key={color}
            type="button"
            className="rounded transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              width: buttonSize,
              height: buttonSize,
              backgroundColor: color,
              border: isActive ? '2px solid #0f172a' : '2px solid rgba(15,23,42,0.35)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
            }}
            onClick={() => onSelect(color)}
            aria-label={`Select color ${color}`}
          />
        );
      })}
    </div>
  );
};
const PLAN_ESTIMATE_OPTIONS = [
  '-',
  'Custom',
  '1 Minute',
  ...Array.from({ length: 11 }, (_, i) => `${(i + 1) * 5} Minutes`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${h} Hour${h > 1 ? 's' : ''}`),
];

const parseEstimateLabelToMinutes = (label) => {
  if (!label || label === '-' || label === 'Custom') return null;
  const minuteMatch = label.match(/^(\d+)\s+Minute/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1], 10);
  }
  const hourMatch = label.match(/^(\d+)\s+Hour/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10) * 60;
  }
  return null;
};

const formatMinutesToHHmm = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}.${mins.toString().padStart(2, '0')}`;
};

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

const buildProjectPlanSummary = (item) => {
  if (!item) return { subprojects: [], totalHours: '0.00' };
  const entries = clonePlanTableEntries(item.planTableEntries);
  const reasonRowCount = item.planReasonRowCount ?? 1;
  const outcomeRowCount = item.planOutcomeRowCount ?? 1;
  const questionRowCount = item.planOutcomeQuestionRowCount ?? 1;
  const needsQuestionRowCount = item.planNeedsQuestionRowCount ?? 1;
  const needsPlanRowCount = item.planNeedsPlanRowCount ?? 1;
  const scheduleRowCount = item.planSubprojectRowCount ?? 1; // Changed from subprojectRowCount
  const subprojectRowCount = item.planXxxRowCount ?? 1; // Changed from xxxRowCount
  const outcomeHeadingRow = 2 + reasonRowCount;
  const outcomePromptStart = outcomeHeadingRow + 1;
  const outcomePromptEnd = outcomePromptStart + Math.max(outcomeRowCount - 1, 0);
  const questionPromptStart = outcomePromptEnd + 1;
  const questionPromptEnd = questionPromptStart + Math.max(questionRowCount - 1, 0);
  const needsHeadingRow = questionPromptEnd + 1;
  const needsQuestionStart = needsHeadingRow + 1;
  const needsQuestionEnd = needsQuestionStart + Math.max(needsQuestionRowCount - 1, 0);
  const needsPlanStart = needsQuestionEnd + 1;
  const scheduleHeadingRow = needsPlanStart + Math.max(needsPlanRowCount, 0); // Changed from subprojectsHeadingRow
  const schedulePromptRow = scheduleHeadingRow + 1; // Changed from subprojectsPromptRow
  const scheduleStart = schedulePromptRow + 1; // Changed from subprojectStart
  const subprojectsHeadingRow = scheduleStart + Math.max(scheduleRowCount, 0); // Changed from xxxHeadingRow
  const subprojectsPromptRow = subprojectsHeadingRow + 1; // Changed from xxxPromptRow
  const subprojectStart = subprojectsPromptRow + 1; // Changed from xxxStart
  const subprojects = [];
  // Now extracting from the new Subprojects section (formerly XXX)
  for (let idx = 0; idx < Math.max(subprojectRowCount, 0); idx += 1) {
    const rowIdx = subprojectStart + idx;
    const rowValues = entries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
    subprojects.push({
      name: (rowValues[2] ?? '').trim(),
      timeValue: rowValues[4] ?? '0.00',
    });
  }
  const calculateMinutes = (baseIdx, rowCount) =>
    Array.from({ length: Math.max(rowCount, 0) }, (_, idx) => {
      const rowIdx = baseIdx + idx;
      const rowValues = entries[rowIdx] ?? [];
      return parseTimeValueToMinutes(rowValues[4] ?? '');
    }).reduce((sum, value) => sum + value, 0);
  const needsPlanTotalMinutes = calculateMinutes(needsPlanStart, needsPlanRowCount);
  const scheduleTotalMinutes = calculateMinutes(scheduleStart, scheduleRowCount); // Changed from subprojectTotalMinutes
  const projectTotalMinutes = needsPlanTotalMinutes + scheduleTotalMinutes;
  return {
    subprojects,
    needsPlanTotalMinutes,
    scheduleTotalMinutes, // Changed from subprojectTotalMinutes
    totalHours: formatMinutesToHHmm(projectTotalMinutes),
  };
};

export default function StagingPage({ currentPath = '/staging', onNavigate = () => {} }) {
  const { currentYear } = useYear();
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadStagingState(currentYear));
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
    const enrichedShortlist = shortlist.map((item) => ({
      ...item,
      planSummary: buildProjectPlanSummary(item),
    }));
    saveStagingState({ shortlist: enrichedShortlist, archived }, currentYear);
  }, [shortlist, archived, currentYear]);

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
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;
          const planTableEntries = clonePlanTableEntries(item.planTableEntries);
          ensurePlanPairingMetadata({
            entries: planTableEntries,
            reasonRowCount: reasonCount,
            outcomeRowCount: outcomeCount,
            questionRowCount: questionCount,
            needsQuestionRowCount: needsQuestionCount,
            needsPlanRowCount: needsPlanCount,
          });
          const nextProjectMetadata = {
            projectName: planModal.projectName,
            projectNickname: planModal.projectNickname,
            color: planModal.color ?? item.color,
          };
          if (item.planTableVisible) {
            return {
              ...item,
              ...nextProjectMetadata,
              hasPlan: true,
              planOutcomeRowCount: outcomeCount,
              planOutcomeQuestionRowCount: questionCount,
              planNeedsQuestionRowCount: needsQuestionCount,
              planNeedsPlanRowCount: needsPlanCount,
              planSubprojectRowCount: subprojectCount,
              planXxxRowCount: xxxCount,
              planTableEntries,
            };
          }
          return {
            ...item,
            ...nextProjectMetadata,
            planTableVisible: true,
            planTableCollapsed: false,
            hasPlan: true,
            planTableEntries,
            planReasonRowCount: reasonCount,
            planOutcomeRowCount: outcomeCount,
            planOutcomeQuestionRowCount: questionCount,
            planNeedsQuestionRowCount: needsQuestionCount,
            planNeedsPlanRowCount: needsPlanCount,
            planSubprojectRowCount: subprojectCount,
            planXxxRowCount: xxxCount,
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
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;
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
          const subprojectsHeadingRow = needsPlanStart + Math.max(needsPlanCount, 0);
          const subprojectsPromptRow = subprojectsHeadingRow + 1;
          const subprojectStart = subprojectsPromptRow + 1;
          const subprojectEnd = subprojectStart + Math.max(subprojectCount - 1, 0);
          const xxxHeadingRow = subprojectStart + Math.max(subprojectCount, 0);
          const xxxPromptRow = xxxHeadingRow + 1;
          const xxxStart = xxxPromptRow + 1;
          const xxxEnd = xxxStart + Math.max(xxxCount - 1, 0);
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
          if (type === 'subproject') {
            const minIndex = Math.max(subprojectStart, 0);
            const maxIndex = Math.min(subprojectEnd + 1, entries.length);
            insertIndex = Math.min(Math.max(insertIndex, minIndex), maxIndex);
          }
          if (type === 'xxx') {
            const minIndex = Math.max(xxxStart, 0);
            const maxIndex = Math.min(xxxEnd + 1, entries.length);
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
          if (type === 'subproject') {
            nextState.planSubprojectRowCount = (item.planSubprojectRowCount ?? 1) + 1;
          }
          if (type === 'xxx') {
            nextState.planXxxRowCount = (item.planXxxRowCount ?? 1) + 1;
          }
          nextFocus = {
            itemId,
            row: insertIndex,
            col: type === 'question' ? 1 : 2,
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
    (itemId) => {
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
    (itemId) => {
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
          const subprojectCount = item.planSubprojectRowCount ?? 1;
          const xxxCount = item.planXxxRowCount ?? 1;
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
          const subprojectHeadingRow = needsPlanEnd;
          const subprojectPromptRow = subprojectHeadingRow + 1;
          const subprojectStart = subprojectPromptRow + 1;
          const subprojectEnd = subprojectStart + subprojectCount;
          const xxxHeadingRow = subprojectEnd;
          const xxxPromptRow = xxxHeadingRow + 1;
          const xxxStart = xxxPromptRow + 1;
          const xxxEnd = xxxStart + xxxCount;

          const withinReason = rowIdx >= reasonStart && rowIdx < reasonEnd;
          const withinOutcome = rowIdx >= outcomeStart && rowIdx < outcomeEnd;
          const withinQuestion = rowIdx >= questionStart && rowIdx < questionEnd;
          const withinNeedsQuestion = rowIdx >= needsQuestionStart && rowIdx < needsQuestionEnd;
          const withinNeedsPlan = rowIdx >= needsPlanStart && rowIdx < needsPlanEnd;
          const withinSubproject = rowIdx >= subprojectStart && rowIdx < subprojectEnd;
          const withinXxx = rowIdx >= xxxStart && rowIdx < xxxEnd;

          if (
            rowIdx < 2 ||
            rowIdx >= entries.length ||
            (type === 'reason' && !withinReason) ||
            (type === 'outcome' && !withinOutcome) ||
            (type === 'question' && !withinQuestion) ||
            (type === 'needsQuestion' && !withinNeedsQuestion) ||
            (type === 'needsPlan' && !withinNeedsPlan) ||
            (type === 'subproject' && !withinSubproject) ||
            (type === 'xxx' && !withinXxx)
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
          const onlySubprojectRow = type === 'subproject' && subprojectCount <= 1;
          const onlyXxxRow = type === 'xxx' && xxxCount <= 1;
          if (
            onlyReasonRow ||
            onlyOutcomeRow ||
            onlyQuestionRow ||
            onlyNeedsQuestionRow ||
            onlyNeedsPlanRow ||
            onlySubprojectRow ||
            onlyXxxRow
          ) {
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
          if (type === 'subproject') {
            nextState.planSubprojectRowCount = Math.max((item.planSubprojectRowCount ?? 1) - 1, 1);
          }
          if (type === 'xxx') {
            nextState.planXxxRowCount = Math.max((item.planXxxRowCount ?? 1) - 1, 1);
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

  const handlePlanEstimateChange = (itemId, rowIdx, nextEstimate) => {
    if (rowIdx < 0) return;
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextEntries = clonePlanTableEntries(item.planTableEntries);
        const row =
          nextEntries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
        if (!nextEntries[rowIdx]) {
          nextEntries[rowIdx] = row;
        }
        row[3] = nextEstimate;
        const minutes = parseEstimateLabelToMinutes(nextEstimate);
        let nextTimeValue = '0.00';
        if (minutes != null) {
          nextTimeValue = formatMinutesToHHmm(minutes);
        } else if (nextEstimate === 'Custom') {
          nextTimeValue = '0.00';
        }
        row[4] = nextTimeValue;
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
                const scheduleRowCount = item.planSubprojectRowCount ?? 1; // Changed from subprojectRowCount
                const subprojectRowCount = item.planXxxRowCount ?? 1; // Changed from xxxRowCount
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
                const scheduleHeadingRow = needsPlanStart + Math.max(needsPlanRowCount, 0); // Changed from subprojectsHeadingRow
                const schedulePromptRow = scheduleHeadingRow + 1; // Changed from subprojectsPromptRow
                const scheduleStart = schedulePromptRow + 1; // Changed from subprojectStart
                const subprojectsHeadingRow = scheduleStart + Math.max(scheduleRowCount, 0); // Changed from xxxHeadingRow
                const subprojectsPromptRow = subprojectsHeadingRow + 1; // Changed from xxxPromptRow
                const subprojectStart = subprojectsPromptRow + 1; // Changed from xxxStart
                const buildRowEntry = (rowIdx) => {
                  const rowValues =
                    planEntries[rowIdx] ?? Array.from({ length: PLAN_TABLE_COLS }, () => '');
                  return {
                    rowIdx,
                    rowValues,
                    pairId: getRowPairId(planEntries[rowIdx]),
                  };
                };
                const renderQuestionPromptRow = (rowValues, rowIdx) => (
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
                        placeholder="What needs to happen and in what order?"
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
                const renderNeedsPlanRow = (rowValues, rowIdx) => {
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
                        const style = { backgroundColor: '#f9f3f6' };
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
                const renderScheduleRow = (rowValues, rowIdx) => {
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
                        const style = { backgroundColor: '#f1f7ee' };
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
                const renderSubprojectRow = (rowValues, rowIdx) => {
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
                        const style = { backgroundColor: '#f9f3f6' };
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
                            className="rounded-full p-1 text-white hover:text-white/80 focus:outline-none"
                            style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: 'none' }}
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
                                <span className="text-sm font-semibold text-slate-700">Project colour</span>
                                <ColorSwatchGrid
                                  selectedColor={planModal.color}
                                  onSelect={(color) =>
                                    setPlanModal((prev) => ({ ...prev, color }))
                                  }
                                  buttonSize={28}
                                  columns={4}
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
                                    setPlanModal((prev) => ({ ...prev, projectName: e.target.value }))
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
                                    setPlanModal((prev) => ({ ...prev, projectNickname: nextValue }));
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
                                  style={{ backgroundColor: '#93c47d', color: '#1f2937', paddingLeft: '10px' }}
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
                                    primary.rowIdx
                                  )}
                                  {secondaryList.map((outcome) =>
                                    renderOutcomePromptRow(outcome.rowValues, outcome.rowIdx)
                                  )}
                                </React.Fragment>
                              ))}
                              {leftoverOutcomeEntries.map(({ rowIdx, rowValues }) =>
                                renderOutcomePromptRow(rowValues, rowIdx)
                              )}
                              {leftoverQuestionEntries.map(({ rowIdx, rowValues }) =>
                                renderQuestionPromptRow(rowValues, rowIdx)
                              )}
                              <tr key={`${item.id}-plan-row-${needsHeadingRow}`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS - 2}
                                  className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#d5a6bd', color: '#1f2937' }}
                                >
                                  &nbsp;&nbsp;&nbsp;Needs
                                </td>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 text-right text-[14px] font-semibold"
                                  style={{
                                    backgroundColor: '#d5a6bd',
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
                                    backgroundColor: '#d5a6bd',
                                    width: '32px',
                                    minWidth: '32px',
                                  }}
                                ></td>
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
                              <tr key={`${item.id}-plan-row-schedule-header`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS}
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px] text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#93c47d', color: '#1f2937', paddingLeft: '10px' }}
                                >
                                  Schedule
                                </td>
                              </tr>
                              <tr key={`${item.id}-schedule-row-prompt`}>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                  style={{ width: '120px', minWidth: '120px', backgroundColor: '#d9ead3' }}
                                ></td>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                  colSpan={PLAN_TABLE_COLS - 2}
                                  style={{ backgroundColor: '#d9ead3' }}
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
                                    backgroundColor: '#d9ead3',
                                  }}
                                ></td>
                              </tr>
                              {scheduleEntries.map(({ rowIdx, rowValues }) =>
                                renderScheduleRow(rowValues, rowIdx)
                              )}
                              <tr key={`${item.id}-plan-row-subprojects-header`}>
                                <td
                                  colSpan={PLAN_TABLE_COLS}
                                  className="border border-[#e5e7eb] pl-6 pr-3 py-2 text-left font-semibold text-[14px]"
                                  style={{ backgroundColor: '#d5a6bd', color: '#1f2937' }}
                                >
                                  &nbsp;&nbsp;&nbsp;Subprojects
                                </td>
                              </tr>
                              <tr key={`${item.id}-subprojects-row-prompt`}>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                  style={{ width: '120px', minWidth: '120px', backgroundColor: '#ead1dc' }}
                                ></td>
                                <td
                                  className="border border-[#e5e7eb] px-3 py-2 min-h-[44px]"
                                  colSpan={PLAN_TABLE_COLS - 2}
                                  style={{ backgroundColor: '#ead1dc' }}
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
                                    backgroundColor: '#ead1dc',
                                  }}
                                ></td>
                              </tr>
                              {subprojectEntries.map(({ rowIdx, rowValues }) =>
                                renderSubprojectRow(rowValues, rowIdx)
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
                <div className="space-y-2" style={{ paddingTop: '15px' }}>
                  <span className="text-sm font-semibold text-slate-700">Project colour</span>
                  <ColorSwatchGrid
                    selectedColor={planModal.color}
                    onSelect={(color) => setPlanModal((prev) => ({ ...prev, color }))}
                    buttonSize={34}
                    columns={5}
                  />
                </div>
                <div className="space-y-1" style={{ paddingTop: '15px' }}>
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
                <div className="space-y-1" style={{ paddingTop: '15px' }}>
                  <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname">
                    Project Nickname
                  </label>
                  <input
                    id="plan-nickname"
                    type="text"
                    value={planModal.projectNickname}
                    onChange={(e) => {
                      const nextValue = (e.target.value || '').toUpperCase();
                      setPlanModal((prev) => ({ ...prev, projectNickname: nextValue }));
                    }}
                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
              </div>
                <div className="mt-5 flex justify-end" style={{ paddingTop: '15px' }}>
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
