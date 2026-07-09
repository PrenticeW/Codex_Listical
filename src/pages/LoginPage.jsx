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
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, sendOtp, verifyOtp } = useAuth();
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
