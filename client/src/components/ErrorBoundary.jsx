import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log to console so it's visible in Electron DevTools / browser console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    // Clear the error state so React re-mounts the tree
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isElectron = !!window.electronAPI?.isElectron;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg border border-red-100 max-w-md w-full p-8 space-y-5 text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
            <p className="text-sm text-gray-500">
              An unexpected error occurred. Your data is safe — tap Reload to continue.
            </p>
          </div>

          {/* Error detail — collapsed by default so staff aren't confused */}
          <details className="text-left">
            <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600">
              Show error details
            </summary>
            <pre className="mt-2 text-[11px] text-red-600 bg-red-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {error.message}
            </pre>
          </details>

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={this.handleReload}
              className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm transition-colors">
              Reload
            </button>
            {isElectron && (
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm transition-colors">
                Full restart
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
