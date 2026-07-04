import { Link } from 'react-router-dom';

/**
 * AccountDeletedPage
 *
 * Displays information to users whose accounts are scheduled for deletion.
 * Shown when a user with deletion_requested_at set tries to access the app.
 */
export default function AccountDeletedPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FAF5EB', fontFamily: "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 448, width: '100%', margin: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)', padding: 32, textAlign: 'center' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, background: '#f5f5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg
                style={{ width: 32, height: 32, color: '#9E9E9E' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111', marginBottom: 8 }}>
              Account Scheduled for Deletion
            </h1>
          </div>

          <p style={{ color: '#616161', marginBottom: 24 }}>
            Your account is scheduled for deletion and will be fully removed within 30 days.
          </p>

          <p style={{ color: '#616161', marginBottom: 32 }}>
            If this was a mistake, please contact{' '}
            <a
              href="mailto:support@codexlistical.com"
              style={{ color: 'var(--brand-deep)', textDecoration: 'underline' }}
            >
              support@codexlistical.com
            </a>{' '}
            within this period to cancel the deletion request.
          </p>

          <div style={{ borderTop: '1px solid #e8e8e4', paddingTop: 24 }}>
            <Link
              to="/login"
              style={{ fontSize: '0.875rem', color: '#9E9E9E', textDecoration: 'none' }}
            >
              Return to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
