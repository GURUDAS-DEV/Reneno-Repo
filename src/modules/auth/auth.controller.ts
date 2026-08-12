import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { sendSuccess } from '../../core/utils/response.js';

export async function handleSignup(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.signup(req.body);
    return sendSuccess(res, result, 201);
  } catch (err) {
    return next(err);
  }
}

export async function handleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export async function handleMe(req: Request, res: Response) {
  return sendSuccess(res, { user: req.user });
}
