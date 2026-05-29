/**
 * VersionHistoryPanel
 *
 * A modal that lists the last 50 site snapshots for the current year and lets
 * the user restore any of them. Opened from the gear menu in NavigationBar.
 *
 * Design: functional over polished (pre-launch requirement from VERSION_HISTORY_PLAN.md).
 * Each row shows the timestamp + a brief summary (project count, chip count,
 * task row count). Restore shows a confirmation modal before writing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { History, RotateCcw, X, AlertTriangle, Loader } from 'lucide-react';
import { loadSiteSnapshots, restoreSiteSnapshot } from '../../lib/snapshotStorage';
import { useYear } from '../../contexts/YearContext';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(isoString) {
  if (!isoString) return 'Unknown time';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function snapshotSummary(snapshot) {
  const parts = [];

  // Goal: count shortlist projects
  const shortlistCount = snapshot.goal?.shortlist?.length ?? 0;
  if (shortlistCount > 0) {
    parts.push(`${shortlistCount} project${shortlistCount !== 1 ? 's' : ''}`);
  }

  // Plan: count chips
  const chipCount = snapshot.plan?.chips?.projectChips?.length ?? 0;
  if (chipCount > 0) {
    parts.push(`${chipCount} chip${chipCount !== 1 ? 's' : ''}`);
  }

  // System: count task rows (exclude calendar header rows)
  const allRows = snapshot.system?.taskRows ?? [];
  const taskCount = allRows.filter(
    (r) => r && r.__rowType !== 'header' && !r.isArchiveRow && !r.isCalendarHeader,
  ).length;
  if (taskCount > 0) {
    parts.push(`${taskCount} task row${taskCount !== 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Empty snapshot';
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

function ConfirmRestoreModal({ snapshot, onConfirm, onCancel, isRestoring }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Restore this version?</p>
            <p className="text-sm text-slate-500 mt-1">
              This will replace your Goal, Plan, and System pages with the version
              from <span className="font-medium text-slate-700">{formatTimestamp(snapshot.created_at)}</span>.
              This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRestoring}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRestoring}
            className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isRestoring && <Loader className="w-3.5 h-3.5 animate-spin" />}
            {isRestoring ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function VersionHistoryPanel({ onClose }) {
  const { currentYear } = useYear();
  const navigate = useNavigate();

  const [snapshots, setSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await loadSiteSnapshots(currentYear);
      setSnapshots(rows);
    } catch {
      setError('Could not load version history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    load();
  }, [load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleRestore = async () => {
    if (!confirmTarget) return;
    setIsRestoring(true);
    try {
      await restoreSiteSnapshot(confirmTarget, currentYear);
      setConfirmTarget(null);
      onClose();
      // Navigate to System page so the user immediately sees the restored state.
      navigate('/');
      // Force a full page reload so all in-memory state is replaced cleanly.
      window.location.reload();
    } catch {
      setIsRestoring(false);
      setConfirmTarget(null);
      setError('Restore failed. Please try again.');
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[999990] bg-black/30"
        onMouseDown={onClose}
      />

      {/* Panel */}
      <div className="fixed right-4 top-16 z-[999995] w-96 max-h-[80vh] bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Version History</span>
            <span className="text-xs text-slate-400 font-normal">Year {currentYear}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader className="w-4 h-4 animate-spin mr-2" />
              <span className="text-sm">Loading history...</span>
            </div>
          )}

          {!isLoading && error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-rose-600">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-3 text-xs text-slate-500 underline hover:text-slate-700"
              >
                Try again
              </button>
            </div>
          )}

          {!isLoading && !error && snapshots.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-500">No snapshots yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Snapshots are captured automatically as you edit.
              </p>
            </div>
          )}

          {!isLoading && !error && snapshots.length > 0 && (
            <ul className="divide-y divide-slate-50">
              {snapshots.map((snap, idx) => (
                <li key={snap.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {formatTimestamp(snap.created_at)}
                      {idx === 0 && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {snapshotSummary(snap)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(snap)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-100 shrink-0">
          <p className="text-xs text-slate-400">
            Up to 50 snapshots are kept. Older ones are removed automatically.
          </p>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmTarget && (
        <ConfirmRestoreModal
          snapshot={confirmTarget}
          onConfirm={handleRestore}
          onCancel={() => setConfirmTarget(null)}
          isRestoring={isRestoring}
        />
      )}
    </>,
    document.body,
  );
}
