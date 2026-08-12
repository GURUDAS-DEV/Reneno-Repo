import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../database/supabase.js';
import { AppError } from '../errors/app-error.js';
import { UserRole } from '../types/auth.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Missing or invalid Authorization header');
    }

    const token = header.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw AppError.unauthenticated('Invalid or expired token');
    }

    // Fetch profile to get role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw AppError.unauthenticated('User profile not found. Complete registration first.');
    }

    req.user = {
      id: user.id,
      email: user.email!,
      role: profile.role as UserRole,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    return next(err);
  }
}

// Authorizes User
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthenticated());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden(`Role '${req.user.role}' is not authorized for this action`));
    }
    return next();
  };
}
