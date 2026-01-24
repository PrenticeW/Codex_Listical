import { Link } from 'react-router-dom';

/**
 * AccountDeletedPage
 *
 * Displays information to users whose accounts are scheduled for deletion.
 * Shown when a user with deletion_requested_at set tries to access the app.
 */
export default function AccountDeletedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Account Scheduled for Deletion
            </h1>
          </div>

          <p className="text-gray-600 mb-6">
            Your account is scheduled for deletion and will be fully removed within 30 days.
          </p>

          <p className="text-gray-600 mb-8">
            If this was a mistake, please contact{' '}
            <a
              href="mailto:support@codexlistical.com"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              support@codexlistical.com
            </a>{' '}
            within this period to cancel the deletion request.
          </p>

          <div className="border-t pt-6">
            <Link
              to="/login"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Return to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
