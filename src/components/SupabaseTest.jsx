import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * SupabaseTest Component
 *
 * Simple test component to verify Supabase connection and auth flow.
 * Shows connection status, auth state, and profile data.
 */
export default function SupabaseTest() {
  const [status, setStatus] = useState('Testing connection...');
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function testSupabase() {
      try {
        setLoading(true);
        setError(null);

        // Test 1: Check Supabase client initialization
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }
        setStatus('✅ Supabase client initialized');

        // Test 2: Check auth session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session) {
          setAuthUser(session.user);
          setStatus('✅ User authenticated');

          // Test 3: Fetch user profile from database
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileError) {
            // If profile doesn't exist, that's okay for this test
            if (profileError.code === 'PGRST116') {
              setStatus('✅ Auth working, but no profile found (run migration)');
            } else {
              throw profileError;
            }
          } else {
            setProfile(profileData);
            setStatus('✅ Full connection verified! Profile loaded.');
          }
        } else {
          setStatus('⚠️ No active session (user not logged in)');
        }

      } catch (err) {
        console.error('Supabase test error:', err);
        setError(err.message || 'Unknown error');
        setStatus('❌ Connection test failed');
      } finally {
        setLoading(false);
      }
    }

    testSupabase();
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '20px',
      backgroundColor: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      maxWidth: '400px',
      zIndex: 9999,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
        🧪 Supabase Connection Test
      </h3>

      <div style={{ marginBottom: '12px' }}>
        <strong>Status:</strong>
        <div style={{
          marginTop: '4px',
          padding: '8px',
          backgroundColor: error ? '#fee2e2' : '#f0fdf4',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          {loading ? '⏳ Testing...' : status}
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '12px',
          padding: '8px',
          backgroundColor: '#fee2e2',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#dc2626'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {authUser && (
        <div style={{ marginBottom: '12px', fontSize: '14px' }}>
          <strong>Auth User:</strong>
          <div style={{
            marginTop: '4px',
            padding: '8px',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div><strong>ID:</strong> {authUser.id.slice(0, 8)}...</div>
            <div><strong>Email:</strong> {authUser.email}</div>
          </div>
        </div>
      )}

      {profile && (
        <div style={{ marginBottom: '12px', fontSize: '14px' }}>
          <strong>Profile Data:</strong>
          <div style={{
            marginTop: '4px',
            padding: '8px',
            backgroundColor: '#f0fdf4',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div><strong>Email:</strong> {profile.email}</div>
            <div><strong>Name:</strong> {profile.full_name || 'Not set'}</div>
            <div><strong>Created:</strong> {new Date(profile.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      )}

      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e5e7eb',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <div>🔗 <strong>URL:</strong> {import.meta.env.VITE_SUPABASE_URL?.slice(0, 30)}...</div>
        <div>🔑 <strong>Key:</strong> {import.meta.env.VITE_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing'}</div>
      </div>

      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '12px',
          width: '100%',
          padding: '8px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
      >
        🔄 Refresh Test
      </button>
    </div>
  );
}
