import { supabaseAdmin } from '../../core/database/supabase.js';
import { AppError } from '../../core/errors/app-error.js';
import { CreateOrderInput, ListOrdersQuery } from './order.schema.js';

export async function placeOrder(customerId: string, input: CreateOrderInput) {
  // Call the atomic PostgreSQL function (handles locking, stock check, decrement, order creation)
  const { data, error } = await supabaseAdmin.rpc('place_order_atomic', {
    p_customer_id: customerId,
    p_items: input.items,
  });

  if (error) {
    // Parse PostgreSQL error messages from the function
    const msg = error.message || '';
    if (msg.includes('Insufficient stock')) {
      throw AppError.conflict(msg);
    }
    if (msg.includes('not found')) {
      throw AppError.notFound(msg);
    }
    if (msg.includes('not available')) {
      throw AppError.badRequest(msg);
    }
    throw AppError.internal(msg);
  }

  return data;
}

export async function getOrderById(userId: string, orderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error || !order) throw AppError.notFound('Order not found');

  // Customers can only see their own orders
  if (order.customer_id !== userId) {
    // Check if user is a seller with items in this order
    const { data: sellerCheck } = await supabaseAdmin
      .from('order_items')
      .select('id, stores!inner(owner_id)')
      .eq('order_id', orderId)
      .limit(1);

    const hasAccess = sellerCheck?.some((item) => {
      const store = item.stores as unknown as { owner_id: string };
      return store.owner_id === userId;
    });

    if (!hasAccess) throw AppError.forbidden('You do not have access to this order');
  }

  // Fetch order items
  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('*, products(name, description), stores(name)')
    .eq('order_id', orderId);

  return { ...order, items: items || [] };
}

export async function listOrders(userId: string, query: ListOrdersQuery) {
  const page = parseInt(query.page);
  const limit = Math.min(parseInt(query.limit), 100);
  const offset = (page - 1) * limit;

  let dbQuery = supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('customer_id', userId);

  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status);
  }

  dbQuery = dbQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await dbQuery;

  if (error) throw AppError.internal(error.message);

  return {
    orders: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}
