import { Link } from 'react-router-dom';
import AuthShell from '../components/auth/AuthShell';

/**
 * NotFoundPage
 *
 * Catch-all route for any unrecognised URL. Matches the auth pages'
 * styling so the bounce does not feel jarring, per the design handover's
 * 404 reference (reference/auth-pages/not-found.html in
 * ListicalVisualHandover.zip). If the visitor is authenticated, the
 * "Return to home" link lands them on the System page.
 */
export default function NotFoundPage() {
  return (
    <AuthShell eyebrow="Error · 404">
      <div className="auth-centered">
        <span className="auth-code-badge">404</span>
      </div>
      <h1 className="auth-title small">Page not found</h1>
      <p className="auth-subtitle">
        We couldn't find that page. It may have moved, or the link may be out of date.
      </p>
      <Link to="/" className="auth-btn-primary">Return to home</Link>
    </AuthShell>
  );
}
