import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { requestAccountDeletion } from '../lib/api/accountDeletion';

/**
 * DeleteAccountModal Component
 *
 * Confirmation modal for account deletion with password verification.
 */

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function DeleteAccountModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError('');
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) { setError('Please enter your password'); return; }
    setIsLoading(true);
    setError('');
    try {
      const result = await requestAccountDeletion(password);
      if (result.success) {
        navigate('/account-deleted');
      } else {
        if (result.error === 'Invalid password') {
          setError('The password you entered is incorrect. Please try again.');
        } else if (result.error === 'Too many attempts. Please try again later.') {
          setError('Too many failed attempts. Please wait a few minutes and try again.');
        } else if (result.error === 'Not authenticated') {
          setError('Your session has expired. Please log in again.');
        } else {
          setError(result.error || 'An error occurred. Please try again.');
        }
      }
    } catch {
      setError('A network error occurred. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !isLoading) onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{ position:'fixed', inset:0, zIndex:1000022, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(31,31,31,0.32)', fontFamily:FONT }}
      onClick={isLoading ? undefined : onClose}
    >
      <div
        style={{ background:'#fff', borderRadius:12, border:'1px solid #e8e8e4', boxShadow:'0 1px 0 rgba(72,50,75,0.04), 0 4px 24px rgba(72,50,75,0.14)', width:'100%', maxWidth:440, margin:'0 16px' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--brand-bd)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#1F1F1F', margin:0 }}>Delete Account</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', border:'none', background:'transparent', borderRadius:6, cursor: isLoading ? 'not-allowed' : 'pointer', color:'#9E9E9E', opacity: isLoading ? 0.5 : 1, transition:'color .1s, background .1s' }}
            onMouseEnter={e=>{ if (!isLoading) { e.currentTarget.style.color='#1F1F1F'; e.currentTarget.style.background='rgba(43,89,182,0.06)'; } }}
            onMouseLeave={e=>{ e.currentTarget.style.color='#9E9E9E'; e.currentTarget.style.background='transparent'; }}
            aria-label="Close modal"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding:'20px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Warning */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:14, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:2 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{ fontSize:13, color:'#c0392b' }}>
                <p style={{ fontWeight:600, marginBottom:6, color:'#9b1c1c' }}>This action is permanent</p>
                <p style={{ marginBottom:6 }}>Deleting your account will remove:</p>
                <ul style={{ paddingLeft:16, margin:0, lineHeight:1.7 }}>
                  <li>Your profile and account information</li>
                  <li>All saved lists and goals</li>
                  <li>Your preferences and settings</li>
                </ul>
              </div>
            </div>

            {/* Retention notice */}
            <div style={{ fontSize:13, color:'#616161', background:'rgba(43,89,182,0.04)', borderRadius:8, padding:'12px 14px', border:'1px solid var(--brand-bd)' }}>
              <p style={{ fontWeight:600, color:'#383838', marginBottom:6 }}>What we retain:</p>
              <p>Payment records (if applicable) are retained for 6 years for legal and tax compliance purposes.</p>
            </div>

            {/* Grace period */}
            <div style={{ fontSize:13, color:'#92400e', background:'#fffbeb', borderRadius:8, padding:'12px 14px', border:'1px solid #fcd34d' }}>
              <p style={{ fontWeight:600, marginBottom:4 }}>30-day grace period</p>
              <p>You have 30 days to cancel your deletion request by contacting support. After this period, your data will be permanently deleted.</p>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="delete-password" style={{ display:'block', fontSize:13, fontWeight:600, color:'#383838', marginBottom:8 }}>
                Enter your password to confirm
              </label>
              <input
                ref={inputRef}
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                disabled={isLoading}
                style={{ width:'100%', border:'1px solid #e8e8e4', borderRadius:8, padding:'10px 14px', fontSize:14, color:'#1F1F1F', background: isLoading ? '#f9f9f9' : '#fff', outline:'none', boxSizing:'border-box', cursor: isLoading ? 'not-allowed' : 'text', transition:'border-color .15s' }}
                onFocus={e=>e.target.style.borderColor='#c0392b'}
                onBlur={e=>e.target.style.borderColor='#e8e8e4'}
                placeholder="Enter your password..."
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:12, background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p style={{ fontSize:13, color:'#c0392b', fontWeight:500, margin:0 }}>{error}</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, padding:'12px 20px', borderTop:'1px solid var(--brand-bd)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{ padding:'7px 16px', fontSize:13, fontWeight:500, color:'#616161', background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily:FONT, opacity: isLoading ? 0.5 : 1, transition:'background .1s' }}
            onMouseEnter={e=>{ if (!isLoading) e.currentTarget.style.background='rgba(43,89,182,0.05)'; }}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || !password}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', fontSize:13, fontWeight:600, color:'#fff', background:'#c0392b', border:'none', borderRadius:8, cursor: (isLoading || !password) ? 'not-allowed' : 'pointer', fontFamily:FONT, opacity: (isLoading || !password) ? 0.5 : 1, transition:'opacity .1s' }}
            onMouseEnter={e=>{ if (!isLoading && password) e.currentTarget.style.opacity='0.85'; }}
            onMouseLeave={e=>e.currentTarget.style.opacity= (isLoading || !password) ? '0.5' : '1'}
          >
            {isLoading && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation:'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"/>
                <path d="M22 12a10 10 0 0 0-10-10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            )}
            {isLoading ? 'Deleting…' : 'Permanently Delete Account'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
