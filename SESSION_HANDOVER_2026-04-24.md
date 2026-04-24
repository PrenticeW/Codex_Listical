# Handover prompt for next session

Copy everything between the fences below into the first message of a new Claude session. It is self contained and assumes zero memory of the previous session.

---

```
I'm continuing pre-launch work on Codex Listical, a 12-week cycle-planning React + Supabase app hosted on Vercel. First clients will be UK and European dance conservatoire students, so GDPR-K is the operative compliance framework.

Before doing anything else, please read:

1. `CLAUDE.md` — project overview, architecture rules, compliance requirements, dead-code list. Follow its instructions exactly; they override defaults.
2. `CODE_REVIEW_April2026.md` — the risk-ranked bug list we've been working through. Pay special attention to the **Progress log** near the top, which shows current status of every finding.
3. `supabase/migrations/20260425000001_bump_age_requirement_to_16.sql` — the age-floor migration applied this week, so you have context on the GDPR-K enforcement that is already live.

State at handover:

- **Done this pass:** B1 (localStorage cleared on account deletion), B2 (raw localStorage bypasses routed through storageService), H1 (projectWeeklyQuotas keyed by id), H5 (Send to System preserves user edits), B3 schema and client changes.
- **B3 remaining:** one end-to-end smoke test of signup → "Check your inbox" card → email confirmation link → authenticated redirect. This is blocked on Supabase's built-in SMTP rate limit (HTTP 429 "email rate limit exceeded"). The real unblock is switching to a custom SMTP provider (Resend, Postmark, or SendGrid) under Auth → Emails → SMTP Settings in the Supabase dashboard. This is a launch prerequisite and now tracked in the code review as a NEW finding.
- **B4 (dev-only Undo Draft / Revert Archive):** intentionally deferred; I still need these buttons for manual testing of the Plan Next Year flow. Do not remove them yet.
- **Next candidate:** H3 (cross-year event collisions). Events like `staging-state-update` carry no yearNumber in their detail, so listeners on a different year can act on stale data.

What I'd like to do next, in priority order:

1. **H3: cross-year event collisions.** Propose a plan first, then implement once I approve. Fix direction from the review: include `yearNumber` in the event `detail` and have each listener compare against its own `currentYear` before acting. Sites to audit: `src/lib/stagingStorage.js` (line ~125), `src/lib/tacticsMetricsStorage.js` (line ~38), and any listener for `staging-state-update`, `tactics-metrics-state-update`, `tactics-send-to-system`, or `yearMetadataStorage`.
2. **Custom SMTP setup.** Walk me through configuring a provider in the Supabase dashboard (I'm leaning toward Resend for EU deliverability, but open to Postmark). Once configured, we finish the B3 smoke test.
3. Then tackle the remaining mediums (M1–M5) and polish items (P1–P5) in a batch.

Working style I want you to follow:

- Ask for permission before starting systematic debugging.
- Never introduce raw `localStorage` calls or `console.log` statements to production code. Use the storage modules.
- When proposing a fix, show me the plan first with file paths and line numbers. Don't just start editing.
- Personal preference: never use dashes (em-dash or hyphen-as-clause-break) in any copy you suggest for emails, UI strings, or external correspondence. Internal docs are fine.

Start by reading the three files above and then give me a short plan for H3. Under 200 words.
```

---

## What the next session needs to know that isn't captured above

Nothing urgent beyond what's in the prompt. Two soft notes if they come up:

- The "Check your inbox" card fix in `AuthContext.jsx` has been tested cosmetically but not yet confirmed end to end because of the Supabase rate limit. If the next session can get custom SMTP live, that verification can happen in minutes.
- The progress log in the code review is the single source of truth for bug status. Update it inline as work lands rather than scattering notes elsewhere.
