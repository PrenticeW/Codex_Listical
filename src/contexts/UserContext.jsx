import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

/**
 * UserContext
 *
 * Manages user-specific data and preferences.
 * This context sits on top of AuthContext and handles user profile data.
 *
 * Key responsibilities:
 * - Load and cache user profile data
 * - Manage user preferences
 * - Provide user-scoped data access
 * - Handle user data updates
 */

const UserContext = createContext(null);

/**
 * Hook to access user context
 * @returns {Object} User context value
 * @throws {Error} If used outside UserProvider
 */
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

/**
 * UserProvider Component
 *
 * Wraps authenticated parts of the app and provides user-specific data.
 *
 * TODO (Loveable Integration):
 * - Fetch user profile from Supabase database
 * - Implement user preferences sync
 * - Add real-time user data updates
 * - Handle user data migrations
 */
export function UserProvider({ children }) {
  const { user: authUser, isAuthenticated, isLoading: authLoading } = useAuth();

  // User profile data
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user profile when auth user changes
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated || !authUser) {
      setProfile(null);
      setPreferences(null);
      setIsLoading(false);
      return;
    }

    const loadUserData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // TODO: Replace with Supabase database query
        // Example:
        // const { data: profile, error: profileError } = await supabase
        //   .from('profiles')
        //   .select('*')
        //   .eq('id', authUser.id)
        //   .single()

        // MOCK: Simulate loading user profile
        const mockProfile = {
          id: authUser.id,
          email: authUser.email,
          full_name: null,
          avatar_url: null,
          created_at: authUser.created_at,
          updated_at: new Date().toISOString(),
        };

        // MOCK: Simulate loading user preferences
        const mockPreferences = {
          theme: 'light',
          notifications_enabled: true,
          default_view: 'planner',
        };

        setProfile(mockProfile);
        setPreferences(mockPreferences);
      } catch (err) {
        console.error('Failed to load user data:', err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [authUser, isAuthenticated, authLoading]);

  // Update user profile
  const updateProfile = async (updates) => {
    try {
      // TODO: Replace with Supabase database update
      // Example:
      // const { data, error } = await supabase
      //   .from('profiles')
      //   .update(updates)
      //   .eq('id', authUser.id)
      //   .select()
      //   .single()

      // MOCK: Simulate profile update
      setProfile(prev => ({
        ...prev,
        ...updates,
        updated_at: new Date().toISOString(),
      }));

      return { data: profile, error: null };
    } catch (err) {
      console.error('Failed to update profile:', err);
      return { data: null, error: err };
    }
  };

  // Update user preferences
  const updatePreferences = async (updates) => {
    try {
      // TODO: Replace with Supabase database update or localStorage
      // Preferences might be stored in:
      // 1. Database for cross-device sync
      // 2. localStorage for local-only preferences

      // MOCK: Simulate preferences update
      setPreferences(prev => ({
        ...prev,
        ...updates,
      }));

      return { data: preferences, error: null };
    } catch (err) {
      console.error('Failed to update preferences:', err);
      return { data: null, error: err };
    }
  };

  // Get user ID for scoping data
  const getUserId = () => {
    return authUser?.id || null;
  };

  // Check if migration is needed for this user
  const needsUserMigration = () => {
    // TODO: Implement migration status check from database
    // Example:
    // const { data } = await supabase
    //   .from('user_metadata')
    //   .select('migration_completed')
    //   .eq('user_id', authUser.id)
    //   .single()

    return false; // MOCK: Assume no migration needed
  };

  const value = {
    // User data
    profile,
    preferences,
    userId: getUserId(),

    // Loading states
    isLoading,
    error,

    // Methods
    updateProfile,
    updatePreferences,
    getUserId,
    needsUserMigration,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export default UserContext;
