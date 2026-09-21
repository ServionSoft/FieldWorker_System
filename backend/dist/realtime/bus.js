let io = null;
export function setIo(server) {
    io = server;
}
export function getIo() {
    return io;
}
export function emitToUser(userId, event, payload) {
    io?.to(`user:${userId}`).emit(event, payload);
}
//# sourceMappingURL=bus.js.map