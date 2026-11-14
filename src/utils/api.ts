import { useEffect, useRef, useState } from 'react';
import type { GameSessionView } from '../shared/types';

const TOKEN_STORAGE_KEY = 't30_mosque_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

export async function apiFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `خطأ في الخادم (${res.status})`);
  }
  return data as T;
}

export function useSessionSocket(
  code: string | null,
  role: 'host' | 'audience' | 'player',
  onUpdate: (session: GameSessionView) => void,
  authProfileId?: string
) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!code) return;
    let closedByUser = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closedByUser) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getAuthToken() || '';
      const url = `${proto}//${window.location.host}/ws?code=${encodeURIComponent(code)}&role=${role}${role === 'host' && token ? '&token=' + encodeURIComponent(token) : ''}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setReconnecting(false);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as { type: string; payload?: GameSessionView };
          if (msg.type === 'session:sync' && msg.payload) {
            onUpdateRef.current(msg.payload);
          }
        } catch {
          // Ignore invalid packet
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByUser) {
          setReconnecting(true);
          const delay = Math.min(5000, 600 * Math.pow(1.5, attempt++));
          retryTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [code, role, authProfileId]);

  return { connected, reconnecting };
}
