# Offline support and cross-client sync — design proposal

**Scope:** tacular-mobile (Expo/React Native) and Listical web (React/Vite), both writing to the same Supabase `planner_rows` tables.
**Conflict policy (agreed):** last write wins, applied at field level wherever possible.
**Date:** 5 Aug 2026

---

## Implementation status (5 Aug 2026)

| Piece | Status |
|---|---|
| Phase 1: mobile outbox + snapshot (`lib/outbox.js`, `lib/offlineStore.js`, `usePlannerData` rewiring) | Built. Needs the AsyncStorage native rebuild and a real-device airplane-mode test. |
| Phase 2: web pending save + IndexedDB snapshot (`src/lib/plannerOffline.js`, `storage.js` wiring) | Built and deployed. Replay semantics covered by `src/utils/planner/__tests__/offlineReplay.test.js`. |
| Phase 3: PWA shell (`vite-plugin-pwa` in `vite.config.js`) | Built and deployed. |
| Phase 3: `planner_rows.updated_at` migration | Applied. Column is recording; no client reads it yet. |
| Sync indicators (mobile pill, web `OfflineSyncBadge`) | Built. Debounced ~1s so normal online saves never flicker; transient "Synced" on drain. |
| Phase 3: extend to staging/tactics/settings modules | Not started (deliberately parked until Phases 1 and 2 pass real-device testing). |
| Phase 3: `updated_at` staleness guard + pending max age | Built 27 Aug 2026 (web) after the stale-tab overwrite incident — see `docs/known-issues.md` "Stale-client overwrite". Client-side: the diff save compares `planner_rows.updated_at` against the read high-water mark for rows without a baseline; pending records older than 30 days are discarded (a sanity cap only — each record carries its baseline, so age alone is not a reason to drop it). Rejected ops are logged (`console.warn`), not surfaced in UI. |
| Phase 3: DB-level history for `planner_rows` | Migration `20260827000001_planner_rows_history_trigger.sql` written, not yet applied. |
| Known gap: System page task notes (`saveTaskNote`/`saveChipTaskNote`) | Still save directly; fail silently offline. Fold into the module-extension pass. |

---

## 1. Why the tube edits vanished

The mobile app is online-only by design today:

1. `usePlannerData` seeds screen state from a network fetch. No fetch, no data — and nothing is persisted locally between launches.
2. Edits are optimistic: the screen updates immediately, then `persistTaskPatch` / `persistNewTask` / `persistDelete` fire a Supabase call. Offline, that call throws.
3. Every persist function's catch block calls `refetch()`. When connectivity returns (or on the next foreground), refetch re-seeds the screen with **server truth**, which never received the offline writes. The edits are silently reverted — exactly what happened on the tube.

The web has the same shape of problem: `saveTaskRows` diffs against an in-memory cache and writes to Supabase. A failed save keeps the pending flag briefly, but a reload or tab close while offline loses the diff, and the page cannot open at all without the network.

Nothing here needs a redesign of the data model. The fix is two local layers per client, sitting under the code that already exists:

- a **snapshot cache** so the app/site can open and render offline, and
- a **durable outbox** so writes made offline survive restarts and replay when connectivity returns.

---

## 2. Shared principles (both clients)

**Client-generated UUIDs.** Row ids must be minted on the client at creation time (mobile already does this; web mints ids during save for synthetic `row-0` ids — move that to row-creation time). This is what makes offline inserts possible: the id exists before the server ever sees the row, so later patches, reorders and events can reference it while still queued.

**Writes go through an outbox, always.** Every mutation is recorded as a small operation object in durable local storage *before* the network attempt, and removed only after the server confirms it. Online, this adds a couple of milliseconds and the user notices nothing. Offline, the op simply waits. There is no separate "offline mode" — one code path, which is the main reason this design stays maintainable.

Operation types map 1:1 onto the existing API surface:

| Op | Payload | Idempotent replay |
|---|---|---|
| `insert` | full row | use `upsert` on id, so a retry after a half-failed flush can't duplicate |
| `patch` | row id + changed fields only | plain update by id; 0 rows affected → drop op (row deleted elsewhere, LWW) |
| `delete` | row id | delete by id; already-gone is success |
| `reorder` | `{id → display_order}` map (+ project moves) | per-row updates, as `runReorder` does now |
| `task_event` | append-only `task_events` row | already fire-and-forget; queue it the same way |

**Coalescing keeps the queue small and replay fast.** Before appending an op, merge:

- `patch` after `patch` on the same row → one merged patch
- `patch` after a queued `insert` → folded into the insert payload
- `delete` after a queued `insert` → both removed (net nothing)
- `delete` after queued `patches` → patches dropped, delete kept
- a new `reorder` replaces any queued `reorder` (only the final ordering matters)

A whole tube journey of editing typically collapses to a handful of ops.

**Flush rules.** Drain the outbox strictly in order (a `task_event` for a row must land after that row's `insert`). Triggers: connectivity restored (NetInfo on mobile, `online` event on web), app foreground / tab focus, and immediately after each new op when already online. One flush at a time; on failure, exponential backoff capped around 30s. Crucially, **never refetch or re-seed screen state while the outbox is non-empty** — this replaces today's "error → refetch → revert" behaviour, which is the exact line of code that ate the tube edits. Refetch happens after the queue drains.

**Field-level LWW falls out for free.** Because `patch` ops carry only changed fields, replaying an offline mobile edit to `status` will not clobber a web edit to `task_name` made in the meantime. Only when both sides touched the *same field* does last-write-wins apply — which is the behaviour we agreed to accept. (A future refinement: an `updated_at` column with a DB trigger, and a `WHERE updated_at <= queued_at` guard, would let older offline edits lose to newer online ones. Not needed for launch; noted in §6.)

---

## 3. Mobile (tacular-mobile)

**Storage.** `expo-sqlite` (or `@react-native-async-storage/async-storage` if you'd rather avoid a native dep — SQLite is the better fit for the outbox because appends and deletes are cheap and atomic). Two stores:

- `snapshot` — the raw results of the last successful fetch (`activeYear`, `projects`, `planner_rows`, prefs), written at the end of every successful `refetch()`.
- `outbox` — ordered op rows: `{seq, type, rowId, payload, queued_at}`.

**New module: `lib/offlineStore.js`** owning both stores, plus **`lib/outbox.js`** owning coalescing and the flush loop. Neither the screens nor `usePlannerData`'s public API change.

**Changes to `usePlannerData`:**

1. On mount, load the snapshot first and render it immediately (with a subtle "offline / last synced at…" indicator when NetInfo says offline), then attempt the network refetch as today.
2. Before applying `refetch()` results, **re-apply any queued ops on top of the fetched rows** so a refetch mid-queue can't visually revert pending edits. (In practice you'll rarely hit this because of rule 3, but it makes the ordering airtight.)
3. `persistTaskPatch` / `persistNewTask` / `persistDelete` / `persistReorder` become thin wrappers: append to outbox → trigger flush. Their catch-refetch blocks move into the flush loop, and only fire for *stale-id* outcomes, not connectivity failures.
4. `writeTaskEvent` calls queue a `task_event` op instead of firing directly.

**Connectivity:** `@react-native-community/netinfo` listener triggers a flush on reconnect; the existing AppState foreground handler stays, but now runs flush-then-refetch instead of bare refetch.

**Realtime while offline** needs no work: the subscription just drops; the post-drain refetch on reconnect covers anything missed, same as the existing backgrounded-app path.

---

## 4. Web (Listical)

Same architecture, web dialect, and it respects the CLAUDE.md rule that components never touch Supabase or localStorage directly — everything lives inside `plannerStorage` (and siblings where relevant).

- **Snapshot:** `readTaskRows` already keeps an in-memory cache; persist that cache to IndexedDB (via a tiny wrapper such as `idb-keyval` — localStorage is too small for a year of rows and blocks the main thread). On load, hydrate from IndexedDB first, render, then revalidate over the network.
- **Outbox:** the diff `saveTaskRows` already computes (`toUpsert` / `toDelete`) *is* the op set — write it to an IndexedDB outbox before attempting the network, and clear it on success. A reload or tab close while offline no longer loses the save. On startup, any leftover outbox flushes before the first fetch.
- **Flush triggers:** `window` `online` event, tab visibilitychange, and after each save when online. Reuse the existing `_pendingTaskRowsSaves` machinery for the in-flight flag.
- **UI:** a small "changes pending — will sync when you're back online" indicator, driven by outbox length. This matters more on web than mobile because users close tabs.
- **Optional, later:** a service worker to cache the app shell so `listical.app` opens with no connection at all. Vite has good PWA tooling (`vite-plugin-pwa`). Without it, offline web only helps a tab that's already open — still worth shipping the outbox first, since that's the data-loss fix.
- The other storage modules (staging, tactics, settings) are lower-stakes and lower-frequency; give them the same treatment in a later pass rather than blocking on them.

---

## 5. App ↔ website sync

The good news: cross-client sync already works when online (Supabase Realtime + refetch on foreground/focus), and this design deliberately changes nothing about it. The outbox sits *below* the existing sync layer — by the time ops reach Supabase they look identical to today's online writes, so Realtime fans them out to the other client exactly as now.

The cases worth spelling out:

- **Mobile offline, web editing.** Web edits land normally. When mobile reconnects it flushes its queue (field-level patches, so disjoint edits merge cleanly), then refetches and picks up everything web did.
- **Same field edited both sides.** Last write to reach the server wins — agreed policy. With the mute-window logic already in `usePlannerData`, both clients converge on the same value after the next Realtime-driven refetch.
- **Row deleted on one side, edited offline on the other.** The patch replay affects 0 rows and is dropped: delete wins, matching the web's existing "never resurrect" rule in the diff save.
- **Reorders crossing an offline window.** The queued `reorder` op renumbers the full sequence on replay (same as `runReorder` today), so the offline device's final ordering wins wholesale — coarse, but consistent, and far better than interleaving two half-orderings.
- **Duplicate insert on retry** is prevented by upsert-on-id, both clients.

One shared-schema nicety to add now because it's cheap: a `client_id` column (or `origin` tag) on writes is *not* needed, but do add **`updated_at` with a `BEFORE UPDATE` trigger** to `planner_rows`. It costs one migration, is invisible to current code, and is the prerequisite for the timestamp guard in §6 if LWW ever feels too blunt.

---

## 6. Build order

**Phase 1 — mobile outbox + snapshot (the tube fix).** `offlineStore`, `outbox`, `usePlannerData` rewiring, NetInfo, offline indicator. This is the highest-value slice and shippable alone. Roughly: schema migration for `updated_at` (optional but do it here), two new lib modules, ~100 lines changed in the hook.

**Phase 2 — web outbox + IndexedDB snapshot.** Persist the existing diff, hydrate-then-revalidate, pending indicator. No component changes thanks to the storage-module rule.

**Phase 3 — polish.** Service worker/PWA shell for web; extend outbox treatment to the staging/tactics storage modules; consider the `updated_at <= queued_at` guard so week-old offline edits can't overwrite fresh ones (with a max-age cutoff on queued ops, e.g. discard ops older than 30 days with a prompt).

**Testing that matters:** airplane-mode edit → kill app → relaunch offline (edits still visible) → reconnect (edits reach web); simultaneous same-field edit both sides (converges); offline delete on one device + offline edit on the other; a long reorder queued offline replaying against a web-modified sequence.
