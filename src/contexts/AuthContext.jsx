import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setCurrentUserId } from '../lib/storageService';
import useAsyncHandler from '../hooks/common/useAsyncHandler';
import { supabase } from '../lib/supabase';

/**
 * AuthContext
 *
 * Manages authentication state for the application using Supabase Auth.
 *
 * Key responsibilities:
 * - Track current authentication state (logged in/out)
 * - Provide user session information
 * - Handle login/logout/signup flows
 * - Persist auth state across page refreshes
 * - Set user ID in storage service for data scoping
 * - Listen to auth state changes from Supabase
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
 * Wraps the application and provides authentication context using Supabase Auth.
 */
export function AuthProvider({ children }) {
  // Authentication state
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state on mount and listen to auth changes
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get existing session from Supabase
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
        } else if (currentSession) {
          setUser(currentSession.user);
          setSession(currentSession);
          setIsAuthenticated(true);
          setCurrentUserId(currentSession.user.id);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes (login, logout, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        console.log('Auth state changed:', event);

        if (currentSession) {
          setUser(currentSession.user);
          setSession(currentSession);
          setIsAuthenticated(true);
          setCurrentUserId(currentSession.user.id);
        } else {
          setUser(null);
          setSession(null);
          setIsAuthenticated(false);
          setCurrentUserId(null);
        }

        // Stop showing loading after initial session check
        setIsLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Core login logic (extracted from try-catch-finally wrapper)
  const loginCore = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Login error:', error);
      return { user: null, error };
    }

    // Auth state will be updated by onAuthStateChange listener
    return { user: data.user, error: null };
  }, []);

  // Core signup logic (extracted from try-catch-finally wrapper)
  // Accepts optional dateOfBirth for age verification (stored in user metadata)
  const signupCore = useCallback(async (email, password, dateOfBirth = null) => {
    const options = {
      // Redirect user to app after email confirmation
      emailRedirectTo: `${window.location.origin}/`,
    };

    // Include date_of_birth in user metadata if provided
    // This will be picked up by the handle_new_user trigger and inserted into profiles
    if (dateOfBirth) {
      options.data = {
        date_of_birth: dateOfBirth, // Format: YYYY-MM-DD
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });

    if (error) {
      console.error('Signup error:', error);
      return { user: null, error };
    }

    // Auth state will be updated by onAuthStateChange listener
    // Note: User may need to confirm email before being fully authenticated
    return { user: data.user, error: null };
  }, []);

  // Core logout logic (extracted from try-catch-finally wrapper)
  const logoutCore = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      return { error };
    }

    // Auth state will be updated by onAuthStateChange listener
    return { error: null };
  }, []);

  // Send OTP to email for passwordless login
  const sendOtpCore = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // Only allow existing users
        emailRedirectTo: undefined, // Disable magic link, use OTP code instead
      }
    });

    if (error) {
      console.error('Send OTP error:', error);
      return { error };
    }

    return { error: null };
  }, []);

  // Verify OTP code for passwordless login
  const verifyOtpCore = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });

    if (error) {
      console.error('Verify OTP error:', error);
      return { user: null, error };
    }

    // Auth state will be updated by onAuthStateChange listener
    return { user: data?.user, error: null };
  }, []);

  // Wrap async functions with loading state management (eliminates repetitive try-catch-finally)
  const login = useAsyncHandler(loginCore, setIsLoading);
  const signup = useAsyncHandler(signupCore, setIsLoading);
  const logout = useAsyncHandler(logoutCore, setIsLoading);
  // Note: sendOtp and verifyOtp are NOT wrapped with useAsyncHandler
  // because setting isLoading causes PublicRoute to show loading screen
  // and unmount LoginPage, resetting the OTP flow state
  const sendOtp = sendOtpCore;
  const verifyOtp = verifyOtpCore;

  // Reset password function
  const resetPassword = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Reset password error:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  }, []);

  // Update password function (used on reset password page)
  const updatePassword = useCallback(async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('Update password error:', error);
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error('Update password error:', error);
      return { error };
    }
  }, []);

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
    updatePassword,
    sendOtp,
    verifyOtp,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
