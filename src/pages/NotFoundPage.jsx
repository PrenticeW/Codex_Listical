import { Link } from 'react-router-dom';

/**
 * NotFoundPage
 *
 * Catch-all route for any unrecognised URL. Matches LoginPage styling so
 * the unauthenticated bounce does not feel jarring. If the visitor is
 * authenticated, the "Return home" link lands them on the System page.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-[#f2e5eb] px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-[#d5a6bd] rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-2xl font-semibold">404</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          We could not find that page. It may have moved, or the link may be
          out of date.
        </p>
        <Link
          to="/"
          className="inline-flex w-full justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-[#d5a6bd] hover:from-blue-700 hover:to-[#c494aa] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
        >
          Return to home
        </Link>
      </div>
    </div>
  );
}
