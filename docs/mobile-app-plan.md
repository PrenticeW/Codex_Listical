# Listical Mobile App — Plan and Requirements

## Repository

Separate repo from the main Listical web app. Expo/React Native project with its own
`package.json`, `app.json`, and EAS Build config. Shares only the Supabase project
(same database, same auth).

---

## Scope (v1)

iOS only, to start.

Three screens:
- Login
- Task list (grouped by project, filterable by status)
- Task detail panel (collapsible overlay on the task list)

Task operations in scope:
- View all tasks for the active year
- Create a task
- Edit a task (name, status, notes, project, day columns)
- Day column scheduling — read and write `day_entries.__cells` in `planner_rows`

Out of scope for v1:
- Goal page and Plan page
- Archive week
- Year management / draft year flow
- Tactics metrics / daily bounds

---

## Architecture

**Auth:** Supabase email/password. Token stored via `expo-secure-store` (required on
React Native — no browser session storage).

**Data:** Direct Supabase calls against the same production tables as the web app.
No shared storage modules from the web codebase — write clean targeted calls
(`INSERT`, `UPDATE`, `DELETE` on individual rows) rather than the web app's
replace-the-layer pattern.

**Sync:** Supabase Realtime subscription on `planner_rows` filtered by `user_id`
and `year_id`. Required because the web app is often open simultaneously.
Note: the web app also needs a Realtime subscription added (tracked separately
in `docs/known-issues.md`) so web picks up mobile changes without a manual refresh.

**Caching:** No localStorage. Use React state and optionally
`@react-native-async-storage/async-storage` for warm cache on app reopen. No
`storageCache.js` from the web project.

---

## App Store Requirements

### Before first submission

| Item | Detail | Status |
|---|---|---|
| Apple Developer Program | $99/yr, paid in USD | Not started |
| Privacy policy | Must be a live hosted URL. Must cover GDPR: lawful basis, data subject rights (access, deletion, portability), retention. A generic US-style policy is insufficient for UK/EU. | Not started |
| Account deletion in-app | Apple hard requirement. Must fully purge user data from Supabase (all planning tables, not just the auth record). The web app has a delete account flow — verify it does a full data purge, then replicate on mobile. | Verify web flow first |
| App Privacy labels | Fill out in App Store Connect: email address (auth), user-generated content (tasks/notes), user ID. Must be accurate. | Not started |
| Privacy manifest file | `PrivacyInfo.xcprivacy` declaring privacy-sensitive API usage. Expo can generate this but needs configuration. | Not started |
| App screenshots | Multiple device sizes required for App Store listing. | Not started |
| App description and metadata | Category: Productivity. | Not started |

### Rules that do not apply (yet)

| Rule | Why it doesn't apply |
|---|---|
| Sign in with Apple | Only required if offering third-party OAuth (Google, Facebook, etc.). Email/password only is exempt. Adding Google login later would trigger this. |
| In-app purchase rules / 30% cut | No paid features or digital subscriptions planned for v1. |
| VAT handling | Apple handles VAT collection for UK/EU sales if monetisation is added later. |

### UK/EU specifics

These are global App Store requirements with extra obligations for UK/EU developers:

- GDPR applies. Privacy policy must be substantively compliant, not just present.
- Right to erasure (GDPR) reinforces Apple's account deletion requirement — deletion
  must actually remove data, not just deactivate the account.
- Apple's review process and the $99 fee are identical for UK developers.

---

## Known Constraints

| Item | Detail |
|---|---|
| Replace-the-layer save conflict | The web app saves `planner_rows` via delete-all then re-insert. If web saves while mobile is live, mobile changes written between syncs could be overwritten. Mitigated by adding Realtime to the web app. For v1, true simultaneous editing on both devices is unsupported. |
| Day columns on small screens | 84 day columns need a mobile-appropriate UI. Likely a horizontally scrollable strip showing the current week, or a week-at-a-time paged view. UI design pass needed before building this screen. |
| `projectNickname` join key | Known fragile join in the web app (nickname change silently breaks quota lookups). Do not build any mobile logic that depends on `projectNickname` — use `projectId` (`project_id` DB column) only. |
