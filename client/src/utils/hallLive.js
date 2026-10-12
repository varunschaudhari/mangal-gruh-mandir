import { useEffect, useRef, useState } from 'react';
import api from '../api/axios.js';
import { serverUrl } from './platform.js';

// Live scans for the hall screen from /bookings/hall-events (server-sent events). Read with
// fetch rather than EventSource so the sign-in token can be sent. Reconnects by itself (with a
// growing pause); after a 401 it lets the API client refresh the token first.
// Returns 'live' | 'connecting' | 'off' (several failures in a row — the screen then polls).

export function useHallEvents(onEvent, { enabled = true } = {}) {
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let ctrl = null;
    let timer = null;
    let failures = 0;

    const connect = async () => {
      if (stopped) return;
      ctrl = new AbortController();
      try {
        const res = await fetch(serverUrl('/api/bookings/hall-events'), {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`, Accept: 'text/event-stream' },
          signal: ctrl.signal, cache: 'no-store',
        });
        if (res.status === 401) { await api.get('/auth/me').catch(() => {}); throw new Error('unauthorised'); }
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        failures = 0;
        setStatus('live');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
            if (data) { try { handler.current(JSON.parse(data)); } catch { /* not an event */ } }
          }
        }
        throw new Error('closed');
      } catch (err) {
        if (stopped || err.name === 'AbortError') return;
        failures += 1;
        setStatus(failures >= 3 ? 'off' : 'connecting');
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      }
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); ctrl?.abort(); };
  }, [enabled]);

  return status;
}
