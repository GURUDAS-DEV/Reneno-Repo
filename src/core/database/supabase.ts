import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

// Client initialized with Anon Key (respects RLS)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Client initialized with Service Role Key (bypasses RLS for administrative operations & tests)
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Helper to construct Supabase client with user JWT context for RLS enforcement
export function getAuthenticatedClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
