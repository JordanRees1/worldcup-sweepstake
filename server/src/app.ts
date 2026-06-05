import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import type { ServerConfig } from './env';
import { createApiRouter } from './routes';
import type { AppStateService } from './services/appState';

// Absolute path to the built web app — server/src/app.ts → ../../web/dist.
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Build the Express app (without listening) — kept separate so it can be tested in-process.
 *
 * Dev:  CORS enabled (Vite on :5173 proxies /api → Express on :8787, different origins).
 * Prod: CORS not needed (web is served from the same origin as the API).
 *       express.static serves web/dist; catch-all returns index.html for client-side routing.
 */
export function createApp(service: AppStateService, config: ServerConfig): Express {
  const app = express();

  if (!IS_PROD) app.use(cors());
  app.use(express.json());
  app.use('/api', createApiRouter(service, config));

  if (IS_PROD && existsSync(WEB_DIST)) {
    // Serve the Vite-built static files and fall back to index.html for React Router.
    app.use(express.static(WEB_DIST));
    app.get('*', (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
  } else {
    // Dev: Vite handles the web; anything not under /api is a 404.
    app.use((_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
    });
  }

  return app;
}
