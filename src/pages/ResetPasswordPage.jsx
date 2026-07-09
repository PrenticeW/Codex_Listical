import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
