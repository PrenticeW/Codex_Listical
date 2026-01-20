import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestAccountDeletion } from '../lib/api/accountDeletion';
import { useAuth } from '../contexts/AuthContext';

/**
 * TEMPORARY TEST PAGE - Delete after testing
 *
 * Test the account deletion flow:
 * 1. Enter your password
 * 2. Click "Test Delete Account"
 * 3. Check the result shown on screen
 */
export default function TestDeleteAccountPage() {
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleTest = async () => {
    if (!password) {
      setResult({ success: false, error: 'Please enter your password' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await requestAccountDeletion(password);
      setResult(response);

      if (response.success) {
        // Wait a moment then redirect to login
        setTimeout(() => navigate('/login'), 3000);
      }
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-red-600 mb-2">
          Test Account Deletion
        </h1>
        <p className="text-slate-600 mb-6 text-sm">
          This is a test page. Enter your password to test the deletion flow.
        </p>

        {user && (
          <p className="text-sm text-slate-500 mb-4">
            Logged in as: {user.email}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Testing...' : 'Test Delete Account'}
          </button>
        </div>

        {result && (
          <div
            className={`mt-6 p-4 rounded-md ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <p className="font-semibold mb-2">
              {result.success ? 'Success!' : 'Error'}
            </p>
            <pre className="text-sm whitespace-pre-wrap break-words">
              {JSON.stringify(result, null, 2)}
            </pre>
            {result.success && (
              <p className="text-sm text-green-600 mt-2">
                Redirecting to login...
              </p>
            )}
          </div>
        )}

        <div className="mt-6 text-xs text-slate-400">
          <p className="font-semibold mb-1">Expected results:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Wrong password: 403 error</li>
            <li>Correct password: Success + signed out</li>
            <li>4+ attempts: 429 rate limit error</li>
          </ul>
        </div>

        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm text-slate-500 hover:text-slate-700"
        >
          Back to home
        </button>
      </div>
    </div>
  );
}
