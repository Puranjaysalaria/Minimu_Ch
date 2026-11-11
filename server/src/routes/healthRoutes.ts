import { Router, Request, Response } from 'express';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';

export const healthRouter = Router();

healthRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // Test simple query
    const dbTest = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      timezone: config.appTimezone,
      database: dbTest?.ok === 1 ? 'healthy' : 'unhealthy',
      geminiConfigured: !!config.geminiApiKey,
      tavilyConfigured: !!config.tavilyApiKey,
      version: '1.0.0',
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      message: err.message || 'Health check failed',
    });
  }
});
