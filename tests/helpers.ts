import request from 'supertest';
import { app } from '../src/app.js';
import { supabaseAdmin } from '../src/core/database/supabase.js';

export interface TestUser {
  id: string;
  email: string;
  token: string;
  role: 'SELLER' | 'CUSTOMER';
}

// Create a test user and return auth details
export async function createTestUser(
  role: 'SELLER' | 'CUSTOMER',
  suffix: string
): Promise<TestUser> {
  const email = `test_${role.toLowerCase()}_${suffix}_${Date.now()}@test.com`;
  const password = 'Test123456!';

  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password, name: `Test ${role} ${suffix}`, role });

  if (res.status !== 201) {
    throw new Error(`Failed to create ${role}: ${JSON.stringify(res.body)}`);
  }

  return {
    id: res.body.data.user.id,
    email,
    token: res.body.data.session.access_token,
    role,
  };
}

// Create a product under a seller and return product details
export async function createTestProduct(
  sellerToken: string,
  overrides: Record<string, unknown> = {}
) {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${sellerToken}`)
    .send({
      name: 'Test Product',
      description: 'A product for testing',
      price: 5000,
      category: 'electronics',
      quantity: 10,
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create product: ${JSON.stringify(res.body)}`);
  }

  return res.body.data;
}

// Cleanup test data (profiles cascade deletes everything)
export async function cleanupTestUser(userId?: string) {
  if (!userId) return;
  try {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch {
    // Ignore cleanup errors
  }
}
