import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Product name is required'),
    description: z.string().optional(),
    price: z.number().min(0, 'Price must be non-negative'),
    category: z.string().optional(),
    quantity: z.number().int().min(0).default(0),
    is_active: z.boolean().default(true),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    category: z.string().optional(),
    quantity: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  }),
});

export const getProductSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listProductsSchema = z.object({
  query: z.object({
    page: z.string().default('1'),
    limit: z.string().default('20'),
    search: z.string().optional(),
    category: z.string().optional(),
    min_price: z.string().optional(),
    max_price: z.string().optional(),
    is_active: z.string().optional(),
    sort_by: z.enum(['price', 'name', 'created_at']).optional(),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];
export type ListProductsQuery = z.infer<typeof listProductsSchema>['query'];
