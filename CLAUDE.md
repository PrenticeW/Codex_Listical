# CLAUDE.md — Listical

## Project overview

Listical is a 12-week cycle-planning tool. Three pages: **Goal** (`/staging`), **Plan** (`/tactics`), **System** (`/`). Nav labels and URL paths do not match — always use nav names in conversation, paths only when discussing routing.

Pre-launch. See `docs/known-issues.md` for the current bug list and launch checklist.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| Language | JavaScript (primary), TypeScript (some hooks) |
| Routing | React Router |
| Table | TanStack Table (`@tanstack/react-table`) |
| Virtualisation | `@tanstack/react-virtual` via `useVirtualizer` in `ProjectTimePlannerV2.jsx` |
| Auth + profiles | Supabase (auth, `profiles`, and all planning tables active) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Deployment | Vercel |

---

## Architecture rules — do not contradict

### Storage modules — always use them

All planning data is stored in Supabase via four named modules:

- `stagingStorage` — Goal page (`src/lib/stagingStorage.js`)
- `tacticsStorage` — Plan page chips and settings (`src/lib/tacticsStorage.js`)
- `tacticsMetricsStorage` — Plan page metrics (`src/lib/tacticsMetricsStorage.js`)
- `plannerStorage` — System page task rows (`src/utils/planner/storage.js`)

**Never call Supabase or `localStorage` directly in page or component code.** Always go through these modules.

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

### Year scoping

All data is scoped by `yearNumber` — every storage module function takes it as a parameter and uses it to scope Supabase queries. Never read or write planning data without a yearNumber. Do not reintroduce a global tactics settings blob; all eight tactics settings are year-scoped.

### `projectNickname` as join key — do not extend

The Plan–System join now uses `projectId` (`project_id` column) — fixed June 2026. `projectNickname` remains only as a fallback for legacy rows in `ProjectRow.jsx`. Do not add any new logic depending on nicknames — see `docs/known-issues.md`.

### Draft year / Plan Next Year flow

See `docs/year-flow.md` for the full spec. Key rule: only one draft year may exist at a time.

---

## Conventions

- Storage modules: `src/lib/` (staging, tactics) and `src/utils/planner/`  (system)
- Hooks: `src/hooks/staging/` and `src/hooks/planner/`
- Year-scoped keys: `{domain}-year-{N}-{descriptor}`
- No `console.log` in production code
- Always ask for permission before starting systematic debugging

---

## Reference docs

- `docs/known-issues.md` — bug list, dead code, do-not-touch notes
- `docs/compliance.md` — GDPR, age requirements, RLS rules
- `docs/year-flow.md` — draft year lifecycle and archive flow
