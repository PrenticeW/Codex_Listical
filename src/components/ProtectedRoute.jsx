import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BrandLoaderScreen } from './BrandLoader';
import { supabase } from '../lib/supabase';

// User ids whose deletion status this SESSION has already confirmed clean —
// module-level so StrictMode remounts and route changes don't refetch
// (2026-10-23 slow-load work: the check ran twice per load, ~1.5s each, and
// blocked first paint behind the loader).
const _deletionCheckedIds = new Set();

/**
 * ProtectedRoute Component
 *
 * Wraps routes that require authentication.
 * Redirects to /login if user is not authenticated.
 * Redirects to /account-deleted if user has requested account deletion.
 *
 * The deletion check no longer blocks first paint (2026-10-23): it runs in
 * the background and signs the user out when it lands. Deletion is rare and
 * server-side RLS still protects the data either way — the only difference
 * is a deleted account sees the page for a moment before being signed out.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const navigate = useNavigate();

  // Background deletion check — once per user per session.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (_deletionCheckedIds.has(user.id)) return;

    let cancelled = false;
    (async () => {
      try {
        // TEMP boot timing (dev only) — remove once the slow-load cause is found.
        const __t0 = performance.now();
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('deletion_requested_at')
          .eq('id', user.id)
          .single();
        if (import.meta.env.DEV) console.warn(`[boot] deletion check: ${(performance.now() - __t0).toFixed(0)}ms`);

        if (error) {
          // Transient failure: don't cache, the next mount retries.
          console.error('Error checking deletion status:', error);
          return;
        }

        if (profile?.deletion_requested_at) {
          if (cancelled) return;
          await logout();
          navigate('/account-deleted', { replace: true });
          return;
        }
        _deletionCheckedIds.add(user.id);
      } catch (err) {
        console.error('Error checking deletion status:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, user, logout, navigate]);

  // Show loading state while checking authentication
  if (isLoading) {
    return <BrandLoaderScreen />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render children if authenticated
  return children;
}
