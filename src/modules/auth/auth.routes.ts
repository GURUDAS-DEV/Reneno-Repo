import { Router } from 'express';
import { validate } from '../../core/middleware/validate.js';
import { authenticate } from '../../core/middleware/auth.js';
import { signupSchema, loginSchema } from './auth.schema.js';
import * as authController from './auth.controller.js';

const router = Router();

router.post('/signup', validate(signupSchema), authController.handleSignup);
router.post('/login', validate(loginSchema), authController.handleLogin);
router.get('/me', authenticate, authController.handleMe);

export { router as authRouter };
