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
      console.log('sendOtp result:', result);

      if (result?.error) {
        setError(result.error.message || 'Failed to send code');
        setIsLoading(false);
        return;
      }

      // Move to code entry step
      console.log('Setting otpStep to code');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-[#f2e5eb] px-4 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-[#d5a6bd] rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600">
            Sign in to continue to Listical GPS
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          {!otpMode ? (
            /* Password Login Form */
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-5">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 sm:text-sm"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 sm:text-sm"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={enterOtpMode}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Sign in with email code
                </button>
                <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                  Forgot password?
                </Link>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-[#d5a6bd] hover:from-blue-700 hover:to-[#c494aa] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
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
            <form className="space-y-6" onSubmit={handleSendOtp}>
              <div>
                <label htmlFor="otp-email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 sm:text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  We'll send a code to your email
                </p>
              </div>

              {/* Send Code Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-[#d5a6bd] hover:from-blue-700 hover:to-[#c494aa] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
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
              <div className="text-center">
                <button
                  type="button"
                  onClick={exitOtpMode}
                  className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to password login
                </button>
              </div>
            </form>
          ) : (
            /* OTP Code Verification Step */
            <form className="space-y-6" onSubmit={handleVerifyOtp}>
              <div>
                <label htmlFor="otp-code" className="block text-sm font-semibold text-gray-700 mb-2">
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
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 text-center text-xl tracking-wide font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Enter code"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Enter the code sent to <strong>{email}</strong>
                </p>
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                disabled={isLoading || otpCode.length < 6}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-[#d5a6bd] hover:from-blue-700 hover:to-[#c494aa] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
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
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={backToEmailStep}
                  className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Change email
                </button>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isLoading}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sign Up Link */}
        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
