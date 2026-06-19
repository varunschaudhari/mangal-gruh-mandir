import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// Manual SW registration — vite-plugin-pwa's auto-inject has no error handling.
// When the app is accessed via a raw IP address the SSL cert doesn't cover that
// origin, so the SW script fetch throws a SecurityError.  Without a .catch()
// this becomes an unhandled rejection that crashes the React root (white screen).
// Skip service worker in Electron — the app:// custom scheme doesn't need it
// and SW caching would interfere with hot-reloaded renderer assets.
if ('serviceWorker' in navigator && !window.electronAPI?.isElectron) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {
        // SW unavailable (e.g. raw-IP access, no valid SSL cert) — app works fine without it.
      });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: { fontSize: '14px' },
              }}
            />
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
