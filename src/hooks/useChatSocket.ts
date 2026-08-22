import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api').replace(/\/api\/?$/, '');

/** Live chat via Socket.io. HTTP polling remains as a fallback in the chat pages. */
export function useChatSocket(threadId: string | null) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setConnected(false);
      return;
    }

    const socket: Socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    const onMessage = (payload?: { threadId?: string }) => {
      if (payload?.threadId) void qc.invalidateQueries({ queryKey: ['chat', payload.threadId] });
      else if (threadId) void qc.invalidateQueries({ queryKey: ['chat', threadId] });
      void qc.invalidateQueries({ queryKey: ['chat', 'threads'] });
    };

    socket.on('connect', () => {
      setConnected(true);
      if (threadId) socket.emit('chat:join', threadId);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('chat:message', onMessage);

    return () => {
      setConnected(false);
      socket.off('chat:message', onMessage);
      socket.disconnect();
    };
  }, [threadId, qc]);

  return connected;
}
