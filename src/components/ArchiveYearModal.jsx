import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useYear } from '../contexts/YearContext';
import {
  performYearArchive,
  validateYearReadyForArchive,
} from '../utils/planner/archiveYear';

/**
 * ArchiveYearModal Component
 *
 * Modal dialog for archiving the current year and starting a new one.
 */

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function InfoBanner({ type, title, body }) {
  const colors = {
    error:   { bg:'#fef2f2', border:'#fca5a5', title:'#9b1c1c', body:'#c0392b', icon:'#c0392b' },
    warning: { bg:'#fffbeb', border:'#fcd34d', title:'#78350f', body:'#92400e', icon:'#d97706' },
    success: { bg:'#f0fdf4', border:'#86efac', title:'#14532d', body:'#166534', icon:'#16a34a' },
  }[type] || {};

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:14, background:colors.bg, border:`1px solid ${colors.border}`, borderRadius:8, marginBottom:12 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.icon} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
        {type === 'success'
          ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
          : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
      </svg>
      <div>
        <p style={{ fontSize:13, fontWeight:600, color:colors.title, marginBottom:4 }}>{title}</p>
        <p style={{ fontSize:13, color:colors.body }}>{body}</p>
      </div>
    </div>
  );
}

export function ArchiveYearModal({ isOpen, onClose, yearNumber }) {
  const { refreshMetadata, draftYear } = useYear();
  const nextYearNumber = draftYear ? draftYear.yearNumber : yearNumber + 1;
  const [isArchiving, setIsArchiving] = useState(false);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (isOpen && yearNumber) {
      let cancelled = false;
      (async () => {
        try {
          const validationResult = await validateYearReadyForArchive(yearNumber);
          if (!cancelled) { setValidation(validationResult); setResult(null); }
        } catch (err) {
          if (!cancelled) { setValidation({ ready: false, reason: `Validation error: ${err.message}` }); }
        }
      })();
      return () => { cancelled = true; };
    }
  }, [isOpen, yearNumber]);

  const handleArchive = async () => {
    if (!validation?.ready) return;
    setIsArchiving(true);
    setResult(null);
    try {
      const archiveResult = await performYearArchive(yearNumber);
      setResult(archiveResult);
      if (archiveResult.success) {
        refreshMetadata();
        setTimeout(() => { onClose(); setIsArchiving(false); setResult(null); }, 2000);
      } else {
        setIsArchiving(false);
      }
    } catch (error) {
      setResult({ success: false, error: error.message });
      setIsArchiving(false);
    }
  };

  const handleCancel = () => {
    if (!isArchiving) { onClose(); setResult(null); }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{ position:'fixed', inset:0, background:'rgba(31,31,31,0.32)', zIndex:1000020 }}
        onClick={handleCancel}
      />

      {/* Modal */}
      <div
        style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', padding:16, pointerEvents:'none', zIndex:1000021 }}
      >
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e8e8e4', boxShadow:'0 1px 0 rgba(72,50,75,0.04), 0 4px 24px rgba(72,50,75,0.14)', maxWidth:440, width:'100%', padding:24, pointerEvents:'auto', fontFamily:FONT }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:'#fffbeb', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <h2 style={{ fontSize:17, fontWeight:600, color:'#1F1F1F', margin:0 }}>Archive Year {yearNumber}?</h2>
          </div>

          {/* Status banners */}
          {validation && !validation.ready && (
            <InfoBanner type="error" title="Cannot Archive" body={validation.reason} />
          )}
          {validation?.warning && (
            <InfoBanner type="warning" title="Warning" body={validation.warning} />
          )}
          {result?.success && (
            <InfoBanner type="success" title="Archive Complete!" body={`Year ${result.archivedYear} has been archived. Starting Year ${result.newYear}…`} />
          )}
          {result?.success === false && (
            <InfoBanner type="error" title="Archive Failed" body={result.error} />
          )}

          {/* Body copy */}
          {!result && validation?.ready && (
            <div style={{ fontSize:13, color:'#616161', lineHeight:1.6 }}>
              <p style={{ fontWeight:600, color:'#383838', marginBottom:8 }}>This will:</p>
              <ul style={{ paddingLeft:20, margin:'0 0 14px', lineHeight:1.8 }}>
                <li>Archive all {validation.weeksCompleted || 0} completed weeks ({validation.totalHours || 0}h total)</li>
                {draftYear
                  ? <li>Activate Year {nextYearNumber} (your planned draft)</li>
                  : <li>Create Year {nextYearNumber} with a fresh 12-week timeline</li>
                }
                {!draftYear && <li>Carry forward recurring tasks (reset to "Not Scheduled")</li>}
              </ul>
              <p style={{ fontSize:12, color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:'10px 12px' }}>
                <strong>Note:</strong> Year {yearNumber} will become read-only and accessible via History.
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--brand-bd)' }}>
            <button
              onClick={handleCancel}
              disabled={isArchiving}
              style={{ padding:'7px 16px', fontSize:13, fontWeight:500, color:'#616161', background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, cursor: isArchiving ? 'not-allowed' : 'pointer', fontFamily:FONT, opacity: isArchiving ? 0.5 : 1, transition:'background .1s' }}
              onMouseEnter={e=>{ if (!isArchiving) e.currentTarget.style.background='rgba(43,89,182,0.05)'; }}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              Cancel
            </button>
            <button
              onClick={handleArchive}
              disabled={!validation?.ready || isArchiving || result?.success}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', fontSize:13, fontWeight:600, color:'#fff', background:'#d97706', border:'none', borderRadius:8, cursor: (!validation?.ready || isArchiving || result?.success) ? 'not-allowed' : 'pointer', fontFamily:FONT, opacity: (!validation?.ready || isArchiving || result?.success) ? 0.5 : 1, transition:'opacity .1s' }}
              onMouseEnter={e=>{ if (validation?.ready && !isArchiving) e.currentTarget.style.opacity='0.85'; }}
              onMouseLeave={e=>e.currentTarget.style.opacity= (!validation?.ready || isArchiving || result?.success) ? '0.5' : '1'}
            >
              {isArchiving && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation:'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              )}
              {isArchiving ? 'Archiving…' : `Archive & Start Year ${nextYearNumber}`}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default ArchiveYearModal;
