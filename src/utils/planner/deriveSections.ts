/**
 * Positional section derivation — the shared walk.
 *
 * WHERE a planner row lives (the Inbox, a project block, a General /
 * Unscheduled section, a chip/subproject group) is never stored on the row:
 * it is derived purely from the row's position between structural rows, in
 * order. project_id / projectId is data, not placement. Three consumers need
 * the same walk:
 *   - the web UI: useParentGroupAssignment.ts (assignParentGroupIds) — kept
 *     as its own pass because it deals in groupIds for collapse/drag, but its
 *     RULES must stay in lockstep with this file (see comments there)
 *   - the mobile app: tacular-mobile lib/plannerData.js (nestRows)
 *   - AI features reading planner_rows from the DB — use
 *     deriveRowSectionsFromDb below
 *
 * Rules (web parity, and mobile parity for the DB shape):
 *   - a projectHeader opens a project; task rows after it belong to it
 *   - a subprojectHeader opens a group inside the current project
 *   - projectGeneral / projectUnscheduled open those standing sections AND
 *     reset any subproject/chip group context (the 2026-10-17 "can't move a
 *     task under a new subheader" fix — label rows must reset like
 *     relocateStrayChipTasks's walk does)
 *   - subprojectGeneral / subprojectUnscheduled reset group context only
 *   - the Inbox divider (_isInboxRow) clears all context; rows after it are
 *     in the Inbox regardless of their project column (web parity: a task
 *     after the divider is IN the Inbox even if its project cell is set)
 *   - deletedChip tombstones are skipped and never close a section
 *   - the Archive header ends the walk's live region: archive rows and
 *     archived tasks are excluded from the result
 *   - a task row before any structural context gets section: null — the
 *     caller may fall back to the row's own projectId join (mobile parity)
 */

// @ts-ignore — plain JS module
import { isValidOrderKey } from './orderKey';

export type DerivedSection = {
  rowId: string;
  /** 'inbox' | 'project' | null (no positional context — fall back to the row's own projectId) */
  section: 'inbox' | 'project' | null;
  /** Display nickname of the enclosing project ('' never appears; null when not in a project) */
  projectNickname: string | null;
  /** Title of the enclosing group/section (chip or subproject name, 'General', 'Unscheduled', or a custom label); null at project top level */
  groupTitle: string | null;
};

const GENERAL_GROUP = 'General';
const UNSCHEDULED_GROUP = 'Unscheduled';

// Structural row types that close the live region (everything archive-shaped).
const ARCHIVE_TYPES = new Set([
  'archiveHeader',
  'archiveRow',
  'archivedProjectHeader',
  'archivedProjectGeneral',
  'archivedProjectUnscheduled',
]);

// In-memory-only calendar/metrics rows — not tasks, not section openers.
const isDecorationRow = (row: any): boolean =>
  !!(row._isMonthRow || row._isWeekRow || row._isDayRow || row._isDayOfWeekRow ||
     row._isDailyMinRow || row._isDailyMaxRow || row._isDailyTotalRow || row._isFilterRow);

/**
 * Walk rows IN DISPLAY ORDER (the caller is responsible for order — in-memory
 * state is already ordered; DB rows go through deriveRowSectionsFromDb) and
 * return one entry per live task row.
 */
export function deriveRowSections(rows: any[]): DerivedSection[] {
  const out: DerivedSection[] = [];
  let currentProject: string | null = null; // nickname of the open project
  let currentGroup: string | null = null;   // title of the open group/section
  let inInbox = false;
  let inArchive = false;

  for (const row of (rows || [])) {
    if (!row || inArchive) continue; // the Archive header ends the live region
    const rowType = row._rowType;

    if (rowType && ARCHIVE_TYPES.has(rowType)) { inArchive = true; continue; }
    if (row._isArchiveRow) { inArchive = true; continue; } // legacy divider

    if (row._isInboxRow) {
      currentProject = null;
      currentGroup = null;
      inInbox = true;
      continue;
    }
    if (rowType === 'projectHeader') {
      currentProject = row.projectNickname || null;
      currentGroup = null;
      inInbox = false;
      continue;
    }
    if (rowType === 'subprojectHeader') {
      currentGroup = row.subprojectName || row._chipLabel || null;
      if (row.projectNickname) currentProject = row.projectNickname;
      inInbox = false;
      continue;
    }
    if (rowType === 'projectGeneral' || rowType === 'projectUnscheduled') {
      currentGroup = row.sectionLabel ||
        (rowType === 'projectGeneral' ? GENERAL_GROUP : UNSCHEDULED_GROUP);
      if (row.projectNickname) currentProject = row.projectNickname;
      inInbox = false;
      continue;
    }
    if (rowType === 'subprojectGeneral' || rowType === 'subprojectUnscheduled') {
      // Label rows reset subproject context only (web parity with
      // assignParentGroupIds); the project stays open.
      currentGroup = null;
      continue;
    }
    if (rowType === 'deletedChip') continue; // tombstone: skip, never closes a section
    if (rowType) continue; // any other structural row: not a task
    if (isDecorationRow(row)) continue;
    if (row._isArchivedTask || row.archiveWeekLabel) continue;

    // Live task row.
    out.push({
      rowId: row.id,
      section: inInbox ? 'inbox' : (currentProject ? 'project' : null),
      projectNickname: inInbox ? null : currentProject,
      groupTitle: inInbox ? null : currentGroup,
    });
  }
  return out;
}

/**
 * Same walk over raw planner_rows DB rows (snake_case, structural markers in
 * day_entries.__extra). Sorts by order_key byte order (COLLATE "C" parity:
 * plain JS < / > on the base-62 key IS code-unit order) with display_order as
 * the legacy fallback for null-key rows — the same comparator shape as
 * orderKey.js compareRowOrder and mobile's compareDbRowOrder.
 */
export function deriveRowSectionsFromDb(dbRows: any[]): DerivedSection[] {
  const ordered = (dbRows || [])
    .filter((r) => r && r.row_kind === 'task')
    .slice()
    .sort((a, b) => {
      const ak = isValidOrderKey(a.order_key) ? a.order_key : null;
      const bk = isValidOrderKey(b.order_key) ? b.order_key : null;
      if (ak !== null && bk !== null) {
        if (ak < bk) return -1;
        if (ak > bk) return 1;
        return String(a.id).localeCompare(String(b.id));
      }
      const ao = typeof a.display_order === 'number' ? a.display_order : 0;
      const bo = typeof b.display_order === 'number' ? b.display_order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });

  const shaped = ordered.map((r) => {
    const extra = r.day_entries?.__extra || {};
    return {
      id: r.id,
      _rowType: extra._rowType,
      _isInboxRow: extra._isInboxRow === true,
      _isArchiveRow: extra._isArchiveRow === true,
      _isArchivedTask: extra._isArchivedTask === true,
      archiveWeekLabel: extra.archiveWeekLabel,
      projectNickname: extra.projectNickname,
      subprojectName: extra.subprojectName,
      _chipLabel: extra._chipLabel,
      sectionLabel: extra.sectionLabel,
    };
  });
  return deriveRowSections(shaped);
}
