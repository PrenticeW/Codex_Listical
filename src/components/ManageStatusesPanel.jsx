/**
 * ManageStatusesPanel — edit the status chips used on task rows.
 * Design: design_handoff_manage_statuses/ (adapted: the chip editor opens via
 * the codebase's standard slide-within-tray pattern — GoalPanel ColourView,
 * SystemPanel task detail — rather than a second side-by-side PanelShell).
 * Spec: docs/STATUS_MANAGER_SPEC.md.
 *
 * Rendered by SystemPanel above itself (zIndex 99995). Back returns to the
 * System panel. Deleting a status shows the reassignment dialog; on confirm
 * live rows are reassigned via SYSTEM_PANEL_ACTION_EVENT ('reassignStatus')
 * and the status is soft-deleted (archived weeks keep the old chip).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { GripVertical, Pencil, Trash2, Lock, Plus, ChevronDown } from 'lucide-react';
import ChipEditorView from './ChipEditorView';
import PanelLockButton from './PanelLockButton';
import { useStatuses } from '../hooks/useStatuses';
import {
  createStatus,
  updateStatus,
  softDeleteStatus,
  reorderStatuses,
  getStatusColors,
} from '../lib/statusesStorage';

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace";
const C = {
  border: '#e8e8e4', separator: '#EFEDE6', textDim: '#616161',
  textFaint: '#9E9E9E', grip: '#C7C7C7', danger: '#DD2C2C',
};

const CARD = {
  background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`,
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
  margin: '0 11px', padding: 14,
};

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '6px 11px', cursor: 'pointer', fontFamily: FONT,
        fontSize: 12.5, fontWeight: 500, color: 'var(--brand-deep)',
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M5.5 1.5L2.5 4.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  );
}


/**
 * Styled hover tooltip (same pattern as staging/TableRow.jsx, inline-styled to
 * match the design handoff: #1F1F1F bubble, white 10.5px/500, radius 6).
 * align='center' centres under the child; 'right' right-aligns so the bubble
 * never clips outside the panel edge.
 */
function Tip({ text, align = 'center', children }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', top: '100%', marginTop: 4, zIndex: 10,
            ...(align === 'right' ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
            background: '#1F1F1F', color: '#fff', borderRadius: 6,
            padding: '4px 8px', fontFamily: FONT, fontSize: 10.5, fontWeight: 500,
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function Tog({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', padding: 0,
        background: on ? 'var(--brand-deep)' : '#D9D5E2', cursor: 'pointer',
        position: 'relative', transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3,
        width: 14, height: 14, borderRadius: 7, background: '#fff',
        transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function Chip({ status }) {
  const colors = getStatusColors(status.id);
  return (
    <span style={{
      width: 104, flexShrink: 0, textAlign: 'center', boxSizing: 'border-box',
      background: colors.bg, color: colors.text, borderRadius: 5,
      padding: '3px 10px', fontFamily: FONT, fontSize: 11, fontWeight: 500,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {status.label}
    </span>
  );
}

function IconBtn({ title, danger, onClick, children, active }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 26, height: 26, borderRadius: 6, border: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
        background: hov || active
          ? (danger ? 'rgba(221,44,44,0.08)' : 'rgba(43,89,182,0.08)')
          : 'transparent',
        color: hov || active
          ? (danger ? C.danger : 'var(--brand-deep)')
          : C.textFaint,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function DeleteDialog({ status, statuses, onCancel, onConfirm }) {
  const fallback = statuses.find((s) => s.id === 'Not Scheduled') || statuses[0];
  const [replacementId, setReplacementId] = useState(fallback?.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const options = statuses.filter((s) => s.id !== status.id);
  const replacement = options.find((s) => s.id === replacementId) || options[0];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5,
      background: 'rgba(31,31,31,0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 262, background: '#fff', borderRadius: 12,
        border: `1px solid ${C.border}`, padding: 18, textAlign: 'center',
        boxShadow: '0 16px 40px rgba(31,31,31,0.22)', fontFamily: FONT,
      }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 8, color: '#1F1F1F' }}>
          Delete status?
        </div>
        <div style={{ fontSize: 12.5, color: '#383838', marginBottom: 12, lineHeight: 1.5 }}>
          Tasks using <Chip status={status} /> will be reassigned.
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
          textTransform: 'uppercase', color: C.textFaint, marginBottom: 5,
        }}>
          Reassign to
        </div>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 10 }}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              width: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, background: '#FCFBF8', border: '1px solid #e0ded6', borderRadius: 6,
              padding: '5px 8px', cursor: 'pointer',
            }}
          >
            {replacement && <Chip status={replacement} />}
            <ChevronDown size={12} style={{ color: 'var(--brand-deep)', flexShrink: 0 }} />
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 6,
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: 4, marginTop: 2,
              maxHeight: 180, overflowY: 'auto',
            }}>
              {options.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setReplacementId(s.id); setPickerOpen(false); }}
                  style={{
                    padding: '3px 4px', borderRadius: 5, cursor: 'pointer',
                    display: 'flex', justifyContent: 'center',
                  }}
                >
                  <Chip status={s} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14 }}>
          Archived weeks keep the old status unchanged.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              background: '#fff', border: '1px solid #e0ded6', borderRadius: 6,
              padding: '7px 14px', fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              color: '#383838', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => replacement && onConfirm(replacement.id)}
            style={{
              background: C.danger, border: `1px solid ${C.danger}`, borderRadius: 6,
              padding: '7px 14px', fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              color: '#fff', cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Content-only: rendered INSIDE SystemPanel's PanelShell (in the detail pane
 * of its slide track), so it inherits the shared panel's drag-resize and
 * content scaling. isOpen resets sub-views when the pane slides away.
 */
export default function ManageStatusesContent({ isOpen, onBack }) {
  const statuses = useStatuses();
  // editor: { mode: 'edit'|'add', status? } | null
  const [editor, setEditor] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // status object
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Reset sub-views when the panel closes
  useEffect(() => {
    if (!isOpen) { setEditor(null); setDeleteConfirm(null); }
  }, [isOpen]);

  // Escape: dialog → editor → close panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (deleteConfirm) setDeleteConfirm(null);
      else if (editor) setEditor(null);
      else onBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, editor, deleteConfirm, onBack]);

  const chipEditorPayload = useMemo(() => {
    if (!editor) return null;
    if (editor.mode === 'edit') {
      return { kind: 'status', id: editor.status.id, name: editor.status.label, colour: editor.status.bg };
    }
    return { kind: 'status', id: null, name: '', colour: '#8a7fd6', isNew: true };
  }, [editor]);

  const handleEditorConfirm = async ({ id, name, colour }) => {
    const trimmed = (name || '').trim();
    if (id) {
      await updateStatus(id, { label: trimmed || undefined, bg: colour });
    } else if (trimmed) {
      await createStatus({ label: trimmed, bg: colour });
    }
    setEditor(null);
  };

  const handleDeleteConfirm = async (replacementId) => {
    const fromId = deleteConfirm.id;
    // Reassign live rows first (sweeps status + multiStatus-<n> keys in the
    // planner), then soft-delete so archives keep rendering the old chip.
    // Literal event name (= SYSTEM_PANEL_ACTION_EVENT in SystemPanel.jsx)
    // to avoid a SystemPanel <-> ManageStatusesPanel import cycle.
    window.dispatchEvent(new CustomEvent('system-panel-action', {
      detail: { action: 'reassignStatus', fromId, toId: replacementId },
    }));
    await softDeleteStatus(fromId);
    setDeleteConfirm(null);
  };

  const handleDrop = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const ids = statuses.map((s) => s.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(dragOverId);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      reorderStatuses(ids);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const showEditor = Boolean(editor);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', width: '200%', height: '100%',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          transform: showEditor ? 'translateX(-50%)' : 'translateX(0)',
        }}>
          {/* ── List pane ── */}
          <div style={{ width: '50%', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ padding: '13px 14px 9px', display: 'flex', alignItems: 'center' }}>
              <BackBtn onClick={onBack} />
              <PanelLockButton style={{ marginLeft: 'auto' }} />
            </div>
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
              <div style={CARD}>
                <div style={{
                  fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
                  textTransform: 'uppercase', color: 'var(--brand-ink)',
                  borderBottom: '1px solid rgba(90,132,216,0.18)', paddingBottom: 3, marginBottom: 6,
                }}>
                  Statuses
                </div>

                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 6px 4px' }}>
                  <span style={{ width: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.textFaint }}>Status</span>
                  <span style={{ width: 64, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <Tip text="Status included when Archive Week is pressed" align="right">
                      <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.textFaint, cursor: 'help' }}>
                        Archive
                      </span>
                    </Tip>
                  </span>
                  <span style={{ width: 56, flexShrink: 0 }} />
                </div>

                {/* Rows */}
                {statuses.map((s, i) => (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={() => setDragId(s.id)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverId(s.id); }}
                    onDrop={handleDrop}
                    onDragEnd={handleDrop}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 6px 7px 4px', borderRadius: 8,
                      borderTop: i === 0 ? 'none' : `1px solid ${C.separator}`,
                      background:
                        dragOverId === s.id && dragId !== s.id ? 'rgba(43,89,182,0.08)'
                        : editor?.status?.id === s.id ? 'rgba(43,89,182,0.06)'
                        : 'transparent',
                      opacity: dragId === s.id ? 0.5 : 1,
                    }}
                  >
                    <GripVertical size={13} style={{ color: C.grip, cursor: 'grab', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                      <Chip status={s} />
                    </span>
                    <span style={{ width: 64, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                      <Tog on={s.archiveSweep} onChange={(val) => updateStatus(s.id, { archiveSweep: val })} />
                    </span>
                    <span style={{ width: 56, display: 'flex', flexShrink: 0 }}>
                      <IconBtn
                        title="Edit status"
                        active={editor?.status?.id === s.id}
                        onClick={() => setEditor({ mode: 'edit', status: s })}
                      >
                        <Pencil size={15} />
                      </IconBtn>
                      {s.locked ? (
                        <Tip text="Built in status" align="right">
                          <span style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.grip, flexShrink: 0 }}>
                            <Lock size={15} />
                          </span>
                        </Tip>
                      ) : (
                        <IconBtn title="Delete status" danger onClick={() => setDeleteConfirm(s)}>
                          <Trash2 size={15} />
                        </IconBtn>
                      )}
                    </span>
                  </div>
                ))}

                {/* Add status */}
                <button
                  onClick={() => setEditor({ mode: 'add' })}
                  style={{
                    width: '100%', marginTop: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'flex-start', gap: 8, padding: '9px 10px',
                    background: 'rgba(43,89,182,0.025)', border: '1px dashed rgba(43,89,182,0.3)',
                    borderRadius: 8, cursor: 'pointer', fontFamily: FONT, fontSize: 12,
                    color: C.textDim,
                  }}
                >
                  <Plus size={14} style={{ color: 'var(--brand-deep)' }} />
                  Add status
                </button>
              </div>
            </div>

            {deleteConfirm && (
              <DeleteDialog
                status={deleteConfirm}
                statuses={statuses}
                onCancel={() => setDeleteConfirm(null)}
                onConfirm={handleDeleteConfirm}
              />
            )}
          </div>

          {/* ── Chip editor pane ── */}
          <div style={{ width: '50%', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
            {showEditor && (
              /* ChipEditorView sizes its text with calc(Npx * var(--pz)) —
                 the Plan page's zoom variable. The statuses list uses fixed
                 sizes, so pin --pz to 1 here or the editor inflates with
                 page zoom while the list doesn't. */
              <div style={{ '--pz': 1, width: '100%', height: '100%', display: 'flex' }}>
                <ChipEditorView
                  editor={chipEditorPayload}
                  onBack={() => setEditor(null)}
                  onConfirm={handleEditorConfirm}
                  viewWidth="100%"
                  nameLocked={editor?.mode === 'edit' && editor.status.locked}
                />
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
