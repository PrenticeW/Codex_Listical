import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getAgeBlockTimestamp,
  saveAgeBlockTimestamp,
  clearAgeBlockTimestamp,
} from '../lib/ageBlockStorage';
import AuthShell, { AuthField, AuthErrorBanner, AuthSpinnerLabel, AuthFooterText } from '../components/auth/AuthShell';

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

// Generate year options (current year - 100 to current year - 18)
// Minimum age is 18. No point offering younger years; server rejects them.
function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear - 18; year >= currentYear - 100; year--) {
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
 * SignupPage
 *
 * Styled per the design handover's auth reference
 * (reference/auth-pages/auth-pages.html in ListicalVisualHandover.zip)
 * via the shared AuthShell chrome.
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
      setError('Sorry, you must be 18 or older to use Tacular. Please try again later.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Check if user is blocked from signup attempts
    if (isBlocked || isAgeBlocked()) {
      setIsBlocked(true);
      setError('Sorry, you must be 18 or older to use Tacular. Please try again later.');
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

    if (age < 18) {
      setAgeBlock();
      setIsBlocked(true);
      setError('Sorry, you must be 18 or older to use Tacular');
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

  // Post-signup confirmation pending state.
  // Supabase email confirmation is enabled: the account was created but
  // the user still needs to click the link in their inbox before they can
  // sign in. Render an alternate view instead of stranding them on /.
  if (confirmationPendingEmail) {
    return (
      <AuthShell
        eyebrow="Auth · Confirm Email"
        footer={(
          <span className="auth-footer-tray-text">
            Already confirmed?{' '}
            <Link className="auth-link-btn" to="/login">Sign in</Link>
          </span>
        )}
      >
        <div className="auth-confirm-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="auth-title">Check your inbox</h1>
        <p className="auth-subtitle">
          We sent a confirmation link to <strong style={{ color: 'var(--ink-soft)' }}>{confirmationPendingEmail}</strong>. Click it to finish creating your account.
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
          It should arrive within a minute or two — check spam if not.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Auth · Create Account"
      footer={<AuthFooterText prompt="Already have an account?" linkTo="/login" linkLabel="Sign in" />}
    >
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
            disabled={isBlocked}
          />
        </AuthField>

        <AuthField label="Password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 10 characters"
            disabled={isBlocked}
          />
        </AuthField>

        <AuthField label="Confirm password">
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            className="auth-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            disabled={isBlocked}
          />
        </AuthField>

        <AuthField label="Date of birth" hint="You must be 18 or older to use Tacular.">
          <div className="auth-dob-grid">
            <select
              id="birth-month"
              className="auth-select"
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              disabled={isBlocked}
            >
              <option value="">Month</option>
              {MONTHS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>

            <select
              id="birth-day"
              className="auth-select"
              value={birthDay}
              onChange={(e) => setBirthDay(e.target.value)}
              disabled={isBlocked}
            >
              <option value="">Day</option>
              {getDayOptions(parseInt(birthMonth, 10), parseInt(birthYear, 10)).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>

            <select
              id="birth-year"
              className="auth-select"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              disabled={isBlocked}
            >
              <option value="">Year</option>
              {getYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </AuthField>

        <button
          type="submit"
          className="auth-btn-primary"
          disabled={isLoading || isBlocked}
          style={{ marginTop: 4 }}
        >
          {isLoading ? <AuthSpinnerLabel label="Creating account…" /> : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
