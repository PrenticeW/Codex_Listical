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
import { Loader } from 'lucide-react';
import { loadSiteSnapshots, restoreSiteSnapshot } from '../../lib/snapshotStorage';
import { useYear } from '../../contexts/YearContext';
import { useNavigate } from 'react-router-dom';
import { fmtTimestamp as formatTimestamp } from '../../utils/fmtTimestamp';

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono', 'SFMono-Regular', ui-monospace, monospace";

function snapshotSummary(snapshot) {
  const parts = [];

  const shortlistCount = snapshot.goal?.shortlist?.length ?? 0;
  if (shortlistCount > 0) {
    parts.push(`${shortlistCount} project${shortlistCount !== 1 ? 's' : ''}`);
  }

  const chipCount = snapshot.plan?.chips?.projectChips?.length ?? 0;
  if (chipCount > 0) {
    parts.push(`${chipCount} chip${chipCount !== 1 ? 's' : ''}`);
  }

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
// Restore button
// ---------------------------------------------------------------------------

function RestoreBtn({ onClick, disabled }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        fontSize: 11, fontFamily: FONT, fontWeight: 500,
        color: hov ? 'var(--brand-deep)' : '#616161',
        border: `1px solid ${hov ? 'rgba(43,89,182,0.3)' : '#e8e8e4'}`,
        borderRadius: 6, padding: '4px 10px', flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: hov ? 'rgba(43,89,182,0.06)' : '#fff',
        opacity: disabled ? 0.5 : 1,
        transition: 'color .15s, border-color .15s, background .15s',
        userSelect: 'none',
      }}
    >
      Restore
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

function ConfirmRestoreModal({ snapshot, onConfirm, onCancel, isRestoring }) {
  return createPortal(
    <div
      style={{ position:'fixed', inset:0, zIndex:1000001, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(31,31,31,0.32)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background:'#fff', borderRadius:12, border:'1px solid #e8e8e4',
        boxShadow:'0 1px 0 rgba(72,50,75,0.04), 0 4px 24px rgba(72,50,75,0.14)',
        padding:'24px', maxWidth:380, width:'calc(100% - 32px)', fontFamily:FONT,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0, marginTop:2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#d97706" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="9" x2="12" y2="13" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="#d97706" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <div>
            <p style={{ fontSize:14, fontWeight:600, color:'#1F1F1F', marginBottom:6 }}>Restore this version?</p>
            <p style={{ fontSize:13, color:'#616161', lineHeight:1.5 }}>
              This will replace your Goal, Plan, and System pages with the version
              from <span style={{ fontWeight:500, color:'#383838' }}>{formatTimestamp(snapshot.created_at)}</span>.
              This cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isRestoring}
            style={{ padding:'7px 16px', fontSize:13, fontWeight:500, color:'#616161', background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, cursor:'pointer', fontFamily:FONT, opacity: isRestoring ? 0.5 : 1, transition:'background .1s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(43,89,182,0.05)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRestoring}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', fontSize:13, fontWeight:600, color:'#fff', background:'#c0392b', border:'none', borderRadius:8, cursor:'pointer', fontFamily:FONT, opacity: isRestoring ? 0.7 : 1, transition:'opacity .1s' }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.85'}
            onMouseLeave={e=>e.currentTarget.style.opacity= isRestoring ? '0.7' : '1'}
          >
            {isRestoring && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation:'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
                <path d="M22 12a10 10 0 0 0-10-10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            )}
            {isRestoring ? 'Restoring…' : 'Restore'}
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

  useEffect(() => { load(); }, [load]);

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
      navigate('/');
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
        style={{ position:'fixed', inset:0, zIndex:999990, background:'rgba(31,31,31,0.32)' }}
        onMouseDown={onClose}
      />

      {/* Panel */}
      <div style={{
        position:'fixed', right:16, top:64, zIndex:999995,
        width:384, maxHeight:'80vh',
        background:'#fff',
        borderRadius:12,
        border:'1px solid #e8e8e4',
        boxShadow:'0 1px 0 rgba(72,50,75,0.04), 0 4px 24px rgba(72,50,75,0.14)',
        display:'flex', flexDirection:'column', overflow:'hidden',
        fontFamily:FONT,
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--brand-bd)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none" style={{ color:'#8090A8' }}>
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6.5 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize:13, fontWeight:600, color:'#1F1F1F' }}>Version History</span>
            <span style={{ fontSize:11, color:'#9E9E9E' }}>Year {currentYear}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', border:'none', background:'transparent', borderRadius:6, cursor:'pointer', color:'#9E9E9E', transition:'color .1s, background .1s' }}
            onMouseEnter={e=>{ e.currentTarget.style.color='#1F1F1F'; e.currentTarget.style.background='rgba(43,89,182,0.06)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.color='#9E9E9E'; e.currentTarget.style.background='transparent'; }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {isLoading && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 16px', color:'#9E9E9E' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight:8, animation:'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.1)" strokeWidth="2.5"/>
                <path d="M22 12a10 10 0 0 0-10-10" stroke="#9E9E9E" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize:13 }}>Loading history…</span>
            </div>
          )}

          {!isLoading && error && (
            <div style={{ padding:'24px 16px', textAlign:'center' }}>
              <p style={{ fontSize:13, color:'#c0392b', marginBottom:12 }}>{error}</p>
              <button
                type="button"
                onClick={load}
                style={{ fontSize:12, color:'#616161', textDecoration:'underline', background:'none', border:'none', cursor:'pointer' }}
              >
                Try again
              </button>
            </div>
          )}

          {!isLoading && !error && snapshots.length === 0 && (
            <div style={{ padding:'40px 16px', textAlign:'center' }}>
              <p style={{ fontSize:13, color:'#616161', marginBottom:6 }}>No snapshots yet.</p>
              <p style={{ fontSize:12, color:'#9E9E9E' }}>
                Snapshots are captured automatically as you edit.
              </p>
            </div>
          )}

          {!isLoading && !error && snapshots.length > 0 && (
            <ul style={{ listStyle:'none', margin:0, padding:0 }}>
              {snapshots.map((snap, idx) => (
                <li key={snap.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 16px', borderBottom: idx < snapshots.length - 1 ? '1px solid rgba(130,155,210,0.18)' : 'none' }}>
                  <div style={{ minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:500, color:'#1F1F1F', marginBottom:3, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {formatTimestamp(snap.created_at)}
                      </span>
                      {idx === 0 && (
                        <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--brand-deep)', background:'var(--brand-tint)', padding:'2px 6px', borderRadius:4, flexShrink:0 }}>
                          Latest
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize:10.5, color:'#8090A8', fontFamily:MONO, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {snapshotSummary(snap)}
                    </p>
                  </div>
                  <RestoreBtn onClick={() => setConfirmTarget(snap)} disabled={isRestoring} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 16px 10px', borderTop:'1px solid var(--brand-bd)', flexShrink:0 }}>
          <p style={{ fontSize:11, color:'#9E9E9E' }}>
            Up to 50 snapshots are kept. Older ones are removed automatically.
          </p>
        </div>
      </div>

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
