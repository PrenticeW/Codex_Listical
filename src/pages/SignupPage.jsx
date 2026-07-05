import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getAgeBlockTimestamp,
  saveAgeBlockTimestamp,
  clearAgeBlockTimestamp,
} from '../lib/ageBlockStorage';

const AGE_BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to check if user is blocked from signup attempts
function isAgeBlocked() {
  const blockData = getAgeBlockTimestamp();
  if (!blockData) return false;

  const blockTime = parseInt(blockData, 10);
  const now = Date.now();

  if (now - blockTime < AGE_BLOCK_DURATION_MS) {
    return true;
  }

  // Block expired, remove it
  clearAgeBlockTimestamp();
  return false;
}

// Helper to set the age block
function setAgeBlock() {
  saveAgeBlockTimestamp();
}

// Calculate age from date of birth
function calculateAge(year, month, day) {
  const today = new Date();
  const birthDate = new Date(year, month - 1, day);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

// Generate year options (current year - 100 to current year - 16)
// Minimum age is 16 (GDPR-K). No point offering younger years; server rejects them.
function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear - 16; year >= currentYear - 100; year--) {
    years.push(year);
  }
  return years;
}

// Generate day options based on month and year
function getDayOptions(month, year) {
  if (!month || !year) return Array.from({ length: 31 }, (_, i) => i + 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => i + 1);
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/**
 * SignupPage Component
 *
 * Basic signup form stub - Loveable will style and enhance this.
 */
export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  // When Supabase email confirmation is enabled, signup succeeds but no
  // session is returned. We show a "check your inbox" state instead of
  // navigating the user to an unauthenticated route.
  const [confirmationPendingEmail, setConfirmationPendingEmail] = useState('');

  // Check for age block on mount
  useEffect(() => {
    if (isAgeBlocked()) {
      setIsBlocked(true);
      setError('Sorry, you must be 16 or older to use Listical. Please try again later.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Check if user is blocked from signup attempts
    if (isBlocked || isAgeBlocked()) {
      setIsBlocked(true);
      setError('Sorry, you must be 16 or older to use Listical. Please try again later.');
      return;
    }

    // Validate date of birth is provided
    if (!birthMonth || !birthDay || !birthYear) {
      setError('Please enter your date of birth');
      return;
    }

    // Calculate age and validate
    const age = calculateAge(
      parseInt(birthYear, 10),
      parseInt(birthMonth, 10),
      parseInt(birthDay, 10)
    );

    if (age < 16) {
      setAgeBlock();
      setIsBlocked(true);
      setError('Sorry, you must be 16 or older to use Listical');
      return;
    }

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

    // Format DOB as YYYY-MM-DD for database
    const dateOfBirth = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    try {
      const { session, error: signupError } = await signup(
        email,
        password,
        dateOfBirth
      );

      if (signupError) {
        setError(signupError.message || 'Failed to create account');
        setIsLoading(false);
        return;
      }

      if (session) {
        // Confirmation disabled in Supabase: we have a real session, the
        // AuthContext listener will pick it up and the user is signed in.
        navigate('/');
      } else {
        // Confirmation enabled: no session yet. Show a confirmation pending
        // state on this page instead of navigating to an unauthenticated
        // route and leaving the user stranded.
        setConfirmationPendingEmail(email);
        setIsLoading(false);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  const pageStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#FAF5EB',
    padding: '48px 16px',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const cardStyle = {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e8e8e4',
    boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)',
    padding: 32,
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

  const selectStyle = {
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #e8e8e4',
    borderRadius: 8,
    color: '#111',
    fontSize: '0.875rem',
    outline: 'none',
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: 'border-box',
    background: '#fff',
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

  // Post-signup confirmation pending state.
  // Supabase email confirmation is enabled: the account was created but
  // the user still needs to click the link in their inbox before they can
  // sign in. Render an alternate view instead of stranding them on /.
  if (confirmationPendingEmail) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 448, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: 'var(--brand-deep)', borderRadius: 12, marginBottom: 16, boxShadow: '0 4px 12px rgba(72,50,75,0.18)' }}>
              <svg style={{ width: 32, height: 32, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
              Check your inbox
            </h2>
            <p style={{ color: '#616161', margin: 0 }}>
              We sent a confirmation link to <span style={{ fontWeight: 600 }}>{confirmationPendingEmail}</span>. Click the link in that email to finish creating your account.
            </p>
          </div>
          <div style={{ ...cardStyle, fontSize: '0.875rem', color: '#616161', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0 }}>
              The email should arrive within a minute or two. If you don&apos;t see it, check your spam folder.
            </p>
            <p style={{ margin: 0 }}>
              Once confirmed, you can{' '}
              <Link to="/login" style={{ fontWeight: 600, color: 'var(--brand-deep)', textDecoration: 'none' }}>
                sign in here
              </Link>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 448, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: 'var(--brand-deep)', borderRadius: 12, marginBottom: 16, boxShadow: '0 4px 12px rgba(72,50,75,0.18)' }}>
            <svg style={{ width: 32, height: 32, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111', margin: '0 0 8px' }}>
            Create Your Account
          </h2>
          <p style={{ color: '#616161', margin: 0 }}>
            Start organizing your projects with Listical GPS
          </p>
        </div>

        {/* Form Card */}
        <div style={cardStyle}>
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
                    style={{ ...inputStyle, opacity: isBlocked ? 0.5 : 1 }}
                    placeholder="you@example.com"
                    disabled={isBlocked}
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
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={{ ...inputStyle, opacity: isBlocked ? 0.5 : 1 }}
                    placeholder="Minimum 10 characters"
                    disabled={isBlocked}
                  />
                </div>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label htmlFor="confirm-password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <svg style={{ width: 20, height: 20, color: '#9E9E9E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={{ ...inputStyle, opacity: isBlocked ? 0.5 : 1 }}
                    placeholder="Confirm your password"
                    disabled={isBlocked}
                  />
                </div>
              </div>

              {/* Date of Birth Field */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Date of Birth
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {/* Month */}
                  <select
                    id="birth-month"
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    disabled={isBlocked}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={{ ...selectStyle, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'auto' }}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>

                  {/* Day */}
                  <select
                    id="birth-day"
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    disabled={isBlocked}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={{ ...selectStyle, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'auto' }}
                  >
                    <option value="">Day</option>
                    {getDayOptions(parseInt(birthMonth, 10), parseInt(birthYear, 10)).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>

                  {/* Year */}
                  <select
                    id="birth-year"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    disabled={isBlocked}
                    onFocus={(e) => { e.target.style.border = '1px solid var(--brand)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid #e8e8e4'; }}
                    style={{ ...selectStyle, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'auto' }}
                  >
                    <option value="">Year</option>
                    {getYearOptions().map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ marginTop: 4, fontSize: '0.75rem', color: '#616161' }}>You must be 16 or older to use Listical</p>
              </div>
            </div>

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={isLoading || isBlocked}
              style={{ ...primaryBtnStyle, opacity: (isLoading || isBlocked) ? 0.5 : 1, cursor: (isLoading || isBlocked) ? 'not-allowed' : 'pointer' }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin" style={{ marginLeft: -4, marginRight: 12, width: 20, height: 20, color: '#fff' }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        {/* Sign In Link */}
        <p style={{ marginTop: 24, textAlign: 'center', fontSize: '0.875rem', color: '#616161' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600, color: 'var(--brand-deep)', textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
