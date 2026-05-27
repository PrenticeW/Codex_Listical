# CLAUDE.md — Listical

## Project overview

Listical is a 12-week cycle-planning tool. Three pages: **Goal** (`/staging`), **Plan** (`/tactics`), **System** (`/`). Nav labels and URL paths do not match — always use nav names in conversation, paths only when discussing routing.

Pre-launch. Working through `CODE_REVIEW_April2026.md` before public launch.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| Language | JavaScript (primary), TypeScript (some hooks) |
| Routing | React Router |
| Table | TanStack Table (`@tanstack/react-table`) |
| Virtualisation | `@tanstack/react-virtual` via `useVirtualizer` in `ProjectTimePlannerV2.jsx` |
| Auth + profiles | Supabase (auth + `profiles` table active; planning schema exists but unused — see `docs/migration.md`) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Deployment | Vercel |

---

## Architecture rules — do not contradict

### Storage modules — always use them

All planning data lives in localStorage via three named modules:

- `stagingStorage` — Goal page (`src/lib/stagingStorage.js`)
- `tacticsMetricsStorage` — Plan page metrics (`src/lib/tacticsMetricsStorage.js`)
- `plannerStorage` — System page task rows (`src/utils/planner/storage.js`)

**Never call `localStorage` directly in page or component code.** The storage service prefixes keys with `user:{userId}:` when authenticated — bypassing it breaks per-user isolation.

### Cross-page communication — custom events only

Pages communicate via custom browser events. **Do not add direct imports between page components.**

| Event | Fired by | Consumed by |
|---|---|---|
| `staging-state-update` | `stagingStorage.saveStagingState` | TacticsPage, `useProjectsData` |
| `tactics-metrics-state-update` | `tacticsMetricsStorage.saveTacticsMetrics` | No current consumer |
| `tactics-chips-state-update` | `tacticsStorage.saveTacticsChipsState` | `useTacticsChips` |
| `tactics-settings-state-update` | `tacticsStorage.saveTacticsYearSettings` | No current consumer |
| `tactics-send-to-system` | TacticsPage `handleSendToSystem` | `ProjectTimePlannerV2` |
| `yearMetadataStorage` | `yearMetadataStorage.saveYearMetadata` | `YearContext` |

**Year-scoping on events:** Every year-scoped event carries `__eventYear` in `CustomEvent.detail`. Listeners short-circuit if `event.detail.__eventYear` does not match their own `currentYear`. `yearMetadataStorage` is intentionally not tagged. Include `__eventYear` in any new year-scoped cross-page event.

### Storage key scoping

Pattern: `{domain}-year-{N}-{descriptor}`. Authenticated users get an additional `user:{userId}:` prefix via storageService.

All eight tactics settings are year-scoped under `tactics-year-{N}-settings`. The legacy global `tactics-page-settings` key is wiped on module load. Do not reintroduce a global tactics settings blob.

### `projectNickname` as join key — do not extend

`projectNickname` is the current join key between Plan and System. It is fragile — a nickname change silently breaks quota lookups. Do not add any new logic depending on it. The Supabase migration will replace it with `id`.

### Draft year / Plan Next Year flow

See `docs/year-flow.md` for the full spec. Key rule: only one draft year may exist at a time. The **Undo Draft** nav button must be removed before launch (tracked as B4 in code review).

---

## Conventions

- Storage modules: `src/lib/` (staging, tactics) and `src/utils/planner/`  (system)
- Hooks: `src/hooks/staging/` and `src/hooks/planner/`
- Year-scoped keys: `{domain}-year-{N}-{descriptor}`
- No `console.log` in production code
- Always ask for permission before starting systematic debugging

---

## Reference docs

- `docs/migration.md` — Supabase migration status and schema blockers
- `docs/known-issues.md` — bug list, dead code, do-not-touch notes
- `docs/compliance.md` — GDPR, age requirements, RLS rules
- `docs/year-flow.md` — draft year lifecycle and archive flow
