# Onboarding plan

Status: in design. The wizard UI for the **Week stage**, the **Wheel stage**, and part of the **Sort stage** is already built (not yet on this branch as of 2026-10-07).

---

## Questioning — schedule section (settled 2026-10-07)

### Core decision: no tutorial

The wizard builds the entire base schedule from the user's answers; the user only corrects. Rule: **the wizard owns placement and duplication, the user owns correction.** Nothing in this section is tutorialised — no steps, no sequence, no "do this now". The deliverable is a complete, honest base schedule, not gesture training.

### Wizard shell

Overlay panel with the Plan page live behind it. Chips materialise as answers are given — the feedback loop is the page itself, and a misplaced chip is noticed while the question is still on screen. Placement should land chips in the visible region (or scroll/shift the grid); a chip materialising behind the panel is magic nobody sees. Precedent for content-yields-to-panel layout: `useStagingTableWidth`.

### The questions (three screens + a gap pass)

1. **Sleep** — wake time / bed time → sleep chip placed. Also feeds the Your Schedule settings (`startMinute` / `startHour`).
2. **Standing commitments** — repeatable input rows: name + days + rough times. Work, school, training, caring etc. all come out of one question with no presumed life shape. Wizard places AND duplicates across the ticked days. Rough times are fine by design — correction is the user's job.
3. **Weekly must-dos** — things done every week with no fixed time → populate the **tray**, not the grid. Populating the tray with their own items teaches the tray concept wordlessly, and leaves self-assigned homework that pulls them back for the fill-out session.
4. **Gap pass** (not a screen) — after placement, up to **3** calendar-driven questions, biggest gaps first, each pointing at visible evidence on the live page:
   - work chip with no commute → "How do you get to work?" → commute placed both sides, all work days
   - wake-to-first-commitment gap → "You're up at 7 and start at 9 — what happens in between?" (breakfast, getting ready)
   - evening gap before bed → dinner / wind-down
   Rules: hard cap of 3; no question the calendar can't justify; skip questions whose trigger doesn't exist. This replaces a dedicated "interstitials" screen — the taxonomy is ours, not the user's. Anything the pass misses, the free-hours readout catches.

### Scaffolding instead of teaching

- **Closing line** on wizard dismiss: "Drag chips to move them, drag their edges to resize." One sentence, not a step.
- **Visible resize handles** on hover/selection — now load-bearing, since nothing else teaches resize. Affordance beats instruction.
- **Delete toast**: "Chip removed · Undo". The Plan page command stack (`useCommandPattern`) already supports undo; verify delete goes through `executeCommand` so the toast can call `undo()`. The toast removes undo, remove, and panic-copy-paste from the teaching list entirely.
- **Free-hours readout** ("You have ~61 free hours this week"), live-updating during the wizard. The honesty backstop: an absurd number prompts "oh — I haven't put meals in". Teaches time-is-finite without words, and keeps auditing forever. Protects the core promise — a plan built on 2–3 phantom hours/day fails in week 2 and the user blames the method.

### Must-know at end of wizard

**Resize and move.** That's the whole list — one concept (chips are physical), two variants of a drag. Everything else:

| Interaction | When it's introduced |
|---|---|
| Tap-to-edit (rename, recolour) | Self-discovered — users tap chips unprompted; editor fields are self-evident |
| Add chip | Opening beat of the fill-out session ("add your first [goal] session") |
| Copy / paste / duplicate | Fill-out session, motivated by creation (wizard did all day-one duplication) |
| Remove | First mistake, via the toast |
| Display toggles (duration/clock), colour mixer | Never taught — power-user discovery |
| Custom projects, metrics | Fill-out session, when chips exist in volume |
| **Send to System** | Only after all goals are done — never in this section |
| **Week start day** | NOT asked in wizard — user can't know until they can see a schedule. Ask once the week is visible: "now that you can see your week, when will you sit down to plan it?" Framed as planning ritual, not calendar preference. Handler exists (`handleStartDayChange`). |

### Settings decisions (Your Schedule / GearPanel)

- Wizard covers wake/bed. Time format: infer from locale or default, don't ask (settings pointer suffices).
- **Time increment: remove the toggle from the UI, default 30 min, keep the feature.** Soft removal — note if pilot users had touched the setting.
- Theme colour and page zoom: not in the wizard; point to settings at the end.

### Future layers — build on hunches, let SEEDS decide

- **Behavioural hints** (no AI): stuck selection (chip selected, no action for seconds), repeated ineffective clicks/drags, editor opened-and-closed unchanged → one-shot tooltip "drag edges to resize, drag to move", then never again. Implement only if the pilot shows people stall.
- **"Just ask" AMA**: strong safety net, poor sole mechanism (users with unknown-unknowns don't know what to ask). Requires either way: an authoritative help corpus (~25–40 task files — doubles as the help page), app-state context passed per question, `data-tutorial-id` anchors + a highlight primitive for pointing at drag gestures, and a server-side key via an Edge Function with rate limits. Stepping stone: ship the corpus as searchable help first; conversational layer later. Triggers and AMA are complementary: predicted vs unpredicted confusion.
- **SEEDS observation questions** (free usability data, decide what to watch): Do people resize/move unprompted? Does anyone find the tray without being told? Where do they stall? What do they ask for help with (feeds the corpus)? Did anyone miss commute/meals despite the gap pass (tests the free-hours backstop)?

### Open items

- Goal page wizard questions — not yet designed.
- Fill-out session design (add, duplicate, projects, metrics, send to System) — second channel is just-in-time coach marks, never a second tour.
- Wizard copy for the three screens and gap-pass questions.
- Gap-pass trigger detection rules (what counts as "a gap worth asking about").
- Verify delete path goes through the command stack for the toast.
