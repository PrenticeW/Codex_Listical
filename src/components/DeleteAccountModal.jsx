import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import { requestAccountDeletion } from '../lib/api/accountDeletion';

/**
 * DeleteAccountModal Component
 *
 * Confirmation modal for account deletion with password verification.
 */
export function DeleteAccountModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError('');
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await requestAccountDeletion(password);

      if (result.success) {
        navigate('/account-deleted');
      } else {
        if (result.error === 'Invalid password') {
          setError('The password you entered is incorrect. Please try again.');
        } else if (result.error === 'Too many attempts. Please try again later.') {
          setError('Too many failed attempts. Please wait a few minutes and try again.');
        } else if (result.error === 'Not authenticated') {
          setError('Your session has expired. Please log in again.');
        } else {
          setError(result.error || 'An error occurred. Please try again.');
        }
      }
    } catch {
      setError('A network error occurred. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Delete Account</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="flex flex-col gap-4">
            {/* Warning */}
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-semibold mb-2">This action is permanent</p>
                <p>Deleting your account will remove:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Your profile and account information</li>
                  <li>All saved lists and goals</li>
                  <li>Your preferences and settings</li>
                </ul>
              </div>
            </div>

            {/* Retention notice */}
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="font-medium text-slate-700 mb-2">What we retain:</p>
              <p>
                Payment records (if applicable) are retained for 6 years for legal and tax compliance purposes.
              </p>
            </div>

            {/* Grace period notice */}
            <div className="text-sm text-slate-600 bg-amber-50 rounded-lg p-4 border border-amber-200">
              <p className="font-medium text-amber-800 mb-1">30-day grace period</p>
              <p className="text-amber-700">
                You have 30 days to cancel your deletion request by contacting support. After this period, your data will be permanently deleted.
              </p>
            </div>

            {/* Password input */}
            <div>
              <label htmlFor="delete-password" className="block text-sm font-semibold text-slate-700 mb-2">
                Enter your password to confirm
              </label>
              <input
                ref={inputRef}
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                disabled={isLoading}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
                placeholder="Enter your password..."
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || !password}
            className="px-6 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Permanently Delete Account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
