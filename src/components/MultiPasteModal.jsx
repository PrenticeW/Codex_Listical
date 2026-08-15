import React, { useEffect, useRef } from 'react';

/**
 * MultiPasteModal Component
 *
 * Confirmation dialog shown when a multi line paste lands in a single Task
 * cell on the System page. Offers to turn the pasted lines into task rows:
 * the first line fills the selected cell and each remaining line becomes a
 * new task row inserted directly below it. Cancelling leaves the sheet
 * untouched.
 */

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function MultiPasteModal({ isOpen, taskCount, maxTasks = 100, onClose, onConfirm }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => confirmRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cappedCount = Math.min(taskCount, maxTasks);
  const isCapped = taskCount > maxTasks;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
  };

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(31,31,31,0.32)', fontFamily:FONT }}
      onClick={onClose}
    >
      <div
        style={{ background:'#fff', borderRadius:12, border:'1px solid #e8e8e4', boxShadow:'0 1px 0 rgba(72,50,75,0.04), 0 4px 24px rgba(72,50,75,0.14)', width:'100%', maxWidth:440, margin:'0 16px' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--brand-bd)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--brand-deep)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#1F1F1F', margin:0 }}>Add Tasks</h2>
          </div>
          <button
            onClick={onClose}
            style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', border:'none', background:'transparent', borderRadius:6, cursor:'pointer', color:'#9E9E9E', transition:'color .1s, background .1s' }}
            onMouseEnter={e=>{ e.currentTarget.style.color='#1F1F1F'; e.currentTarget.style.background='color-mix(in srgb, var(--th-44) 6%, transparent)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.color='#9E9E9E'; e.currentTarget.style.background='transparent'; }}
            aria-label="Close modal"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>

        {/* Body: only shown when the paste exceeds the task cap */}
        {isCapped && (
          <div style={{ padding:'20px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:12, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p style={{ fontSize:13, color:'#c0392b', fontWeight:500, margin:0 }}>
                A maximum of {maxTasks} tasks can be added at once. Only the first {maxTasks} lines will be used.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'12px 20px', borderTop: isCapped ? '1px solid var(--brand-bd)' : 'none' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding:'7px 16px', fontSize:13, fontWeight:500, color:'#616161', background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, cursor:'pointer', fontFamily:FONT, transition:'background .1s' }}
            onMouseEnter={e=>e.currentTarget.style.background='color-mix(in srgb, var(--th-44) 5%, transparent)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            style={{ padding:'7px 18px', fontSize:13, fontWeight:600, color:'#fff', background:'var(--brand-deep)', border:'none', borderRadius:8, cursor:'pointer', fontFamily:FONT, transition:'opacity .1s' }}
            onMouseEnter={e=>{ e.currentTarget.style.opacity='0.85'; }}
            onMouseLeave={e=>{ e.currentTarget.style.opacity='1'; }}
          >
            Add {cappedCount} Task{cappedCount === 1 ? '' : 's'}?
          </button>
        </div>
      </div>
    </div>
  );
}

export default MultiPasteModal;
