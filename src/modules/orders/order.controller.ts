import { Request, Response, NextFunction } from 'express';
import * as orderService from './order.service.js';
import { sendSuccess } from '../../core/utils/response.js';

export async function handlePlaceOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await orderService.placeOrder(req.user!.id, req.body);
    return sendSuccess(res, result, 201);
  } catch (err) {
    return next(err);
  }
}

export async function handleGetById(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrderById(req.user!.id, req.params.id as string);
    return sendSuccess(res, order);
  } catch (err) {
    return next(err);
  }
}

export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await orderService.listOrders(req.user!.id, req.query as any);
    return sendSuccess(res, result.orders, 200, { pagination: result.pagination });
  } catch (err) {
    return next(err);
  }
}
