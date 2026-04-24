import { Component } from 'react';

/**
 * ErrorBoundary
 *
 * Catches unhandled render-time errors anywhere below it in the tree and
 * shows a safe fallback instead of an unstyled white screen. Intended to
 * wrap the entire router. Recovery is manual (reload) because we cannot
 * know which state caused the error.
 *
 * Error-logging hook is deliberately minimal: console.error for now so
 * Vercel's browser console capture still records it. Replace the
 * logError call with Sentry/LogRocket/etc. once observability lands.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    logError(error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReturnHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-[#f2e5eb] px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-[#d5a6bd] rounded-2xl mb-4 shadow-lg">
            <span className="text-white text-2xl font-semibold">!</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Listical hit an unexpected error. Your saved work is still on this
            device. Try reloading the page. If the issue keeps happening,
            please let us know.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-[#d5a6bd] hover:from-blue-700 hover:to-[#c494aa] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleReturnHome}
              className="w-full py-3 px-4 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
            >
              Return to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function logError(error, info) {
  console.error('[ErrorBoundary]', error, info?.componentStack);
}

export default ErrorBoundary;
