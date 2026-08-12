-- =============================================
-- Migration 001: Core Schema
-- =============================================

-- Enums
CREATE TYPE user_role AS ENUM ('SELLER', 'CUSTOMER');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Tables
-- =============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_registration_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  status order_status NOT NULL DEFAULT 'PENDING',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

-- Idempotency keys for duplicate request prevention (B2)
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outbox table for reliable event emission (B3)
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Indexes
-- =============================================

-- Products: FK + filter + search indexes
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_search_vector ON products USING GIN(search_vector);

-- Orders: FK indexes
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Order Items: FK indexes
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_order_items_store_id ON order_items(store_id);

-- Idempotency: TTL cleanup
CREATE INDEX idx_idempotency_created_at ON idempotency_keys(created_at);

-- Order Events: unprocessed event polling
CREATE INDEX idx_order_events_unprocessed ON order_events(processed) WHERE processed = FALSE;

-- =============================================
-- Auto-update triggers for updated_at
-- =============================================

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =============================================
-- Atomic Order Placement Function (B1 - 20 pts)
-- Uses SELECT FOR UPDATE to lock inventory rows,
-- validates stock, creates order + items atomically.
-- =============================================

CREATE OR REPLACE FUNCTION place_order_atomic(
  p_customer_id UUID,
  p_items JSONB -- Array of { "product_id": "...", "quantity": N }
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_total NUMERIC(12,2) := 0;
  v_item JSONB;
  v_product RECORD;
  v_current_qty INTEGER;
  v_subtotal NUMERIC(12,2);
BEGIN
  -- Create the order first
  INSERT INTO orders (customer_id, status, total_amount)
  VALUES (p_customer_id, 'CONFIRMED', 0)
  RETURNING id INTO v_order_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Lock inventory row + fetch product details in one step
    SELECT p.id, p.price, p.store_id, p.is_active, i.quantity
    INTO v_product
    FROM products p
    JOIN inventory i ON i.product_id = p.id
    WHERE p.id = (v_item->>'product_id')::UUID
    FOR UPDATE OF i;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_item->>'product_id';
    END IF;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product % is not available', v_item->>'product_id';
    END IF;

    v_current_qty := v_product.quantity;
    IF v_current_qty < (v_item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        v_item->>'product_id', v_current_qty, (v_item->>'quantity')::INTEGER;
    END IF;

    -- Deduct stock
    UPDATE inventory
    SET quantity = quantity - (v_item->>'quantity')::INTEGER
    WHERE product_id = (v_item->>'product_id')::UUID;

    -- Calculate subtotal
    v_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
    v_total := v_total + v_subtotal;

    -- Insert order item
    INSERT INTO order_items (order_id, product_id, store_id, quantity, unit_price, subtotal)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_product.store_id,
      (v_item->>'quantity')::INTEGER,
      v_product.price,
      v_subtotal
    );
  END LOOP;

  -- Update order total
  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

  -- Emit ORDER_CREATED event into outbox (B3)
  INSERT INTO order_events (order_id, event_type, payload)
  VALUES (
    v_order_id,
    'ORDER_CREATED',
    jsonb_build_object(
      'order_id', v_order_id,
      'customer_id', p_customer_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'created_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'total_amount', v_total,
    'status', 'CONFIRMED'
  );
END;
$$ LANGUAGE plpgsql;
