import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import { WEB_DIST_DIR as WEB_DIST } from './data/paths';
import type { ServerConfig } from './env';
import type { TenantStore } from './data/tenantStore';
import { createApiRouter } from './routes';
import type { Gateway } from './services/appState';

const IS_PROD = process.env.NODE_ENV === 'production';

// Old per-app vanity subdomains → canonical code URL on the apex. Keeps existing links working.
const CANONICAL_HOST = 'sstake.co.uk';
const VANITY_HOSTS: Record<string, string> = {
  'aa.sstake.co.uk': 'aa26',
  'crackers.sstake.co.uk': 'crackers',
};

/**
 * Build the Express app (without listening) — kept separate so it can be tested in-process.
 *
 * Dev:  CORS enabled (Vite on :5173 proxies /api → Express on :8787, different origins).
 * Prod: CORS not needed (web is served from the same origin as the API).
 *       express.static serves web/dist; catch-all returns index.html for client-side routing.
 */
export function createApp(gateway: Gateway, store: TenantStore, config: ServerConfig): Express {
  const app = express();
  app.set('trust proxy', true);

  // Redirect old vanity subdomains (aa./crackers.) to their canonical code URL.
  app.use((req, res, next) => {
    const code = VANITY_HOSTS[req.hostname];
    if (code) {
      res.redirect(301, `https://${CANONICAL_HOST}/s/${code}`);
      return;
    }
    next();
  });

  if (!IS_PROD) app.use(cors());
  app.use(express.json());
  app.use('/api', createApiRouter(gateway, store, config));

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
