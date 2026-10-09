import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pushAvailable, registerPush } from '../utils/push.js';
import haptics from '../utils/haptics.js';

// Signed-in mobile app: register for push and open the right screen when a notification is tapped.
export const usePushNotifications = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!pushAvailable) return undefined;
    let cleanup = () => {};
    let cancelled = false;

    registerPush({
      onOpen: (url) => navigate(url),
      // The OS doesn't show notifications while the app is open — show a toast instead.
      onForeground: ({ title, body, data }) => {
        haptics.tap();
        toast((t) => (
          <button
            className="text-left"
            onClick={() => { toast.dismiss(t.id); if (data?.url) navigate(data.url); }}
          >
            <span className="block font-semibold">{title}</span>
            {body && <span className="block text-gray-600">{body}</span>}
          </button>
        ), { duration: 6000 });
      },
    })
      .then((fn) => { if (cancelled) fn(); else cleanup = fn; })
      .catch(() => { /* permission denied or offline — the app works without push */ });

    return () => { cancelled = true; cleanup(); };
  }, [navigate]);
};
