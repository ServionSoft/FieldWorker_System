import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api').replace(/\/api\/?$/, '');

export function useNotificationSocket(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();
    if (!enabled || !token) return;

    const socket: Socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification:new', () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, qc]);
}
