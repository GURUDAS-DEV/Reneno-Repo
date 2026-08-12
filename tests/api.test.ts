import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestUser, createTestProduct, cleanupTestUser, TestUser } from './helpers.js';

let sellerA: TestUser;
let sellerB: TestUser;
let customer: TestUser;
let productBySellerA: any;

beforeAll(async () => {
  sellerA = await createTestUser('SELLER', 'A');
  sellerB = await createTestUser('SELLER', 'B');
  customer = await createTestUser('CUSTOMER', 'C');
});

afterAll(async () => {
  await cleanupTestUser(sellerA.id);
  await cleanupTestUser(sellerB.id);
  await cleanupTestUser(customer.id);
});

// =============================================
// TEST 1: Seller A creates a product (Success)
// =============================================
describe('Test 1: Seller creates a product', () => {
  it('should allow Seller A to create a product successfully', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${sellerA.token}`)
      .send({
        name: 'Wireless Headphones',
        description: 'High quality wireless headphones',
        price: 15000,
        category: 'electronics',
        quantity: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('Wireless Headphones');
    expect(res.body.data.price).toBe(15000);
    expect(res.body.data.quantity).toBe(5);

    productBySellerA = res.body.data;
  });
});

// =============================================
// TEST 2: Seller B cannot modify Seller A's product (403 / RLS)
// =============================================
describe('Test 2: Cross-seller isolation', () => {
  it('should deny Seller B from updating Seller A product', async () => {
    const res = await request(app)
      .patch(`/api/products/${productBySellerA.id}`)
      .set('Authorization', `Bearer ${sellerB.token}`)
      .send({ name: 'Hacked Product Name' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should deny Seller B from deleting Seller A product', async () => {
    const res = await request(app)
      .delete(`/api/products/${productBySellerA.id}`)
      .set('Authorization', `Bearer ${sellerB.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// =============================================
// TEST 3: Customer orders an available product (Success)
// =============================================
describe('Test 3: Customer places a valid order', () => {
  it('should allow customer to order an available product', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        items: [{ product_id: productBySellerA.id, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('order_id');
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(Number(res.body.data.total_amount)).toBe(15000);
  });
});

// =============================================
// TEST 4: Customer orders more than available stock (409)
// =============================================
describe('Test 4: Insufficient stock rejection', () => {
  it('should reject order when quantity exceeds available stock', async () => {
    // Stock was 5, we used 1 in Test 3 → 4 remaining. Request 100.
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        items: [{ product_id: productBySellerA.id, quantity: 100 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toContain('Insufficient stock');
  });
});

// =============================================
// TEST 5: Race Condition — Two simultaneous orders for last item
// Exactly one should succeed, the other gets 409
// =============================================
describe('Test 5: Concurrent stock race condition', () => {
  let raceProduct: any;

  beforeAll(async () => {
    // Create product with exactly 1 unit in stock
    raceProduct = await createTestProduct(sellerA.token, {
      name: 'Limited Edition Item',
      quantity: 1,
      price: 25000,
    });
  });

  it('should allow exactly one order to succeed when two race for the last item', async () => {
    // Fire two simultaneous order requests via Promise.all
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ items: [{ product_id: raceProduct.id, quantity: 1 }] }),
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ items: [{ product_id: raceProduct.id, quantity: 1 }] }),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 201 (success) and one 409 (conflict)
    expect(statuses).toEqual([201, 409]);

    // The successful one should have a valid order
    const success = res1.status === 201 ? res1 : res2;
    expect(success.body.data).toHaveProperty('order_id');
    expect(success.body.data.status).toBe('CONFIRMED');

    // The failed one should have the correct error
    const failed = res1.status === 409 ? res1 : res2;
    expect(failed.body.error.code).toBe('CONFLICT');
    expect(failed.body.error.message).toContain('Insufficient stock');
  });
});
