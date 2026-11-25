import { useEffect, useRef } from 'react';
import { API_URL, invalidateApiCache } from './api';

export type RealtimeTopic = 'bookings' | 'seats' | 'books' | 'announcements' | 'settings';

type Listener = (topics: RealtimeTopic[]) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function ensureConnected() {
  if (typeof window === 'undefined' || source) return;

  const es = new EventSource(`${API_URL}/api/events`);
  source = es;

  es.addEventListener('update', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { topics?: RealtimeTopic[] };
      const topics = payload.topics ?? [];
      if (topics.length === 0) return;

      // Immediately clear stale in-memory SWR cache entries for changed topics
      if (topics.includes('bookings') || topics.includes('seats')) {
        invalidateApiCache('/api/seats');
        invalidateApiCache('/api/bookings');
        invalidateApiCache('/api/dashboard');
        invalidateApiCache('/api/admin');
      }
      if (topics.includes('books')) {
        invalidateApiCache('/api/books');
        invalidateApiCache('/api/dashboard');
        invalidateApiCache('/api/admin');
      }
      if (topics.includes('announcements') || topics.includes('settings')) {
        invalidateApiCache('/api/dashboard');
        invalidateApiCache('/api/admin');
      }

      for (const fn of listeners) {
        fn(topics);
      }
    } catch {
      // ignore malformed payloads
    }
  });

  es.onerror = () => {
    es.close();
    source = null;
    if (listeners.size > 0 && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        ensureConnected();
      }, 2500);
    }
  };
}

/**
 * Subscribes a React component to live server-pushed updates for the given topics.
 * Fires `onUpdate` immediately whenever any user or admin mutates relevant data.
 */
export function useRealtime(topics: RealtimeTopic[], onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const topicsKey = topics.join(',');

  useEffect(() => {
    const watched = new Set(topicsKey.split(',') as RealtimeTopic[]);
    const handler: Listener = (incoming) => {
      if (incoming.some((t) => watched.has(t))) {
        onUpdateRef.current();
      }
    };

    listeners.add(handler);
    ensureConnected();

    return () => {
      listeners.delete(handler);
    };
  }, [topicsKey]);
}
