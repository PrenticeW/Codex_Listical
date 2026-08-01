# Listical — Data Retention Schedule and Breach Response Plan (Internal)

Internal document. Not published to users. Review annually or after any material change to the stack.

Owner: Prentice Whitlow, Studio PDW Ltd
Last reviewed: 1 August 2026

---

## Part 1 — Data retention schedule

| Data | Where | Retention | Deletion trigger |
|---|---|---|---|
| Account data (email, hashed password, DOB) | Supabase `auth.users`, `public.profiles` | Life of account | Account deletion (user initiated in web or iOS app, or email request) |
| Planning data (goals, plans, tasks, notes, settings, theme) | Supabase planning tables | Life of account | Account deletion. The deletion routine must cover every table carrying a `user_id` FK. Re-audit the routine whenever a migration adds a table. |
| Deletion audit record | `public.deletion_audit_log` | 12 months after completion | Scheduled cleanup. Record must contain no planning content, only user id, timestamps and status. |
| Encrypted database backups | Supabase managed backups | 7 day rolling window (currently 0 days on the Supabase free plan; 7 days once on Pro) | Automatic. Deleted user data persists in backups until the window rolls over; this is documented in the privacy policy. Backups are never restored selectively to resurrect deleted accounts. |
| Transactional email logs | Brevo | Per Brevo retention settings, target minimum available | Configure Brevo to the shortest log retention offered. |
| Hosting/request logs | Vercel, Supabase | Provider default short term logs | Automatic. No custom log pipeline; do not add one that captures personal data without updating this schedule. |
| Support emails | hello@tacular.app mailbox | 24 months | Manual annual cleanup. |

**Inactive accounts:** is to delete accounts inactive for 3 years, after two warning emails. Not yet implemented; decide before or shortly after launch.

**Rule of thumb:** if a new feature wants to store new personal data, it must be added to this table, be attributable to a `user_id`, be covered by the deletion routine, and have RLS before production.

---

## Part 2 — Personal data breach response plan

A personal data breach is any accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to user data. Examples: leaked Supabase service key, RLS misconfiguration exposing another user's rows, compromised admin account, Brevo account takeover, laptop theft with credentials.

### Step 1 — Contain (immediately)

- Rotate the affected credentials (Supabase service and anon keys, Vercel tokens, Brevo API keys).
- If RLS or a query bug is exposing data, take the affected surface offline (disable route, pause deploy) rather than leaving it up while fixing.
- Preserve evidence: export relevant logs before they roll over.

### Step 2 — Assess (within 24 hours)

Record in writing: what happened, when, what data categories were affected (email, DOB, planning content), how many users, whether data was actually accessed or only exposed, and what containment was done. Keep this record even if the conclusion is "no risk"; Article 33(5) requires documenting all breaches, including ones not reported.

### Step 3 — Notify the ICO (within 72 hours of becoming aware)

Required unless the breach is unlikely to result in a risk to individuals. When in doubt, report. Report via the ICO website (ico.org.uk, "Report a breach"). The clock starts at awareness, not at full understanding; a partial initial report followed by updates is acceptable.

If EU residents are affected on a large scale, consider whether an EU supervisory authority also needs notifying.

### Step 4 — Notify affected users (without undue delay)

Required if the breach is likely to result in a high risk to them (e.g. exposed passwords or personal planning content). Email them in plain language: what happened, what data was involved, what we have done, what they should do (e.g. change password), and a contact address.

### Step 5 — Review

After closing the incident, write a short post mortem: root cause, fix, and any changes to this plan or the codebase rules (CLAUDE.md, compliance.md).

### Contacts

- Responsible person: Prentice Whitlow, hello@tacular.app
- ICO breach reporting: ico.org.uk / 0303 123 1113
- Supabase support, Vercel support, Brevo support: via respective dashboards
