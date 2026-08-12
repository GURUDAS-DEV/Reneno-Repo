-- =============================================
-- Migration 002: Row Level Security Policies (A6)
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
-- Profiles
-- =============================================

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =============================================
-- Stores
-- =============================================

CREATE POLICY "Anyone can read stores"
  ON stores FOR SELECT
  USING (true);

CREATE POLICY "Sellers can create own store"
  ON stores FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SELLER'
    )
  );

CREATE POLICY "Sellers can update own store"
  ON stores FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Sellers can delete own store"
  ON stores FOR DELETE
  USING (auth.uid() = owner_id);

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
      SELECT 1 FROM stores WHERE id = store_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Sellers can update own store products"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM stores WHERE id = store_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Sellers can delete own store products"
  ON products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM stores WHERE id = store_id AND owner_id = auth.uid()
    )
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
      WHERE p.id = product_id AND s.owner_id = auth.uid()
    )
  );

-- =============================================
-- Orders
-- =============================================

CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "Sellers can read orders containing their products"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN stores s ON s.id = oi.store_id
      WHERE oi.order_id = id AND s.owner_id = auth.uid()
    )
  );

CREATE POLICY "Customers can create orders"
  ON orders FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'CUSTOMER'
    )
  );

-- =============================================
-- Order Items
-- =============================================

CREATE POLICY "Customers can read own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders WHERE id = order_id AND customer_id = auth.uid()
    )
  );

CREATE POLICY "Sellers can read order items from their store"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM stores WHERE id = store_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "Customers can insert order items"
  ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders WHERE id = order_id AND customer_id = auth.uid()
    )
  );

-- =============================================
-- Idempotency Keys
-- =============================================

CREATE POLICY "Users can manage own idempotency keys"
  ON idempotency_keys FOR ALL
  USING (auth.uid() = user_id);

-- =============================================
-- Order Events (service role only, not user-facing)
-- =============================================

CREATE POLICY "No direct user access to order events"
  ON order_events FOR SELECT
  USING (false);
