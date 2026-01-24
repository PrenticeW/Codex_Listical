import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * ProtectedRoute Component
 *
 * Wraps routes that require authentication.
 * Redirects to /login if user is not authenticated.
 * Redirects to /account-deleted if user has requested account deletion.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [isDeletionPending, setIsDeletionPending] = useState(false);
  const [isCheckingDeletion, setIsCheckingDeletion] = useState(true);

  // Check if user has requested account deletion
  useEffect(() => {
    const checkDeletionStatus = async () => {
      if (!isAuthenticated || !user) {
        setIsCheckingDeletion(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('deletion_requested_at')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error checking deletion status:', error);
          setIsCheckingDeletion(false);
          return;
        }

        if (profile?.deletion_requested_at) {
          // User has requested deletion - sign them out and redirect
          setIsDeletionPending(true);
          await logout();
        }
      } catch (err) {
        console.error('Error checking deletion status:', err);
      } finally {
        setIsCheckingDeletion(false);
      }
    };

    if (!isLoading) {
      checkDeletionStatus();
    }
  }, [isAuthenticated, isLoading, user, logout]);

  // Show loading state while checking authentication or deletion status
  if (isLoading || isCheckingDeletion) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to account-deleted page if deletion is pending
  if (isDeletionPending) {
    return <Navigate to="/account-deleted" replace />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render children if authenticated and not pending deletion
  return children;
}
