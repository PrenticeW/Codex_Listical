import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell, { AuthField, AuthErrorBanner, AuthSpinnerLabel } from '../components/auth/AuthShell';

/**
 * ResetPasswordPage
 *
 * Page where users set their new password after clicking the reset link
 * from their email. Styled per the design handover's auth reference
 * (reference/auth-pages/auth-pages.html in ListicalVisualHandover.zip)
 * via the shared AuthShell chrome.
 */
// True while the URL still carries password-recovery credentials that
// Supabase hasn't consumed yet (hash tokens or a PKCE ?code=). Checked so
// we don't redirect away before the PASSWORD_RECOVERY event has fired.
function urlLooksLikeRecovery() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).has('code')
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword, isLoading: authLoading, isAuthenticated, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Guard: this page is only for sessions that arrived via a password-recovery
  // link. An ordinary signed-in user (password, OTP, or OAuth — e.g. a Google
  // sign-in that fell back to the web redirect) should never be asked to set a
  // password, so send them to the app instead.
  const isLegitRecovery = isPasswordRecovery || urlLooksLikeRecovery();
  if (!authLoading && isAuthenticated && !isLegitRecovery) {
    return <Navigate to="/" replace />;
  }

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

      // Success - clear the recovery flag and redirect to the app
      clearPasswordRecovery();
      navigate('/');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <AuthShell eyebrow="Auth · Set Password">
      <h1 className="auth-title">Set new password</h1>
      <p className="auth-subtitle">Enter your new password below.</p>

      <AuthErrorBanner>{error}</AuthErrorBanner>

      <form onSubmit={handleSubmit}>
        <AuthField label="New password" hint="Must be at least 10 characters.">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
          />
        </AuthField>

        <AuthField label="Confirm password">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="auth-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </AuthField>

        <button type="submit" className="auth-btn-primary" disabled={isLoading} style={{ marginTop: 4 }}>
          {isLoading ? <AuthSpinnerLabel label="Updating password…" /> : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
