import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/index.js';
import { getDatabase, closeDatabase } from './database/connection.js';
import { runMigrations } from './database/migrations/migrator.js';
import { healthRouter } from './routes/healthRoutes.js';
import { conversationRouter } from './routes/conversationRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { memoryRouter } from './routes/memoryRoutes.js';
import { sourceRouter } from './routes/sourceRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow local development and specified CLIENT_URL
      if (!origin || origin.startsWith('http://localhost') || origin === config.clientUrl) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for local challenge testing
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Initialize Database & Run Migrations
try {
  const db = getDatabase();
  runMigrations(db);
  console.log('✅ Database connected and migrations applied successfully.');
} catch (err: any) {
  console.error('❌ Failed to initialize database:', err.message);
}

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/chat', chatRouter);
app.use('/api/memories', memoryRouter);
app.use('/api/sources', sourceRouter);

// Centralized error handler
app.use(errorHandler);

// Only listen if not loaded by a test runner (Supertest)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  validateConfig();
  const server = app.listen(config.port, () => {
    console.log(`🚀 Minimi Agent Backend listening on http://localhost:${config.port}`);
    console.log(`⏰ Timezone configured to: ${config.appTimezone}`);
    console.log(`📁 Database path: ${config.databasePath}`);
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down Minimi Backend...');
    server.close(() => {
      closeDatabase();
      console.log('Database connection closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
