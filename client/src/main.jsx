import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { isNative, isElectron } from './utils/platform.js';
import { initNativeShell, hideSplash } from './utils/nativeShell.js';
import { installGlobalErrorHandlers } from './utils/errorReporter.js';
import { LanguageProvider } from './i18n/index.jsx';

// Manual SW registration — vite-plugin-pwa's auto-inject has no error handling.
// When the app is accessed via a raw IP address the SSL cert doesn't cover that
// origin, so the SW script fetch throws a SecurityError.  Without a .catch()
// this becomes an unhandled rejection that crashes the React root (white screen).
// Skip service worker in Electron — the app:// custom scheme doesn't need it
// and SW caching would interfere with hot-reloaded renderer assets.
// Skip it in the Capacitor apps too — their assets ship inside the APK/IPA.
if ('serviceWorker' in navigator && !isElectron && !isNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {
        // SW unavailable (e.g. raw-IP access, no valid SSL cert) — app works fine without it.
      });
  });
}

initNativeShell();
installGlobalErrorHandlers();

const isPhone = window.matchMedia('(max-width: 639px)').matches;

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
          <LanguageProvider>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
            <Toaster
              position={isPhone ? 'top-center' : 'top-right'}
              containerStyle={{ top: 'calc(var(--safe-top) + 12px)' }}
              toastOptions={{
                duration: 4000,
                style: { fontSize: '14px' },
              }}
            />
          </AuthProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// Native apps: drop the splash screen once the first frame is on screen.
requestAnimationFrame(() => requestAnimationFrame(hideSplash));
