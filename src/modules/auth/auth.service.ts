import { supabaseAdmin, supabase } from '../../core/database/supabase.js';
import { AppError } from '../../core/errors/app-error.js';
import { SignupInput, LoginInput } from './auth.schema.js';

export async function signup(input: SignupInput) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes('already')) {
      throw AppError.conflict('A user with this email already exists');
    }
    throw AppError.internal(authError.message);
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      role: input.role,
      name: input.name,
      phone: input.phone || null,
    });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw AppError.internal(`Failed to create user profile: ${profileError.message}`);
  }

  // Auto-create store for sellers
  if (input.role === 'SELLER') {
    const { error: storeError } = await supabaseAdmin
      .from('stores')
      .insert({
        owner_id: authData.user.id,
        name: `${input.name}'s Store`,
        business_name: `${input.name}'s Business`,
      });

    if (storeError) {
      throw AppError.internal('Failed to create store for seller');
    }
  }

  // Sign in using anon client to get proper JWT tokens
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (signInError) {
    throw AppError.internal('Account created but sign-in failed');
  }

  return {
    user: {
      id: authData.user.id,
      email: input.email,
      name: input.name,
      role: input.role,
    },
    session: {
      access_token: session.session!.access_token,
      refresh_token: session.session!.refresh_token,
    },
  };
}

export async function login(input: LoginInput) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    throw AppError.unauthenticated('Invalid email or password');
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, name')
    .eq('id', data.user.id)
    .single();

  return {
    user: {
      id: data.user.id,
      email: data.user.email!,
      name: profile?.name,
      role: profile?.role,
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}
