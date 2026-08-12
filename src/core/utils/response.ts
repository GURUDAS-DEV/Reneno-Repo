import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: Record<string, unknown>) {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}
