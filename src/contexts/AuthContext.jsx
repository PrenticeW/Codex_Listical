import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setCurrentUserId } from '../lib/storageService';
import useAsyncHandler from '../hooks/common/useAsyncHandler';

/**
 * AuthContext
 *
 * Manages authentication state for the application.
 * This is a skeleton implementation - Loveable will integrate with Supabase Auth.
 *
 * Key responsibilities:
 * - Track current authentication state (logged in/out)
 * - Provide user session information
 * - Handle login/logout flows
 * - Persist auth state across page refreshes
 * - Set user ID in storage service for data scoping
 */

const AuthContext = createContext(null);

/**
 * Hook to access auth context
 * @returns {Object} Auth context value
 * @throws {Error} If used outside AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * AuthProvider Component
 *
 * Wraps the application and provides authentication context.
 *
 * TODO (Loveable Integration):
 * - Replace mock auth with Supabase Auth
 * - Add proper session management
 * - Implement token refresh logic
 * - Add social auth providers if needed
 */
export function AuthProvider({ children }) {
  // Authentication state
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state on mount
  useEffect(() => {
    // TODO: Replace with Supabase session check
    // Example: const { data: { session } } = await supabase.auth.getSession()

    const initializeAuth = async () => {
      try {
        // MOCK: For now, simulate checking for existing session
        // In production, this will check Supabase session
        const mockSession = localStorage.getItem('mock-session');

        if (mockSession) {
          const mockUser = JSON.parse(mockSession);
          setUser(mockUser);
          setSession({ user: mockUser });
          setIsAuthenticated(true);
          // Set user ID in storage service for data scoping
          setCurrentUserId(mockUser.id);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Core login logic (extracted from try-catch-finally wrapper)
  const loginCore = useCallback(async (email, password) => {
    // TODO: Replace with Supabase auth
    // Example: const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    // MOCK: Simulate successful login
    const mockUser = {
      id: 'mock-user-id-' + Date.now(),
      email: email,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem('mock-session', JSON.stringify(mockUser));

    setUser(mockUser);
    setSession({ user: mockUser });
    setIsAuthenticated(true);

    // Set user ID in storage service for data scoping
    setCurrentUserId(mockUser.id);

    return { user: mockUser, error: null };
  }, []);

  // Core signup logic (extracted from try-catch-finally wrapper)
  const signupCore = useCallback(async (email, password) => {
    // TODO: Replace with Supabase auth
    // Example: const { data, error } = await supabase.auth.signUp({ email, password })

    // MOCK: Simulate successful signup
    const mockUser = {
      id: 'mock-user-id-' + Date.now(),
      email: email,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem('mock-session', JSON.stringify(mockUser));

    setUser(mockUser);
    setSession({ user: mockUser });
    setIsAuthenticated(true);

    // Set user ID in storage service for data scoping
    setCurrentUserId(mockUser.id);

    return { user: mockUser, error: null };
  }, []);

  // Core logout logic (extracted from try-catch-finally wrapper)
  const logoutCore = useCallback(async () => {
    // TODO: Replace with Supabase auth
    // Example: const { error } = await supabase.auth.signOut()

    // MOCK: Clear session
    localStorage.removeItem('mock-session');

    setUser(null);
    setSession(null);
    setIsAuthenticated(false);

    // Clear user ID from storage service
    setCurrentUserId(null);

    return { error: null };
  }, []);

  // Wrap async functions with loading state management (eliminates repetitive try-catch-finally)
  const login = useAsyncHandler(loginCore, setIsLoading);
  const signup = useAsyncHandler(signupCore, setIsLoading);
  const logout = useAsyncHandler(logoutCore, setIsLoading);

  // Reset password function (mock - to be replaced by Loveable)
  const resetPassword = async (email) => {
    try {
      // TODO: Replace with Supabase auth
      // Example: const { error } = await supabase.auth.resetPasswordForEmail(email)

      console.log('Password reset requested for:', email);
      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  };

  const value = {
    // State
    user,
    session,
    isLoading,
    isAuthenticated,

    // Methods
    login,
    signup,
    logout,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
