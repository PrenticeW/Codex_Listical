/**
 * Planner Filter Storage
 *
 * Persists the System page's filter state so it survives navigating away
 * from the page and closing/reopening the app.
 *
 * Storage backend: localStorage only — filters are per-device VIEW state
 * (like a scroll position), not planning data, so they deliberately do not
 * sync across devices and never touch Supabase. This is the one sanctioned
 * localStorage use for filters; page/component code must still go through
 * this module rather than calling localStorage directly.
 *
 * Year-scoped (`planner-year-{N}-filters`): filter values reference
 * projects/statuses/day columns that are themselves per-year.
 *
 * Shape stored (all arrays of strings unless noted):
 * {
 *   dayColumns,          // day column ids ('day-3', …)
 *   project, subproject, status, recurring, estimate,
 *   dayTags,             // day-tag view filter ('Mon', …)
 *   projectFilter,       // string | null — single-project view filter
 * }
 */

const storageKey = (yearNumber) => `planner-year-${yearNumber}-filters`;

const EMPTY_STATE = Object.freeze({
  dayColumns: [],
  project: [],
  subproject: [],
  status: [],
  recurring: [],
  estimate: [],
  dayTags: [],
  projectFilter: null,
});

const asStringArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export const plannerFilterStorage = {
  /**
   * Load persisted filter state for a year. Always returns a full, sanitised
   * state object (EMPTY_STATE shape) — never throws, never returns null.
   */
  loadFilters(yearNumber) {
    try {
      const raw = localStorage.getItem(storageKey(yearNumber));
      if (!raw) return { ...EMPTY_STATE };
      const parsed = JSON.parse(raw);
      return {
        dayColumns: asStringArray(parsed.dayColumns),
        project: asStringArray(parsed.project),
        subproject: asStringArray(parsed.subproject),
        status: asStringArray(parsed.status),
        recurring: asStringArray(parsed.recurring),
        estimate: asStringArray(parsed.estimate),
        dayTags: asStringArray(parsed.dayTags),
        projectFilter: typeof parsed.projectFilter === 'string' ? parsed.projectFilter : null,
      };
    } catch {
      return { ...EMPTY_STATE };
    }
  },

  /**
   * Persist filter state for a year. `state` fields may be Sets or arrays.
   * A fully-empty state removes the key instead of storing an empty blob.
   */
  saveFilters(yearNumber, state) {
    try {
      const out = {
        dayColumns: Array.from(state.dayColumns ?? []),
        project: Array.from(state.project ?? []),
        subproject: Array.from(state.subproject ?? []),
        status: Array.from(state.status ?? []),
        recurring: Array.from(state.recurring ?? []),
        estimate: Array.from(state.estimate ?? []),
        dayTags: Array.from(state.dayTags ?? []),
        projectFilter: state.projectFilter ?? null,
      };
      const isEmpty =
        !out.projectFilter &&
        ['dayColumns', 'project', 'subproject', 'status', 'recurring', 'estimate', 'dayTags']
          .every((k) => out[k].length === 0);
      if (isEmpty) {
        localStorage.removeItem(storageKey(yearNumber));
      } else {
        localStorage.setItem(storageKey(yearNumber), JSON.stringify(out));
      }
    } catch {
      // localStorage unavailable/full — filters just won't persist.
    }
  },

  /** Remove persisted filter state for a year (e.g. on year deletion). */
  clearFilters(yearNumber) {
    try {
      localStorage.removeItem(storageKey(yearNumber));
    } catch {
      // ignore
    }
  },
};

export default plannerFilterStorage;
