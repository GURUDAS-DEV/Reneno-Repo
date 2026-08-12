import { supabaseAdmin } from '../../core/database/supabase.js';
import { AppError } from '../../core/errors/app-error.js';
import { CreateProductInput, UpdateProductInput, ListProductsQuery } from './product.schema.js';

// Get seller's store id
async function getSellerStoreId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('owner_id', userId)
    .single();

  if (error || !data) throw AppError.notFound('Store not found. Create a store first.');
  return data.id;
}

// Verify product belongs to seller
async function verifyOwnership(productId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, store_id, stores!inner(owner_id)')
    .eq('id', productId)
    .single();

  if (error || !data) throw AppError.notFound('Product not found');

  const store = data.stores as unknown as { owner_id: string };
  if (store.owner_id !== userId) {
    throw AppError.forbidden('You do not own this product');
  }

  return data;
}

export async function createProduct(userId: string, input: CreateProductInput) {
  const storeId = await getSellerStoreId(userId);

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({
      store_id: storeId,
      name: input.name,
      description: input.description || null,
      price: input.price,
      category: input.category || null,
      is_active: input.is_active,
    })
    .select()
    .single();

  if (error) throw AppError.internal(error.message);

  // Create inventory record
  const { error: invError } = await supabaseAdmin
    .from('inventory')
    .insert({
      product_id: product.id,
      quantity: input.quantity,
    });

  if (invError) throw AppError.internal(invError.message);

  return { ...product, quantity: input.quantity };
}

export async function getProductById(productId: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*, inventory(quantity), stores(id, name, owner_id)')
    .eq('id', productId)
    .single();

  if (error || !data) throw AppError.notFound('Product not found');

  const inventory = data.inventory as unknown as { quantity: number } | null;

  return {
    ...data,
    quantity: inventory?.quantity ?? 0,
    inventory: undefined,
  };
}

export async function updateProduct(userId: string, productId: string, input: UpdateProductInput) {
  await verifyOwnership(productId, userId);

  const { quantity, ...productFields } = input;

  // Update product fields if any provided
  if (Object.keys(productFields).length > 0) {
    const { error } = await supabaseAdmin
      .from('products')
      .update(productFields)
      .eq('id', productId);

    if (error) throw AppError.internal(error.message);
  }

  // Update inventory if quantity provided
  if (quantity !== undefined) {
    const { error } = await supabaseAdmin
      .from('inventory')
      .update({ quantity })
      .eq('product_id', productId);

    if (error) throw AppError.internal(error.message);
  }

  return getProductById(productId);
}

export async function deleteProduct(userId: string, productId: string) {
  await verifyOwnership(productId, userId);

  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) throw AppError.internal(error.message);
}

export async function listProducts(query: ListProductsQuery) {
  const page = parseInt(query.page);
  const limit = Math.min(parseInt(query.limit), 100);
  const offset = (page - 1) * limit;

  let dbQuery = supabaseAdmin
    .from('products')
    .select('*, inventory(quantity), stores(id, name)', { count: 'exact' });

  // Filters
  if (query.category) {
    dbQuery = dbQuery.eq('category', query.category);
  }
  if (query.is_active !== undefined) {
    dbQuery = dbQuery.eq('is_active', query.is_active === 'true');
  }
  if (query.min_price) {
    dbQuery = dbQuery.gte('price', parseFloat(query.min_price));
  }
  if (query.max_price) {
    dbQuery = dbQuery.lte('price', parseFloat(query.max_price));
  }

  // Full-text search using tsvector
  if (query.search) {
    dbQuery = dbQuery.textSearch('search_vector', query.search, { type: 'websearch' });
  }

  // Sorting
  const sortBy = query.sort_by || 'created_at';
  const ascending = query.sort_order === 'asc';
  dbQuery = dbQuery.order(sortBy, { ascending });

  // Pagination
  dbQuery = dbQuery.range(offset, offset + limit - 1);

  const { data, error, count } = await dbQuery;

  if (error) throw AppError.internal(error.message);

  const products = (data || []).map((p) => {
    const inv = p.inventory as unknown as { quantity: number } | null;
    return {
      ...p,
      quantity: inv?.quantity ?? 0,
      inventory: undefined,
    };
  });

  return {
    products,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}
