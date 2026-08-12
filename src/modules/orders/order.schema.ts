import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          product_id: z.string().uuid(),
          quantity: z.number().int().min(1, 'Quantity must be at least 1'),
        })
      )
      .min(1, 'Order must have at least one item'),
  }).strict(),
});

export const getOrderSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listOrdersSchema = z.object({
  query: z.object({
    page: z.string().default('1'),
    limit: z.string().default('20'),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
  }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>['body'];
export type ListOrdersQuery = z.infer<typeof listOrdersSchema>['query'];
