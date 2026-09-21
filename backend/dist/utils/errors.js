export class AppError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export const notFound = (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);
export const emailUnverified = (message = 'Verify your email before signing in.') => new AppError(403, 'EMAIL_UNVERIFIED', message);
export const unauthorized = (message = 'Unauthorized') => new AppError(401, 'UNAUTHORIZED', message);
export const badRequest = (message, code = 'BAD_REQUEST') => new AppError(400, code, message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);
//# sourceMappingURL=errors.js.map