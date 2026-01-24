import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { DeleteAccountModal } from '../components/DeleteAccountModal';

/**
 * AccountSettingsPage Component
 *
 * User account settings page with account deletion functionality.
 */
export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">Account Settings</h1>

        {/* Account Info Section */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-500">Email</label>
              <p className="text-slate-800 font-medium">{user?.email || 'Not available'}</p>
            </div>
          </div>
        </div>

        {/* Delete Account Section */}
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Delete Account</h2>
          <p className="text-sm text-slate-600 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete my account
          </button>
        </div>
      </div>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
