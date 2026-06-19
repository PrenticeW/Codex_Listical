# Snapshot Hard Tier Handover

Two remaining snapshot gaps are in a different category from the medium tier. They are "hard" because they require either schema work, a pending migration, or changes to how the System page processes its own data. Neither is a straightforward read-and-restore.

---

## Gap 1 — `task_events` not captured

### What it is

Every time a task row changes status (e.g. Not Started → In Progress → Done), an event is written to the `task_events` table. The System page history panel reads these rows to show the status trail for each task.

The snapshot system does not read or write `task_events`. The table is append-only and keyed by `task_row_id`, not by snapshot.

### What breaks

After a snapshot restore, the planner rows roll back to their previous state. But `task_events` is untouched. This means:

- The history panel will show status changes that post-date the snapshot, making the history misleading.
- If a task that didn't exist at snapshot time was created and got events, and the restore removes that task row, the orphaned events stay in the table. They won't display anywhere useful, but they are noise.

### Why it's hard

Restoring `task_events` is not just a write-back — it requires a decision about what "restore" means for an append-only audit log. Two valid approaches:

**Option A — Soft delete post-snapshot events on restore.** Add a `snapshot_id` or `deleted_at` column to `task_events`. On restore, soft-delete any events with `created_at > snapshot.created_at` and `task_row_id` belonging to this year. This preserves the true audit trail but hides events from the history panel post-restore.

**Option B — Accept the inconsistency, surface it in the UI.** Add a banner or visual indicator in the history panel when a restore has been performed, flagging that the event history may include post-restore events. No schema change required. Trade-off: the history view is misleading.

**Option C — Capture a per-task snapshot of the latest status inside the system snapshot blob.** On capture, record `{ taskRowId, latestStatus }` for every row. On restore, truncate `task_events` for the year and re-insert synthetic events restoring each row to its captured status. This is complex and synthetic events pollute the audit trail.

Option B is the lowest-risk path pre-launch. Option A is correct if the history panel is a user-facing feature you want to stand behind.

### Relevant files

- `task_events` table in Supabase (no storage module exists for it yet)
- History panel: rendered inside `GearPanel.jsx` (`HistoryView` component, reads events via a direct Supabase query)
- `snapshotStorage.js` — `captureSystem` and `restoreSystem` are the entry points to extend

---

## Gap 2 — Chip task notes not captured

### What it is

Each chip on the Plan page can have task-level notes. Currently these notes are stored per-device in `localStorage`. There is a planned migration to move them to Supabase (tracked in `known-issues.md` under "Migrate chip task notes"), but it has not been written or applied.

Because notes live in `localStorage`, they are:
- Not user-account data — they cannot be read by `snapshotStorage.js` server-side
- Not year-scoped in the storage module sense
- Not restored when a snapshot is applied (nothing to restore from)

### What breaks

Snapshot restores leave chip task notes completely untouched. This is consistent — since notes aren't in the snapshot, they neither roll back nor forward. The user loses no data from a restore. The gap is that snapshot fidelity is incomplete: if you restore to a point before you added a note, the note survives the restore.

### Why it's hard

This gap cannot be closed until the chip task notes migration is done. The dependency chain is:

1. **Migrate chip task notes to Supabase.** Create a `chip_task_notes` table (or add a `notes` column to `tactics_chips`), write a storage module function for it, and update the Plan page to read/write through that module instead of `localStorage`.
2. **Add the notes to `capturePlan`.** Once the data is in Supabase, `capturePlan` can read it. The payload shape would be `{ chipId: string, notes: string }[]`.
3. **Add restore to `restorePlan`.** On restore, upsert each note row. This is safe because notes are per-chip and can be fully replaced.

Until step 1 is done, steps 2 and 3 cannot be written — there is no read path that works across devices.

### Relevant files

- Notes are read/written directly in `localStorage` inside the Plan page chip components (search for `localStorage` in `src/pages/TacticsPage.jsx` or in chip-related components under `src/components/tactics/`)
- `snapshotStorage.js` — `capturePlan` and `restorePlan` are the entry points to extend once the migration is done
- `tacticsStorage.js` — the module to add `loadChipTaskNotes` / `saveChipTaskNotes` to after the Supabase table exists

---

## Summary

| Gap | Blocker | Recommended path |
|---|---|---|
| `task_events` | Design decision | Ship Option B (UI disclosure) pre-launch; implement Option A post-launch if history panel is a core feature |
| Chip task notes | `localStorage` → Supabase migration not yet written | Do the migration first; snapshot capture/restore follows naturally |
