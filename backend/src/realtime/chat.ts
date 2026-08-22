import type { Server } from 'socket.io';
import { verifyAccess } from '../utils/crypto.js';

export function attachChat(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') return next(new Error('Unauthorized'));
    try {
      socket.data.auth = verifyAccess(token);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as { companyId: string | null; userId: string };
    if (auth.userId) socket.join(`user:${auth.userId}`);
    socket.on('chat:join', (threadId: string) => {
      if (!auth.companyId || typeof threadId !== 'string') return;
      socket.join(`company:${auth.companyId}:thread:${threadId}`);
    });
  });
}
