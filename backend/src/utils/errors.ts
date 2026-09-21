export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (entity = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${entity} not found`);

export const forbidden = (message = 'Forbidden') =>
  new AppError(403, 'FORBIDDEN', message);

export const emailUnverified = (message = 'Verify your email before signing in.') =>
  new AppError(403, 'EMAIL_UNVERIFIED', message);

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  new AppError(400, code, message);

export const conflict = (message: string) =>
  new AppError(409, 'CONFLICT', message);
