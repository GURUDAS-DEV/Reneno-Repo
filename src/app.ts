import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './core/middleware/error-handler.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Centralized Error Handler
app.use(errorHandler);
