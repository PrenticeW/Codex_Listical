import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell, { AuthField, AuthErrorBanner, AuthSpinnerLabel } from '../components/auth/AuthShell';

/**
 * ForgotPasswordPage
 *
 * Allows users to request a password reset email. Styled per the design
 * handover's auth reference (reference/auth-pages/auth-pages.html in
 * ListicalVisualHandover.zip) via the shared AuthShell chrome.
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

  if (success) {
    return (
      <AuthShell eyebrow="Auth · Reset Password">
        <div className="auth-confirm-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-subtitle">
          We've sent a password reset link to <strong style={{ color: 'var(--ink-soft)' }}>{email}</strong>.
        </p>
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', margin: '0 0 24px' }}>
          If you don't see the email, check your spam folder.
        </p>
        <Link to="/login" className="auth-link-btn muted" style={{ display: 'block', textAlign: 'center' }}>
          Back to login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Auth · Reset Password">
      <h1 className="auth-title">Reset password</h1>
      <p className="auth-subtitle">Enter your email to receive a password reset link.</p>

      <AuthErrorBanner>{error}</AuthErrorBanner>

      <form onSubmit={handleSubmit}>
        <AuthField label="Email address">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </AuthField>

        <button type="submit" className="auth-btn-primary" disabled={isLoading} style={{ marginBottom: 18 }}>
          {isLoading ? <AuthSpinnerLabel label="Sending reset link…" /> : 'Send reset link'}
        </button>

        <div className="auth-centered">
          <Link to="/login" className="auth-link-btn muted">Back to login</Link>
        </div>
      </form>
    </AuthShell>
  );
}
