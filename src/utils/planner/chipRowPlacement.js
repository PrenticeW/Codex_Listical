// Chip row placement for the System page's chip sync (2026-10-12, MOVE HOUSE
// mis-filing incident; docs/known-issues.md).
//
// Replaces the old inline "Step 4" reorder in ProjectTimePlannerV2's chip
// sync. That pass scanned each project block from its header to the NEXT
// project header. The last project has no next header, so its scan ran on
// through the Inbox and the whole Archive, and every live chip task found
// anywhere below it (any project's) was pulled up under the last project and
// registered as moved, i.e. persisted there. MOVE HOUSE, the last project,
// became the catch-all: 8 SELF LOVE / LIFE UPKEEP / BUILD HOODS chip tasks
// were saved between its header and its General row on 2026-10-12.
//
// Rules now:
//  1. A live chip task belongs directly under ITS OWN chip group header,
//     identified by parentGroupId (an opaque id, never a nickname or a
//     position). A chip task found anywhere else is moved back under that
//     header, wherever the header is.
//  2. Within a project, chip header blocks precede the General/Unscheduled
//     section rows, as before. The scan stops at the Inbox divider and the
//     Archive header, and only gathers this project's own chip headers and
//     their own chip tasks.
//
// Pure: returns { rows, movedIds }. The caller registers movedIds with
// plannerStorage.markRowsMoved so the intent-gated save persists the keys.

const SECTION_ROW_TYPES = new Set([
  'projectGeneral', 'projectUnscheduled', 'subprojectGeneral', 'subprojectUnscheduled',
]);

const isArchivedCopy = (row) => {
  if (row._isArchivedTask === true || String(row._isArchivedTask) === 'true') return true;
  if (typeof row._rowType === 'string' && row._rowType.startsWith('archived')) return true;
  const p = row.parentGroupId;
  return typeof p === 'string' && (p.startsWith('archived-') || p.startsWith('archive-week-'));
};

const isLiveChipTask = (row) =>
  row._rowType === 'projectTask' &&
  !!row._chipId &&
  typeof row.parentGroupId === 'string' &&
  row.parentGroupId.startsWith('chip') &&
  !isArchivedCopy(row);

const isLiveSubHeader = (row) =>
  row._rowType === 'subprojectHeader' && !!row.groupId && !isArchivedCopy(row);

const isBoundary = (row) => !!row._isInboxRow || row._rowType === 'archiveHeader';

// Rule 1: put every stray live chip task back under its own header.
export function relocateStrayChipTasks(input) {
  const rows = [...input];
  const headerCount = new Map();
  rows.forEach((r) => {
    if (isLiveSubHeader(r)) headerCount.set(r.groupId, (headerCount.get(r.groupId) || 0) + 1);
  });

  // Positional sub-group of each row (same reset rules as assignParentGroupIds).
  const strayIdx = [];
  let currentSub = null;
  rows.forEach((r, i) => {
    if (r._rowType === 'projectHeader' || SECTION_ROW_TYPES.has(r._rowType) || isBoundary(r)) {
      currentSub = null;
    }
    if (isLiveSubHeader(r)) { currentSub = r.groupId; return; }
    if (!isLiveChipTask(r)) return;
    if (r.parentGroupId === currentSub) return;
    // Only relocate when its header exists exactly once; otherwise leave it.
    if (headerCount.get(r.parentGroupId) !== 1) return;
    strayIdx.push(i);
  });
  if (strayIdx.length === 0) return { rows: input, movedIds: [] };

  const strays = strayIdx.map((i) => rows[i]);
  for (let k = strayIdx.length - 1; k >= 0; k -= 1) rows.splice(strayIdx[k], 1);
  strays.forEach((task) => {
    const h = rows.findIndex((r) => isLiveSubHeader(r) && r.groupId === task.parentGroupId);
    let at = h + 1;
    while (at < rows.length && rows[at].parentGroupId === task.parentGroupId && !isLiveSubHeader(rows[at])) at += 1;
    rows.splice(at, 0, task);
  });
  return { rows, movedIds: strays.map((r) => r.id) };
}

// Rule 2: within each project, chip header blocks precede section rows.
export function liftChipBlocksAboveSections(input) {
  const rows = [...input];
  const movedIds = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]._rowType !== 'projectHeader') { i += 1; continue; }
    const projectGroupId = rows[i].groupId;
    const ownHeaderIds = new Set();
    const blockIndices = [];
    const sectionIndices = [];
    let j = i + 1;
    while (j < rows.length && rows[j]._rowType !== 'projectHeader' && !isBoundary(rows[j])) {
      const r = rows[j];
      if (isLiveSubHeader(r) && r.parentGroupId === projectGroupId) {
        ownHeaderIds.add(r.groupId);
        blockIndices.push(j);
      } else if (isLiveChipTask(r) && ownHeaderIds.has(r.parentGroupId)) {
        blockIndices.push(j);
      } else if (SECTION_ROW_TYPES.has(r._rowType)) {
        sectionIndices.push(j);
      }
      j += 1;
    }
    const firstSection = sectionIndices.length ? sectionIndices[0] : Infinity;
    const misplaced = blockIndices.filter((idx) => idx > firstSection);
    if (misplaced.length > 0) {
      const lifted = misplaced.map((idx) => rows[idx]);
      movedIds.push(...lifted.map((r) => r.id));
      for (let k = misplaced.length - 1; k >= 0; k -= 1) rows.splice(misplaced[k], 1);
      rows.splice(firstSection, 0, ...lifted);
    }
    i += 1;
  }
  return { rows: movedIds.length ? rows : input, movedIds };
}

export function placeChipRows(input) {
  const a = relocateStrayChipTasks(input);
  const b = liftChipBlocksAboveSections(a.rows);
  return { rows: b.rows, movedIds: [...new Set([...a.movedIds, ...b.movedIds])] };
}
