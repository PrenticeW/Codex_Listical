/**
 * notesEditGuard — keeps keystrokes meant for the task panel's notes editor
 * away from the System grid's window-level keyboard handlers.
 *
 * The grid's keydown/paste handlers normally skip events while focus is in
 * an input/textarea. That guard has a hole: if the notes textarea unmounts
 * mid-input (e.g. the 2026-10-14 bug where typing a URL flipped the notes
 * box to its read-only link view), focus falls to <body> and the very next
 * keystrokes reach the grid — type-to-edit then typed the rest of the URL
 * into the still-selected TASK cell, and a stray Backspace could clear
 * cells or delete rows.
 *
 * The notes editor marks itself on focus and every keystroke; the grid
 * handlers ask isNotesEditGuardActive() before acting on a key that would
 * edit the grid. The guard stays up while marked, plus a short grace window
 * after the editor goes away, and is dropped immediately by an explicit
 * clear (editor blur) or by any pointerdown (clicking is an intentional
 * refocus, so grid editing must work right away).
 *
 * Deliberately NOT tied to "panel open": users edit the grid freely while
 * the side panel is open — only in-flight notes typing is shielded.
 */

const GRACE_MS = 400;

let marked = false;
let lastMarkAt = 0;

export const markNotesEditing = () => {
  marked = true;
  lastMarkAt = Date.now();
};

export const clearNotesEditing = () => {
  marked = false;
  lastMarkAt = 0;
};

export const isNotesEditGuardActive = () =>
  marked || (Date.now() - lastMarkAt) < GRACE_MS;

// Any pointerdown anywhere is an intentional refocus — drop the guard so a
// click into the grid (or anywhere else) restores normal keyboard behaviour
// even if the editor unmounted without firing blur. Capture phase so this
// runs before the click's own handlers.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', clearNotesEditing, true);
}
