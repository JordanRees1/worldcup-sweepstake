import cors from 'cors';
import express, { type Express } from 'express';
import type { ServerConfig } from './env';
import { createApiRouter } from './routes';
import type { AppStateService } from './services/appState';

/** Build the Express app (without listening) — kept separate so it can be tested in-process. */
export function createApp(service: AppStateService, config: ServerConfig): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api', createApiRouter(service, config));

  // Fallback 404 with the same error envelope as the routes.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
  });

  return app;
}
