import { Request, Response, NextFunction } from 'express';
import * as productService from './product.service.js';
import { sendSuccess } from '../../core/utils/response.js';

export async function handleCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.createProduct(req.user!.id, req.body);
    return sendSuccess(res, product, 201);
  } catch (err) {
    return next(err);
  }
}

export async function handleGetById(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.getProductById(req.params.id as string);
    return sendSuccess(res, product);
  } catch (err) {
    return next(err);
  }
}

export async function handleUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.updateProduct(req.user!.id, req.params.id as string, req.body);
    return sendSuccess(res, product);
  } catch (err) {
    return next(err);
  }
}

export async function handleDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await productService.deleteProduct(req.user!.id, req.params.id as string);
    return sendSuccess(res, { message: 'Product deleted successfully' });
  } catch (err) {
    return next(err);
  }
}

export async function handleList(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productService.listProducts(req.query as any);
    return sendSuccess(res, result.products, 200, { pagination: result.pagination });
  } catch (err) {
    return next(err);
  }
}
