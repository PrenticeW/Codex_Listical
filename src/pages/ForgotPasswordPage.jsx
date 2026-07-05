import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * ForgotPasswordPage Component
 *
 * Allows users to request a password reset email.
 */
export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const { error: resetError } = await resetPassword(email);

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
            Reset Password
          </h2>
          <p style={{ color: '#616161', margin: 0 }}>
            Enter your email to receive a password reset link
          </p>
        </div>

        {/* Form Card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)', padding: 32 }}>
          {success ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#d1fae5' }}>
                <svg style={{ width: 24, height: 24, color: '#059669' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111', marginBottom: 8 }}>Check your email</h3>
                <p style={{ fontSize: '0.875rem', color: '#616161', marginBottom: 16 }}>
                  We've sent a password reset link to <strong>{email}</strong>
                </p>
                <p style={{ fontSize: '0.75rem', color: '#9E9E9E', margin: 0 }}>
                  If you don't see the email, check your spam folder.
                </p>
              </div>
              <Link
                to="/login"
                style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-deep)', textDecoration: 'none' }}
              >
                <svg style={{ width: 16, height: 16, marginRight: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to login
              </Link>
            </div>
          ) : (
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

              {/* Email Field */}
              <div>
                <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <svg style={{ width: 20, height: 20, color: '#9E9E9E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={inputStyle}
                    placeholder="you@example.com"
                  />
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
                    Sending reset link...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              {/* Back to Login Link */}
              <div style={{ textAlign: 'center' }}>
                <Link
                  to="/login"
                  style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: '#616161', textDecoration: 'none' }}
                >
                  <svg style={{ width: 16, height: 16, marginRight: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
