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
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAF5EB', padding:'48px 16px', fontFamily:"'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg" style={{ background:'var(--brand-deep)', borderRadius:12 }}>
            <span className="text-white text-2xl font-semibold">!</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Tacular hit an unexpected error. Your saved work is still on this
            device. Try reloading the page. If the issue keeps happening,
            please let us know.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3 px-4 text-sm font-semibold transition-all duration-200"
              style={{ background:'var(--brand-deep)', color:'#fff', borderRadius:8, border:'none' }}
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleReturnHome}
              className="w-full py-3 px-4 text-sm font-semibold transition-all duration-200"
              style={{ background:'transparent', border:'1px solid #e8e8e4', borderRadius:8, color:'#616161' }}
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
