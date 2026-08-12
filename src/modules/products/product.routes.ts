import { Router } from 'express';
import { validate } from '../../core/middleware/validate.js';
import { authenticate, authorize } from '../../core/middleware/auth.js';
import {
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  listProductsSchema,
} from './product.schema.js';
import * as productController from './product.controller.js';

const router = Router();

// Public routes
router.get('/', validate(listProductsSchema), productController.handleList);
router.get('/:id', validate(getProductSchema), productController.handleGetById);

// Seller-only routes
router.post('/', authenticate, authorize('SELLER'), validate(createProductSchema), productController.handleCreate);
router.patch('/:id', authenticate, authorize('SELLER'), validate(updateProductSchema), productController.handleUpdate);
router.delete('/:id', authenticate, authorize('SELLER'), validate(getProductSchema), productController.handleDelete);

export { router as productRouter };
