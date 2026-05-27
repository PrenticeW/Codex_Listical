# Year Flow

## Year statuses

- `active` — current working year, fully writable
- `draft` — next year in planning mode, all three pages writable but not the live year
- `archived` — completed year, read-only

Only one draft year may exist at a time.

---

## Plan Next Year flow

1. User presses **Plan Next Year** in the gear menu → `createDraftYearFromActive` (`src/utils/planner/createDraftYear.js`)
2. Year N+1 is created with `status: 'draft'`. Goal page, Plan chips/metrics, and UI settings are copied from Year N. Task rows are **not** copied.
3. UI switches to the draft year. A violet nav group appears for quick access to draft year pages.
4. User works through Goal → Plan → System on the draft year. Autosave applies as normal.
5. On the draft year's System page, an **Import tasks from Year N** panel appears when task rows are empty. User selects statuses to import (default: all except Done/Abandoned) and imports once only.
6. User presses **Archive Year N?** in the gear menu → `ArchiveYearModal` + `performYearArchive`.

### Archive guards

- **Empty-shortlist guard:** `validateYearReadyForArchive` and `performYearArchive` both reject the operation when the draft's Goal page has no projects. The modal renders this in a red Cannot Archive panel and disables the Archive button.
- **Metadata rollback on failure:** `performYearArchive` snapshots `app-year-metadata` before the first mutation and restores it on failure. The result object includes `rolledBack: true|false` on the failure path.

---

## Chip persistence

Tactics chips are persisted per year to `tactics-year-{N}-chips-state` via `saveTacticsChipsState` / `loadTacticsChipsState` in `src/lib/tacticsStorage.js`. Loaded on mount via `useState` initialiser — not deferred.

---

## Undo Draft (dev only — remove before launch)

The **Undo Draft** button in the nav bar calls `undoDraftYear` (`src/utils/planner/undoDraftYear.js`). It deletes all draft year storage keys, removes the draft year record from metadata, and switches back to the active year. Tracked as B4 in the code review. Remove before launch.
