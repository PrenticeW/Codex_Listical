import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ResetPasswordPage Component
 *
 * Page where users set their new password after clicking the reset link from their email.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await updatePassword(password);

      if (updateError) {
        setError(updateError.message || 'Failed to update password');
        setIsLoading(false);
        return;
      }

      // Success - redirect to login or home
      navigate('/');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  const inputStyle = {
    display: 'block',
    width: '100%',
    paddingTop: '10px',
    paddingBottom: '10px',
    paddingLeft: '40px',
    paddingRight: '14px',
    border: '1px solid #e8e8e4',
    borderRadius: 8,
    color: '#111',
    fontSize: '0.875rem',
    outline: 'none',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: 'border-box',
  };

  const primaryBtnStyle = {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '10px 14px',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--brand-deep)',
    cursor: 'pointer',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF5EB', padding: '48px 16px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 448, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: 'var(--brand-deep)', borderRadius: 12, marginBottom: 16, boxShadow: '0 4px 12px rgba(72,50,75,0.18)' }}>
            <svg style={{ width: 32, height: 32, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
            Set New Password
          </h2>
          <p style={{ color: '#616161', margin: 0 }}>
            Enter your new password below
          </p>
        </div>

        {/* Form Card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)', padding: 32 }}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }} onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <svg style={{ width: 20, height: 20, color: '#c0392b', marginRight: 8, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#c0392b', margin: 0 }}>{error}</p>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* New Password Field */}
              <div>
                <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <svg style={{ width: 20, height: 20, color: '#9E9E9E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={inputStyle}
                    placeholder="Enter new password"
                  />
                </div>
                <p style={{ marginTop: 8, fontSize: '0.75rem', color: '#9E9E9E' }}>Must be at least 10 characters</p>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label htmlFor="confirmPassword" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <svg style={{ width: 20, height: 20, color: '#9E9E9E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={inputStyle}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{ ...primaryBtnStyle, opacity: isLoading ? 0.5 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin" style={{ marginLeft: -4, marginRight: 12, width: 20, height: 20, color: '#fff' }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating password...
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
