/**
 * Row pairing utilities for managing paired rows in the plan table
 * (e.g., outcome rows paired with question rows, needs question rows paired with plan rows)
 */

const PLAN_PAIR_META_KEY = '__pairId';

/**
 * Create a unique pair ID for linking rows together
 */
export const createRowPairId = (prefix = 'pair') => {
  const base =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${base}`;
};

/**
 * Get the pair ID from a row
 */
export const getRowPairId = (row) => {
  if (!row) return null;
  const value = row?.[PLAN_PAIR_META_KEY];
  return typeof value === 'string' && value ? value : null;
};

/**
 * Set the pair ID on a row (as non-enumerable property)
 */
export const setRowPairId = (row, pairId) => {
  if (!row) return;
  Object.defineProperty(row, PLAN_PAIR_META_KEY, {
    value: pairId,
    writable: true,
    configurable: true,
    enumerable: false,
  });
};

/**
 * Ensure pairing metadata for a section of rows (e.g., outcomes + questions)
 */
export const ensureSectionPairMetadata = ({
  entries,
  primaryStart,
  primaryCount,
  secondaryStart,
  secondaryCount,
  prefix,
}) => {
  if (!Array.isArray(entries)) return;
  const pairableCount = Math.min(primaryCount, secondaryCount);

  // Pair rows that align by index
  for (let i = 0; i < pairableCount; i += 1) {
    const primaryIdx = primaryStart + i;
    const secondaryIdx = secondaryStart + i;
    const primaryRow = entries[primaryIdx];
    const secondaryRow = entries[secondaryIdx];
    if (!primaryRow && !secondaryRow) continue;

    const primaryPairId = getRowPairId(primaryRow);
    const secondaryPairId = getRowPairId(secondaryRow);

    // If both have different pair IDs, skip (user customization)
    if (primaryPairId && secondaryPairId && primaryPairId !== secondaryPairId) {
      continue;
    }

    // Assign or create pair ID
    const pairId = primaryPairId || secondaryPairId || createRowPairId(prefix);
    setRowPairId(primaryRow, pairId);
    setRowPairId(secondaryRow, pairId);
  }

  // Propagate pair IDs within primary section
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

  // Propagate pair IDs within secondary section
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

/**
 * Ensure pairing metadata for all sections in the plan table
 */
export const ensurePlanPairingMetadata = ({
  entries,
  reasonRowCount,
  outcomeRowCount,
  questionRowCount,
  needsQuestionRowCount,
  needsPlanRowCount,
}) => {
  if (!Array.isArray(entries)) return;

  // Calculate row positions
  const outcomeHeadingRow = 2 + reasonRowCount;
  const outcomeStart = outcomeHeadingRow + 1;
  const questionStart = outcomeStart + outcomeRowCount;

  // Pair outcomes with questions
  ensureSectionPairMetadata({
    entries,
    primaryStart: outcomeStart,
    primaryCount: outcomeRowCount,
    secondaryStart: questionStart,
    secondaryCount: questionRowCount,
    prefix: 'outcome',
  });

  // Calculate needs section positions
  const needsHeadingRow = questionStart + questionRowCount;
  const needsQuestionStart = needsHeadingRow + 1;
  const needsPlanStart = needsQuestionStart + needsQuestionRowCount;

  // Pair needs questions with plans
  ensureSectionPairMetadata({
    entries,
    primaryStart: needsQuestionStart,
    primaryCount: needsQuestionRowCount,
    secondaryStart: needsPlanStart,
    secondaryCount: needsPlanRowCount,
    prefix: 'needs',
  });
};

/**
 * Build grouped row pairs from primary and secondary entries
 * Returns: { pairs, leftoverPrimary, leftoverSecondary }
 */
export const buildPairedRowGroups = (primaryEntries, secondaryEntries) => {
  const groupedSecondary = new Map();
  const fallbackSecondary = [];

  // Group secondary entries by pair ID
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

  // Match primary entries with secondary entries
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
