import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell, { AuthField, AuthErrorBanner, AuthSpinnerLabel, AuthFooterText } from '../components/auth/AuthShell';

/**
 * LoginPage
 *
 * Password and email-code (OTP) sign in. Styled per the design handover's
 * auth reference (reference/auth-pages/auth-pages.html in
 * ListicalVisualHandover.zip) via the shared AuthShell chrome.
 */
// Official Google "G" mark, per Google's sign-in branding guidelines.
function GoogleLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, sendOtp, verifyOtp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // OTP flow state
  const [otpMode, setOtpMode] = useState(false);
  const [otpStep, setOtpStep] = useState('email'); // 'email' or 'code'
  const [otpCode, setOtpCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: loginError } = await login(email, password);

      if (loginError) {
        setError(loginError.message || 'Failed to login');
        setIsLoading(false);
        return;
      }

      // Success - navigation will happen automatically via auth state change
      navigate('/');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // Handle OTP email submission
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await sendOtp(email);

      if (result?.error) {
        setError(result.error.message || 'Failed to send code');
        setIsLoading(false);
        return;
      }

      // Move to code entry step
      setOtpStep('code');
      setIsLoading(false);
    } catch (err) {
      console.error('handleSendOtp error:', err);
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // Handle OTP code verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: verifyError } = await verifyOtp(email, otpCode);

      if (verifyError) {
        setError(verifyError.message || 'Invalid code');
        setIsLoading(false);
        return;
      }

      // Success - navigation will happen automatically via auth state change
      navigate('/');
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // Handle Google sign in — redirects the whole page to Google, so no
  // navigate() here; the browser comes back to "/" with a session.
  const handleGoogle = async () => {
    setError('');
    setIsLoading(true);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message || 'Google sign in failed');
      setIsLoading(false);
    }
    // On success the page navigates away; leave isLoading true.
  };

  // Switch to OTP mode
  const enterOtpMode = () => {
    setOtpMode(true);
    setOtpStep('email');
    setError('');
    setOtpCode('');
  };

  // Switch back to password mode
  const exitOtpMode = () => {
    setOtpMode(false);
    setOtpStep('email');
    setError('');
    setOtpCode('');
  };

  // Go back to email step in OTP flow
  const backToEmailStep = () => {
    setOtpStep('email');
    setError('');
    setOtpCode('');
  };

  return (
    <AuthShell
      eyebrow="Auth · Sign In"
      footer={<AuthFooterText prompt="Don't have an account?" linkTo="/signup" linkLabel="Create an account" />}
    >
      <AuthErrorBanner>{error}</AuthErrorBanner>

      {!otpMode ? (
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
          <AuthField label="Password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </AuthField>

          <button className="auth-btn-primary" type="submit" disabled={isLoading} style={{ marginTop: 6 }}>
            {isLoading ? <AuthSpinnerLabel label="Signing in…" /> : 'Sign in'}
          </button>

          <div className="auth-divider"><span className="line" /><span>or</span><span className="line" /></div>

          <button type="button" className="auth-btn-secondary" onClick={enterOtpMode}>
            Sign in with email code
          </button>

          <button
            type="button"
            className="auth-btn-secondary"
            onClick={handleGoogle}
            disabled={isLoading}
            style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
          >
            <GoogleLogo />
            Sign in with Google
          </button>
        </form>
      ) : otpStep === 'email' ? (
        <form onSubmit={handleSendOtp}>
          <AuthField label="Email address" hint="We'll send a one-time code to this address.">
            <input
              id="otp-email"
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
          <button className="auth-btn-primary" type="submit" disabled={isLoading} style={{ marginBottom: 18 }}>
            {isLoading ? <AuthSpinnerLabel label="Sending…" /> : 'Send code'}
          </button>
          <div className="auth-centered">
            <button type="button" className="auth-link-btn muted" onClick={exitOtpMode}>
              Back to password login
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <AuthField
            label="Verification code"
            hint={<>Enter the code sent to <strong style={{ color: 'var(--ink-soft)' }}>{email || 'your email'}</strong></>}
          >
            <input
              id="otp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              className="auth-input mono-code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </AuthField>
          <button
            className="auth-btn-primary"
            type="submit"
            disabled={isLoading || otpCode.length < 6}
            style={{ marginBottom: 18 }}
          >
            {isLoading ? <AuthSpinnerLabel label="Verifying…" /> : 'Verify & sign in'}
          </button>
          <div className="auth-row-between" style={{ marginBottom: 0 }}>
            <button type="button" className="auth-link-btn muted" onClick={backToEmailStep}>
              Change email
            </button>
            <button type="button" className="auth-link-btn" onClick={handleSendOtp} disabled={isLoading}>
              Resend code
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
