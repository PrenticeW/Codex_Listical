import React, { useState, useEffect, useRef } from 'react';

/**
 * AddTasksModal Component
 *
 * Custom modal for adding multiple tasks to the planner.
 */

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function AddTasksModal({ isOpen, onClose, onConfirm }) {
  const [count, setCount] = useState('5');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCount('5');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const numCount = parseInt(count, 10);
    if (!Number.isFinite(numCount) || numCount <= 0) {
      setError('Please enter a valid positive number');
      return;
    }
    if (numCount > 100) {
      setError('Maximum 100 tasks allowed at once');
      return;
    }
    onConfirm(numCount);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

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
            onMouseEnter={e=>{ e.currentTarget.style.color='#1F1F1F'; e.currentTarget.style.background='rgba(43,89,182,0.06)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.color='#9E9E9E'; e.currentTarget.style.background='transparent'; }}
            aria-label="Close modal"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding:'20px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label htmlFor="task-count" style={{ display:'block', fontSize:13, fontWeight:600, color:'#383838', marginBottom:8 }}>
                How many tasks would you like to add?
              </label>
              <input
                ref={inputRef}
                id="task-count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => { setCount(e.target.value); setError(''); }}
                style={{ width:'100%', border:'1px solid #e8e8e4', borderRadius:8, padding:'10px 14px', fontSize:14, color:'#1F1F1F', background:'#fff', outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
                onFocus={e=>e.target.style.borderColor='var(--brand)'}
                onBlur={e=>e.target.style.borderColor='#e8e8e4'}
                placeholder="Enter number of tasks..."
              />
            </div>

            {error && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:12, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p style={{ fontSize:13, color:'#c0392b', fontWeight:500, margin:0 }}>{error}</p>
              </div>
            )}

            <div style={{ fontSize:12, color:'#616161', background:'rgba(43,89,182,0.04)', borderRadius:8, padding:12, border:'1px solid var(--brand-bd)' }}>
              Tasks will be added below the currently selected row, or at the end if no row is selected.
            </div>
          </div>
        </form>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'12px 20px', borderTop:'1px solid var(--brand-bd)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding:'7px 16px', fontSize:13, fontWeight:500, color:'#616161', background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, cursor:'pointer', fontFamily:FONT, transition:'background .1s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(43,89,182,0.05)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={!count || count === '0'}
            style={{ padding:'7px 18px', fontSize:13, fontWeight:600, color:'#fff', background:'var(--brand-deep)', border:'none', borderRadius:8, cursor: (!count || count === '0') ? 'not-allowed' : 'pointer', fontFamily:FONT, opacity: (!count || count === '0') ? 0.5 : 1, transition:'opacity .1s' }}
            onMouseEnter={e=>{ if (count && count !== '0') e.currentTarget.style.opacity='0.85'; }}
            onMouseLeave={e=>e.currentTarget.style.opacity= (!count || count === '0') ? '0.5' : '1'}
          >
            Add {count && count !== '0' ? count : ''} Task{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
