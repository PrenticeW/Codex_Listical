import { Link } from 'react-router-dom';
import AuthShell from '../components/auth/AuthShell';

/**
 * AccountDeletedPage
 *
 * Displays information to users whose accounts are scheduled for deletion.
 * Shown when a user with deletion_requested_at set tries to access the app.
 * Styled per the design handover's account-deleted reference
 * (reference/auth-pages/account-deleted.html in ListicalVisualHandover.zip).
 */
export default function AccountDeletedPage() {
  return (
    <AuthShell eyebrow="Account · Deletion Pending">
      <div className="auth-icon-ring">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="auth-title small">Account scheduled for deletion</h1>
      <p className="auth-subtitle">
        Your account is scheduled for deletion and will be fully removed within 30 days.
      </p>
      <p className="auth-subtitle">
        If this was a mistake, contact <a href="mailto:hello@tacular.app">hello@tacular.app</a> within this period to cancel the deletion request.
      </p>
      <div className="auth-rule" />
      <Link to="/login" className="auth-link-btn muted">Return to login</Link>
    </AuthShell>
  );
}
