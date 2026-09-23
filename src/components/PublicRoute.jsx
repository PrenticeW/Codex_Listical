import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BrandLoaderScreen } from './BrandLoader';

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
    return <BrandLoaderScreen />;
  }

  // Redirect to home if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Render children if not authenticated
  return children;
}
