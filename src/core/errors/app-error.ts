export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthenticated(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'Access denied') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static internal(message = 'Internal server error') {
    return new AppError(500, 'INTERNAL_SERVER_ERROR', message);
  }
}
