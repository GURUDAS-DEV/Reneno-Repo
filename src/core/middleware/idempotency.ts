import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../database/supabase.js';
import { AppError } from '../errors/app-error.js';

const IDEMPOTENCY_TTL_HOURS = 24;

function hashPayload(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export async function idempotencyGuard(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'] as string | undefined;

  if (!key) return next();

  const userId = req.user?.id;
  if (!userId) return next(AppError.unauthenticated());

  const requestHash = hashPayload(req.body);

  // Check for existing key
  const { data: existing } = await supabaseAdmin
    .from('idempotency_keys')
    .select('*')
    .eq('key', key)
    .single();

  if (existing) {
    // Verify same user
    if (existing.user_id !== userId) {
      return next(AppError.forbidden('Idempotency key belongs to another user'));
    }

    // Check TTL
    const createdAt = new Date(existing.created_at).getTime();
    const ttlMs = IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;
    if (Date.now() - createdAt > ttlMs) {
      // Expired — delete and let request through
      await supabaseAdmin.from('idempotency_keys').delete().eq('key', key);
      return next();
    }

    // Verify payload hash matches
    if (existing.request_hash !== requestHash) {
      return next(AppError.conflict('Idempotency key reused with different payload'));
    }

    // Return cached response
    return res.status(existing.response_code).json(existing.response_body);
  }

  // Store the response after it completes
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    supabaseAdmin
      .from('idempotency_keys')
      .insert({
        key,
        user_id: userId,
        request_hash: requestHash,
        response_code: res.statusCode,
        response_body: body,
      })
      .then(() => {});

    return originalJson(body);
  };

  return next();
}
