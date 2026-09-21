import { verifyAccess } from '../utils/crypto.js';
export function attachChat(io) {
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token || typeof token !== 'string')
            return next(new Error('Unauthorized'));
        try {
            socket.data.auth = verifyAccess(token);
            next();
        }
        catch {
            next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const auth = socket.data.auth;
        if (auth.userId)
            socket.join(`user:${auth.userId}`);
        socket.on('chat:join', (threadId) => {
            if (!auth.companyId || typeof threadId !== 'string')
                return;
            socket.join(`company:${auth.companyId}:thread:${threadId}`);
        });
    });
}
//# sourceMappingURL=chat.js.map