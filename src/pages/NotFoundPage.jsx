import { Link } from 'react-router-dom';

/**
 * NotFoundPage
 *
 * Catch-all route for any unrecognised URL. Matches LoginPage styling so
 * the unauthenticated bounce does not feel jarring. If the visitor is
 * authenticated, the "Return home" link lands them on the System page.
 */
export default function NotFoundPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF5EB', padding: '48px 16px', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 448, width: '100%', background: '#fff', borderRadius: 12, border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 16px rgba(72,50,75,0.12)', padding: 32, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: 'var(--brand-deep)', borderRadius: 12, marginBottom: 16, boxShadow: '0 4px 12px rgba(72,50,75,0.18)' }}>
          <span style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600 }}>404</span>
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111', marginBottom: 8 }}>
          Page not found
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#616161', marginBottom: 24 }}>
          We could not find that page. It may have moved, or the link may be
          out of date.
        </p>
        <Link
          to="/"
          style={{ display: 'inline-flex', width: '100%', justifyContent: 'center', alignItems: 'center', padding: '10px 14px', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: 'var(--brand-deep)', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
