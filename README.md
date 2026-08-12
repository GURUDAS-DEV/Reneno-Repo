# Reneo Commerce Backend API

A production-ready backend for a multi-seller e-commerce platform built with **Node.js**, **TypeScript**, **Express**, and **Supabase (PostgreSQL)**.

## Table of Contents

- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [API Endpoints](#api-endpoints)
- [Database Design](#database-design)
- [Concurrency & Stock Management](#concurrency--stock-management)
- [Idempotency](#idempotency)
- [Event-Driven Architecture](#event-driven-architecture)
- [Search & Pagination at Scale](#search--pagination-at-scale)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Running Tests](#running-tests)
- [Scaling to 10M Users](#scaling-to-10m-users)
- [Expansion Plan](#expansion-plan)
- [AI & Library Disclosure](#ai--library-disclosure)

---

## Architecture

```
src/
├── config/env.ts              # Zod-validated environment config
├── core/
│   ├── database/supabase.ts   # Supabase client instances
│   ├── errors/app-error.ts    # Standardized error class
│   ├── middleware/
│   │   ├── auth.ts            # JWT validation + role guard
│   │   ├── error-handler.ts   # Central error handler
│   │   ├── idempotency.ts     # Idempotency-Key deduplication
│   │   └── validate.ts        # Zod request validation
│   ├── types/                 # Shared TypeScript types
│   └── utils/response.ts      # Uniform API response helper
├── modules/
│   ├── auth/                  # Signup, login, profile
│   ├── products/              # CRUD + search + pagination
│   └── orders/                # Order placement (atomic)
├── app.ts                     # Express app setup
└── server.ts                  # Entry point
```

**Pattern**: Modular / Feature-Based architecture. Each module contains its own `schema`, `service`, `controller`, and `routes`. Shared infrastructure lives in `core/`.

---

## Setup & Installation

### Prerequisites

- Node.js >= 18
- A Supabase project (free tier works)

### Steps

```bash
# 1. Clone
git clone https://github.com/GURUDAS-DEV/Reneno-Repo.git
cd Reneno-Repo

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in your Supabase credentials in .env

# 4. Run database migrations
# Execute the SQL files in your Supabase SQL Editor in order:
#   supabase/migrations/001_schema.sql
#   supabase/migrations/002_rls_policies.sql

# 5. Start development server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` / `production` / `test` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, never exposed) |

---

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/signup` | No | Register (SELLER or CUSTOMER) |
| `POST` | `/api/auth/login` | No | Login, returns JWT |
| `GET` | `/api/auth/me` | Yes | Get current user profile |

**Signup Payload:**
```json
{
  "email": "seller@example.com",
  "password": "securepassword",
  "name": "John Doe",
  "role": "SELLER",
  "phone": "+237600000000"
}
```

### Products

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/products` | No | — | List/search products (paginated) |
| `GET` | `/api/products/:id` | No | — | Get product details |
| `POST` | `/api/products` | Yes | SELLER | Create product |
| `PATCH` | `/api/products/:id` | Yes | SELLER | Update own product |
| `DELETE` | `/api/products/:id` | Yes | SELLER | Delete own product |

**Search Query Parameters:**
- `search` — Full-text search (uses PostgreSQL tsvector + GIN index)
- `category` — Filter by category
- `min_price` / `max_price` — Price range filter
- `is_active` — Availability filter
- `sort_by` — `price`, `name`, or `created_at`
- `sort_order` — `asc` or `desc`
- `page` / `limit` — Pagination (max 100 per page)

### Orders

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `POST` | `/api/orders` | Yes | CUSTOMER | Place order |
| `GET` | `/api/orders` | Yes | Any | List own orders |
| `GET` | `/api/orders/:id` | Yes | Any | Get order details |

**Order Payload** (price is resolved server-side, never accepted from client):
```json
{
  "items": [
    { "product_id": "uuid-here", "quantity": 2 },
    { "product_id": "uuid-here", "quantity": 1 }
  ]
}
```

### Standardized Error Response

All errors follow a uniform format:
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Insufficient stock for product xyz. Available: 0, Requested: 1"
  }
}
```

| Status | Code | Usage |
|--------|------|-------|
| 400 | `BAD_REQUEST` | Invalid input / validation failure |
| 401 | `UNAUTHENTICATED` | Missing or expired token |
| 403 | `FORBIDDEN` | Insufficient permissions / RLS violation |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Out of stock / duplicate idempotency key mismatch |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error |

---

## Database Design

### Schema Diagram

```
profiles (1) ──── (1) stores (1) ──── (N) products (1) ──── (1) inventory
    │                                       │
    │                                       │
    └──── (N) orders (1) ──── (N) order_items ────┘
```

### Key Design Decisions

1. **Separate `inventory` table** — Enables row-level locking on stock without locking the entire product row during concurrent orders.

2. **`NUMERIC(12,2)` for money** — Avoids floating-point precision issues. Suitable for FCFA currency.

3. **`search_vector` generated column** — `TSVECTOR` auto-computed from `name` + `description`, enabling efficient full-text search over millions of products without application-level indexing.

4. **`store_id` on `order_items`** — Denormalized for efficient seller-side order queries without expensive joins.

5. **Check constraints** — `price >= 0`, `quantity >= 0`, `quantity > 0` (order items) enforced at the database level.

### Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `idx_products_search_vector` | GIN | Full-text search across 1M+ products |
| `idx_products_store_id` | B-tree | Fast product lookup by store |
| `idx_products_category` | B-tree | Category filter queries |
| `idx_products_price` | B-tree | Price range filter queries |
| `idx_products_is_active` | B-tree | Availability filter |
| `idx_orders_customer_id` | B-tree | Customer order listing |
| `idx_order_items_order_id` | B-tree | Order item joins |
| `idx_order_items_product_id` | B-tree | Product-to-order lookups |
| `idx_order_events_unprocessed` | B-tree (partial) | Efficient outbox polling |

### EXPLAIN Analysis — Product Search at Scale

For a search query with category filter + text search on a table with 1M+ rows:

```sql
EXPLAIN ANALYZE
SELECT p.*, i.quantity
FROM products p
JOIN inventory i ON i.product_id = p.id
WHERE p.is_active = true
  AND p.category = 'electronics'
  AND p.search_vector @@ websearch_to_tsquery('english', 'wireless headphones')
ORDER BY p.created_at DESC
LIMIT 20 OFFSET 0;
```

**Expected query plan:**

```
Limit (cost=X..Y rows=20)
  -> Sort (cost=X..Y)
    Sort Key: p.created_at DESC
    -> Nested Loop (cost=X..Y)
      -> Bitmap Heap Scan on products p
           Recheck Cond: (search_vector @@ '''wireless'' & ''headphon'''::tsquery)
           Filter: (is_active = true AND category = 'electronics')
           -> Bitmap Index Scan on idx_products_search_vector
                Index Cond: (search_vector @@ '''wireless'' & ''headphon'''::tsquery)
      -> Index Scan on inventory i
           Index Cond: (product_id = p.id)
```

**Key observation**: The GIN index on `search_vector` is used for the text search condition, performing a Bitmap Index Scan rather than a sequential scan. This reduces the search space from 1M+ rows to only matching documents before applying additional filters, making the query performant at scale.

---

## Concurrency & Stock Management

### The Problem

When stock = 1 and two customers order simultaneously:
- Both read stock = 1 ✓
- Both decrement to 0 ✓
- Stock goes to -1 ✗ (overselling)

### The Solution: `place_order_atomic` PostgreSQL Function

```sql
-- Inside the function, for each item:
SELECT p.id, p.price, i.quantity
FROM products p
JOIN inventory i ON i.product_id = p.id
WHERE p.id = $product_id
FOR UPDATE OF i;  -- Locks the inventory row

-- Only after acquiring the lock:
IF quantity < requested THEN
  RAISE EXCEPTION 'Insufficient stock...';
END IF;

UPDATE inventory SET quantity = quantity - requested WHERE ...;
```

**How it works:**
1. The entire function runs inside a single PostgreSQL transaction.
2. `SELECT ... FOR UPDATE OF i` acquires a row-level exclusive lock on the inventory row.
3. The second concurrent transaction blocks at this point, waiting for the first to commit or rollback.
4. After the first commits (stock → 0), the second acquires the lock, re-reads stock = 0, and raises a `409 Conflict`.
5. **Result**: Exactly one order succeeds. No overselling. No negative stock.

### Why Database-Level Locking?

- **Simpler than application-level locks** — No need for Redis/distributed locks.
- **Transactional guarantees** — If anything fails mid-order, the entire transaction rolls back (stock restored, no orphaned orders).
- **Deadlock-safe** — Items are processed sequentially within the function.

---

## Idempotency

### Problem

Network retries, double-clicks, or timeouts can cause the same order to be placed twice.

### Solution

The `POST /api/orders` endpoint supports an optional `Idempotency-Key` header:

```bash
curl -X POST /api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: unique-client-generated-key-123" \
  -d '{"items": [...]}'
```

**How it works:**
1. On first request: process normally, store the response in `idempotency_keys` table with a SHA-256 hash of the payload.
2. On duplicate request (same key): return the cached response without re-processing.
3. If the same key is sent with a different payload: return `409 Conflict`.
4. Keys expire after **24 hours** (TTL).

---

## Event-Driven Architecture

### Outbox Pattern for `ORDER_CREATED`

When an order is placed, the atomic SQL function also inserts an event into the `order_events` table within the same transaction:

```sql
INSERT INTO order_events (order_id, event_type, payload)
VALUES (order_id, 'ORDER_CREATED', '{"order_id": "...", "total_amount": ...}');
```

**Why Outbox Pattern?**
- **Atomicity** — The event is guaranteed to be created if and only if the order is created (same transaction).
- **Reliability** — No events are lost even if external services are down.
- **Retry-safe** — A background worker polls `order_events WHERE processed = FALSE` and processes them. Failed events are retried.

**Failure strategy**: The partial index `idx_order_events_unprocessed` makes polling efficient. A worker can process events and mark them `processed = TRUE`. Dead-letter or max-retry logic can be added on the worker side.

---

## Row Level Security (RLS)

All tables have RLS enabled with policies enforcing:

| Rule | Implementation |
|------|---------------|
| Sellers can only CRUD their own store's products | Policy checks `stores.owner_id = auth.uid()` |
| Sellers cannot access other sellers' stores/products | INSERT/UPDATE/DELETE policies with ownership joins |
| Customers can only see their own orders | Policy checks `orders.customer_id = auth.uid()` |
| Sellers can see orders containing their products | Policy joins through `order_items.store_id` → `stores.owner_id` |
| Order events are service-role only | `USING (false)` prevents direct user access |

---

## Running Tests

```bash
# Ensure .env is configured with valid Supabase credentials
# Ensure migrations are applied

npm test
```

### Test Cases

| # | Test | Assertion |
|---|------|-----------|
| 1 | Seller A creates a product | `201`, product returned with correct data |
| 2 | Seller B modifies/deletes Seller A's product | `403 FORBIDDEN` |
| 3 | Customer orders available product | `201 CONFIRMED` with correct total |
| 4 | Customer orders more than available stock | `409 CONFLICT` |
| 5 | **Race condition**: Two `Promise.all` orders for last item (qty=1) | Exactly one `201`, one `409` |

---

## Scaling to 10M Users

### Current Architecture (Single Server)

```
Client → Express API → Supabase (PostgreSQL)
```

### Scaled Architecture

```
                         ┌──────────────┐
                         │   CDN/Edge   │
                         └──────┬───────┘
                                │
                     ┌──────────┴──────────┐
                     │    Load Balancer    │
                     └──┬───────┬───────┬──┘
                        │       │       │
                   ┌────┴─┐ ┌──┴──┐ ┌──┴────┐
                   │ API  │ │ API │ │  API  │   (Horizontally scaled)
                   │  #1  │ │ #2  │ │  #3   │
                   └──┬───┘ └──┬──┘ └──┬────┘
                      │       │       │
              ┌───────┴───────┴───────┴────┐
              │         Redis Cache        │  (Product catalog, sessions)
              └───────────┬────────────────┘
                          │
              ┌───────────┴────────────────┐
              │     PostgreSQL Primary     │  (Writes: orders, inventory)
              │           │                │
              │    ┌──────┴──────┐         │
              │    │ Read Replica│ (x2-3)  │  (Reads: product search, listings)
              │    └─────────────┘         │
              └────────────────────────────┘
                          │
              ┌───────────┴────────────────┐
              │   Message Queue (BullMQ)   │  (Order events, notifications)
              └────────────────────────────┘
```

### Scaling Strategy by Bottleneck

| Bottleneck | Solution | Impact |
|-----------|----------|--------|
| **Read-heavy product queries** | PostgreSQL read replicas + Redis cache (TTL 60s) for product listings | 90% of product reads served from cache |
| **Write contention on inventory** | Current `SELECT FOR UPDATE` works well. At extreme scale, shard inventory by product ID range or use optimistic concurrency (version column) | Linear write throughput scaling |
| **API compute** | Horizontal scaling behind a load balancer (stateless API, no in-memory state) | Linear throughput scaling |
| **Search at scale** | Promote to Elasticsearch/Typesense for search, keep PostgreSQL as source of truth | Sub-100ms search over 10M+ products |
| **Order event processing** | BullMQ / Kafka for async event processing (notifications, analytics, fulfillment) | Decoupled, retry-safe event handling |
| **Auth token validation** | Cache Supabase JWT verification result in Redis (short TTL) | Eliminates per-request auth round-trip |

### Key Principle

The current architecture is already designed for horizontal scaling:
- **Stateless API** — No in-memory sessions or state
- **Database as source of truth** — All concurrency handled at the DB level
- **Transactional integrity** — `place_order_atomic` works correctly with multiple API instances

---

## PART D — Written Responses

### D1. Scaling Architecture (10M Users & High Volume)

#### Current Architecture (Single Server)

```
Client → Express API → Supabase (PostgreSQL)
```

#### Evolved Architecture Diagram

```
                         ┌──────────────┐
                         │   CDN/Edge   │
                         └──────┬───────┘
                                │
                     ┌──────────┴──────────┐
                     │    Load Balancer    │
                     └──┬───────┬───────┬──┘
                        │       │       │
                   ┌────┴─┐ ┌──┴──┐ ┌──┴────┐
                   │ API  │ │ API │ │  API  │   (Horizontally scaled)
                   │  #1  │ │ #2  │ │  #3   │
                   └──┬───┘ └──┬──┘ └──┬────┘
                      │       │       │
              ┌───────┴───────┴───────┴────┐
              │         Redis Cache        │  (Product catalog, sessions)
              └───────────┬────────────────┘
                          │
              ┌───────────┴────────────────┐
              │     PostgreSQL Primary     │  (Writes: orders, inventory)
              │           │                │
              │    ┌──────┴──────┐         │
              │    │ Read Replica│ (x2-3)  │  (Reads: product search, listings)
              │    └─────────────┘         │
              └────────────────────────────┘
                          │
              ┌───────────┴────────────────┐
              │   Message Queue (BullMQ)   │  (Order events, notifications)
              └────────────────────────────┘
```

#### What Breaks First, and How Do You Know?

1. **Database Connection Pool Exhaustion**: Under 10M users, incoming order requests will exhaust the PostgreSQL connection limit first (`503` / connection timeout errors). We detect this via APM/Supabase metrics monitoring `active_connections` vs `max_connections` and CPU utilization exceeding 85%.
2. **Inventory Row Lock Contention**: Popular flash-sale items will cause thread contention on `SELECT FOR UPDATE` in PostgreSQL. We detect this via pg_stat_activity showing queries stuck in `LockWaiting` state.

#### What Would You NOT Do Yet, and Why?

1. **Microservices Decomposition**: We would NOT split into separate microservices yet. Monolithic API with modular folder structure scales to tens of thousands of requests per second easily when backed by read replicas and Redis caching. Splitting too early adds unnecessary network latency, distributed transaction complexity (Saga pattern), and operational overhead.
2. **Database Sharding**: We would NOT shard PostgreSQL horizontally yet. Read replicas + connection poolers (PgBouncer) + Redis cache offload 95% of traffic. Sharding introduces cross-shard join headaches and complex query routing that isn't needed until write TPS exceeds 10,000/sec.

---

### D2. What Did You Not Have Time to Do, and What Would You Do Next with 2 More Days?

If given 2 more days, I would implement:

1. **Full Webhook Delivery Worker for `ORDER_CREATED` Events**:
   - Build a dedicated background worker polling the `order_events` outbox table.
   - Deliver webhooks to seller endpoints with exponential backoff retries and dead-letter queues.
2. **Redis Layer for Search Caching & Idempotency**:
   - Replace in-database idempotency storage with Redis (built-in TTL keys).
   - Cache hot product search queries in Redis with cache invalidation on product updates.
3. **Media & File Storage**:
   - Integrate Supabase Storage for product images with signed URLs and image optimization.
4. **Enhanced Seller Analytics & State Machine**:
   - Order status state transitions (`PENDING → CONFIRMED → SHIPPED → DELIVERED → CANCELLED`).
   - Seller revenue dashboard endpoints.

---

### D3. Where Did You Use a Library or AI Assistant, and What Did You Learn?

#### AI Assistant Usage
An AI assistant was used for code scaffolding, verifying SQL constraints, generating test boilerplate, and structuring the scaling architecture documentation.

#### Key Libraries & Technical Rationale

| Library | Purpose | What I Learned / Key Technical Insight |
|---------|---------|----------------------------------------|
| `Express` | Web framework | Minimalist middleware execution pipeline. Learned how custom error middleware with `(err, req, res, next)` signatures process thrown errors uniformly. |
| `@supabase/supabase-js` | Postgres & Auth Client | Learned how RLS context is passed via JWT headers (`Authorization: Bearer <jwt>`), forcing database-level policy checks for every query. |
| `Zod` | Runtime Schema Validation | Using `.strict()` on request schemas guarantees unexpected payload fields (like a client-sent `price`) are stripped or rejected immediately before touching database logic. |
| `Vitest` & `Supertest` | Concurrency Testing | Learned how `Promise.all` executes HTTP requests concurrently to test database locking and race conditions realistically without sequential execution bias. |

#### Key Learnings
- **Database Concurrency Control**: Writing the `place_order_atomic` stored procedure demonstrated that pushing lock acquisition (`SELECT FOR UPDATE`) down to PostgreSQL is dramatically simpler and more bulletproof than application-level distributed locks.
- **Data Integrity**: Separating `inventory` into a distinct table prevents row-locking on `products` metadata during high-concurrency order placement.

