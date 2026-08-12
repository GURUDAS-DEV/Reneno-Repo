import { Router } from 'express';
import { validate } from '../../core/middleware/validate.js';
import { authenticate, authorize } from '../../core/middleware/auth.js';
import { idempotencyGuard } from '../../core/middleware/idempotency.js';
import { createOrderSchema, getOrderSchema, listOrdersSchema } from './order.schema.js';
import * as orderController from './order.controller.js';

const router = Router();

// All order routes require authentication
router.use(authenticate);

router.post(
  '/',
  authorize('CUSTOMER'),
  idempotencyGuard,
  validate(createOrderSchema),
  orderController.handlePlaceOrder
);

router.get('/', validate(listOrdersSchema), orderController.handleList);
router.get('/:id', validate(getOrderSchema), orderController.handleGetById);

export { router as orderRouter };
