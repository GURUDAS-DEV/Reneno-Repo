import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './core/middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { productRouter } from './modules/products/product.routes.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);

// Centralized Error Handler (must be last)
app.use(errorHandler);
