import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * PublicRoute Component
 *
 * Wraps routes that are only accessible when NOT authenticated (login, signup).
 * Redirects to home page if user is already authenticated.
 */
export default function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation:'spin 1s linear infinite', margin:'0 auto 16px' }}>
            <circle cx="12" cy="12" r="10" stroke="rgba(43,89,182,0.15)" strokeWidth="2.5"/>
            <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--brand-deep)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to home if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Render children if not authenticated
  return children;
}
