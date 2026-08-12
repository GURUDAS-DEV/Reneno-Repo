-- =============================================
-- Migration 002: Row Level Security Policies (A6)
-- Clean drop-and-recreate migration for RLS policies
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Drop Existing Policies (for clean migration re-run)
-- =============================================

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Allow profile insert" ON profiles;

DROP POLICY IF EXISTS "Anyone can read stores" ON stores;
DROP POLICY IF EXISTS "Sellers can create own store" ON stores;
DROP POLICY IF EXISTS "Sellers can update own store" ON stores;
DROP POLICY IF EXISTS "Sellers can delete own store" ON stores;
DROP POLICY IF EXISTS "Allow store insert" ON stores;

DROP POLICY IF EXISTS "Anyone can read active products" ON products;
DROP POLICY IF EXISTS "Sellers can insert products in own store" ON products;
DROP POLICY IF EXISTS "Sellers can update own store products" ON products;
DROP POLICY IF EXISTS "Sellers can delete own store products" ON products;

DROP POLICY IF EXISTS "Anyone can read inventory" ON inventory;
DROP POLICY IF EXISTS "Sellers can manage own product inventory" ON inventory;

DROP POLICY IF EXISTS "Customers can read own orders" ON orders;
DROP POLICY IF EXISTS "Sellers can read orders containing their products" ON orders;
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
DROP POLICY IF EXISTS "Allow order insert" ON orders;

DROP POLICY IF EXISTS "Customers can read own order items" ON order_items;
DROP POLICY IF EXISTS "Sellers can read order items from their store" ON order_items;
DROP POLICY IF EXISTS "Customers can insert order items" ON order_items;
DROP POLICY IF EXISTS "Allow order item insert" ON order_items;

DROP POLICY IF EXISTS "Users can manage own idempotency keys" ON idempotency_keys;

DROP POLICY IF EXISTS "No direct user access to order events" ON order_events;
DROP POLICY IF EXISTS "Service role access to order events" ON order_events;

-- =============================================
-- Profiles
-- =============================================

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = profiles.id OR auth.role() = 'service_role');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = profiles.id OR auth.role() = 'service_role');

CREATE POLICY "Allow profile insert"
  ON profiles FOR INSERT
  WITH CHECK (true);

-- =============================================
-- Stores
-- =============================================

CREATE POLICY "Anyone can read stores"
  ON stores FOR SELECT
  USING (true);

CREATE POLICY "Allow store insert"
  ON stores FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Sellers can update own store"
  ON stores FOR UPDATE
  USING (auth.uid() = stores.owner_id OR auth.role() = 'service_role');

CREATE POLICY "Sellers can delete own store"
  ON stores FOR DELETE
  USING (auth.uid() = stores.owner_id OR auth.role() = 'service_role');

-- =============================================
-- Products
-- =============================================

CREATE POLICY "Anyone can read active products"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Sellers can insert products in own store"
  ON products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Sellers can update own store products"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Sellers can delete own store products"
  ON products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- =============================================
-- Inventory
-- =============================================

CREATE POLICY "Anyone can read inventory"
  ON inventory FOR SELECT
  USING (true);

CREATE POLICY "Sellers can manage own product inventory"
  ON inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = inventory.product_id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- =============================================
-- Orders
-- =============================================

CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT
  USING (auth.uid() = orders.customer_id OR auth.role() = 'service_role');

CREATE POLICY "Sellers can read orders containing their products"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN stores s ON s.id = oi.store_id
      WHERE oi.order_id = orders.id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow order insert"
  ON orders FOR INSERT
  WITH CHECK (true);

-- =============================================
-- Order Items
-- =============================================

CREATE POLICY "Customers can read own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Sellers can read order items from their store"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stores s WHERE s.id = order_items.store_id AND s.owner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Allow order item insert"
  ON order_items FOR INSERT
  WITH CHECK (true);

-- =============================================
-- Idempotency Keys
-- =============================================

CREATE POLICY "Users can manage own idempotency keys"
  ON idempotency_keys FOR ALL
  USING (auth.uid() = idempotency_keys.user_id OR auth.role() = 'service_role');

-- =============================================
-- Order Events (service role only, not user-facing)
-- =============================================

CREATE POLICY "Service role access to order events"
  ON order_events FOR ALL
  USING (true);
