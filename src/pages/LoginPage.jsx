import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * LoginPage Component
 *
 * Basic login form stub - Loveable will style and enhance this.
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
            <svg className="w-8 h-8" style={{ width: 32, height: 32, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111', marginBottom: 8, margin: '0 0 8px' }}>
            Welcome Back
          </h2>
          <p style={{ color: '#616161', margin: 0 }}>
            Sign in to continue to Listical GPS
          </p>
        </div>

        {/* Form Card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)', padding: 32 }}>
          {/* Error Display */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <svg style={{ width: 20, height: 20, color: '#c0392b', marginRight: 8, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#c0392b', margin: 0 }}>{error}</p>
              </div>
            </div>
          )}

          {!otpMode ? (
            /* Password Login Form */
            <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }} onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

                {/* Password Field */}
                <div>
                  <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Password
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
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                      onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                      style={inputStyle}
                      placeholder="Enter your password"
                    />
                  </div>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={enterOtpMode}
                  style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-deep)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  Sign in with email code
                </button>
                <Link to="/forgot-password" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-deep)', textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>

              {/* Sign In Button */}
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
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          ) : otpStep === 'email' ? (
            /* OTP Email Step */
            <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }} onSubmit={handleSendOtp}>
              <div>
                <label htmlFor="otp-email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <svg style={{ width: 20, height: 20, color: '#9E9E9E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="otp-email"
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
                <p style={{ marginTop: 8, fontSize: '0.875rem', color: '#616161' }}>
                  We'll send a code to your email
                </p>
              </div>

              {/* Send Code Button */}
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
                    Sending code...
                  </>
                ) : (
                  'Send Code'
                )}
              </button>

              {/* Back to Password Link */}
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={exitOtpMode}
                  style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: '#616161', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  <svg style={{ width: 16, height: 16, marginRight: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to password login
                </button>
              </div>
            </form>
          ) : (
            /* OTP Code Verification Step */
            <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }} onSubmit={handleVerifyOtp}>
              <div>
                <label htmlFor="otp-code" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Verification Code
                </label>
                <input
                  id="otp-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                  onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1px solid #e8e8e4', borderRadius: 8, color: '#111', fontSize: '1.25rem', textAlign: 'center', letterSpacing: '0.1em', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Enter code"
                />
                <p style={{ marginTop: 8, fontSize: '0.875rem', color: '#616161' }}>
                  Enter the code sent to <strong>{email}</strong>
                </p>
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                disabled={isLoading || otpCode.length < 6}
                style={{ ...primaryBtnStyle, opacity: (isLoading || otpCode.length < 6) ? 0.5 : 1, cursor: (isLoading || otpCode.length < 6) ? 'not-allowed' : 'pointer' }}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin" style={{ marginLeft: -4, marginRight: 12, width: 20, height: 20, color: '#fff' }} fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              {/* Resend / Back Links */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={backToEmailStep}
                  style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.875rem', fontWeight: 500, color: '#616161', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  <svg style={{ width: 16, height: 16, marginRight: 8 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isLoading}
                  style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--brand-deep)', background: 'none', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', padding: 0, opacity: isLoading ? 0.5 : 1, fontFamily: 'inherit' }}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sign Up Link */}
        <p style={{ marginTop: 24, textAlign: 'center', fontSize: '0.875rem', color: '#616161' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ fontWeight: 600, color: 'var(--brand-deep)', textDecoration: 'none' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
