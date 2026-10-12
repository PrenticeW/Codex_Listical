# AI Weekly Review — lessons from feature test #1 (2026-10-03)

First live run of an AI-led weekly review, conducted in Claude against production data
(decrypted via the master key, per the "AI wizard" path in docs/encryption-plan.md).
Prentice will re-run weekly to find where the value is. These notes are the design input.

## Review shape (v1)

1. **Question time** — the review OPENS with questions, generated from the data,
   never a wall: one or two at a time, holding a queue and steering back. Every
   assumption becomes a question ("no activity on Y — what happened?" never
   "you deprioritised Y").
2. **Goal check-in** — explicit step, questions not assumptions. Updates carry to
   standing context so week N+1 remembers week N ("deliberately ignoring X" stops
   being flagged).
3. **Mirror** — short factual week record, AS A LIST (dense prose recaps cause
   zone-out). Built ONLY from the archived week.
4. **Consent gate** — ask before offering trends-against-goals interpretation.
   Never reprimand about ignored goals; priorities legitimately change.
5. **Next week** — the payload. Suggestions must be NET-NEW information, never a
   recital of what the user already planned. First ask "where do you want progress
   you're not seeing?" (unless they already said). Write-back of tasks to inbox:
   parked for later.

## Hard data rules

- **The archive is the source of truth for "this week".** Live planner_rows carry
  whole-cycle state; building the mirror from them misattributed a weeks-old
  completion ("you moved house this week!"). Use the archive group
  (`parentGroupId: archived-<PROJECT>-group-<ts>-…`) + day_entries.__cells columns.
- **task_events counts measure when the user touched the app, not when work
  happened.** Archiving day batches and fresh features inflate counts. Low-trust
  evidence only.
- **Know where the user is in their cycle before asking anything.** Week runs
  Sat→Fri here; archive + new-week plan happen Saturday. Review runs post-archive.
  Check the latest archived_at: if the user hasn't archived yet, the review's
  framing must flip to pre-archive mode.
- Day column mapping: day_entries.__cells index 0 = cycle start date; archive label
  carries the human range. Time values are H.MM strings.

## Conversation rules

- One or two questions per turn; hold the rest.
- Short questions; never list the user's own tasks back ("Tacular had a visible
  push" suffices).
- Lists for recap-type content; prose for conversation.
- Long or feeling-heavy answers = signal to slow down and dig in, not summarise.
  Objective of digging: turn the feeling into something the plan can respond to
  (a decision, a constraint, or an explicit "not yet").
- Distinguish context-for-the-AI from genuinely-new-to-the-user information. The
  user's own schedule is never advice.
- Internal mechanics (cycle numbers, start dates) are context, not conversation.
- Open question: when exactly to probe deeper (emotion detection was floated,
  undecided).

## Semantics that must inform any AI feature

- Status vocabulary: Accounted = done, no time logged (bundled under a parent
  task); Done = done with time; Abandoned = didn't do / no longer needed — NEUTRAL,
  not failure; On Hold = "absolutely not this coming week".
- Two planning horizons: weekly + 3-month cycle. Big new wants route to the next
  cycle; current-cycle only if already in motion. The review should route captured
  items accordingly.

## Feature ideas captured

- **"Hold this for later" capture**: things said in review that can't be actioned
  now but should resurface at next cycle planning.
- **Wheel of Life in the 3-month wizard**: makes goal importance visible at a
  glance, so the weekly review doesn't need rounds of care-level questions.
- **Archive side-panel week summary**: short factual summary + emotional state
  note per archived week (see next-week test).
- For users who struggle to plan/prioritise: the push is a question, not a plan
  ("what's the one thing that would make this week feel OK?"); anchor nudges in
  their own data; Abandoned-as-neutral is the guilt-relief feature; cadence does
  the pushing (short recurring ritual ending in a small spoken commitment); keep
  the weekly touch to ~2 questions for this user type — front-load care-mapping
  into the cycle wizard.

## Infra notes from the session

- Review-over-raw-SQL requires the decryption layer (worked: unwrap DEK from
  user_keys with master key, AES-256-GCM per crypto.js format). A product version
  needs a proper server-side review endpoint, not dashboard SQL.
- RLS was enabled on 4 exposed rescue/backup tables (2026-10-03).
- Open data question: most projects' plan tables appear empty — never planned vs
  data loss. Check against this week's backups before the next cycle planning.

## Archive side-panel summary (added after mock iterations, same session)

Two sections per archived week, written at review time (needs one writable field
on the archive row):

- **The week in short** — interpretation, with hard rules:
  - Every sentence traces to the user's own words from the review or to
    arithmetic. Nothing the AI "reckons". Test per line: the user can point to
    where it came from.
  - Lead with the user's stated framing ("you called X your main focus") and let
    the data confirm or contradict it.
  - Closed, past-tense record: must still read as true a year later. No
    present-state phrasing ("so that's now open"). Forward-looking content
    belongs in the new week's plan.
  - Value comes from what the user can't see at a glance: priority-vs-time
    agreement, what the week closed that earlier weeks left open, trend against
    their own baseline once several summaries exist.
  - Plain recall of visible data is worthless to the user ("three gym sessions").
- **How you were** — the user's own reflection distilled, incl. one direct quote.
  Only exists if a review happened; never sentiment-inferred from task data.
- Banned phrasing: the "it's not X, it's Y" construction, anywhere in review output.
- Also surface tasks long undone, weighted by project importance (Wheel of Life
  data will drive the weighting).
- Possible extras: one number that mattered, carried-forward list, parked list,
  and "the commitment" (what the user said next week is about, so the next review
  opens by closing that loop).

## Closing format and accountability loop (final rules, same session)

- The review ends like a business call: a numbered list of actionable to-dos.
- Separate lists for the user's actions and the AI's actions (the AI offers to
  take on tasks it can do itself — possible future feature: AI-executable
  review to-dos).
- Every user task starts with a verb, one action per line, never grouped, and
  written in the USER's vocabulary (no AI-words like "capture" — a task in
  unfamiliar language is a task left misunderstood).
- Every review checks on the previous week's agreed actions before anything else
  is suggested.
- Quota overshoot is celebrated, not flagged; note consistent overshoots for the
  next cycle planning as quota bump candidates.
- A gap in the plan is not a gap in the day: join custom chips (WORK, COMMUTE
  etc.) before reasoning about free time, and ask about the calendar where the
  plan can't see.

## Review #2 lessons (2026-10-10)

- **The mirror step is DEAD.** A factual recap of the week is useless to the user
  ("I was just there"). Data reading happens silently and fuels the questions;
  only computed, non-obvious findings get said aloud (quota-vs-actual, trends
  across weeks, priority-vs-time disagreement, anomalies), and they live in the
  summary. Shape is now: silent data read → questions → gaps/accountability →
  wrap (summary + agreed actions).
- **Quotas are floors, not ceilings.** They are a guide and a bare minimum;
  overshoot never needs discussion. Only under-minimum with no stated reason is
  worth raising.
- **Read the live planner and inbox as well as the archive** before question
  time. Statuses like Blocked only exist in live rows (caught: schedule rewrite
  blocked on the alternate-schedules feature).
- **A project with an empty plan table is still a goal.** The project itself is
  the goal; Reasons/Outcomes detail is optional depth.
- **Suggestions target the week being planned right now.** Cycle-scale
  restructuring ideas (e.g. "make job hunting its own project") are parked for
  cycle end, not raised off one week of data.
- **Strictly one question per turn.**
- **Check the previous week's agreed actions first** — worked well as the opener
  (scorecard format, one line per action).
- Claude-executed follow-ups (scheduled reminders; later, direct task
  write-back with notes context + AI-authored task history) confirmed feasible;
  user not ready to turn them on yet.
- Data note: plan tables that look empty are not data loss — content (or the
  empty template) lives in plan_table_entries_enc; the jsonb column only holds
  the placeholder after the encryption flip.
